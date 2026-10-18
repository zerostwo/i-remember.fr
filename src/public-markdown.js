import { uploadVideoFile } from "../packages/content/src/video-upload.js";
import { markdownToHtml, memoryBody, memoryPreview, memoryReaderTitle } from "../packages/content/src/markdown.js";
window.songqiVideoUpload = uploadVideoFile;
window.songqiMarkdown = { render: markdownToHtml, body: memoryBody, preview: memoryPreview, readerTitle: memoryReaderTitle };
window.dispatchEvent(new Event("songqi-markdown-ready"));
