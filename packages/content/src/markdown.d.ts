interface MemoryText {
  title?: string;
  content?: string;
  bodyMarkdown?: string;
  source?: string;
  metadata?: Record<string, unknown> | null;
}

export const CARD_PREVIEW_LENGTH: number;
export function markdownToHtml(value?: string): string;
export function plainText(value?: string): string;
export function memoryBody(memory?: MemoryText): string;
export function memoryPreview(memory?: MemoryText): { title: string; text: string; truncated: boolean; longForm: boolean };
export function memoryReaderTitle(memory?: MemoryText): string;
