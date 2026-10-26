import { useEffect, useId, useRef, useState } from "react";
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
  const url = mediaUrl(asset);
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
            src={asset.metadata.videoUrl}
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
function MediaDialog({ asset, onClose, memories = [], onDetach, editMemory }) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const usedBy = memories.filter((memory) =>
    (memory.attachments || []).some((item) => item.url === mediaUrl(asset)),
  );
  return (
    <Modal
      open
      title={assetName(asset)}
      description={`${kindLabels[mediaKind(asset)]} · ${asset.type || asset.mimeType || "File"}`}
      onClose={onClose}
    >
      <div className="admin-media-stage">
        <MediaPlayer asset={asset} />
      </div>
      <div className="admin-media-detail">
        <Button asChild variant="outline">
          <a
            href={asset.metadata?.livePhoto ? asset.metadata.downloadUrl : mediaUrl(asset)}
            download
            target="_blank"
            rel="noreferrer"
          >
            <Download size={16} />
            {asset.metadata?.livePhoto ? "Download photo + MOV" : "Download file"}
          </a>
        </Button>
        {usedBy.length ? (
          <section>
            <h3>
              Used in {usedBy.length} {usedBy.length === 1 ? "memory" : "memories"}
            </h3>
            {usedBy.map((memory) => (
              <div className="admin-media-usage" key={memory.id}>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    editMemory?.(memory.id);
                  }}
                  disabled={!editMemory}
                >
                  {memory.title || memory.excerpt}
                </button>
                {onDetach ? (
                  <Button
                    disabled={busy}
                    variant="ghost"
                    type="button"
                    onClick={async () => {
                      if (
                        !window.confirm(
                          `Remove this attachment from “${memory.title || "this memory"}”? Other memories keep their copy.`,
                        )
                      )
                        return;
                      setBusy(true);
                      setError("");
                      try {
                        if (await onDetach(asset, memory.id)) onClose();
                        else setError("Could not remove this attachment. Try again.");
                      } catch (err) {
                        setError(err.message);
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    Remove from memory
                  </Button>
                ) : null}
              </div>
            ))}
          </section>
        ) : null}
        {error ? <p role="alert">{error}</p> : null}
      </div>
    </Modal>
  );
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
              : asset.memoryIds?.length
                ? `Used in ${asset.memoryIds.length} ${asset.memoryIds.length === 1 ? "memory" : "memories"}`
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
          placeholder="Search media or memory…"
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
      </select>
      <span className="admin-workspace-count">{count} items</span>
    </div>
  );
}
function filterAssets(assets, memories, query, kind) {
  const needle = query.trim().toLocaleLowerCase();
  return assets.filter(
    (asset) =>
      (kind === "all" || mediaKind(asset) === kind) &&
      [
        assetName(asset),
        asset.imageKey,
        ...(memories || [])
          .filter((memory) => memory.attachments?.some((item) => item.url === mediaUrl(asset)))
          .map((memory) => memory.title),
      ]
        .join(" ")
        .toLocaleLowerCase()
        .includes(needle),
  );
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
export function MediaLibrary({ assets = [], memories = [], onUpload, onDetach, editMemory }) {
  const [query, setQuery] = useState(""),
    [kind, setKind] = useState("all"),
    [selected, setSelected] = useState(null),
    [uploadOpen, setUploadOpen] = useState(false);
  const [memoryId, setMemoryId] = useState(""),
    [busy, setBusy] = useState(false),
    [progress, setProgress] = useState(null),
    [error, setError] = useState("");
  const controller = useRef(null);
  useEffect(() => () => controller.current?.abort(), []);
  const filtered = filterAssets(assets, memories, query, kind);
  return (
    <div className="admin-media-workspace">
      <div className="admin-section-heading">
        <div>
          <h2>Media library</h2>
          <p>Preview files, find their memories, and reuse them while writing.</p>
        </div>
        <Button onClick={() => setUploadOpen(true)}>
          <Upload size={16} />
          Upload media
        </Button>
      </div>
      <LibraryFilter {...{ query, setQuery, kind, setKind }} count={filtered.length} />
      {filtered.length ? (
        <MediaGrid assets={filtered} onSelect={setSelected} />
      ) : (
        <div className="admin-workspace-empty">
          <Image size={32} />
          <h3>{assets.length ? "No matching media" : "Your media library is empty"}</h3>
          <p>
            {assets.length
              ? "Try another search or media type."
              : "Upload to a memory, or add media while writing one."}
          </p>
          {assets.length ? (
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
      )}
      {selected ? (
        <MediaDialog
          key={mediaUrl(selected)}
          asset={selected}
          onClose={() => setSelected(null)}
          {...{ memories, onDetach, editMemory }}
        />
      ) : null}
      <Modal
        open={uploadOpen}
        title="Upload media"
        description="Choose the memory these files belong to."
        onClose={() => {
          if (!busy) setUploadOpen(false);
        }}
      >
        <div className="admin-upload-dialog-body">
          <label className="admin-workspace-field">
            Memory
            <select
              aria-label="Memory"
              value={memoryId}
              onChange={(event) => setMemoryId(event.target.value)}
              disabled={busy}
            >
              <option value="">Choose a memory…</option>
              {memories.map((memory) => (
                <option key={memory.id} value={memory.id}>
                  {memory.title || memory.excerpt}
                </option>
              ))}
            </select>
          </label>
          {!memories.length ? (
            <p>Create a memory first, then add its media in the editor.</p>
          ) : null}
          <label className="admin-upload-dropzone">
            <Upload size={26} />
            <strong>Choose photos, audio or video</strong>
            <span>Live Photos: select both the photo and matching MOV.</span>
            <input
              aria-label="Choose media files"
              type="file"
              accept={mediaAccept}
              multiple
              disabled={!memoryId || busy}
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
                  await onUpload(files, memoryId, abort.signal, setProgress);
                  if (!abort.signal.aborted) setUploadOpen(false);
                } catch (err) {
                  setError(
                    abort.signal.aborted
                      ? "Upload cancelled. Completed files remain attached."
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
            count={filterAssets(assets, [], query, kind).length}
          />
          <MediaGrid
            assets={filterAssets(assets, [], query, kind)}
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
          {!assets.length ? (
            <p className="admin-workspace-empty">
              No saved media yet. Upload a file to this memory.
            </p>
          ) : null}
        </div>
      </Modal>
    </section>
  );
}
export function WritingField({ label, value = "", onChange, assets }) {
  const [mediaOpen, setMediaOpen] = useState(false);
  const [preview, setPreview] = useState(false),
    textarea = useRef(null),
    id = useId();
  const tools = [
    [Bold, "Bold", "**", "**", "bold text"],
    [Italic, "Italic", "_", "_", "italic text"],
    [Heading2, "Heading", "\n## ", "", "Heading"],
    [Link, "Link", "[", "](https://)", "link text"],
    [List, "List", "\n- ", "", "List item"],
  ];
  const insert = (before, after, fallback) => {
    const field = textarea.current;
    if (!field) return;
    const start = field.selectionStart,
      end = field.selectionEnd,
      text = value.slice(start, end) || fallback;
    onChange(value.slice(0, start) + before + text + after + value.slice(end));
    requestAnimationFrame(() => {
      field.focus();
      field.setSelectionRange(start + before.length, start + before.length + text.length);
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
          <textarea
            ref={textarea}
            id={id}
            className="admin-writing-input"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            placeholder="Start writing…"
            rows={18}
          />
        </>
      ) : (
        <div className="markdown-preview admin-writing-preview" aria-label={`${label} preview`}>
          {value.trim() ? (
            <div dangerouslySetInnerHTML={{ __html: markdownToHtml(value) }} />
          ) : (
            <p>Your writing preview will appear here.</p>
          )}
        </div>
      )}
      <div className="admin-writing-footer">
        {value.length.toLocaleString()} characters · Full content is preserved
      </div>
      <Modal
        open={mediaOpen}
        title="Insert media"
        description="Photos appear inline. Other files are inserted as links."
        onClose={() => setMediaOpen(false)}
      >
        <div className="admin-library-picker">
          <MediaGrid
            assets={assets || []}
            selectLabel="Insert"
            onSelect={(asset) => {
              const image = ["image", "live"].includes(mediaKind(asset));
              insert(
                image ? "\n![" : "\n[",
                `](<${mediaUrl(asset)}>)\n`,
                assetName(asset).replace(/[\[\]]/g, ""),
              );
              setMediaOpen(false);
            }}
          />
          {!assets?.length ? (
            <p>No saved media. Add files to a memory to make them available here.</p>
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
function PageEditorWorkspace({
  data,
  selectedPageSlug,
  savePage,
  savingPage,
  reportDirty,
  navigate,
}) {
  const page = data.pages?.find((item) => item.slug === selectedPageSlug);
  const [draft, setDraft] = useState(() =>
    page
      ? { ...page }
      : {
          title: "",
          slug: "",
          bodyMarkdown: "",
          excerpt: "",
          status: "DRAFT",
          language: data.settings.defaultLanguage,
          metadata: {},
        },
  );
  const slugTouched = useRef(Boolean(page));
  const [error, setError] = useState("");
  useEffect(() => {
    if (page) {
      setDraft({ ...page });
      slugTouched.current = true;
    }
  }, [page]);
  const update = (key, value) => {
    reportDirty(true);
    setDraft((current) => ({ ...current, [key]: value }));
  };
  if (selectedPageSlug && !page)
    return (
      <div className="admin-workspace-empty">
        <h2>Page not found</h2>
        <Button onClick={() => navigate("pages")}>Back to pages</Button>
      </div>
    );
  const linked = data.memories?.find((item) => item.id === page?.linkedMemoryId);
  const publishedUrl =
    linked?.publicUrl ||
    (page?.linkedMemoryId ? `/memory/${encodeURIComponent(page.linkedMemoryId)}` : "");
  return (
    <div>
      <Button className="admin-back-link" variant="ghost" onClick={() => navigate("pages")}>
        <ArrowLeft size={16} />
        All pages
      </Button>
      <form
        id="page-editor-form"
        className="admin-editor-grid admin-page-editor"
        onSubmit={async (event) => {
          event.preventDefault();
          if (savingPage) return;
          setError("");
          if (draft.status === "PUBLISHED" && !draft.bodyMarkdown.trim()) {
            setError("Write some content before publishing this page.");
            return;
          }
          await savePage(page?.slug, draft);
        }}
      >
        <Card>
          <CardHeader>
            <CardTitle>Page content</CardTitle>
            <CardDescription>Write an article for your public navigation.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-5" inert={savingPage}>
            <FieldInput
              label="Title"
              required
              maxLength={180}
              placeholder="Give this page a title"
              value={draft.title}
              onChange={(event) => {
                const title = event.target.value;
                reportDirty(true);
                setDraft((current) => ({
                  ...current,
                  title,
                  ...(!slugTouched.current
                    ? {
                        slug: title
                          .toLowerCase()
                          .normalize("NFKD")
                          .replace(/[^a-z0-9\s-]/g, "")
                          .trim()
                          .replace(/[\s-]+/g, "-")
                          .slice(0, 120),
                      }
                    : {}),
                }));
              }}
            />
            <WritingField
              assets={data.attachments}
              label="Page content"
              value={draft.bodyMarkdown}
              onChange={(value) => update("bodyMarkdown", value)}
            />
            <details className="admin-secondary-fields">
              <summary>Summary</summary>
              <label className="admin-workspace-field">
                Short description
                <textarea
                  rows={3}
                  maxLength={600}
                  value={draft.excerpt || ""}
                  onChange={(event) => update("excerpt", event.target.value)}
                />
              </label>
              <p>Optional. Used in page lists and navigation.</p>
            </details>
          </CardContent>
        </Card>
        <aside className="admin-editor-rail">
          <Card>
            <CardHeader>
              <CardTitle>Publishing</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-5" inert={savingPage}>
              <label className="admin-workspace-field">
                Status
                <select
                  aria-label="Status"
                  value={draft.status}
                  onChange={(event) => update("status", event.target.value)}
                >
                  <option value="DRAFT">Draft</option>
                  <option value="PUBLISHED">Published</option>
                  <option value="ARCHIVED">Archived</option>
                </select>
              </label>
              <p className="admin-field-help">
                {draft.status === "PUBLISHED"
                  ? "Visible on the site after you save."
                  : draft.status === "ARCHIVED"
                    ? "Hidden from the public site. Select Draft or Published to restore it."
                    : "Only you can see this draft."}
              </p>
              <FieldInput
                label="Navigation key"
                required
                pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
                title="Lowercase letters, numbers and single hyphens"
                placeholder="about"
                value={draft.slug}
                onChange={(event) => {
                  slugTouched.current = true;
                  update("slug", event.target.value);
                }}
              />
              <p className="admin-field-help">
                Used to identify this page in Navigation. Existing menu links follow a key change.
              </p>
              <Button type="submit" disabled={savingPage}>
                {savingPage ? "Saving…" : "Save page"}
              </Button>
              {error ? <p role="alert">{error}</p> : null}
              {publishedUrl && page?.status === "PUBLISHED" ? (
                <Button asChild variant="outline">
                  <a href={publishedUrl} target="_blank" rel="noreferrer">
                    Open published page
                    <ExternalLink size={15} />
                  </a>
                </Button>
              ) : null}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Public navigation</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="admin-field-help">
                After publishing, add a Page item in Navigation to place this article in the site
                footer.
              </p>
              <Button type="button" variant="ghost" onClick={() => navigate("menus")}>
                Manage navigation
                <ArrowRight size={15} />
              </Button>
            </CardContent>
          </Card>
        </aside>
      </form>
    </div>
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
