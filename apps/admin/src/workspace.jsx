import { useEffect, useEffectEvent, useId, useRef, useState } from "react";
import { EditorialLayout } from "./EditorialLayout.jsx";
import { Dialog } from "radix-ui";
import {
  ArrowLeft,
  ArrowRight,
  File,
  Film,
  Image,
  Music2,
  Play,
  Search,
  Upload,
  X,
  Plus,
  Eye,
  Pencil,
  Bold,
  Italic,
  Heading2,
  Link,
  List,
  Download,
  ExternalLink,
} from "lucide-react";
import {
  Button,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Input,
} from "@i-remember/ui";
import { markdownToHtml } from "../../../packages/content/src/markdown.js";
import { mediaAccept } from "../../../packages/config/src/media-limits.js";
import { groupLivePhotos } from "../../../packages/content/src/live-photo-upload.js";
import { appendV1Attachment } from "./v1-memory.js";
import { v1AssetPreviewUrls } from "./v1-assets.js";

export function mediaKind(asset = {}) {
  if (asset.metadata?.livePhoto) return "live";
  const type = asset.type || asset.mimeType || "";
  return type.startsWith("image/")
    ? "image"
    : type.startsWith("video/")
      ? "video"
      : type.startsWith("audio/")
        ? "audio"
        : "file";
}
const kindLabels = {
  image: "Photo",
  video: "Video",
  audio: "Audio",
  live: "Live Photo",
  file: "File",
};
const kindIcons = { image: Image, video: Film, audio: Music2, live: Play, file: File };
export function assetName(asset = {}) {
  return (
    asset.metadata?.filename ||
    asset.metadata?.originalName ||
    (asset.url || asset.resizedUrl || asset.imageKey || "Attachment").split("/").pop()
  );
}
function mediaUrl(asset) {
  return asset.url || asset.resizedUrl;
}
function durationLabel(seconds) {
  return Number.isFinite(seconds) && seconds > 0
    ? `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`
    : "";
}
function MediaThumbnail({ asset }) {
  const kind = mediaKind(asset),
    Icon = kindIcons[kind];
  const src = kind === "image" || kind === "live" ? mediaUrl(asset) : asset.metadata?.posterUrl;
  const [failed, setFailed] = useState(false);
  return (
    <div className={`admin-media-thumb is-${kind}`}>
      {src && !failed ? (
        <img src={src} alt="" loading="lazy" onError={() => setFailed(true)} />
      ) : (
        <Icon size={32} strokeWidth={1} />
      )}
      <span className="admin-media-kind">
        <Icon size={13} />
        {kindLabels[kind]}
        {["video", "audio", "live"].includes(kind) && durationLabel(asset.metadata?.duration)
          ? ` · ${durationLabel(asset.metadata.duration)}`
          : ""}
      </span>
    </div>
  );
}
function MediaPlayer({ asset }) {
  const kind = mediaKind(asset),
    [error, setError] = useState(false);
  const [livePlaying, setLivePlaying] = useState(false);
  const urls = v1AssetPreviewUrls(asset);
  const url = urls.preview;
  if (error)
    return (
      <div className="admin-workspace-empty">
        <File />
        <p>Preview unavailable. You can still download the original file.</p>
      </div>
    );
  if (kind === "image")
    return (
      <img
        className="admin-media-full-image"
        src={url}
        alt={assetName(asset)}
        onError={() => setError(true)}
      />
    );
  if (kind === "video")
    return (
      <video
        className="admin-media-player"
        src={url}
        poster={asset.metadata?.posterUrl}
        controls
        playsInline
        preload="metadata"
        onError={() => setError(true)}
      />
    );
  if (kind === "live")
    return (
      <div className="admin-live-preview">
        {livePlaying ? (
          <video
            className="admin-media-player"
            src={urls.video}
            controls
            playsInline
            autoPlay
            onEnded={() => setLivePlaying(false)}
            onError={() => setError(true)}
          />
        ) : (
          <>
            <img className="admin-media-full-image" src={url} alt={assetName(asset)} />
            <Button type="button" onClick={() => setLivePlaying(true)}>
              <Play size={16} />
              Play Live Photo{asset.metadata.hasAudio ? " with sound" : ""}
            </Button>
          </>
        )}
      </div>
    );
  if (kind === "audio")
    return (
      <div className="admin-audio-preview">
        <Music2 size={48} strokeWidth={1} />
        <p>{assetName(asset)}</p>
        <audio src={url} controls preload="metadata" onError={() => setError(true)} />
      </div>
    );
  return (
    <div className="admin-workspace-empty">
      <File />
      <p>No preview for this file type.</p>
    </div>
  );
}
function Modal({ title, description, children, open, onClose, className = "" }) {
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(value) => {
        if (!value) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="admin-workspace-scrim" />
        <Dialog.Content className={`i-remember-admin dark admin-workspace-dialog ${className}`}>
          <header>
            <div>
              <Dialog.Title>{title}</Dialog.Title>
              <Dialog.Description>{description}</Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <Button variant="ghost" type="button" aria-label="Close dialog">
                <X size={20} />
              </Button>
            </Dialog.Close>
          </header>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
function MediaDialog({ asset, onClose, loadMedia, deleteMedia, editMemory, editPage }) {
  const [detail, setDetail] = useState(null), [busy, setBusy] = useState(false), [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    if (loadMedia && asset.id) loadMedia(asset.id).then(value => { if (active) setDetail(value); }).catch(err => { if (active) setError(err.message); });
    return () => { active = false; };
  }, [asset.id, loadMedia]);
  return <Modal open title={assetName(asset)} description={kindLabels[mediaKind(asset)]} onClose={() => { if (!busy) onClose(); }}>
    <div className="admin-media-stage"><MediaPlayer asset={asset} /></div>
    <div className="admin-media-detail">
      <Button asChild variant="outline"><a href={v1AssetPreviewUrls(asset).download} download target="_blank" rel="noreferrer"><Download size={16} />{asset.metadata?.livePhoto ? "Download photo + MOV" : "Download file"}</a></Button>
      {loadMedia && !detail && !error ? <p role="status">Checking file usage…</p> : null}
      {detail ? <section><h3>{detail.usage.length ? `Used in ${detail.usage.length} ${detail.usage.length === 1 ? "place" : "places"}` : "Not used in any saved memory or page"}</h3>
        {detail.usage.map(item => <div className="admin-media-usage" key={item.kind + item.id}>
          <button type="button" onClick={() => { onClose(); if (item.kind === "page") editPage?.(item.slug); else editMemory?.(item.id); }}>
            {item.title}<small>{item.kind === "page" ? "Page" : "Memory"} · {item.status.toLowerCase()}</small>
          </button>
        </div>)}
        {!detail.usage.length ? <p className="admin-field-help">Kept in your library for reuse. Deleting also removes the stored file and its media variants.</p> : null}
        {!detail.usage.length && detail.canDelete && deleteMedia ? <Button variant="outline" disabled={busy} onClick={async () => {
          if (!window.confirm("Permanently delete this unused file and its media variants? This cannot be undone.")) return;
          setBusy(true); setError("");
          try { await deleteMedia(asset.id); onClose(); } catch (err) { setError(err.message); } finally { setBusy(false); }
        }}>{busy ? "Deleting…" : "Delete unused file"}</Button> : null}
      </section> : null}
      {error ? <p role="alert">{error}</p> : null}
    </div>
  </Modal>;
}

function MediaGrid({ assets, onSelect, selectLabel = "Preview", selected = [] }) {
  return (
    <div className="admin-media-grid">
      {assets.map((asset) => (
        <button
          type="button"
          className="admin-media-tile"
          key={mediaUrl(asset)}
          onClick={() => onSelect(asset)}
          disabled={selected.includes(mediaUrl(asset))}
          aria-label={`${selectLabel} ${assetName(asset)}`}
        >
          <MediaThumbnail asset={asset} />
          <span className="admin-media-filename">{assetName(asset)}</span>
          <span className="admin-media-caption">
            {selected.includes(mediaUrl(asset))
              ? "Already attached"
              : asset.usageCount !== undefined
                ? asset.usageCount ? `Used in ${asset.usageCount} ${asset.usageCount === 1 ? "place" : "places"}` : "Unused · kept in library"
                : kindLabels[mediaKind(asset)]}
          </span>
        </button>
      ))}
    </div>
  );
}
function LibraryFilter({ query, setQuery, kind, setKind, count }) {
  return (
    <div className="admin-workspace-toolbar">
      <label className="admin-workspace-search">
        <Search size={17} />
        <Input
          type="search"
          aria-label="Search media"
          placeholder="Search files or their owners…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>
      <select
        aria-label="Media type"
        value={kind}
        onChange={(event) => setKind(event.target.value)}
      >
        <option value="all">All media</option>
        <option value="image">Photos</option>
        <option value="video">Videos</option>
        <option value="audio">Audio</option>
        <option value="live">Live Photos</option>
        <option value="file">Files</option>
        <option value="unused">Unused</option>
      </select>
      <span className="admin-workspace-count">{count} items</span>
    </div>
  );
}
function useMediaPage(queryMedia, query, kind, enabled, revision) {
  const [result, setResult] = useState({ assets: [], total: 0, cursor: null, loading: false, error: "" });
  const request = useRef(null), generation = useRef(0);
  const load = async (cursor, version) => {
    request.current?.abort();
    const controller = new AbortController(); request.current = controller;
    setResult(current => ({ ...current, loading: true, error: "" }));
    try {
      const payload = await queryMedia({ q: query.trim(), ...(kind === "unused" ? { unused: "true" } : { kind }), ...(cursor ? { cursor } : {}) }, controller.signal);
      if (controller.signal.aborted || generation.current !== version) return;
      setResult(current => ({ assets: cursor ? [...current.assets, ...payload.data] : payload.data, total: payload.pagination.total, cursor: payload.pagination.nextCursor, loading: false, error: "" }));
    } catch (error) {
      if (!controller.signal.aborted && generation.current === version) setResult(current => ({ ...current, loading: false, error: error.message }));
    }
  };
  useEffect(() => {
    const version = ++generation.current;
    setResult({ assets: [], total: 0, cursor: null, loading: Boolean(enabled), error: "" });
    if (!enabled || !queryMedia) return;
    const timer = setTimeout(() => load(null, version), query.trim() ? 180 : 0);
    return () => { clearTimeout(timer); request.current?.abort(); generation.current++; };
  }, [queryMedia, query, kind, enabled, revision]);
  return { ...result, more: () => load(result.cursor, generation.current), retry: () => load(null, generation.current) };
}
function MediaPagination({ library }) {
  return <div className="admin-media-pagination">
    {library.loading ? <p role="status">Loading media…</p> : null}
    {library.error ? <p role="alert">{library.error} <Button variant="ghost" onClick={library.retry}>Retry</Button></p> : null}
    {library.cursor ? <Button type="button" variant="outline" disabled={library.loading} onClick={library.more}>Load more media</Button> : null}
  </div>;
}
function UploadStatus({ progress, onCancel }) {
  return (
    <div className="admin-upload-status" role="status">
      <span>
        {progress?.phase === "uploading" ? "Uploading" : "Processing media"}
        {progress?.index ? ` · File ${progress.index}` : ""}
        {progress?.percent != null ? ` · ${progress.percent}%` : ""}
      </span>
      <progress aria-label="Upload progress" max="100" value={progress?.percent ?? undefined} />
      <Button type="button" variant="ghost" onClick={onCancel}>
        Cancel upload
      </Button>
    </div>
  );
}
export function MediaLibrary({ assets = [], queryMedia, onUpload, loadMedia, deleteMedia, scanMedia, editMemory, editPage }) {
  const [query, setQuery] = useState(""),
    [kind, setKind] = useState("all"),
    [selected, setSelected] = useState(null),
    [uploadOpen, setUploadOpen] = useState(false);
  const [busy, setBusy] = useState(false),
    [progress, setProgress] = useState(null),
    [error, setError] = useState("");
  const controller = useRef(null);
  useEffect(() => () => controller.current?.abort(), []);
  const library = useMediaPage(queryMedia, query, kind, true, assets);
  const filtered = library.assets;
  return (
    <div className="admin-media-workspace">
      <div className="admin-section-heading">
        <div>
          <h2>Media library</h2>
          <p>Preview files, find their memories, and reuse them while writing.</p>
        </div>
        <div className="admin-media-library-actions"><Button variant="ghost" disabled={busy} onClick={async () => { setBusy(true); setError(""); try { await scanMedia(); } catch (err) { setError(err.message); } finally { setBusy(false); } }}>Find stored files</Button><Button onClick={() => setUploadOpen(true)}>
          <Upload size={16} />
          Upload media
        </Button></div>
      </div>
      {error && !uploadOpen ? <p role="alert">{error}</p> : null}
      <LibraryFilter {...{ query, setQuery, kind, setKind }} count={library.total} />
      {filtered.length ? (
        <MediaGrid assets={filtered} onSelect={setSelected} />
      ) : !library.loading && !library.error ? (
        <div className="admin-workspace-empty">
          <Image size={32} />
          <h3>{query || kind !== "all" ? "No matching media" : "Your media library is empty"}</h3>
          <p>
            {query || kind !== "all"
              ? "Try another search or media type."
              : "Upload media here or while writing a memory or page."}
          </p>
          {query || kind !== "all" ? (
            <Button
              variant="outline"
              onClick={() => {
                setQuery("");
                setKind("all");
              }}
            >
              Clear filters
            </Button>
          ) : null}
        </div>
      ) : null}
      <MediaPagination library={library} />
      {selected ? (
        <MediaDialog
          key={mediaUrl(selected)}
          asset={selected}
          onClose={() => setSelected(null)}
          {...{ loadMedia, deleteMedia, editMemory, editPage }}
        />
      ) : null}
      <Modal
        open={uploadOpen}
        title="Upload media"
        description="Upload once, then use the file in any memory or page."
        onClose={() => {
          if (!busy) setUploadOpen(false);
        }}
      >
        <div className="admin-upload-dialog-body">
          <label className="admin-upload-dropzone">
            <Upload size={26} />
            <strong>Choose photos, audio or video</strong>
            <span>Live Photos: select both the photo and matching MOV.</span>
            <input
              aria-label="Choose media files"
              type="file"
              accept={mediaAccept}
              multiple
              disabled={busy}
              onChange={async (event) => {
                const files = Array.from(event.target.files || []);
                event.target.value = "";
                if (!files.length) return;
                const abort = new AbortController();
                controller.current = abort;
                setBusy(true);
                setError("");
                setProgress({ phase: "uploading", percent: 0 });
                try {
                  await onUpload(files, null, abort.signal, setProgress);
                  if (!abort.signal.aborted) setUploadOpen(false);
                } catch (err) {
                  setError(
                    abort.signal.aborted
                      ? "Upload cancelled. Completed files remain in the library."
                      : err.message,
                  );
                } finally {
                  setBusy(false);
                }
              }}
            />
          </label>
          {busy ? (
            <UploadStatus progress={progress} onCancel={() => controller.current?.abort()} />
          ) : null}
          {error ? <p role="alert">{error}</p> : null}
        </div>
      </Modal>
    </div>
  );
}
export function EditorAttachments({
  attachments,
  assets = [],
  queryMedia,
  onUpload,
  onChange,
  onDirty,
  onBusy,
  disabled,
}) {
  const [preview, setPreview] = useState(null),
    [picker, setPicker] = useState(false),
    [busy, setBusy] = useState(false),
    [progress, setProgress] = useState(null),
    [error, setError] = useState("");
  const [query, setQuery] = useState(""),
    [kind, setKind] = useState("all");
  const library = useMediaPage(queryMedia, query, kind, picker, assets);
  const controller = useRef(null),
    currentAttachments = useRef(attachments);
  currentAttachments.current = attachments;
  useEffect(() => () => controller.current?.abort(), []);
  const reorder = (index, direction) => {
    const next = [...attachments],
      to = index + direction;
    [next[index], next[to]] = [next[to], next[index]];
    onChange(next.map((asset, order) => ({ ...asset, metadata: { ...asset.metadata, order } })));
  };
  return (
    <section className="admin-editor-media">
      <div className="admin-section-heading">
        <div>
          <h2>
            Attachments <span>{attachments.length}</span>
          </h2>
          <p>The first file is the cover. Changes apply when you save.</p>
        </div>
        <Button
          type="button"
          variant="outline"
          disabled={disabled || busy}
          onClick={() => setPicker(true)}
        >
          <Plus size={16} />
          From library
        </Button>
      </div>
      <label className="admin-upload-dropzone compact">
        <Upload size={20} />
        <strong>{busy ? "Upload in progress…" : "Upload photos, audio or video"}</strong>
        <input
          aria-label="Upload attachments"
          type="file"
          multiple
          accept={mediaAccept}
          disabled={disabled || busy}
          onChange={async (event) => {
            let files;
            try {
              files = groupLivePhotos(event.target.files);
            } catch (err) {
              setError(err.message);
              event.target.value = "";
              return;
            }
            event.target.value = "";
            if (!files.length) return;
            const abort = new AbortController();
            controller.current = abort;
            setBusy(true);
            onBusy(true);
            onDirty();
            setError("");
            try {
              for (const [index, file] of files.entries()) {
                const update = (value) => setProgress({ ...value, index: index + 1 });
                update({ phase: "uploading", percent: 0 });
                const asset = await onUpload(file, abort.signal, update);
                if (abort.signal.aborted) break;
                const next = appendV1Attachment(currentAttachments.current, asset);
                currentAttachments.current = next;
                onChange(next);
              }
            } catch (err) {
              setError(
                abort.signal.aborted
                  ? "Upload cancelled. Completed files are kept in this draft."
                  : err.message,
              );
            } finally {
              setBusy(false);
              onBusy(false);
            }
          }}
        />
      </label>
      <details className="admin-media-help">
        <summary>Formats and Live Photos</summary>
        <p>
          Photos: JPEG, PNG, WebP, GIF. Video: up to 500 MB / 10 minutes. Audio: up to 100 MB / 10
          minutes. For a Live Photo, select the photo and matching MOV together, or a .livp / .zip
          archive.
        </p>
      </details>
      {busy ? (
        <UploadStatus progress={progress} onCancel={() => controller.current?.abort()} />
      ) : null}
      {error ? <p role="alert">{error}</p> : null}
      <div className="admin-editor-media-grid">
        {attachments.map((asset, index) => (
          <div className="admin-editor-media-item" key={`${mediaUrl(asset)}-${index}`}>
            <button
              type="button"
              onClick={() => setPreview(asset)}
              aria-label={`Preview ${assetName(asset)}`}
            >
              <MediaThumbnail asset={asset} />
            </button>
            <div className="admin-media-item-info">
              <strong>
                {index === 0 ? "Cover · " : `${index + 1} · `}
                {assetName(asset)}
              </strong>
              <div className="admin-media-item-actions">
                <Button
                  type="button"
                  variant="ghost"
                  aria-label={`Move attachment ${index + 1} earlier`}
                  disabled={disabled || busy || index === 0}
                  onClick={() => reorder(index, -1)}
                >
                  <ArrowLeft size={16} />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  aria-label={`Move attachment ${index + 1} later`}
                  disabled={disabled || busy || index === attachments.length - 1}
                  onClick={() => reorder(index, 1)}
                >
                  <ArrowRight size={16} />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  aria-label={`Remove attachment ${index + 1}`}
                  disabled={disabled || busy}
                  onClick={() =>
                    onChange(
                      attachments
                        .filter((_, i) => i !== index)
                        .map((item, order) => ({ ...item, metadata: { ...item.metadata, order } })),
                    )
                  }
                >
                  <X size={16} />
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>
      {preview ? (
        <MediaDialog key={mediaUrl(preview)} asset={preview} onClose={() => setPreview(null)} />
      ) : null}
      <Modal
        open={picker}
        title="Add from library"
        description="Reuse a file without uploading it again."
        onClose={() => setPicker(false)}
      >
        <div className="admin-library-picker">
          <LibraryFilter
            {...{ query, setQuery, kind, setKind }}
            count={library.total}
          />
          <MediaGrid
            assets={library.assets}
            selected={attachments.map(mediaUrl)}
            selectLabel="Attach"
            onSelect={(asset) => {
              onChange(
                appendV1Attachment(attachments, {
                  url: mediaUrl(asset),
                  type: asset.type || asset.mimeType,
                  metadata: asset.metadata,
                }),
              );
              setPicker(false);
            }}
          />
          <MediaPagination library={library} />
          {!library.loading && !library.error && !library.total ? (
            <p className="admin-workspace-empty">
              No saved media yet. Upload a file to this memory.
            </p>
          ) : null}
        </div>
      </Modal>
    </section>
  );
}
export function WritingField({ titleField, previewTitle, label, value = "", onChange, assets, queryMedia, onUpload, onBusy = () => {} }) {
  const [mediaOpen, setMediaOpen] = useState(false);
  const [query, setQuery] = useState(""), [kind, setKind] = useState("all");
  const library = useMediaPage(queryMedia, query, kind, mediaOpen, assets);
  const [uploading, setUploading] = useState(false), [progress, setProgress] = useState(null), [uploadError, setUploadError] = useState("");
  const uploadController = useRef(null), valueRef = useRef(value);
  valueRef.current = value;
  const [preview, setPreview] = useState(false),
    textarea = useRef(null),
    id = useId();
  useEffect(() => () => uploadController.current?.abort(), []);
  useEffect(() => {
    if (!textarea.current) return;
    textarea.current.style.height = "auto";
    textarea.current.style.height = Math.min(420, Math.max(180, textarea.current.scrollHeight)) + "px";
  }, [value, preview]);
  const tools = [
    [Bold, "Bold", "**", "**", "bold text"],
    [Italic, "Italic", "_", "_", "italic text"],
    [Heading2, "Heading", "\n## ", "", "Heading"],
    [Link, "Link", "[", "](https://)", "link text"],
    [List, "List", "\n- ", "", "List item"],
  ];
  const insert = (before, after, fallback, collapse = false) => {
    const field = textarea.current;
    if (!field) return;
    const start = field.selectionStart,
      end = field.selectionEnd,
      text = valueRef.current.slice(start, end) || fallback;
    valueRef.current = valueRef.current.slice(0, start) + before + text + after + valueRef.current.slice(end);
    onChange(valueRef.current);
    requestAnimationFrame(() => {
      field.focus();
      const position = start + before.length + text.length + (collapse ? after.length : 0);
      field.setSelectionRange(collapse ? position : start + before.length, position);
    });
  };
  return (
    <div className="admin-writing-field">
      <div className="admin-writing-header">
        <label htmlFor={id}>{label}</label>
        <div>
          <Button
            type="button"
            variant="ghost"
            aria-pressed={!preview}
            onClick={() => setPreview(false)}
          >
            <Pencil size={14} />
            Write
          </Button>
          <Button
            type="button"
            variant="ghost"
            aria-pressed={preview}
            onClick={() => setPreview(true)}
          >
            <Eye size={14} />
            Preview
          </Button>
        </div>
      </div>
      {!preview ? (
        <>
          <div className="admin-markdown-tools" role="toolbar" aria-label="Formatting">
            {tools.map(([Icon, name, before, after, fallback]) => (
              <Button
                key={name}
                type="button"
                variant="ghost"
                aria-label={name}
                title={name}
                onClick={() => insert(before, after, fallback)}
              >
                <Icon size={16} />
              </Button>
            ))}
            <span>Markdown</span>
            {assets ? (
              <Button
                type="button"
                variant="ghost"
                aria-label="Insert media"
                title="Insert media"
                onClick={() => setMediaOpen(true)}
              >
                <Image size={16} />
              </Button>
            ) : null}
          </div>
          {titleField}
          <textarea
            ref={textarea}
            id={id}
            className="admin-writing-input"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            placeholder="Start writing…"
            rows={6}
          />
        </>
      ) : (
        <div className="markdown-preview admin-writing-preview" aria-label={`${label} preview`}>
          {titleField && <h2 className="editorial-preview-title">{previewTitle || "Page title"}</h2>}
          {value.trim() ? (
            <div dangerouslySetInnerHTML={{ __html: markdownToHtml(value) }} />
          ) : (
            <p>Your writing preview will appear here.</p>
          )}
        </div>
      )}
      <div className="admin-writing-footer">
        {value.length.toLocaleString()} characters{!titleField && " · Full content is preserved"}
      </div>
      <Modal
        open={mediaOpen}
        title="Insert media"
        description="Photos appear inline. Other files are inserted as links."
        onClose={() => { if (!uploading) setMediaOpen(false); }}
      >
        <div className="admin-library-picker">
          {onUpload ? <label className="admin-upload-dropzone compact">
            <Upload size={20} /><strong>Upload and insert media</strong>
            <input type="file" aria-label="Upload page media" accept={mediaAccept} multiple disabled={uploading}
              onChange={async event => {
                let files;
                try { files = groupLivePhotos(event.target.files); } catch (err) { setUploadError(err.message); return; }
                event.target.value = "";
                if (!files.length) return;
                const controller = new AbortController(); uploadController.current = controller;
                setUploading(true); onBusy(true); setUploadError("");
                try {
                  for (const file of files) {
                    const asset = await onUpload(file, controller.signal, setProgress);
                    const image = ["image", "live"].includes(mediaKind(asset));
                    insert(image ? "\n![" : "\n[", `](<${v1AssetPreviewUrls(asset).preview}>)\n`, assetName(asset).replace(/[\[\]]/g, ""), true);
                  }
                  setMediaOpen(false);
                } catch (err) { setUploadError(controller.signal.aborted ? "Upload cancelled. Completed files stay in your library." : err.message); }
                finally { setUploading(false); onBusy(false); }
              }} />
          </label> : null}
          {uploading ? <UploadStatus progress={progress} onCancel={() => uploadController.current?.abort()} /> : null}
          {uploadError ? <p role="alert">{uploadError}</p> : null}
          <LibraryFilter {...{ query, setQuery, kind, setKind }} count={library.total} />
          <MediaGrid
            assets={library.assets}
            selectLabel="Insert"
            onSelect={(asset) => {
              if (uploading) return;
              const image = ["image", "live"].includes(mediaKind(asset));
              insert(
                image ? "\n![" : "\n[",
                `](<${v1AssetPreviewUrls(asset).preview}>)\n`,
                assetName(asset).replace(/[\[\]]/g, ""), true,
              );
              setMediaOpen(false);
            }}
          />
          <MediaPagination library={library} />
          {!library.loading && !library.error && !library.total ? (
            <p>No saved media yet. Upload a file here to start your library.</p>
          ) : null}
        </div>
      </Modal>
    </div>
  );
}
function FieldInput({ label, ...props }) {
  const id = useId();
  return (
    <label className="admin-workspace-field" htmlFor={id}>
      {label}
      <Input id={id} {...props} />
    </label>
  );
}
function PageList({ data, editPage, createPage }) {
  const [query, setQuery] = useState(""),
    [status, setStatus] = useState("all");
  const pages = (data.pages || []).filter(
    (page) =>
      (status === "all" || status === page.status) &&
      `${page.title} ${page.slug}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
  );
  return (
    <div className="admin-pages-workspace">
      <div className="admin-workspace-toolbar">
        <label className="admin-workspace-search">
          <Search size={17} />
          <Input
            aria-label="Search pages"
            type="search"
            placeholder="Search pages…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <select
          aria-label="Page status"
          value={status}
          onChange={(event) => setStatus(event.target.value)}
        >
          <option value="all">All statuses</option>
          <option value="PUBLISHED">Published</option>
          <option value="DRAFT">Draft</option>
          <option value="ARCHIVED">Archived</option>
        </select>
        <span className="admin-workspace-count">{pages.length} pages</span>
      </div>
      <div className="admin-page-list">
        {pages.map((page) => (
          <button
            className="admin-page-row"
            type="button"
            key={page.id}
            onClick={() => editPage(page.slug)}
          >
            <File size={21} strokeWidth={1.4} />
            <span>
              <strong>{page.title}</strong>
              <small>{page.excerpt || `Navigation key: ${page.slug}`}</small>
            </span>
            <span className="admin-page-status">{page.status.toLowerCase()}</span>
            <ArrowRight size={17} />
          </button>
        ))}
      </div>
      {!pages.length ? (
        <div className="admin-workspace-empty">
          <File size={32} />
          <h3>{data.pages?.length ? "No matching pages" : "A place for the longer story"}</h3>
          <p>
            {data.pages?.length
              ? "Try another search or status."
              : "Create an About page, a biography, or another article for your footer."}
          </p>
          {!data.pages?.length ? (
            <Button onClick={createPage}>Create a page</Button>
          ) : (
            <Button
              variant="outline"
              onClick={() => {
                setQuery("");
                setStatus("all");
              }}
            >
              Clear filters
            </Button>
          )}
        </div>
      ) : null}
    </div>
  );
}
export function PagesWorkspace(props) {
  return props.route === "pages" ? <PageList {...props} /> : <PageEditorWorkspace {...props} />;
}
const pageStatusLabels = { DRAFT: "Draft", PUBLISHED: "Published", ARCHIVED: "Archived" };
const pageTransitions = {
  PUBLISHED: ["Publish page", "Visitors will be able to open the full page."],
  ARCHIVED: [
    "Archive page",
    "The public page and its footer link will be hidden. You can restore it later.",
  ],
  DRAFT: [
    "Move to draft",
    "Keep editing privately. Visitors will no longer be able to open this page.",
  ],
};

function PageEditorWorkspace({
  data,
  selectedPageSlug,
  savePage,
  savingPage,
  reportDirty,
  navigate,
  uploadEditorFile,
  queryMedia,
  onUploadingChange,
  navigationPending,
}) {
  const page = data.pages.find((item) => item.slug === selectedPageSlug);
  const footerVisible = Boolean(
    page &&
    data.menu.some(
      (item) => item.type === "PAGE" && item.targetValue === page.slug && item.isVisible,
    ),
  );
  const [draft, setDraft] = useState(() => ({
    title: page?.title || "",
    bodyMarkdown: page?.bodyMarkdown || "",
    excerpt: page?.excerpt || "",
    slug: page?.slug || "",
    navigationVisible: footerVisible,
  }));
  const [baseline, setBaseline] = useState(draft);
  const [record, setRecord] = useState(page);
  const [saveMessage, setSaveMessage] = useState("");
  const [error, setError] = useState("");
  const [intent, setIntent] = useState(null);
  const [uploading, setUploading] = useState(false);
  const editing = useRef(draft);
  const inFlight = useRef(false);
  const slugTouched = useRef(Boolean(page));
  const status = record?.status || "DRAFT";
  const dirty = draft !== baseline;
  const valid = draft.title.trim() && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(draft.slug);
  useEffect(() => () => onUploadingChange(false), [onUploadingChange]);

  function update(fields) {
    const next = { ...editing.current, ...fields };
    editing.current = next;
    setDraft(next);
    setError("");
    reportDirty(true);
  }

  async function persist(nextStatus) {
    if (inFlight.current || uploading) return;
    const snapshot = editing.current;
    if (!valid) {
      setError("Enter a title and a valid navigation key in Advanced.");
      return;
    }
    if (nextStatus === "PUBLISHED" && !snapshot.bodyMarkdown.trim()) {
      setError("Write some content before publishing this page.");
      return;
    }
    inFlight.current = true;
    setError("");
    try {
      const saved = await savePage(record, {
        ...record,
        language: record?.language || data.settings.defaultLanguage,
        ...snapshot,
        status: nextStatus,
        navigationVisible:
          snapshot.navigationVisible !== baseline.navigationVisible
            ? snapshot.navigationVisible
            : undefined,
      });
      setRecord(saved);
      setSaveMessage(nextStatus === status && nextStatus !== "DRAFT" ? "Changes saved" : "");
      setBaseline(snapshot);
      slugTouched.current = true;
      reportDirty(editing.current !== snapshot);
    } catch (cause) {
      setError(cause.message);
    } finally {
      inFlight.current = false;
    }
  }

  const savePrivateDraft = useEffectEvent(() => persist("DRAFT"));
  // Changing the record, opening a confirmation, or editing again cancels the pending timer.
  useEffect(() => {
    if (
      status !== "DRAFT" ||
      !dirty ||
      !valid ||
      savingPage ||
      uploading ||
      intent ||
      navigationPending ||
      error
    )
      return;
    const timer = setTimeout(savePrivateDraft, 900);
    return () => clearTimeout(timer);
  }, [
    draft,
    baseline,
    status,
    savingPage,
    uploading,
    intent,
    navigationPending,
    error,
    valid,
    dirty,
  ]);

  if (selectedPageSlug && !page && !record)
    return (
      <div className="admin-workspace-empty">
        <h2>Page not found</h2>
        <Button onClick={() => navigate("pages")}>Back to pages</Button>
      </div>
    );

  const statusText = uploading
    ? "Uploading…"
    : savingPage
      ? "Saving…"
      : error
        ? "Needs attention"
        : dirty
          ? "Edited"
          : !record
            ? "New draft"
            : status === "DRAFT"
              ? "Draft saved"
              : saveMessage || pageStatusLabels[status];
  const changeStatus = (next) => {
    if (!valid || (next === "PUBLISHED" && !draft.bodyMarkdown.trim())) {
      setError(
        !valid
          ? "Enter a title and a valid navigation key in Advanced."
          : "Write some content before publishing this page.",
      );
      return;
    }
    setIntent(next);
  };
  const publish = status === "DRAFT";
  return (
    <EditorialLayout
      section="Pages"
      detail={draft.title.trim() || "New page"}
      onBack={() => navigate("pages")}
      title={record ? "Edit page" : "New page"}
      description="Write and publish a page for your site."
      status={statusText}
      action={
        <Button
          form="page-editor-form"
          type="submit"
          disabled={savingPage || uploading || (!publish && !dirty)}
        >
          {publish ? "Publish…" : "Save changes"}
        </Button>
      }
    >
      {error && (
        <div className="editorial-error" role="alert">
          {error}
          {status === "DRAFT" && dirty && valid && (
            <button type="button" onClick={() => persist("DRAFT")}>
              Retry draft save
            </button>
          )}
        </div>
      )}
      <form
        id="page-editor-form"
        className="editorial-page"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          if (!savingPage && !uploading) {
            if (publish) changeStatus("PUBLISHED");
            else if (dirty) void persist(status);
          }
        }}
      >
        <section className="editorial-document">
          <WritingField
            previewTitle={draft.title}
            label="Page content"
            assets={data.attachments}
            onUpload={uploadEditorFile}
            queryMedia={queryMedia}
            onBusy={(value) => {
              setUploading(value);
              onUploadingChange(value);
            }}
            value={draft.bodyMarkdown}
            onChange={(bodyMarkdown) => update({ bodyMarkdown })}
            titleField={
              <input
                aria-label="Title"
                className="editorial-title"
                required
                maxLength={180}
                placeholder="Page title"
                value={draft.title}
                onChange={(event) => {
                  const title = event.target.value;
                  const fields = { title };
                  if (!slugTouched.current) {
                    fields.slug =
                      title
                        .toLowerCase()
                        .normalize("NFKD")
                        .replace(/[^a-z0-9\s-]/g, "")
                        .trim()
                        .replace(/[\s-]+/g, "-")
                        .slice(0, 120)
                        .replace(/-$/, "") ||
                      (title.trim()
                        ? editing.current.slug || `page-${crypto.randomUUID().slice(0, 8)}`
                        : "");
                  }
                  update(fields);
                }}
              />
            }
          />
        </section>
        <aside className="editorial-inspector">
          <h2>Publishing</h2>
          <div className="inspector-row">
            Status <span>{pageStatusLabels[status]}</span>
          </div>
          <label className="inspector-row">
            Show in footer
            <input
              className="editorial-toggle"
              type="checkbox"
              checked={draft.navigationVisible}
              onChange={(event) => update({ navigationVisible: event.target.checked })}
            />
          </label>
          <details className="editorial-advanced">
            <summary>Advanced</summary>
            <FieldInput
              label="Navigation key"
              value={draft.slug}
              maxLength={120}
              onChange={(event) => {
                slugTouched.current = true;
                update({ slug: event.target.value });
              }}
            />
            <label className="admin-workspace-field">
              Short description
              <textarea
                rows={3}
                maxLength={600}
                value={draft.excerpt}
                onChange={(event) => update({ excerpt: event.target.value })}
              />
            </label>
            {record && (
              <div className="editorial-lifecycle">
                {status !== "DRAFT" && (
                  <button
                    type="button"
                    disabled={savingPage || uploading}
                    onClick={() => changeStatus("DRAFT")}
                  >
                    {status === "ARCHIVED" ? "Restore draft…" : "Move to draft…"}
                  </button>
                )}
                {status === "ARCHIVED" && (
                  <button
                    type="button"
                    disabled={savingPage || uploading}
                    onClick={() => changeStatus("PUBLISHED")}
                  >
                    Publish…
                  </button>
                )}
                {status !== "ARCHIVED" && (
                  <button
                    type="button"
                    disabled={savingPage || uploading}
                    onClick={() => changeStatus("ARCHIVED")}
                  >
                    Archive page…
                  </button>
                )}
              </div>
            )}
          </details>
          <p>
            {status === "PUBLISHED"
              ? "Saved changes are visible to visitors."
              : "The footer link appears when the page is published."}
          </p>
          {status === "PUBLISHED" && record?.linkedMemoryId && (
            <a
              className="editorial-public-link"
              href={`/memory/${encodeURIComponent(record.linkedMemoryId)}`}
              target="_blank"
              rel="noreferrer"
            >
              Open published page <ExternalLink size={14} />
            </a>
          )}
        </aside>
      </form>
      <Modal
        className="editorial-confirm-dialog"
        open={Boolean(intent)}
        title={intent ? pageTransitions[intent][0] : ""}
        description={intent ? pageTransitions[intent][1] : ""}
        onClose={() => setIntent(null)}
      >
        <div className="editorial-confirm">
          <Button variant="outline" type="button" onClick={() => setIntent(null)}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => {
              const next = intent;
              setIntent(null);
              void persist(next);
            }}
          >
            {intent && pageTransitions[intent][0]}
          </Button>
        </div>
      </Modal>
    </EditorialLayout>
  );
}

export function LeaveDraftDialog({ open, onCancel, onDiscard }) {
  return (
    <Modal
      open={open}
      title="Unsaved changes"
      description="Your changes have not been saved. Stay here to keep editing, or discard them to leave."
      onClose={onCancel}
      className="admin-leave-dialog"
    >
      <div className="admin-leave-actions">
        <Button type="button" variant="outline" onClick={onDiscard}>
          Discard changes
        </Button>
        <Button type="button" onClick={onCancel}>
          Keep editing
        </Button>
      </div>
    </Modal>
  );
}
