import { micromark } from "micromark";

export const CARD_PREVIEW_LENGTH = 220;

export function markdownToHtml(value = "") {
  // CommonMark, with raw HTML and unsafe URL protocols disabled by default.
  return micromark(String(value));
}

export function plainText(value = "") {
  return String(value)
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^[ \t]*#{1,6}\s+/gm, "")
    .replace(/[*_`>~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function memoryBody(memory = {}) {
  const content = String(memory.bodyMarkdown ?? memory.content ?? "");
  const firstHeading = /^(?:\s*\n)*#{1,6}\s+([^\n]+)\n+/.exec(content);
  return firstHeading && plainText(firstHeading[1]) === plainText(memory.title)
    ? content.slice(firstHeading[0].length)
    : content;
}

// CJK glyphs occupy roughly twice the width of Latin characters on the card.
// Keep excerpts similar in visual length and never split a Unicode code point.
export function memoryPreview(memory = {}) {
  const text = plainText(memoryBody(memory));
  let excerpt = "";
  let width = 0;
  for (const character of text) {
    const nextWidth =
      /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Extended_Pictographic}]/u.test(
        character,
      )
        ? 2
        : 1;
    if (width + nextWidth > CARD_PREVIEW_LENGTH) break;
    excerpt += character;
    width += nextWidth;
  }
  const truncated = excerpt.length < text.length;
  // Prefer a whole final word, without dropping an unspaced CJK sentence.
  if (truncated) excerpt = excerpt.replace(/\s+[^\s]{1,20}$/, "").trimEnd();
  return {
    title: memory.title || "", text: excerpt, truncated,
    // Managed pages need the reader even when their text fits on a memory card.
    longForm: truncated || memory.source === "page" || memory.metadata?.source === "page",
  };
}

export function memoryReaderTitle(memory = {}) {
  const title = plainText(memory.title);
  const content = plainText(memoryBody(memory));
  // Anonymous entries have an automatically generated title from their opening.
  return title && !content.startsWith(title.replace(/(?:…|\.\.\.)$/, "")) ? title : "";
}
