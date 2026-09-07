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

export function memoryPreview(memory = {}) {
  const content = String(memory.bodyMarkdown ?? memory.content ?? "");
  const text = plainText(memoryBody(memory));
  return {
    title: memory.title || "",
    text: text.slice(0, CARD_PREVIEW_LENGTH),
    truncated: text.length > CARD_PREVIEW_LENGTH,
    longForm: content.length > CARD_PREVIEW_LENGTH,
  };
}
