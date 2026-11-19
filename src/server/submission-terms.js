import { siteOrigin } from "./seo.js";

// The submission dialog and standalone terms page share the same operator and copy.
const copy = {
  en: {
    title: "Submission terms and privacy",
    operator: owner => `${owner} maintains this personal memory archive.`,
    sharing: "Share only words and media you have permission to publish. Ask before sharing another person’s private information. You keep your rights and allow the site to store and display your contribution.",
    privacy: "When submissions are open, your memory, display name and attachments are published immediately. Visitors can read and share the link. The submission email is not displayed with your memory.",
    requests: "To request a correction or removal, contact the site owner and include the memory link.",
  },
  fr: {
    title: "Conditions de contribution et confidentialité",
    operator: owner => `Ces archives personnelles sont tenues par ${owner}.`,
    sharing: "Partagez uniquement les textes et médias que vous avez le droit de publier. Demandez l’accord des personnes concernées avant de partager des informations privées. Vous conservez vos droits et autorisez le site à conserver et afficher votre contribution.",
    privacy: "Lorsque les contributions sont ouvertes, votre souvenir, votre nom d’affichage et vos pièces jointes sont publiés immédiatement. Les visiteurs peuvent les consulter et partager le lien. Votre adresse e-mail ne figure pas sur le souvenir.",
    requests: "Pour demander une correction ou un retrait, contactez le responsable du site en indiquant le lien du souvenir.",
  },
  zh: {
    title: "投稿条款与隐私",
    operator: owner => `这个个人回忆网站由 ${owner} 维护。`,
    sharing: "请只分享你有权发布的文字和媒体。涉及他人隐私时，请先征得对方同意。你保留自己的权利，并允许本站保存和展示投稿。",
    privacy: "开放投稿时，提交的回忆、显示名称和附件会立即公开。访客可以阅读并分享链接。投稿邮箱不会显示在回忆中。",
    requests: "如需更正或移除内容，请联系站点维护者，并附上回忆链接。",
  },
};

export function submissionTerms(language, settings) {
  const text = copy[language] || copy.en;
  const escape = value => String(value).replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const owner = settings.ownerName || settings.ownerAlternateName || new URL(siteOrigin(settings.canonicalUrl)).hostname;
  const contact = settings.publicContact || "";
  const href = /^https?:\/\//i.test(contact) ? contact : /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(contact) ? "mailto:" + contact : "";
  const link = href ? ` <a href="${escape(href)}">${escape(contact)}</a>` : "";
  return { title: text.title, body: [text.operator(owner), text.sharing, text.privacy, text.requests]
    .map(escape).join("<br/><br/>") + link };
}
