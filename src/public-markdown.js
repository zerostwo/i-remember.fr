import { createAudioVisualizer } from "../packages/content/src/audio-visualizer.js";
import { mediaAccept, isAudioFile } from "../packages/config/src/media-limits.js";
import { uploadRequest } from "../packages/content/src/upload-request.js";
import { uploadVideoFile } from "../packages/content/src/video-upload.js";
import { markdownToHtml, memoryBody, memoryPreview, memoryReaderTitle } from "../packages/content/src/markdown.js";
window.songqiUploadRequest = uploadRequest;
window.songqiVideoUpload = uploadVideoFile;
window.songqiMarkdown = { render: markdownToHtml, body: memoryBody, preview: memoryPreview, readerTitle: memoryReaderTitle };

window.songqiMedia = { accept: mediaAccept, isAudioFile };
window.songqiAudioVisualizer = createAudioVisualizer;
window.dispatchEvent(new Event("songqi-markdown-ready"));
