import { createAudioVisualizer } from "../packages/content/src/audio-visualizer.js";
import { mediaAccept, isAudioFile } from "../packages/config/src/media-limits.js";
import { uploadRequest } from "../packages/content/src/upload-request.js";
import { uploadVideoFile } from "../packages/content/src/video-upload.js";
import { groupLivePhotos, isLivePhotoFile } from "../packages/content/src/live-photo-upload.js";
import { createLivePhotoPlayer } from "../packages/content/src/live-photo-player.js";
import { markdownToHtml, memoryBody, memoryPreview, memoryReaderTitle } from "../packages/content/src/markdown.js";
window.songqiUploadRequest = uploadRequest;
window.songqiVideoUpload = uploadVideoFile;
window.songqiMarkdown = { render: markdownToHtml, body: memoryBody, preview: memoryPreview, readerTitle: memoryReaderTitle };

window.songqiMedia = { accept: mediaAccept, isAudioFile, groupLivePhotos, isLivePhotoFile };
window.songqiAudioVisualizer = createAudioVisualizer;
window.songqiLivePhotoPlayer = createLivePhotoPlayer;
window.dispatchEvent(new Event("songqi-markdown-ready"));
