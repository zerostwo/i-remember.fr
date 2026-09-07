import { markdownToHtml, memoryBody } from "../packages/content/src/markdown.js";
window.songqiMarkdown = { render: markdownToHtml, body: memoryBody };
window.dispatchEvent(new Event("songqi-markdown-ready"));
