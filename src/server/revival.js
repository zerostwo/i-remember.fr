import {
  createHash,
  createHmac,
  pbkdf2Sync,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import sharp from "sharp";
import { RevivalSQLiteStore } from "./sqlite-store.js";

const rootUrl = new URL("../../", import.meta.url);
const postIdOffset = 1248;
const postSearchResultMax = 200;
const colorMapStartupDelayMs = 1000;
const maxJsonBodyBytes = 64 * 1024;
const maxFormBodyBytes = 256 * 1024;
const maxUploadBodyBytes = Number.parseInt(
  process.env.I_REMEMBER_MAX_UPLOAD_BYTES || `${8 * 1024 * 1024}`,
  10,
);
const maxImagePixels = Number.parseInt(
  process.env.I_REMEMBER_MAX_IMAGE_PIXELS || `${30_000_000}`,
  10,
);
const autoApproveSubmissions =
  process.env.I_REMEMBER_AUTO_APPROVE_SUBMISSIONS !== "false";
const seedArchiveData = process.env.I_REMEMBER_SEED_ARCHIVE_DATA === "true";
const seedStarterContent = process.env.I_REMEMBER_SEED_STARTER_CONTENT === "true";
const sessionCookieName = "i_remember_admin_session";
const sessionMaxAgeSeconds = 60 * 60 * 12;
const adminSessions = new Map();

const htmlUrls = {
  en: new URL("./index.html", rootUrl),
  fr: new URL("./fr.html", rootUrl),
  zh: new URL("./index.html", rootUrl),
};

const legalHtmlUrl = new URL("./legal.html", rootUrl);
const adminSourceHtmlUrl = new URL("./admin.html", rootUrl);
const adminDistHtmlUrl = new URL("./dist/admin.html", rootUrl);
const instagramTokenCallbackHtmlUrl = new URL(
  "./public/api/instagram-token-callback",
  rootUrl,
);
const storageDirUrl = new URL("./.revival-storage/", rootUrl);
const uploadsDirUrl = new URL("./.revival-storage/uploads/", rootUrl);
const submittedPostsUrl = new URL(
  "./.revival-storage/submitted-posts.json",
  rootUrl,
);

const fallbackPostImages = {
  resized: {
    data: readFileSync(
      new URL("./public/uploads/posts/revival-upload/resized.jpg", rootUrl),
    ),
    mimeType: "image/jpeg",
  },
  thumb: {
    data: readFileSync(
      new URL("./public/uploads/posts/revival-upload/thumb.jpg", rootUrl),
    ),
    mimeType: "image/jpeg",
  },
};

const uploadedImages = new Map();
const runtimeSubmittedPosts = loadSubmittedPosts();
const defaultPostsByLanguage = {
  en: loadPostsFromHtml(htmlUrls.en, "en"),
  fr: loadPostsFromHtml(htmlUrls.fr, "fr"),
  zh: loadPostsFromHtml(htmlUrls.en, "zh"),
};

const rateLimitBuckets = new Map();

class HttpError extends Error {
  constructor(statusCode, message, errorMsg = "unexpected") {
    super(message);
    this.statusCode = statusCode;
    this.errorMsg = errorMsg;
    this.expose = statusCode < 500;
  }
}

const base32Alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function boolSetting(value, fallback = false) {
  if (value === null || value === undefined || value === "") return fallback;
  return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
}

function logInfo(event, fields = {}) {
  console.log(JSON.stringify({
    ts: new Date().toISOString(),
    level: "info",
    event,
    ...fields,
  }));
}

function hashPassword(password) {
  const iterations = 210000;
  const salt = randomBytes(16).toString("base64url");
  const hash = pbkdf2Sync(String(password || ""), salt, iterations, 32, "sha256").toString("base64url");
  return `pbkdf2$${iterations}$${salt}$${hash}`;
}

function verifyPassword(password, stored) {
  const parts = String(stored || "").split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2") return false;
  const iterations = Number.parseInt(parts[1], 10);
  if (!Number.isFinite(iterations) || iterations < 100000) return false;
  const expected = Buffer.from(parts[3], "base64url");
  const actual = pbkdf2Sync(String(password || ""), parts[2], iterations, expected.length, "sha256");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function base32Encode(buffer) {
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += base32Alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += base32Alphabet[(value << (5 - bits)) & 31];
  return output;
}

function base32Decode(value) {
  let bits = 0;
  let buffer = 0;
  const bytes = [];
  for (const char of String(value || "").replace(/=+$/g, "").toUpperCase()) {
    const index = base32Alphabet.indexOf(char);
    if (index === -1) continue;
    buffer = (buffer << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((buffer >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

function totp(secret, step = Math.floor(Date.now() / 30000)) {
  const key = base32Decode(secret);
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const digest = createHmac("sha1", key).update(counter).digest();
  const offset = digest[digest.length - 1] & 15;
  const code = (
    ((digest[offset] & 127) << 24) |
    ((digest[offset + 1] & 255) << 16) |
    ((digest[offset + 2] & 255) << 8) |
    (digest[offset + 3] & 255)
  ) % 1000000;
  return String(code).padStart(6, "0");
}

function verifyTotp(secret, code) {
  const value = String(code || "").replace(/\s+/g, "");
  if (!/^\d{6}$/.test(value)) return false;
  const step = Math.floor(Date.now() / 30000);
  for (let offset = -1; offset <= 1; offset += 1) {
    if (totp(secret, step + offset) === value) return true;
  }
  return false;
}

function parseCookies(req) {
  return Object.fromEntries(
    String(req.headers.cookie || "")
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf("=");
        return index === -1
          ? [part, ""]
          : [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
      }),
  );
}

function createAdminSession(email) {
  const token = randomBytes(32).toString("base64url");
  adminSessions.set(token, {
    email,
    expiresAt: Date.now() + sessionMaxAgeSeconds * 1000,
  });
  return token;
}

function adminSessionFromRequest(req) {
  const token = parseCookies(req)[sessionCookieName];
  const session = token ? adminSessions.get(token) : null;
  if (!session) return null;
  if (Date.now() > session.expiresAt) {
    adminSessions.delete(token);
    return null;
  }
  session.expiresAt = Date.now() + sessionMaxAgeSeconds * 1000;
  return session;
}

function requireAdmin(req) {
  const session = adminSessionFromRequest(req);
  if (!session) throw new HttpError(401, "Admin login required", "unauthorized");
  return session;
}

function setAdminCookie(res, token) {
  res.setHeader(
    "Set-Cookie",
    `${sessionCookieName}=${encodeURIComponent(token)}; Path=/; Max-Age=${sessionMaxAgeSeconds}; HttpOnly; SameSite=Strict`,
  );
}

function clearAdminCookie(res, req) {
  const token = parseCookies(req)[sessionCookieName];
  if (token) adminSessions.delete(token);
  res.setHeader("Set-Cookie", `${sessionCookieName}=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict`);
}

const curatedTagsByLanguage = {
  en: [
    "family",
    "friends",
    "summer",
    "school",
    "love",
    "mother",
    "father",
    "childhood",
    "holiday",
    "birthday",
    "beach",
    "home",
    "life",
    "memory",
  ],
  fr: [
    "souvenir",
    "souvenirs",
    "amis",
    "famille",
    "vacances",
    "ete",
    "ecole",
    "amour",
    "maison",
    "enfance",
    "anniversaire",
    "maman",
    "papa",
    "vie",
  ],
  zh: [
    "回忆",
    "家人",
    "朋友",
    "童年",
    "夏天",
    "学校",
    "生日",
    "旅行",
    "母亲",
    "父亲",
    "生活",
    "爱",
  ],
};

const relatedTagStopWords = {
  en: new Set([
    "about",
    "all",
    "and",
    "are",
    "been",
    "but",
    "for",
    "from",
    "had",
    "has",
    "have",
    "her",
    "his",
    "how",
    "our",
    "that",
    "the",
    "their",
    "there",
    "these",
    "this",
    "those",
    "was",
    "were",
    "what",
    "when",
    "where",
    "which",
    "who",
    "why",
    "with",
    "you",
    "your",
  ]),
  fr: new Set([
    "avec",
    "aux",
    "avait",
    "avoir",
    "dans",
    "des",
    "elle",
    "est",
    "ete",
    "etre",
    "les",
    "leur",
    "leurs",
    "mais",
    "mes",
    "mon",
    "nous",
    "pas",
    "plus",
    "pour",
    "que",
    "qui",
    "sans",
    "ses",
    "son",
    "sur",
    "tous",
    "tout",
    "une",
    "vous",
  ]),
  zh: new Set(["一个", "一些", "这个", "那个", "我们", "你们", "他们", "自己"]),
};

const defaultPageContent = {
  en: [
    {
      slug: "about",
      title: "About this archive",
      excerpt: "A living memory archive that can also become a personal blog.",
      body_markdown:
        "# About this archive\n\nI Remember began as a public memory field: a quiet place where each photograph can hold a short recollection.\n\nThis restored version keeps that public memory flow, but the same object can now grow into a longer essay. When an entry is longer, the public card shows a short excerpt first and offers **Read more** for the full text.",
      legacy_id: 12001,
    },
    {
      slug: "terms",
      title: "Terms and Conditions",
      excerpt: "Submission, moderation, deletion, and ownership notes for this archive.",
      body_markdown:
        "# Terms and Conditions\n\nUse this page to publish the current terms for submissions, moderation, privacy, and deletion requests.\n\nBecause this site accepts public memories without requiring an account, the owner should keep this page clear and easy to review.",
      legacy_id: 12002,
    },
    {
      slug: "credits",
      title: "Credits",
      excerpt: "A place to credit the original project and the people maintaining this version.",
      body_markdown:
        "# Credits\n\nThis archive preserves the visual language of the original I Remember experience while making the backend self-hosted and editable.\n\nAdd project, design, music, hosting, and maintenance credits here.",
      legacy_id: 12003,
    },
  ],
  fr: [
    {
      slug: "about",
      title: "A propos de cette archive",
      excerpt: "Une archive vivante de souvenirs, prete a devenir un blog personnel.",
      body_markdown:
        "# A propos de cette archive\n\nI Remember est un champ de souvenirs public, calme, ou chaque photographie peut porter une histoire.\n\nCette version conserve le geste public du souvenir et permet aussi aux entrees longues de devenir des textes complets avec **Read more**.",
      legacy_id: 12001,
    },
    {
      slug: "terms",
      title: "Mentions legales",
      excerpt: "Notes de publication, moderation, suppression et confidentialite.",
      body_markdown:
        "# Mentions legales\n\nUtilisez cette page pour publier les regles de contribution, de moderation, de confidentialite et de suppression.\n\nComme le site accepte des souvenirs publics sans compte, cette page doit rester claire.",
      legacy_id: 12002,
    },
    {
      slug: "credits",
      title: "Credits",
      excerpt: "Un espace pour remercier le projet original et les personnes qui maintiennent cette version.",
      body_markdown:
        "# Credits\n\nCette archive conserve le langage visuel de I Remember tout en rendant le backend auto-heberge et editable.\n\nAjoutez ici les credits du projet, du design, de la musique, de l'hebergement et de la maintenance.",
      legacy_id: 12003,
    },
  ],
  zh: [
    {
      slug: "about",
      title: "关于这个记忆档案",
      excerpt: "一个可以继续收集回忆，也可以作为个人博客使用的档案。",
      body_markdown:
        "# 关于这个记忆档案\n\nI Remember 原本是一个公共记忆场：每张照片都可以承载一段短短的回忆。\n\n这个恢复版本保留不用登录也能留下记忆的入口，同时允许同一个 Memory 承载更长的文章。长文会先显示摘要，再通过 **Read more** 阅读全文。",
      legacy_id: 12001,
    },
    {
      slug: "terms",
      title: "条款",
      excerpt: "用于说明投稿、审核、删除和数据使用规则。",
      body_markdown:
        "# 条款\n\n你可以在这里编辑公开投稿、审核、隐私、删除请求等规则。\n\n因为网站保留了不用登录也可以留下记忆的功能，这个页面应该保持清晰、易读。",
      legacy_id: 12002,
    },
    {
      slug: "credits",
      title: "鸣谢",
      excerpt: "用于记录原项目和当前维护者的说明。",
      body_markdown:
        "# 鸣谢\n\n这个版本保留 I Remember 的视觉语言，同时让后台变成可自托管、可编辑的系统。\n\n你可以在这里添加项目、设计、音乐、部署和维护相关的鸣谢。",
      legacy_id: 12003,
    },
  ],
};

const defaultMenuItems = {
  en: [
    { uid: "footer_about", label: "About", item_type: "PAGE", target_value: "about", position: 10 },
    { uid: "footer_donate", label: "Donate", item_type: "EXTERNAL", url: "https://don.frm.org/Iremember/", position: 20, opens_new_tab: true },
    { uid: "footer_terms", label: "Terms and Conditions", item_type: "PAGE", target_value: "terms", position: 30 },
    { uid: "footer_credits", label: "Credits", item_type: "PAGE", target_value: "credits", position: 40 },
    { uid: "footer_language", label: "langue_en", item_type: "LANGUAGE", position: 50 },
  ],
  fr: [
    { uid: "footer_about", label: "A propos", item_type: "PAGE", target_value: "about", position: 10 },
    { uid: "footer_donate", label: "Faire un don", item_type: "EXTERNAL", url: "https://don.frm.org/jemesouviens/", position: 20, opens_new_tab: true },
    { uid: "footer_terms", label: "Mentions legales", item_type: "PAGE", target_value: "terms", position: 30 },
    { uid: "footer_credits", label: "Credits", item_type: "PAGE", target_value: "credits", position: 40 },
    { uid: "footer_language", label: "langue_fr", item_type: "LANGUAGE", position: 50 },
  ],
  zh: [
    { uid: "footer_about", label: "关于", item_type: "PAGE", target_value: "about", position: 10 },
    { uid: "footer_donate", label: "捐赠", item_type: "EXTERNAL", url: "https://don.frm.org/Iremember/", position: 20, opens_new_tab: true },
    { uid: "footer_terms", label: "条款", item_type: "PAGE", target_value: "terms", position: 30 },
    { uid: "footer_credits", label: "鸣谢", item_type: "PAGE", target_value: "credits", position: 40 },
    { uid: "footer_language", label: "语言", item_type: "LANGUAGE", position: 50 },
  ],
};

const defaultFooterMenuItems = {
  en: [
    { uid: "footer_donate", label: "Donate", item_type: "EXTERNAL", url: "https://don.frm.org/Iremember/", position: 20, opens_new_tab: true },
    { uid: "footer_terms", label: "Terms and Conditions", item_type: "TERMS", position: 30 },
    { uid: "footer_credits", label: "Credits", item_type: "CREDITS", position: 40 },
    { uid: "footer_language", label: "language", item_type: "LANGUAGE", position: 50 },
  ],
  fr: [
    { uid: "footer_donate", label: "Faire un don", item_type: "EXTERNAL", url: "https://don.frm.org/jemesouviens/", position: 20, opens_new_tab: true },
    { uid: "footer_terms", label: "Mentions legales", item_type: "TERMS", position: 30 },
    { uid: "footer_credits", label: "Credits", item_type: "CREDITS", position: 40 },
    { uid: "footer_language", label: "langue", item_type: "LANGUAGE", position: 50 },
  ],
  zh: [
    { uid: "footer_donate", label: "捐赠", item_type: "EXTERNAL", url: "https://don.frm.org/Iremember/", position: 20, opens_new_tab: true },
    { uid: "footer_terms", label: "条款", item_type: "TERMS", position: 30 },
    { uid: "footer_credits", label: "鸣谢", item_type: "CREDITS", position: 40 },
    { uid: "footer_language", label: "语言", item_type: "LANGUAGE", position: 50 },
  ],
};

function loadPostsFromHtml(htmlUrl, language) {
  try {
    const html = readFileSync(htmlUrl, "utf8");
    const match = html.match(/var DEFAULT_POSTS = ([\s\S]*?);\n\s*var DEFAULT_POST =/);
    if (!match) return [];
    const parsed = JSON.parse(match[1]);
    const language_id = languageId(language);
    return Array.isArray(parsed?.data?.posts)
      ? parsed.data.posts.map((post) => ({ ...post, language_id }))
      : [];
  } catch (error) {
    return [];
  }
}

function ensureStorage() {
  mkdirSync(storageDirUrl, { recursive: true });
  mkdirSync(uploadsDirUrl, { recursive: true });
}

function loadSubmittedPosts() {
  if (!existsSync(submittedPostsUrl)) return [];

  try {
    const parsed = JSON.parse(readFileSync(submittedPostsUrl, "utf8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

function persistRuntimeSubmittedPosts() {
  ensureStorage();
  writeFileSync(
    submittedPostsUrl,
    `${JSON.stringify(runtimeSubmittedPosts, null, 2)}\n`,
  );
}

export function normalizeLanguage(value = "") {
  const language = String(value || "").toLowerCase();
  if (language === "fr" || language === "zh") return language;
  return "en";
}

function languageId(language) {
  if (normalizeLanguage(language) === "fr") return "1";
  if (normalizeLanguage(language) === "zh") return "3";
  return "2";
}

function languageFromLegacyId(languageIdValue) {
  if (String(languageIdValue) === "1") return "fr";
  if (String(languageIdValue) === "3") return "zh";
  return "en";
}

export function languageFromPath(pathname, defaultLanguage = "en") {
  if (pathname === "/fr" || pathname.startsWith("/fr/")) return "fr";
  if (pathname === "/zh" || pathname.startsWith("/zh/")) return "zh";
  if (pathname === "/en" || pathname.startsWith("/en/")) return "en";
  return normalizeLanguage(defaultLanguage);
}

function languageFromRequest(url, pathname, defaultLanguage = "en") {
  return normalizeLanguage(url.searchParams.get("ln") || languageFromPath(pathname, defaultLanguage));
}

function contentLanguage(defaultLanguage = "en") {
  return normalizeLanguage(defaultLanguage);
}

function postsForLanguage(language) {
  return defaultPostsByLanguage[normalizeLanguage(language)] || [];
}

function submittedPostsForLanguage(language) {
  const id = languageId(language);
  return runtimeSubmittedPosts.filter((post) => post.language_id === id);
}

function fallbackAvailablePosts(language) {
  return [...submittedPostsForLanguage(language), ...postsForLanguage(language)];
}

export function normalizeTag(value = "") {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function routeTag(value = "") {
  return normalizeTag(value).replace(/\s+/g, "-");
}

function postHaystack(post) {
  return normalizeTag(
    `${post.name || ""} ${post.title || ""} ${post.excerpt || ""} ${post.text || ""} ${post.body_markdown || ""}`,
  );
}

function postHaystackTokens(post) {
  return postHaystack(post).split(" ").filter(Boolean);
}

function matchingPosts(posts, tag) {
  const normalized = normalizeTag(tag);
  if (!normalized) return posts;

  const words = normalized.split(" ").filter(Boolean);
  const exact = posts.filter((post) => {
    const haystack = postHaystack(post);
    if (words.length === 1) {
      return postHaystackTokens(post).includes(words[0]) || haystack.includes(words[0]);
    }
    return haystack.includes(normalized);
  });
  if (exact.length) return exact;

  return posts.filter((post) => {
    const tokens = postHaystackTokens(post);
    return words.some((word) => {
      return word.length > 1 && tokens.some((token) => token.includes(word));
    });
  });
}

function numericPostId(post) {
  const id = Number.parseInt(post?.id, 10);
  return Number.isFinite(id) ? id : -1;
}

function paginatePosts(posts, url) {
  const lastId = Number.parseInt(url.searchParams.get("lastId") || "", 10);
  const page =
    Number.isFinite(lastId) && lastId >= 0
      ? posts.filter((post) => numericPostId(post) < lastId)
      : posts;

  return page.slice(0, postSearchResultMax);
}

function uniquePosts(posts) {
  const seen = new Set();
  return posts.filter((post) => {
    const key = String(post.public_id || post.uid || post.id || "");
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function textTagTokens(value = "", language = "en") {
  const stopWords = relatedTagStopWords[normalizeLanguage(language)];
  const matches = String(value).toLowerCase().match(/[\p{L}\p{N}]+/gu) || [];
  return [...new Set(matches)].filter((word) => {
    return word.length > 1 && !stopWords.has(word);
  });
}

function relatedTagCountsForPosts(post, posts, language = "en") {
  if (post.tags && Object.keys(post.tags).length) return post.tags;

  const ownTokens = textTagTokens(post.text, language);
  const otherTokenSets = posts
    .filter((candidate) => String(candidate.id) !== String(post.id))
    .map((candidate) => {
      return new Set(
        textTagTokens(`${candidate.name || ""} ${candidate.text || ""}`, language),
      );
    });
  const related = {};

  for (const token of ownTokens) {
    const count = otherTokenSets.reduce((total, tokenSet) => {
      return total + (tokenSet.has(token) ? 1 : 0);
    }, 0);
    if (count > 0) related[token] = count;
  }

  return Object.fromEntries(
    Object.entries(related).sort((left, right) => {
      return right[1] - left[1] || left[0].localeCompare(right[0]);
    }),
  );
}

function autocompleteList(posts, fragment, language = "en") {
  const normalized = routeTag(fragment);
  if (!normalized) return [];

  const extracted = new Set(curatedTagsByLanguage[normalizeLanguage(language)]);
  for (const post of posts) {
    const text = postHaystack(post);
    for (const token of text.split(" ")) {
      if (token.length > 1) extracted.add(token);
    }
  }

  return [...extracted]
    .map(routeTag)
    .filter((tag) => tag.startsWith(normalized) && tag !== normalized)
    .sort((a, b) => a.length - b.length || a.localeCompare(b))
    .slice(0, 3);
}

function setSecurityHeaders(res, { html = false } = {}) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  if (html) {
    res.setHeader(
      "Content-Security-Policy",
      [
        "default-src 'self'",
        "base-uri 'self'",
        "object-src 'none'",
        "frame-ancestors 'none'",
        "img-src 'self' data: blob:",
        "media-src 'self'",
        "style-src 'self' 'unsafe-inline'",
        "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
        "connect-src 'self'",
        "form-action 'self'",
      ].join("; "),
    );
  }
}

function sendJson(req, res, payload, statusCode = 200) {
  const url = new URL(req.url || "/", "http://i-remember.local");
  const callback = url.searchParams.get("callback");
  const supportsJsonp =
    req.method === "GET" &&
    callback &&
    /^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*$/.test(callback);
  const json = JSON.stringify(payload);
  const body = supportsJsonp ? `${callback}(${json});` : json;

  res.statusCode = statusCode;
  setSecurityHeaders(res);
  res.setHeader("Cache-Control", "no-store");
  res.setHeader(
    "Content-Type",
    supportsJsonp
      ? "application/javascript; charset=utf-8"
      : "application/json; charset=utf-8",
  );
  res.end(body);
}

function sendStatus(res, statusCode, message) {
  res.statusCode = statusCode;
  setSecurityHeaders(res);
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.end(message);
}

function sendHtml(res, html) {
  res.statusCode = 200;
  setSecurityHeaders(res, { html: true });
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.end(html);
}

function clientAddress(req) {
  return req.socket?.remoteAddress || "unknown";
}

function assertRateLimit(req, bucketName, limit, windowMs) {
  const now = Date.now();
  const key = `${bucketName}:${clientAddress(req)}`;
  const bucket = rateLimitBuckets.get(key) || [];
  const active = bucket.filter((timestamp) => now - timestamp < windowMs);
  if (active.length >= limit) {
    rateLimitBuckets.set(key, active);
    throw new HttpError(429, "Too many requests", "rate_limited");
  }
  active.push(now);
  rateLimitBuckets.set(key, active);
}

function assertSameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return;

  let parsed;
  try {
    parsed = new URL(origin);
  } catch (error) {
    throw new HttpError(403, "Invalid origin", "invalid_origin");
  }

  const host = req.headers.host;
  if (!host || parsed.host !== host) {
    throw new HttpError(403, "Cross-origin writes are not allowed", "invalid_origin");
  }
}

function collectRequest(req, limitBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let rejected = false;
    req.on("data", (chunk) => {
      if (rejected) return;
      size += chunk.length;
      if (size > limitBytes) {
        rejected = true;
        reject(new HttpError(413, "Request body too large", "request_too_large"));
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (!rejected) resolve(Buffer.concat(chunks));
    });
    req.on("error", (error) => {
      if (!rejected) reject(error);
    });
  });
}

function parseMultipart(req, body) {
  const contentType = req.headers["content-type"] || "";
  const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  const fields = {};
  const files = {};
  if (!boundaryMatch) return { fields, files };

  const boundary = boundaryMatch[1] || boundaryMatch[2];
  const marker = Buffer.from(`--${boundary}`);
  let markerIndex = body.indexOf(marker);

  while (markerIndex !== -1) {
    const partStart = markerIndex + marker.length;
    const nextMarkerIndex = body.indexOf(marker, partStart);
    if (nextMarkerIndex === -1) break;

    let part = body.slice(partStart, nextMarkerIndex);
    if (part.subarray(0, 2).toString("utf8") === "\r\n") {
      part = part.subarray(2);
    }
    if (part.subarray(-2).toString("utf8") === "\r\n") {
      part = part.subarray(0, -2);
    }

    const headerEnd = part.indexOf(Buffer.from("\r\n\r\n"));
    if (headerEnd !== -1) {
      const headers = part.subarray(0, headerEnd).toString("utf8");
      const content = part.subarray(headerEnd + 4);
      const disposition =
        headers.match(/^content-disposition:\s*([^\r\n]+)/im)?.[1] || "";
      const name = disposition.match(/name="([^"]+)"/)?.[1];
      const filename = disposition.match(/filename="([^"]*)"/)?.[1];
      const fileType =
        headers.match(/^content-type:\s*([^\r\n]+)/im)?.[1]?.trim() ||
        "application/octet-stream";

      if (name && filename) {
        files[name] = {
          data: content,
          filename,
          contentType: fileType,
        };
      } else if (name) {
        fields[name] = content.toString("utf8");
      }
    }

    markerIndex = nextMarkerIndex;
  }

  return { fields, files };
}

function parseFields(req, body) {
  const contentType = req.headers["content-type"] || "";
  const fields = {};

  if (contentType.includes("application/json")) {
    return parseJsonObject(body);
  }

  if (contentType.includes("application/x-www-form-urlencoded")) {
    const params = new URLSearchParams(body.toString("utf8"));
    for (const [key, value] of params.entries()) fields[key] = value;
    return fields;
  }

  const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  if (!boundaryMatch) return fields;

  const boundary = `--${boundaryMatch[1] || boundaryMatch[2]}`;
  const parts = body.toString("binary").split(boundary);

  for (const part of parts) {
    const nameMatch = part.match(/name="([^"]+)"/);
    if (!nameMatch) continue;

    const splitIndex = part.indexOf("\r\n\r\n");
    if (splitIndex === -1) continue;

    let value = part.slice(splitIndex + 4);
    value = value.replace(/\r\n--$/, "").replace(/\r\n$/, "");
    fields[nameMatch[1]] = Buffer.from(value, "binary").toString("utf8");
  }

  return fields;
}

function parseJsonObject(body) {
  if (!body.length) return {};

  try {
    const value = JSON.parse(body.toString("utf8"));
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("JSON body must be an object");
    }
    return value;
  } catch (error) {
    throw new HttpError(400, "Invalid JSON body", "invalid_json");
  }
}

function firstUploadedImage(files) {
  return Object.values(files).find((file) => {
    return file?.filename && file.data?.length;
  });
}

function storedMimeType(file) {
  if (/^image\/(gif|jpeg|jpg|png|webp)$/i.test(file.contentType)) {
    return file.contentType.replace(/^image\/jpg$/i, "image/jpeg");
  }

  if (/\.png$/i.test(file.filename)) return "image/png";
  if (/\.gif$/i.test(file.filename)) return "image/gif";
  if (/\.webp$/i.test(file.filename)) return "image/webp";
  return "image/jpeg";
}

function mimeTypeForPath(pathname) {
  if (/\.png$/i.test(pathname)) return "image/png";
  if (/\.gif$/i.test(pathname)) return "image/gif";
  if (/\.webp$/i.test(pathname)) return "image/webp";
  return "image/jpeg";
}

function htmlText(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function inlineMarkdown(value) {
  return htmlText(value)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+|\/[^)\s]+)\)/g, (_match, label, href) => {
      return `<a href="${htmlText(href)}" target="_blank" rel="noopener noreferrer">${label}</a>`;
    });
}

function markdownToHtml(value = "") {
  const lines = String(value || "").replace(/\r\n/g, "\n").split("\n");
  const output = [];
  let listOpen = false;

  const closeList = () => {
    if (listOpen) {
      output.push("</ul>");
      listOpen = false;
    }
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      closeList();
      continue;
    }

    if (trimmed.startsWith("### ")) {
      closeList();
      output.push(`<h3>${inlineMarkdown(trimmed.slice(4))}</h3>`);
      continue;
    }

    if (trimmed.startsWith("## ")) {
      closeList();
      output.push(`<h2>${inlineMarkdown(trimmed.slice(3))}</h2>`);
      continue;
    }

    if (trimmed.startsWith("# ")) {
      closeList();
      output.push(`<h1>${inlineMarkdown(trimmed.slice(2))}</h1>`);
      continue;
    }

    if (/^[-*]\s+/.test(trimmed)) {
      if (!listOpen) {
        output.push("<ul>");
        listOpen = true;
      }
      output.push(`<li>${inlineMarkdown(trimmed.replace(/^[-*]\s+/, ""))}</li>`);
      continue;
    }

    closeList();
    output.push(`<p>${inlineMarkdown(trimmed)}</p>`);
  }

  closeList();
  return output.join("");
}

function plainFromMarkdown(value = "") {
  return String(value || "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]+\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[#>*_~`-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function excerptFromMarkdown(value = "", maxLength = 220) {
  const plain = plainFromMarkdown(value);
  return plain.length > maxLength ? `${plain.slice(0, maxLength - 1).trim()}...` : plain;
}

function memoryToPost(row) {
  const bodyMarkdown = row.body_markdown || row.text || "";
  const title = row.title || row.name || "I Remember";
  const excerpt = row.excerpt || excerptFromMarkdown(bodyMarkdown || row.text || "");
  return {
    id: String(row.legacy_id ?? row.id),
    uid: row.uid,
    public_id: String(row.public_id || ""),
    name: htmlText(row.name || "I Remember"),
    title: htmlText(title),
    img: row.image_key || "revival-upload",
    img_offset_x: String(row.img_offset_x ?? "0"),
    img_offset_y: String(row.img_offset_y ?? "0"),
    text: htmlText(row.text || excerpt || ""),
    excerpt: htmlText(excerpt || ""),
    body_markdown: bodyMarkdown,
    body_html: markdownToHtml(bodyMarkdown || row.text || ""),
    is_long_form: row.is_long_form ? "1" : "0",
    resized_img_width: String(row.resized_img_width ?? "600"),
    resized_img_height: String(row.resized_img_height ?? "600"),
    has_created_tags: row.has_created_tags === false ? "0" : "1",
    is_stared: row.is_stared ? "1" : "0",
    created_at: normalizeLegacyDate(row.created_at),
    language_id: languageId(row.language_code),
    ...(row.tags ? { tags: row.tags } : {}),
  };
}

function legacyPostToMemoryRow(post, source = "archive") {
  const language = languageFromLegacyId(post.language_id);
  const legacyId = Number.parseInt(post.id, 10);
  return {
    uid: post.uid || `mem_${language}_${Number.isFinite(legacyId) ? legacyId : randomUUID()}`,
    legacy_id: Number.isFinite(legacyId) ? legacyId : null,
    public_id: post.public_id || post.publicId || null,
    language_code: language,
    name: post.name || "I Remember",
    text: post.text || "",
    image_key: post.img || "revival-upload",
    img_offset_x: Number.parseFloat(post.img_offset_x || "0") || 0,
    img_offset_y: Number.parseFloat(post.img_offset_y || "0") || 0,
    resized_img_width: Number.parseInt(post.resized_img_width || "600", 10) || 600,
    resized_img_height: Number.parseInt(post.resized_img_height || "600", 10) || 600,
    has_created_tags: post.has_created_tags !== "0",
    is_stared: post.is_stared === "1",
    created_at: legacyDateToIso(post.created_at),
    tags: post.tags || null,
    title: post.title || post.name || "I Remember",
    excerpt: post.excerpt || post.text || "",
    body_markdown: post.body_markdown || post.text || "",
    content_format: post.content_format || "plain",
    is_long_form: Boolean(post.is_long_form),
    source,
    status: post.status || "NORMAL",
  };
}

function normalizeLegacyDate(value) {
  if (!value) return sqlTimestamp(new Date());
  if (String(value).includes("T")) return sqlTimestamp(new Date(value));
  return String(value).replace("T", " ").replace(/\.\d+Z$/, "");
}

function legacyDateToIso(value) {
  if (!value) return new Date().toISOString();
  if (String(value).includes("T")) return new Date(value).toISOString();
  return new Date(`${String(value).replace(" ", "T")}Z`).toISOString();
}

function sqlTimestamp(date) {
  return date.toISOString().slice(0, 19).replace("T", " ");
}

function localPublicUrl(pathname) {
  return new URL(`./public${pathname}`, rootUrl);
}

function publicUploadImageForPath(pathname) {
  if (!/^\/uploads\/(?:tmp|posts)\//.test(pathname)) return null;

  const fileUrl = localPublicUrl(pathname);
  if (!existsSync(fileUrl)) return null;

  return {
    data: readFileSync(fileUrl),
    filename: pathname.split("/").pop() || "image.jpg",
    mimeType: mimeTypeForPath(pathname),
  };
}

function fallbackPostImageForPath(pathname) {
  const match = pathname.match(
    /^\/uploads\/posts\/([^/]+)\/(resized|thumb)\.jpg$/,
  );
  if (!match || match[1] === "revival-upload") return null;

  return fallbackPostImages[match[2]] || null;
}

function safeUploadedFileId(fileId) {
  const value = String(fileId || "");
  return /^revival-[a-z0-9-]+$/i.test(value) ? value : null;
}

function uploadedImageUrls(fileId) {
  const safeId = safeUploadedFileId(fileId);
  if (!safeId) return null;

  return {
    data: new URL(`./${safeId}.bin`, uploadsDirUrl),
    meta: new URL(`./${safeId}.json`, uploadsDirUrl),
  };
}

function runtimeUploadedImageForFileId(fileId, variant = "resized") {
  const safeId = safeUploadedFileId(fileId);
  if (!safeId) return null;

  const cached = uploadedImages.get(safeId);
  if (cached) return cached[variant] || cached.resized || cached.original;

  const urls = uploadedImageUrls(safeId);
  if (!urls || !existsSync(urls.data) || !existsSync(urls.meta)) return null;

  try {
    const meta = JSON.parse(readFileSync(urls.meta, "utf8"));
    const stored = {
      resized: {
        data: readFileSync(urls.data),
        mimeType: meta.mimeType || "image/jpeg",
      },
    };
    uploadedImages.set(safeId, stored);
    return stored.resized;
  } catch (error) {
    return null;
  }
}

function runtimeUploadedImageForPath(pathname) {
  const match = pathname.match(
    /^\/uploads\/(?:tmp|posts)\/([^/]+)\/(resized|thumb)\.(?:jpg|jpeg|png|gif|webp)$/i,
  );
  if (!match) return null;
  return runtimeUploadedImageForFileId(match[1], match[2]);
}

function imagePathForVariant(row, variant) {
  if (variant === "thumb") return row.thumb_path;
  if (variant === "original") return row.original_path;
  return row.resized_path || row.original_path;
}

function legacyImagePath(imageKey, variant = "resized") {
  const safeVariant = variant === "thumb" ? "thumb" : "resized";
  return `/uploads/posts/${imageKey || "revival-upload"}/${safeVariant}.jpg`;
}

function publicMemoryUrl(post) {
  const publicId = String(post?.public_id || post?.publicId || "").trim();
  const legacyId = numericPostId(post);
  const fallback = legacyId >= 0 ? String(legacyId + postIdOffset) : "";
  return `/memory/${encodeURIComponent(publicId || fallback)}`;
}

function legacyImageUrl(imageKey, variant = "thumb") {
  return legacyImagePath(imageKey || "revival-upload", variant);
}

function adminStatus(row) {
  if (row.status === "NORMAL") return "published";
  if (row.status === "PENDING") return "pending";
  if (row.status === "REJECTED") return "rejected";
  return "archived";
}

function dbStatus(value) {
  const normalized = String(value || "").toUpperCase();
  if (["NORMAL", "PENDING", "ARCHIVED", "REJECTED"].includes(normalized)) {
    return normalized;
  }
  if (value === "published") return "NORMAL";
  if (value === "pending") return "PENDING";
  if (value === "rejected") return "REJECTED";
  return "ARCHIVED";
}

function metadataJson(value, fallback = null) {
  if (value === undefined) return fallback;
  if (value && typeof value === "object" && !Array.isArray(value)) return JSON.stringify(value);
  const text = String(value || "").trim();
  if (!text) return null;
  try {
    return JSON.stringify(JSON.parse(text));
  } catch (_error) {
    throw new HttpError(400, "Metadata must be valid JSON", "invalid_metadata");
  }
}

function adminMemory(row, language = row?.language_code || "en") {
  if (!row) return null;
  const post = memoryToPost(row);
  const bodyMarkdown = row.body_markdown || row.text || "";
  return {
    rowId: row.id,
    id: row.id,
    legacyId: row.legacy_id,
    publicId: row.public_id,
    uid: row.uid,
    title: row.title || row.name || "I Remember",
    author: row.name || "I Remember",
    language: normalizeLanguage(row.language_code),
    status: adminStatus(row),
    dbStatus: row.status,
    source: row.source,
    excerpt: row.excerpt || excerptFromMarkdown(bodyMarkdown || row.text || ""),
    text: row.text || "",
    bodyMarkdown,
    metadataJson: row.metadata_json || "",
    bodyHtml: markdownToHtml(bodyMarkdown || row.text || ""),
    isLongForm: Boolean(row.is_long_form),
    imageKey: row.image_key || "revival-upload",
    imageUrl: legacyImageUrl(row.image_key, "thumb"),
    publicUrl: publicMemoryUrl(post),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function adminPage(row) {
  if (!row) return null;
  return {
    id: row.id,
    slug: row.slug,
    language: normalizeLanguage(row.language_code),
    title: row.title,
    excerpt: row.excerpt || excerptFromMarkdown(row.body_markdown || ""),
    bodyMarkdown: row.body_markdown || "",
    bodyHtml: markdownToHtml(row.body_markdown || ""),
    status: row.status,
    linkedMemoryUid: row.linked_memory_uid || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function adminMenuItem(row) {
  if (!row) return null;
  return {
    id: row.id,
    uid: row.uid,
    language: normalizeLanguage(row.language_code),
    label: row.label,
    type: row.item_type,
    targetValue: row.target_value || "",
    url: row.url || "",
    position: row.position,
    isVisible: Boolean(row.is_visible),
    opensNewTab: Boolean(row.opens_new_tab),
  };
}

function publicMenuItem(row) {
  const item = adminMenuItem(row);
  return item
    ? {
        id: item.id,
        label: item.label,
        type: item.type,
        targetValue: item.targetValue,
        url: item.url,
        position: item.position,
        opensNewTab: item.opensNewTab,
      }
    : null;
}

function safeScriptJson(payload) {
  return JSON.stringify(payload).replace(/[<>&\u2028\u2029]/g, (char) => {
    switch (char) {
      case "<":
        return "\\u003C";
      case ">":
        return "\\u003E";
      case "&":
        return "\\u0026";
      case "\u2028":
        return "\\u2028";
      case "\u2029":
        return "\\u2029";
      default:
        return char;
    }
  });
}

function clampNumber(value, min, max, fallback = 0) {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

function cleanText(value, fallback, maxLength) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return (text || fallback).slice(0, maxLength);
}

function validatedPostFields(fields = {}, defaultLanguage = "en") {
  const language = normalizeLanguage(defaultLanguage);
  const name = fields.name || fields.author || fields.username;
  const message = fields.message || fields.text || fields.memory;
  const fileId = fields.fileId || fields.file_id || fields.img || fields.imageKey;
  return {
    language,
    name: cleanText(name, "I Remember", 80),
    message: cleanText(message, defaultMessage(language), 1000),
    fileId: safeUploadedFileId(fileId) || "revival-upload",
    imgOffsetX: String(clampNumber(fields.imgOffsetX || fields.img_offset_x, -1, 1)),
    imgOffsetY: String(clampNumber(fields.imgOffsetY || fields.img_offset_y, -1, 1)),
  };
}

function localUploadRelativePath(fileId, filename) {
  return `uploads/${fileId}/${filename}`;
}

function resolveStoredDataPath(store, storedPath) {
  if (!storedPath) return null;

  const resolved = resolve(store.dataDir, storedPath);
  if (resolved !== store.dataDir && !resolved.startsWith(`${store.dataDir}${sep}`)) {
    return null;
  }
  return resolved;
}

function storedImageForRow(store, row, variant = "resized") {
  if (!row || row.storage_type !== "LOCAL") return null;

  const storedPath = imagePathForVariant(row, variant);
  const filePath = resolveStoredDataPath(store, storedPath);
  if (!filePath || !existsSync(filePath) || !statSync(filePath).isFile()) return null;

  return {
    data: readFileSync(filePath),
    filename: filePath.split(/[\\/]/).pop() || "image.jpg",
    mimeType: mimeTypeForPath(filePath),
  };
}

function archiveImageRowForKey(imageKey) {
  const resized = publicUploadImageForPath(legacyImagePath(imageKey, "resized"));
  const thumb = publicUploadImageForPath(legacyImagePath(imageKey, "thumb"));
  const available = resized || thumb;
  return {
    image_key: imageKey,
    storage_type: available ? "ARCHIVE" : "FALLBACK",
    original_path: available ? legacyImagePath(imageKey, "resized") : null,
    resized_path: resized ? legacyImagePath(imageKey, "resized") : null,
    thumb_path: thumb ? legacyImagePath(imageKey, "thumb") : null,
    mime_type: "image/jpeg",
    sha256: available ? createHash("sha256").update(available.data).digest("hex") : null,
    fallback: !available,
  };
}

class RevivalBackend {
  constructor() {
    this.store = new RevivalSQLiteStore();
    this.ensureAdminAccount();
    this.ensureSiteSettings();
    this.ensureDefaultFooterMenu();
    if (seedArchiveData) this.seedArchiveData();
    if (seedStarterContent) this.seedAdminContent();
  }

  get mode() {
    return "sqlite";
  }

  ensureAdminAccount() {
    if (this.store.getSetting("admin.two_factor_enabled", null) === null) {
      this.store.setSetting("admin.two_factor_enabled", "false");
    }
  }

  ensureSiteSettings() {
    const defaults = {
      "site.default_language": normalizeLanguage(process.env.I_REMEMBER_DEFAULT_LANGUAGE || "en"),
      "site.anonymous_submissions": String(process.env.I_REMEMBER_ANONYMOUS_SUBMISSIONS !== "false"),
      "site.tracking_enabled": String(Boolean(process.env.UMAMI_SRC && process.env.UMAMI_WEBSITE_ID)),
      "site.umami_src": process.env.UMAMI_SRC || "",
      "site.umami_website_id": process.env.UMAMI_WEBSITE_ID || "",
    };
    const updates = {};
    for (const [key, value] of Object.entries(defaults)) {
      if (this.store.getSetting(key, null) === null) updates[key] = value;
    }
    if (Object.keys(updates).length) this.store.setSettings(updates);
  }

  ensureDefaultFooterMenu() {
    for (const language of ["en", "fr", "zh"]) {
      const settingKey = `site.footer_menu_initialized.${language}`;
      if (this.store.getSetting(settingKey, "") === "true") continue;

      const existing = this.store.listMenuItems(language);
      if (existing.length === 0) {
        for (const item of defaultFooterMenuItems[language] || []) {
          this.store.upsertMenuItem({
            ...item,
            language_code: language,
            is_visible: true,
            opens_new_tab: Boolean(item.opens_new_tab),
          });
        }
        logInfo("footer_menu_seeded", {
          language,
          count: (defaultFooterMenuItems[language] || []).length,
        });
      }
      this.store.setSetting(settingKey, "true");
    }
  }

  siteSettings() {
    return {
      defaultLanguage: normalizeLanguage(this.store.getSetting("site.default_language", "en")),
      anonymousSubmissions: boolSetting(this.store.getSetting("site.anonymous_submissions", "true"), true),
      tracking: {
        enabled: boolSetting(this.store.getSetting("site.tracking_enabled", "false"), false),
        umamiSrc: this.store.getSetting("site.umami_src", ""),
        umamiWebsiteId: this.store.getSetting("site.umami_website_id", ""),
      },
    };
  }

  adminAccount() {
    return {
      email: this.store.getSetting("admin.email", ""),
      twoFactorEnabled: boolSetting(this.store.getSetting("admin.two_factor_enabled", "false"), false),
    };
  }

  needsAdminSetup() {
    return !this.store.getSetting("admin.password_hash", "");
  }

  publicAdminProfile() {
    return {
      ...this.adminAccount(),
      hasPassword: Boolean(this.store.getSetting("admin.password_hash", "")),
    };
  }

  loginAdmin(input = {}) {
    if (this.needsAdminSetup()) {
      throw new HttpError(409, "Admin setup is required", "admin_setup_required");
    }
    const account = this.adminAccount();
    const email = String(input.email || input.username || "").trim().toLowerCase();
    const expectedEmail = String(account.email || "").trim().toLowerCase();
    const passwordHash = this.store.getSetting("admin.password_hash", "");
    if (!email || email !== expectedEmail || !verifyPassword(input.password, passwordHash)) {
      throw new HttpError(401, "Invalid admin credentials", "invalid_credentials");
    }

    const secret = this.store.getSetting("admin.two_factor_secret", "");
    if (account.twoFactorEnabled) {
      if (!input.totp) return { requiresTwoFactor: true, email: account.email };
      if (!secret || !verifyTotp(secret, input.totp)) {
        throw new HttpError(401, "Invalid two-factor code", "invalid_two_factor_code");
      }
    }

    return {
      requiresTwoFactor: false,
      account: this.publicAdminProfile(),
    };
  }

  setupAdmin(input = {}) {
    if (!this.needsAdminSetup()) {
      throw new HttpError(409, "Admin account already exists", "admin_exists");
    }
    const email = cleanText(input.email || input.username, "", 180);
    const password = String(input.password || "");
    if (!email) throw new HttpError(400, "Username or email is required", "missing_email");
    if (password.length < 10) {
      throw new HttpError(400, "Password must be at least 10 characters", "weak_password");
    }
    this.store.setSettings({
      "admin.email": email,
      "admin.password_hash": hashPassword(password),
      "admin.two_factor_enabled": "false",
    });
    return this.publicAdminProfile();
  }

  updateSiteSettings(input = {}) {
    const current = this.siteSettings();
    const tracking = input.tracking || {};
    const next = {
      defaultLanguage: normalizeLanguage(input.defaultLanguage || current.defaultLanguage),
      anonymousSubmissions: Boolean(input.anonymousSubmissions),
      tracking: {
        enabled: Boolean(tracking.enabled),
        umamiSrc: cleanText(tracking.umamiSrc ?? current.tracking.umamiSrc, "", 500),
        umamiWebsiteId: cleanText(tracking.umamiWebsiteId ?? current.tracking.umamiWebsiteId, "", 160),
      },
    };
    this.store.setSettings({
      "site.default_language": next.defaultLanguage,
      "site.anonymous_submissions": String(next.anonymousSubmissions),
      "site.tracking_enabled": String(next.tracking.enabled),
      "site.umami_src": next.tracking.umamiSrc,
      "site.umami_website_id": next.tracking.umamiWebsiteId,
    });
    return this.siteSettings();
  }

  updateAdminAccount(input = {}) {
    const passwordHash = this.store.getSetting("admin.password_hash", "");
    if (!verifyPassword(input.currentPassword, passwordHash)) {
      throw new HttpError(401, "Current password is incorrect", "invalid_credentials");
    }
    const updates = {};
    if (input.email) updates["admin.email"] = cleanText(input.email, "admin@i-remember.fr", 180);
    if (input.newPassword) {
      if (String(input.newPassword).length < 10) {
        throw new HttpError(400, "New password must be at least 10 characters", "weak_password");
      }
      updates["admin.password_hash"] = hashPassword(input.newPassword);
    }
    if (Object.keys(updates).length) this.store.setSettings(updates);
    return this.publicAdminProfile();
  }

  setupTwoFactor() {
    const secret = base32Encode(randomBytes(20));
    this.store.setSetting("admin.two_factor_pending_secret", secret);
    const email = this.adminAccount().email;
    return {
      secret,
      otpauthUrl: `otpauth://totp/I%20Remember:${encodeURIComponent(email)}?secret=${secret}&issuer=I%20Remember`,
    };
  }

  enableTwoFactor(input = {}) {
    const secret = this.store.getSetting("admin.two_factor_pending_secret", "");
    if (!secret || !verifyTotp(secret, input.totp)) {
      throw new HttpError(400, "Invalid two-factor code", "invalid_two_factor_code");
    }
    this.store.setSettings({
      "admin.two_factor_secret": secret,
      "admin.two_factor_pending_secret": "",
      "admin.two_factor_enabled": "true",
    });
    return this.publicAdminProfile();
  }

  disableTwoFactor(input = {}) {
    const secret = this.store.getSetting("admin.two_factor_secret", "");
    if (this.adminAccount().twoFactorEnabled && (!secret || !verifyTotp(secret, input.totp))) {
      throw new HttpError(400, "Invalid two-factor code", "invalid_two_factor_code");
    }
    this.store.setSettings({
      "admin.two_factor_secret": "",
      "admin.two_factor_pending_secret": "",
      "admin.two_factor_enabled": "false",
    });
    return this.publicAdminProfile();
  }

  seedArchiveData() {
    const imported = new Set();
    for (const language of ["en", "fr", "zh"]) {
      for (const post of postsForLanguage(language)) {
        const row = legacyPostToMemoryRow(post, "archive");
        row.status = "NORMAL";
        this.store.upsertMemory(row, "NORMAL");
        if (post.img && !imported.has(post.img)) {
          this.store.upsertImage(archiveImageRowForKey(post.img));
          imported.add(post.img);
        }
      }
    }

    for (const post of runtimeSubmittedPosts) {
      const row = legacyPostToMemoryRow(post, "legacy-submission");
      row.status = "NORMAL";
      this.store.upsertMemory(row, "NORMAL");
      if (post.img && !imported.has(post.img)) {
        this.store.upsertImage(archiveImageRowForKey(post.img));
        imported.add(post.img);
      }
    }
  }

  seedAdminContent() {
    for (const language of ["en", "fr", "zh"]) {
      for (const page of defaultPageContent[language] || []) {
        this.savePage({
          ...page,
          language,
          status: "PUBLISHED",
          seedLegacyId: page.legacy_id,
        });
      }

      for (const item of defaultMenuItems[language] || []) {
        this.store.upsertMenuItem({
          ...item,
          language_code: language,
          is_visible: true,
          opens_new_tab: Boolean(item.opens_new_tab),
        });
      }
    }
  }

  async allPosts(language) {
    return uniquePosts(this.store.listMemories(normalizeLanguage(language)).map(memoryToPost));
  }

  memoryByPublicId(publicId, fallbackLanguage = "en") {
    const row = this.store.getMemoryByPublicId(publicId);
    if (row) return row;

    const legacyId = Number.parseInt(publicId, 10) - postIdOffset;
    if (!Number.isFinite(legacyId)) return null;
    return this.store.getMemory(normalizeLanguage(fallbackLanguage), legacyId);
  }

  async directPost(publicId, fallbackLanguage = "en") {
    const row = this.memoryByPublicId(publicId, fallbackLanguage);
    return row ? memoryToPost(row) : null;
  }

  async searchPosts(language, tag, url) {
    const posts = await this.allPosts(language);
    return paginatePosts(matchingPosts(posts, tag), url);
  }

  async relatedTagCounts(language, id) {
    const posts = await this.allPosts(language);
    const post = posts.find((item) => String(item.id) === String(id));
    return post ? relatedTagCountsForPosts(post, posts, language) : {};
  }

  async autocomplete(language, fragment) {
    const posts = await this.allPosts(language);
    return autocompleteList(posts, fragment, language);
  }

  adminBootstrap(language = "en") {
    const normalized = normalizeLanguage(language);
    const memories = this.store
      .listAllMemories(normalized, 500)
      .map((row) => adminMemory(row, normalized));
    const pages = this.store.listPages(normalized).map(adminPage);
    const menu = this.store.listMenuItems(normalized).map(adminMenuItem);
    const attachments = this.store.listImages(80).map((row) => {
      return {
        imageKey: row.image_key,
        storageType: row.storage_type,
        thumbUrl: legacyImageUrl(row.image_key, "thumb"),
        resizedUrl: legacyImageUrl(row.image_key, "resized"),
        mimeType: row.mime_type,
        updatedAt: row.updated_at,
      };
    });
    const counts = {
      pendingMemory: memories.filter((memory) => memory.dbStatus === "PENDING").length,
      publishedMemory: memories.filter((memory) => memory.dbStatus === "NORMAL").length,
      archivedMemory: memories.filter((memory) => memory.dbStatus === "ARCHIVED").length,
      pages: pages.length,
      menuItems: menu.length,
      attachments: attachments.length,
    };

    return {
      language: normalized,
      counts,
      memories,
      pages,
      menu,
      comments: [],
      attachments,
      settings: {
        ...this.siteSettings(),
        autoApproveSubmissions,
        account: this.publicAdminProfile(),
      },
    };
  }

  adminExport(language = "en") {
    const data = this.adminBootstrap(language);
    return {
      generatedAt: new Date().toISOString(),
      defaultLanguage: this.siteSettings().defaultLanguage,
      format: "i-remember-admin-export-v1",
      data,
    };
  }

  saveMemory(input = {}) {
    const language = normalizeLanguage(
      input.language || input.language_code || this.siteSettings().defaultLanguage,
    );
    const existing = input.id ? this.store.getMemoryByRowId(input.id) : null;
    const legacyId = existing?.legacy_id || this.store.nextLegacyId(language);
    const bodyMarkdown = String(input.bodyMarkdown ?? input.body_markdown ?? existing?.body_markdown ?? input.text ?? "");
    const excerpt = cleanText(
      input.excerpt ?? existing?.excerpt ?? excerptFromMarkdown(bodyMarkdown),
      "",
      600,
    );
    const title = cleanText(input.title ?? existing?.title ?? input.name, "I Remember", 180);
    const row = this.store.upsertMemory({
      ...(existing || {}),
      uid: existing?.uid || `mem_${randomUUID().replaceAll("-", "")}`,
      legacy_id: legacyId,
      public_id: existing?.public_id,
      language_code: language,
      name: cleanText(input.author ?? input.name ?? existing?.name, "I Remember", 120),
      title,
      excerpt,
      text: cleanText(input.text ?? excerpt, excerpt, 12000),
      body_markdown: bodyMarkdown,
      content_format: "markdown",
      is_long_form: Boolean(input.isLongForm ?? input.is_long_form ?? existing?.is_long_form),
      image_key: input.imageKey || input.image_key || existing?.image_key || "revival-upload",
      img_offset_x: Number(input.imgOffsetX ?? existing?.img_offset_x ?? 0),
      img_offset_y: Number(input.imgOffsetY ?? existing?.img_offset_y ?? 0),
      resized_img_width: Number(input.resizedImgWidth ?? existing?.resized_img_width ?? 600),
      resized_img_height: Number(input.resizedImgHeight ?? existing?.resized_img_height ?? 600),
      has_created_tags: existing?.has_created_tags ?? true,
      is_stared: Boolean(input.isStared ?? existing?.is_stared),
      tags: existing?.tags || defaultTags(language),
      metadata_json: metadataJson(
        input.metadataJson ?? input.metadata_json ?? input.metadata,
        existing?.metadata_json || null,
      ),
      source: input.source || existing?.source || "admin",
      status: dbStatus(input.status || existing?.status || "PENDING"),
      created_at: existing?.created_at || new Date().toISOString(),
    });

    return adminMemory(row, language);
  }

  archiveMemory(id) {
    const existing = this.store.getMemoryByRowId(id);
    if (!existing) throw new HttpError(404, "Memory not found", "not_found");
    return this.saveMemory({ id, language_code: existing.language_code, status: "ARCHIVED" });
  }

  savePage(input = {}) {
    const language = normalizeLanguage(
      input.language || input.language_code || this.siteSettings().defaultLanguage,
    );
    const slug = routeTag(input.slug || "page") || "page";
    const existingPage = this.store.getPage(language, slug);
    const linkedMemoryUid =
      input.linkedMemoryUid ||
      input.linked_memory_uid ||
      existingPage?.linked_memory_uid ||
      `page_${language}_${slug}`;
    const bodyMarkdown = String(
      input.bodyMarkdown ?? input.body_markdown ?? existingPage?.body_markdown ?? "",
    );
    const title = cleanText(input.title ?? existingPage?.title, "Untitled page", 180);
    const excerpt = cleanText(
      input.excerpt ?? existingPage?.excerpt ?? excerptFromMarkdown(bodyMarkdown),
      "",
      600,
    );
    const status = ["PUBLISHED", "DRAFT", "ARCHIVED"].includes(input.status)
      ? input.status
      : existingPage?.status || "DRAFT";
    const page = this.store.upsertPage({
      slug,
      language_code: language,
      title,
      excerpt,
      body_markdown: bodyMarkdown,
      status,
      linked_memory_uid: linkedMemoryUid,
    });

    const existingMemory = this.store.getMemoryByUid(linkedMemoryUid);
    const legacyId =
      existingMemory?.legacy_id ||
      Number(input.seedLegacyId || input.legacy_id) ||
      this.store.nextLegacyId(language);
    const memoryStatus = page.status === "PUBLISHED" ? "NORMAL" : "ARCHIVED";
    this.store.upsertMemory({
      ...(existingMemory || {}),
      uid: linkedMemoryUid,
      legacy_id: legacyId,
      public_id: existingMemory?.public_id,
      language_code: language,
      name: "I Remember",
      title,
      excerpt,
      text: excerpt || excerptFromMarkdown(bodyMarkdown),
      body_markdown: bodyMarkdown,
      content_format: "markdown",
      is_long_form: true,
      image_key: existingMemory?.image_key || "revival-upload",
      img_offset_x: existingMemory?.img_offset_x || 0,
      img_offset_y: existingMemory?.img_offset_y || 0,
      resized_img_width: existingMemory?.resized_img_width || 600,
      resized_img_height: existingMemory?.resized_img_height || 600,
      has_created_tags: true,
      is_stared: false,
      tags: { [slug]: 2, page: 1, memory: 1 },
      source: "page",
      status: memoryStatus,
      created_at: existingMemory?.created_at || new Date().toISOString(),
    });

    return {
      ...adminPage(page),
      linkedMemoryLegacyId: legacyId,
    };
  }

  saveMenuItem(input = {}) {
    const language = normalizeLanguage(
      input.language || input.language_code || this.siteSettings().defaultLanguage,
    );
    const row = {
      uid: input.uid || `footer_${routeTag(input.label || "item")}_${randomUUID().slice(0, 6)}`,
      language_code: language,
      label: input.label || "Menu item",
      item_type: input.type || input.item_type || "PAGE",
      target_value: input.targetValue ?? input.target_value ?? "",
      url: input.url || "",
      position: Number(input.position || 0),
      is_visible: input.isVisible ?? input.is_visible ?? true,
      opens_new_tab: input.opensNewTab ?? input.opens_new_tab ?? false,
    };

    const saved = input.id
      ? this.store.updateMenuItemById(input.id, row)
      : this.store.upsertMenuItem(row);
    return adminMenuItem(saved);
  }

  deleteMenuItem(id) {
    this.store.deleteMenuItem(id);
  }

  publicMenu(language = "en") {
    return this.store
      .listMenuItems(normalizeLanguage(language), { visibleOnly: true })
      .map(publicMenuItem)
      .filter(Boolean);
  }

  async publicMenuTarget(id, language = "en") {
    const normalized = normalizeLanguage(language);
    const item = this.store.getMenuItem(id);
    if (!item || normalizeLanguage(item.language_code) !== normalized || !item.is_visible) {
      throw new HttpError(404, "Menu item not found", "not_found");
    }

    if (item.item_type === "PAGE") {
      const page = this.store.getPage(normalized, routeTag(item.target_value || item.label));
      const memory = page?.linked_memory_uid
        ? this.store.getMemoryByUid(page.linked_memory_uid)
        : null;
      return {
        item: publicMenuItem(item),
        page: adminPage(page),
        memory: adminMemory(memory, normalized),
        post: memory ? memoryToPost(memory) : null,
      };
    }

    if (item.item_type === "MEMORY") {
      const memory =
        this.memoryByPublicId(item.target_value, normalized) ||
        this.store.getMemoryByUid(item.target_value);
      return {
        item: publicMenuItem(item),
        memory: adminMemory(memory, normalized),
        post: memory ? memoryToPost(memory) : null,
      };
    }

    if (item.item_type === "SEARCH") {
      const found = await this.searchPosts(
        normalized,
        item.target_value || item.label,
        new URL("/", "http://i-remember.local"),
      );
      const first = found[0];
      const memory = first
        ? this.store.getMemory(normalized, Number.parseInt(first.id, 10))
        : null;
      return {
        item: publicMenuItem(item),
        memory: adminMemory(memory, normalized),
        post: memory ? memoryToPost(memory) : null,
        results: found,
      };
    }

    return {
      item: publicMenuItem(item),
    };
  }

  async uploadImage(file) {
    if (!file?.data?.length) throw new HttpError(400, "Image is required", "invalid_image");
    if (file.data.length > maxUploadBodyBytes) {
      throw new HttpError(413, "Uploaded image is too large", "request_too_large");
    }

    const fileId = `revival-${randomUUID().slice(0, 12)}`;
    const original = file.data;
    const input = sharp(file.data, { limitInputPixels: maxImagePixels, animated: false });
    const metadata = await input.metadata();
    if (!["jpeg", "jpg", "png", "webp", "gif"].includes(metadata.format || "")) {
      throw new HttpError(400, "Unsupported image type", "invalid_image");
    }
    if ((metadata.width || 0) < 1 || (metadata.height || 0) < 1) {
      throw new HttpError(400, "Invalid image", "invalid_image");
    }

    const mimeType = storedMimeType({
      ...file,
      contentType: metadata.format === "png"
        ? "image/png"
        : metadata.format === "webp"
          ? "image/webp"
          : metadata.format === "gif"
            ? "image/gif"
            : "image/jpeg",
    });
    const resized = await sharp(file.data, { limitInputPixels: maxImagePixels, animated: false })
      .rotate()
      .resize(600, 600, { fit: "cover" })
      .jpeg({ quality: 88 })
      .toBuffer();
    const thumb = await sharp(file.data, { limitInputPixels: maxImagePixels, animated: false })
      .rotate()
      .resize(220, 220, { fit: "cover" })
      .jpeg({ quality: 82 })
      .toBuffer();

    uploadedImages.set(fileId, {
      original: { data: original, mimeType },
      resized: { data: resized, mimeType: "image/jpeg" },
      thumb: { data: thumb, mimeType: "image/jpeg" },
    });

    const uploadDir = join(this.store.uploadsDir, fileId);
    mkdirSync(uploadDir, { recursive: true, mode: 0o770 });
    const originalPath = join(uploadDir, "original");
    const resizedPath = join(uploadDir, "resized.jpg");
    const thumbPath = join(uploadDir, "thumb.jpg");
    writeFileSync(originalPath, original, { mode: 0o660 });
    writeFileSync(resizedPath, resized, { mode: 0o660 });
    writeFileSync(thumbPath, thumb, { mode: 0o660 });

    this.store.upsertImage({
      image_key: fileId,
      storage_type: "LOCAL",
      original_path: relative(this.store.dataDir, originalPath),
      resized_path: relative(this.store.dataDir, resizedPath),
      thumb_path: relative(this.store.dataDir, thumbPath),
      mime_type: mimeType,
      width: metadata.width || null,
      height: metadata.height || null,
      sha256: createHash("sha256").update(original).digest("hex"),
      fallback: false,
    });

    return fileId;
  }

  async imageForPath(pathname) {
    const localRuntime = runtimeUploadedImageForPath(pathname);
    if (localRuntime) return localRuntime;

    const match = pathname.match(
      /^\/uploads\/(?:tmp|posts)\/([^/]+)\/(resized|thumb)\.(?:jpg|jpeg|png|gif|webp)$/i,
    );

    if (match) {
      const imageKey = match[1];
      const variant = match[2] === "thumb" ? "thumb" : "resized";
      const row = this.store.getImage(imageKey);
      const stored = storedImageForRow(this.store, row, variant);
      if (stored) return stored;
    }

    return publicUploadImageForPath(pathname) || fallbackPostImageForPath(pathname);
  }

  async imageFromUrl(value) {
    if (!value) return null;

    let parsed;
    try {
      parsed = new URL(String(value), "http://i-remember.local");
    } catch (error) {
      return null;
    }
    if (parsed.origin !== "http://i-remember.local") return null;

    const pathname = decodeURIComponent(parsed.pathname);
    const stored = await this.imageForPath(pathname);
    if (!stored) return null;

    return {
      data: stored.data,
      filename: pathname.split("/").pop() || "image.jpg",
      contentType: stored.mimeType,
    };
  }

  async createPost(fields = {}) {
    const clean = validatedPostFields(fields, this.siteSettings().defaultLanguage);
    const language = clean.language;
    const legacyId = await this.nextSubmittedPostId(language);
    const post = {
      id: String(legacyId),
      uid: `mem_${randomUUID().replaceAll("-", "")}`,
      name: clean.name,
      img: clean.fileId,
      img_offset_x: clean.imgOffsetX,
      img_offset_y: clean.imgOffsetY,
      text: clean.message,
      resized_img_width: "600",
      resized_img_height: "600",
      has_created_tags: "1",
      is_stared: "0",
      created_at: sqlTimestamp(new Date()),
      language_id: languageId(language),
      tags: defaultTags(language),
      status: autoApproveSubmissions ? "NORMAL" : "PENDING",
    };

    const row = legacyPostToMemoryRow(post, "submission");
    const data = this.store.insertMemory(row, post.status);
    return {
      ...memoryToPost(data),
      status: data.status,
    };
  }

  async nextSubmittedPostId(language) {
    return this.store.nextLegacyId(normalizeLanguage(language));
  }

}

function defaultMessage(language) {
  if (normalizeLanguage(language) === "fr") return "ce souvenir revit.";
  if (normalizeLanguage(language) === "zh") return "这段回忆重新被点亮。";
  return "this revived memory lives again.";
}

function defaultTags(language) {
  if (normalizeLanguage(language) === "fr") {
    return { souvenir: 2, souvenirs: 2, memoire: 2 };
  }
  if (normalizeLanguage(language) === "zh") {
    return { 回忆: 2, 记得: 2, 生活: 2 };
  }
  return { memory: 2, remember: 2, revived: 2 };
}

function appHtmlUrlForLanguage(language) {
  return htmlUrls[normalizeLanguage(language)] || htmlUrls.en;
}

function legalPageRequested(pathname) {
  return ["/legal", "/fr/legal", "/en/legal", "/zh/legal"].includes(pathname);
}

function instagramTokenCallbackRequested(pathname) {
  return pathname === "/api/instagram-token-callback";
}

function adminPageRequested(pathname) {
  const normalized = pathname.replace(/\/+$/g, "");
  return (
    normalized === "/admin" ||
    normalized === "/admin/index.html" ||
    normalized === "/admin/setup" ||
    /^\/admin\/(?:dashboard|memory|pages|comments|attachments|theme|menus|settings|backups)$/.test(normalized)
  );
}

function adminHtmlUrlForMode({ production = false } = {}) {
  if (production && existsSync(adminDistHtmlUrl)) return adminDistHtmlUrl;
  return adminSourceHtmlUrl;
}

function appShellRequested(pathname) {
  return [
    "/",
    "/fr",
    "/fr/",
    "/en",
    "/en/",
    "/zh",
    "/zh/",
  ].includes(pathname);
}

function memoryShellRequested(pathname) {
  return /^\/(?:en\/|fr\/|zh\/)?memory\/[^/?#]+/.test(pathname);
}

function nonSiteArtifactRequested(pathname) {
  return (
    pathname === "/qa" ||
    pathname.startsWith("/qa/") ||
    pathname === "/data" ||
    pathname.startsWith("/data/") ||
    pathname === "/dist" ||
    pathname.startsWith("/dist/") ||
    pathname === "/node_modules" ||
    pathname.startsWith("/node_modules/") ||
    pathname === "/.revival-storage" ||
    pathname.startsWith("/.revival-storage/") ||
    pathname === "/.revival-data" ||
    pathname.startsWith("/.revival-data/") ||
    pathname === "/db" ||
    pathname.startsWith("/db/") ||
    pathname === "/.env" ||
    pathname.startsWith("/.env.") ||
    pathname === "/src" ||
    pathname.startsWith("/src/") ||
    pathname === "/supabase" ||
    pathname.startsWith("/supabase/") ||
    pathname === "/scripts" ||
    pathname.startsWith("/scripts/") ||
    pathname === "/AGENTS.md" ||
    pathname === "/REVIVAL_NOTES.md" ||
    pathname === "/design-qa.md" ||
    pathname === "/package.json" ||
    pathname === "/package-lock.json" ||
    pathname === "/vite.config.mjs" ||
    pathname === "/server.mjs" ||
    pathname === "/Dockerfile" ||
    pathname === "/docker-compose.yml"
  );
}

function directPostPublicId(pathname) {
  return pathname.match(/\/memory\/([^/?#]+)/)?.[1] || "";
}

function shouldLogRequest(pathname) {
  return (
    pathname === "/healthz" ||
    pathname === "/version" ||
    pathname === "/api" ||
    pathname.startsWith("/api/") ||
    appShellRequested(pathname) ||
    memoryShellRequested(pathname) ||
    legalPageRequested(pathname) ||
    adminPageRequested(pathname)
  );
}

async function renderAppHtml(
  backend,
  language,
  directPayload = null,
  pathname = "/",
  memoryLanguage = language,
) {
  const normalized = normalizeLanguage(language);
  const normalizedMemoryLanguage = normalizeLanguage(memoryLanguage);
  let html = readFileSync(appHtmlUrlForLanguage(normalized), "utf8");
  if (normalized === "zh") html = localizeChineseHtml(html);

  html = patchLanguageShell(html, normalized, pathname);
  html = injectTracking(html, backend.siteSettings());

  const defaultPosts = await backend.searchPosts(
    normalizedMemoryLanguage,
    "",
    new URL("/", "http://i-remember.local"),
  );
  html = replaceDefaultPosts(html, {
    success: 1,
    data: {
      tagName: "",
      posts: defaultPosts,
    },
    input: { ln: normalized },
  });

  if (!directPayload) return html;

  return html.replace(
    /var DEFAULT_POST = \(function \(\) \{[\s\S]*?\n\s*\}\(\)\);/,
    `var DEFAULT_POST = ${safeScriptJson(directPayload)};`,
  );
}

function htmlAttr(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function injectTracking(html, settings) {
  const tracking = settings?.tracking || {};
  if (!tracking.enabled || !tracking.umamiSrc || !tracking.umamiWebsiteId) return html;
  const script = `<script defer src="${htmlAttr(tracking.umamiSrc)}" data-website-id="${htmlAttr(tracking.umamiWebsiteId)}"></script>`;
  return html.includes("</head>") ? html.replace("</head>", `    ${script}\n</head>`) : `${script}\n${html}`;
}

function replaceDefaultPosts(html, payload) {
  return html.replace(
    /var DEFAULT_POSTS = [\s\S]*?\n\s*var DEFAULT_POST =/,
    `var DEFAULT_POSTS = ${safeScriptJson(payload)};\n    var DEFAULT_POST =`,
  );
}

function languagePathForLanguageSwitcher(pathname) {
  if (!pathname || pathname === "/") return "";
  return pathname.replace(/^\/+/, "").replace(/\/+$/, "");
}

function patchLanguageShell(html, language, pathname = "/") {
  const normalized = normalizeLanguage(language);
  const languagePath = languagePathForLanguageSwitcher(pathname);
  const labels = {
    en: "language",
    fr: "langue",
    zh: "语言",
  };
  const htmlLang = {
    en: "en-US",
    fr: "fr-FR",
    zh: "zh-CN",
  };
  const menu = [
    languageMenuItem("en", languagePath, "English", normalized),
    languageMenuItem("fr", languagePath, "French", normalized),
    languageMenuItem("zh", languagePath, "中文", normalized),
  ].join("\n");

  return html
    .replace(/lang="(?:en-US|fr-FR|zh-CN)"/g, `lang="${htmlLang[normalized]}"`)
    .replace(/var LANG = '[^']+';/, `var LANG = '${normalized}';`)
    .replace(
      /<div class="footer-link-lang footer-link-item footer-fade-item">[\s\S]*?(?=\s*<div class="footer-link-credits)/,
      `<div class="footer-link-lang footer-link-item footer-fade-item">\n                <div class="footer-link-lang-text">${labels[normalized]}</div>\n                <div class="footer-link-lang-list">\n${menu}\n                </div>\n            </div>`,
    );
}

function languageMenuItem(id, suffix, label, selectedLanguage) {
  const selected = id === selectedLanguage ? " selected" : " ";
  return `                    <div class="footer-link-lang-item${selected}" data-id="${id}" data-url-suffix="${suffix}">${label}</div>`;
}

function localizeChineseHtml(html) {
  const replacements = [
    [/var SITE_DESCRIPTION = '[^']*';/, "var SITE_DESCRIPTION = '“我记得”是一份珍贵的能力。分享你的回忆，一起守护记忆。';"],
    [/var TWITTER_SITE_DESCRIPTION = '[^']*';/, "var TWITTER_SITE_DESCRIPTION = '分享你的回忆，一起守护记忆。';"],
    [/var POST_DESCRIPTION = '[^']*';/, "var POST_DESCRIPTION = '我在 I-remember.fr 分享了一段回忆。你也可以一起守护记忆。';"],
    [/var TWITTER_POST_DESCRIPTION = '[^']*';/, "var TWITTER_POST_DESCRIPTION = '我在 I-remember.fr 分享了一段回忆。';"],
    [/How lucky we are to be able to say <span class='font-italic'>«I remember»<\/span>\./, "能说出 <span class='font-italic'>“我记得”</span> 是多么幸运。"],
    [/Let's share our memories to fight Alzheimer's disease\./, "让我们分享回忆，一起对抗阿尔茨海默病。"],
    [/This site will gradually disappear/, "如果没有新的回忆"],
    [/if it is not regularly given memories\./, "这个网站会慢慢消失。"],
    [/tell a<br\/><span class="font-light-italic">memory<\/span>/, "说出<br/><span class=\"font-light-italic\">一段回忆</span>"],
    [/see all <span class="font-italic">memories<\/span>/, "查看所有<span class=\"font-italic\">回忆</span>"],
    [/loading\.\.\./, "加载中..."],
    [/upload<br\/><span class="font-light-italic">a picture<\/span><br\/><span class="add-steps-upload-methods-text-size">\(min res: 500px\)<\/span>/, "上传<br/><span class=\"font-light-italic\">一张照片</span><br/><span class=\"add-steps-upload-methods-text-size\">(最小 500px)</span>"],
    [/from<br\/><span class="font-light-italic">your desktop<\/span>/, "来自<br/><span class=\"font-light-italic\">你的电脑</span>"],
    [/Your <span class="">Name<\/span>/, "你的<span class=\"\">名字</span>"],
    [/Your <span class="">Email<\/span>/, "你的<span class=\"\">邮箱</span>"],
    [/I remember,/, "我记得，"],
    [/\(when\), \(with\), \(where\)/, "（什么时候）、（和谁）、（在哪里）"],
    [/I have read and agree with the/, "我已阅读并同意"],
    [/Terms of Service/, "服务条款"],
    [/Thank you /, "谢谢"],
    [/for contributing\. Together, we are stronger<br\/>to fight Alzheimer's disease\./, "感谢你的参与。我们一起<br/>守护不会褪色的记忆。"],
    [/Back/, "返回"],
    [/Confirm/, "确认"],
    [/Share on:/, "分享到："],
    [/other memory talk about/, "段其他回忆提到"],
    [/other memories talk about/, "段其他回忆提到"],
    [/Search for a memory/, "搜索回忆"],
    [/Add a memory/, "添加回忆"],
    [/No memory match your search &lt;&lt;<span class="font-bold-italic">\{\{interpolation\}\}<\/span>&gt;&gt;\.<br\/>Please make an other search\./, "没有回忆匹配 &lt;&lt;<span class=\"font-bold-italic\">{{interpolation}}</span>&gt;&gt;。<br/>请换一个词搜索。"],
    [/Search\.\.\./, "搜索..."],
    [/The experience of <span class="font-bold">I Remember<\/span> requires WebGL\. <br\/>Please upgrade your browser to the latest <a href="http:\/\/www\.mozilla\.org\/firefox" target="_blank">Firefox<\/a> or <a href="http:\/\/www\.google\.com\/chrome" target="_blank">Chrome<\/a>\./, "体验 <span class=\"font-bold\">I Remember</span> 需要 WebGL。<br/>请升级到最新版 <a href=\"http://www.mozilla.org/firefox\" target=\"_blank\">Firefox</a> 或 <a href=\"http://www.google.com/chrome\" target=\"_blank\">Chrome</a>。"],
    [/Use your mouse/, "移动鼠标"],
    [/to move/, "探索回忆"],
    [/Scroll or double click/, "滚动或双击"],
    [/to zoom in/, "放大"],
    [/Click to watch/, "点击查看"],
    [/a memory/, "一段回忆"],
    [/Let's share our memories <br\/> and make sure this website does not disappear\./, "分享我们的回忆<br/>让这个网站继续存在。"],
    [/fade from memories/, "记忆褪色"],
    [/Credits/, "鸣谢"],
    [/Terms and Conditions/, "条款"],
    [/Donate/, "捐赠"],
    [/Your Facebook albums/, "你的 Facebook 相册"],
    [/Your Facebook photos/, "你的 Facebook 照片"],
    [/Your Instagram photos/, "你的 Instagram 照片"],
    [/Download/, "下载"],
    [/General terms and conditions for using the site's services/, "网站服务使用条款"],
  ];

  let output = html
    .replace(/<html class="[^"]*">/, '<html class="no-js" lang="zh-CN">')
    .replace(/<meta name="description" content="[^"]*">/, '<meta name="description" content="分享你的回忆，一起守护记忆。">')
    .replace(/<meta property="og:description" content="[^"]*" \/>/, '<meta property="og:description" content="分享你的回忆，一起守护记忆。" />')
    .replace(/<title>I Remember<\/title>/g, "<title>I Remember | 我记得</title>");

  for (const [pattern, replacement] of replacements) {
    output = output.replace(pattern, replacement);
  }

  return output.replace(
    /<div class="terms-description font-light">[\s\S]*?<\/div>\s*<\/div>\s*<\/div>\s*<div class="scroll-indicator"><\/div>\s*<\/div>/,
    `<div class="terms-description font-light"><span class='font-bold'>第 1 条 - 服务说明</span><br/><br/>I-Remember.fr 用于保存和分享与照片相关的个人回忆。提交内容时，请确认你拥有相应权利，并同意该内容可在本服务中展示。<br/><br/><span class='font-bold'>第 2 条 - 内容责任</span><br/><br/>请勿上传违法、侵权、仇恨、色情、骚扰、威胁或包含他人隐私的信息。你需要对自己提交的文字、图片和其他内容负责。<br/><br/><span class='font-bold'>第 3 条 - 数据与删除</span><br/><br/>服务会保存你提交的名字、邮箱、回忆文字和图片，用于展示、检索和维护本项目。若需要删除或更正内容，请联系站点维护者。<br/><br/><span class='font-bold'>第 4 条 - 技术要求</span><br/><br/>本体验需要支持 WebGL 的现代浏览器。</div>
            </div>
        </div>
        <div class="scroll-indicator"></div>
    </div>`,
  );
}

export function createRevivalMiddleware(options = {}) {
  const backend = new RevivalBackend();

  return (req, res, next) => {
    handleRequest(backend, req, res, next, options).catch((error) => {
      if (!(error instanceof HttpError) || error.statusCode >= 500) {
        console.error(error);
      }
      if (res.headersSent) return;
      const statusCode = error instanceof HttpError ? error.statusCode : 500;
      sendJson(
        req,
        res,
        {
          success: false,
          errorMsg: error instanceof HttpError ? error.errorMsg : "unexpected",
          message: error instanceof HttpError && error.expose
            ? error.message
            : "Unexpected server error",
        },
        statusCode,
      );
    });
  };
}

async function handleRequest(backend, req, res, next, options = {}) {
  const url = new URL(req.url || "/", "http://i-remember.local");
  const pathname = decodeURIComponent(url.pathname);
  const startedAt = Date.now();
  const siteSettings = backend.siteSettings();
  const defaultLanguage = siteSettings.defaultLanguage;
  const memoryLanguage = contentLanguage(defaultLanguage);

  if (shouldLogRequest(pathname)) {
    res.once("finish", () => {
      logInfo("http_request", {
        method: req.method || "GET",
        path: pathname,
        status: res.statusCode,
        durationMs: Date.now() - startedAt,
        contentLength: req.headers["content-length"] || "",
      });
    });
  }

  if (req.method === "GET" && pathname === "/healthz") {
    sendJson(req, res, { ok: true });
    return;
  }

  if (req.method === "GET" && nonSiteArtifactRequested(pathname)) {
    sendStatus(res, 404, "Not found");
    return;
  }

  if (req.method === "GET" && pathname === "/favicon.ico") {
    res.statusCode = 204;
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.end();
    return;
  }

  const image = await backend.imageForPath(pathname);
  if (image) {
    res.statusCode = 200;
    setSecurityHeaders(res);
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.setHeader("Content-Type", image.mimeType);
    res.end(image.data);
    return;
  }

  if (pathname === "/api/public/menu" && req.method === "GET") {
    sendJson(req, res, {
      success: true,
      data: {
        language: memoryLanguage,
        items: backend.publicMenu(memoryLanguage),
      },
    });
    return;
  }

  if (pathname.startsWith("/api/public/menu-target/") && req.method === "GET") {
    const id = Number.parseInt(pathname.split("/").pop() || "", 10);
    if (!Number.isFinite(id)) throw new HttpError(400, "Invalid menu item", "invalid_menu_item");
    sendJson(req, res, {
      success: true,
      data: await backend.publicMenuTarget(id, memoryLanguage),
    });
    return;
  }

  if (pathname === "/api/admin/session" && req.method === "GET") {
    const session = adminSessionFromRequest(req);
    sendJson(req, res, {
      success: true,
      data: {
        needsSetup: backend.needsAdminSetup(),
        authenticated: Boolean(session),
        account: session ? backend.publicAdminProfile() : null,
      },
    });
    return;
  }

  if (pathname === "/api/admin/setup" && req.method === "POST") {
    assertSameOrigin(req);
    assertRateLimit(req, "admin-setup", 12, 10 * 60 * 1000);
    const body = await collectRequest(req, maxJsonBodyBytes);
    const input = parseJsonObject(body);
    const account = backend.setupAdmin(input);
    const token = createAdminSession(account.email);
    setAdminCookie(res, token);
    sendJson(req, res, {
      success: true,
      data: {
        authenticated: true,
        account,
      },
    });
    return;
  }

  if (pathname === "/api/admin/login" && req.method === "POST") {
    assertSameOrigin(req);
    assertRateLimit(req, "admin-login", 12, 10 * 60 * 1000);
    const body = await collectRequest(req, maxJsonBodyBytes);
    const input = parseJsonObject(body);
    const result = backend.loginAdmin(input);
    if (result.requiresTwoFactor) {
      sendJson(req, res, { success: true, data: result });
      return;
    }
    const token = createAdminSession(result.account.email);
    setAdminCookie(res, token);
    sendJson(req, res, {
      success: true,
      data: {
        authenticated: true,
        account: result.account,
      },
    });
    return;
  }

  if (pathname === "/api/admin/logout" && req.method === "POST") {
    assertSameOrigin(req);
    clearAdminCookie(res, req);
    sendJson(req, res, { success: true, data: { authenticated: false } });
    return;
  }

  if (pathname === "/api/admin/bootstrap" && req.method === "GET") {
    requireAdmin(req);
    sendJson(req, res, {
      success: true,
      data: backend.adminBootstrap(memoryLanguage),
    });
    return;
  }

  if (pathname === "/api/admin/export" && req.method === "GET") {
    requireAdmin(req);
    sendJson(req, res, {
      success: true,
      data: backend.adminExport(memoryLanguage),
    });
    return;
  }

  if (pathname === "/api/admin/memories" && req.method === "POST") {
    assertSameOrigin(req);
    requireAdmin(req);
    const body = await collectRequest(req, maxJsonBodyBytes);
    const input = parseJsonObject(body);
    sendJson(req, res, {
      success: true,
      data: backend.saveMemory(input),
    });
    return;
  }

  if (/^\/api\/admin\/memories\/\d+$/.test(pathname) && req.method === "PUT") {
    assertSameOrigin(req);
    requireAdmin(req);
    const body = await collectRequest(req, maxJsonBodyBytes);
    const input = parseJsonObject(body);
    const id = Number.parseInt(pathname.split("/").pop(), 10);
    sendJson(req, res, {
      success: true,
      data: backend.saveMemory({ ...input, id }),
    });
    return;
  }

  if (/^\/api\/admin\/memories\/\d+$/.test(pathname) && req.method === "DELETE") {
    assertSameOrigin(req);
    requireAdmin(req);
    const id = Number.parseInt(pathname.split("/").pop(), 10);
    sendJson(req, res, {
      success: true,
      data: backend.archiveMemory(id),
    });
    return;
  }

  if (pathname === "/api/admin/pages" && req.method === "POST") {
    assertSameOrigin(req);
    requireAdmin(req);
    const body = await collectRequest(req, maxJsonBodyBytes);
    const input = parseJsonObject(body);
    sendJson(req, res, {
      success: true,
      data: backend.savePage(input),
    });
    return;
  }

  if (/^\/api\/admin\/pages\/[^/]+$/.test(pathname) && req.method === "PUT") {
    assertSameOrigin(req);
    requireAdmin(req);
    const body = await collectRequest(req, maxJsonBodyBytes);
    const input = parseJsonObject(body);
    const slug = decodeURIComponent(pathname.split("/").pop() || "");
    sendJson(req, res, {
      success: true,
      data: backend.savePage({ ...input, slug }),
    });
    return;
  }

  if (pathname === "/api/admin/menu-items" && req.method === "POST") {
    assertSameOrigin(req);
    requireAdmin(req);
    const body = await collectRequest(req, maxJsonBodyBytes);
    const input = parseJsonObject(body);
    sendJson(req, res, {
      success: true,
      data: backend.saveMenuItem(input),
    });
    return;
  }

  if (/^\/api\/admin\/menu-items\/\d+$/.test(pathname) && req.method === "PUT") {
    assertSameOrigin(req);
    requireAdmin(req);
    const body = await collectRequest(req, maxJsonBodyBytes);
    const input = parseJsonObject(body);
    const id = Number.parseInt(pathname.split("/").pop(), 10);
    sendJson(req, res, {
      success: true,
      data: backend.saveMenuItem({ ...input, id }),
    });
    return;
  }

  if (/^\/api\/admin\/menu-items\/\d+$/.test(pathname) && req.method === "DELETE") {
    assertSameOrigin(req);
    requireAdmin(req);
    const id = Number.parseInt(pathname.split("/").pop(), 10);
    backend.deleteMenuItem(id);
    sendJson(req, res, {
      success: true,
      data: { id },
    });
    return;
  }

  if (pathname === "/api/admin/settings" && req.method === "PUT") {
    assertSameOrigin(req);
    requireAdmin(req);
    const body = await collectRequest(req, maxJsonBodyBytes);
    const input = parseJsonObject(body);
    sendJson(req, res, {
      success: true,
      data: backend.updateSiteSettings(input),
    });
    return;
  }

  if (pathname === "/api/admin/account" && req.method === "PUT") {
    assertSameOrigin(req);
    requireAdmin(req);
    const body = await collectRequest(req, maxJsonBodyBytes);
    const input = parseJsonObject(body);
    sendJson(req, res, {
      success: true,
      data: backend.updateAdminAccount(input),
    });
    return;
  }

  if (pathname === "/api/admin/2fa/setup" && req.method === "POST") {
    assertSameOrigin(req);
    requireAdmin(req);
    sendJson(req, res, {
      success: true,
      data: backend.setupTwoFactor(),
    });
    return;
  }

  if (pathname === "/api/admin/2fa/enable" && req.method === "POST") {
    assertSameOrigin(req);
    requireAdmin(req);
    const body = await collectRequest(req, maxJsonBodyBytes);
    const input = parseJsonObject(body);
    sendJson(req, res, {
      success: true,
      data: backend.enableTwoFactor(input),
    });
    return;
  }

  if (pathname === "/api/admin/2fa/disable" && req.method === "POST") {
    assertSameOrigin(req);
    requireAdmin(req);
    const body = await collectRequest(req, maxJsonBodyBytes);
    const input = parseJsonObject(body);
    sendJson(req, res, {
      success: true,
      data: backend.disableTwoFactor(input),
    });
    return;
  }

  if (req.method === "GET") {
    if (instagramTokenCallbackRequested(pathname)) {
      sendHtml(res, readFileSync(instagramTokenCallbackHtmlUrl, "utf8"));
      return;
    }

    if (legalPageRequested(pathname)) {
      sendHtml(res, readFileSync(legalHtmlUrl, "utf8"));
      return;
    }

    if (backend.needsAdminSetup() && appShellRequested(pathname)) {
      res.statusCode = 302;
      res.setHeader("Location", "/admin/setup");
      res.end();
      return;
    }

    if (adminPageRequested(pathname)) {
      sendHtml(res, readFileSync(adminHtmlUrlForMode(options), "utf8"));
      return;
    }

    const directId = directPostPublicId(pathname);
    if (directId) {
      const language = languageFromRequest(url, pathname, defaultLanguage);
      const post = await backend.directPost(directId, memoryLanguage);
      if (post) {
        const payload = {
          success: 1,
          data: post,
          input: { ln: language, id: String(numericPostId(post)) },
        };
        sendHtml(res, await renderAppHtml(backend, language, payload, pathname, memoryLanguage));
        return;
      }
    }

    if (appShellRequested(pathname) || memoryShellRequested(pathname)) {
      const language = languageFromRequest(url, pathname, defaultLanguage);
      sendHtml(res, await renderAppHtml(backend, language, null, pathname, memoryLanguage));
      return;
    }
  }

  if (pathname === "/img/colorMap.png") {
    setTimeout(() => next(), colorMapStartupDelayMs);
    return;
  }

  if (pathname === "/api/upload-image" && req.method === "POST") {
    assertSameOrigin(req);
    assertRateLimit(req, "upload-image", 20, 10 * 60 * 1000);
    const body = await collectRequest(req, maxUploadBodyBytes);
    const { fields, files } = parseMultipart(req, body);
    const directImage = firstUploadedImage(files);
    const urlImage = directImage ? null : await backend.imageFromUrl(fields.url);
    const sourceImage = directImage || urlImage;
    const fileId = sourceImage
      ? await backend.uploadImage({
          data: sourceImage.data,
          filename: sourceImage.filename || "upload.jpg",
          contentType: sourceImage.contentType || sourceImage.mimeType || "image/jpeg",
        })
      : "revival-upload";

    logInfo("upload_image", {
      fileId,
      source: directImage ? "file" : urlImage ? "url" : "fallback",
      bytes: sourceImage?.data?.length || 0,
    });

    sendJson(req, res, {
      success: true,
      data: { fileId },
    });
    return;
  }

  if (pathname === "/api/post" && req.method === "POST") {
    assertSameOrigin(req);
    if (!backend.siteSettings().anonymousSubmissions) {
      throw new HttpError(403, "Anonymous submissions are closed", "submissions_closed");
    }
    assertRateLimit(req, "post", 10, 10 * 60 * 1000);
    const body = await collectRequest(req, maxFormBodyBytes);
    const fields = parseFields(req, body);
    const post = await backend.createPost(fields);
    logInfo("memory_submitted", {
      language: memoryLanguage,
      memoryId: post.id,
      publicId: post.public_id || "",
      status: post.status || "",
      imageKey: post.img || "",
    });
    sendJson(req, res, {
      success: true,
      data: post,
    });
    return;
  }

  if (req.method === "GET" && pathname.startsWith("/api/related-post-count/")) {
    assertRateLimit(req, "related-post-count", 240, 60 * 1000);
    const id = pathname.split("/").pop();
    const tags = await backend.relatedTagCounts(memoryLanguage, id);
    sendJson(req, res, {
      success: 1,
      data: tags,
      input: {
        id,
        ln: memoryLanguage,
        found: Object.keys(tags).length > 0,
      },
    });
    return;
  }

  if (req.method === "GET" && pathname.startsWith("/api/auto-complete-tags/")) {
    assertRateLimit(req, "auto-complete-tags", 240, 60 * 1000);
    const fragment = pathname.replace(/^\/api\/auto-complete-tags\/?/, "").slice(0, 120);
    sendJson(req, res, {
      success: true,
      data: {
        tagFragment: routeTag(fragment),
        list: await backend.autocomplete(memoryLanguage, fragment),
      },
    });
    return;
  }

  if (req.method === "GET" && pathname.startsWith("/api/search-posts")) {
    assertRateLimit(req, "search-posts", 240, 60 * 1000);
    const pathTag = pathname.startsWith("/api/search-posts")
      ? pathname.replace(/^\/api\/search-posts\/?/, "").slice(0, 120)
      : "";
    const inputTag = (url.searchParams.get("tagName") || pathTag).slice(0, 120);
    const parsedTag = routeTag(inputTag);
    const found = await backend.searchPosts(memoryLanguage, inputTag, url);
    logInfo("search_posts", {
      language: memoryLanguage,
      tagName: parsedTag,
      count: found.length,
    });

    sendJson(req, res, {
      success: 1,
      data: {
        tagName: parsedTag,
        posts: found,
      },
      input: {
        ln: memoryLanguage,
        tagName: inputTag,
        lastId: url.searchParams.get("lastId") || "",
      },
    });
    return;
  }

  if (req.method === "GET" && /^\/api(?:\/[^/]+)?$/.test(pathname)) {
    assertRateLimit(req, "search-posts", 240, 60 * 1000);
    const inputTag = pathname.replace(/^\/api\/?/, "").slice(0, 120);
    const parsedTag = routeTag(inputTag);
    const found = await backend.searchPosts(memoryLanguage, inputTag, url);
    logInfo("search_posts", {
      language: memoryLanguage,
      tagName: parsedTag,
      count: found.length,
    });

    sendJson(req, res, {
      success: 1,
      data: {
        tagName: parsedTag,
        posts: found,
      },
      input: {
        ln: memoryLanguage,
        tagName: inputTag,
        lastId: url.searchParams.get("lastId") || "",
      },
    });
    return;
  }

  next();
}

export function createViteRevivalPlugin() {
  return {
    name: "i-remember-api-shim",
    configureServer(server) {
      server.middlewares.use(createRevivalMiddleware());
    },
    configurePreviewServer(server) {
      server.middlewares.use(createRevivalMiddleware({ production: true }));
    },
  };
}

export function createStoreForScripts() {
  const backend = new RevivalBackend();
  return backend.store;
}

export function createBackendForScripts() {
  return new RevivalBackend();
}

export {
  fallbackPostImages,
  legacyDateToIso,
  legacyImagePath,
  legacyPostToMemoryRow,
  memoryToPost,
  postIdOffset,
};
