import { useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ChevronRight,
  Download,
  File,
  Film,
  Image,
  Images,
  Music2,
  Play,
  Search,
  Upload,
  X,
} from "lucide-react";
import { Button, Input } from "@i-remember/ui";
import {
  audioLimits,
  mediaAccept,
  videoLimits,
} from "../../../packages/config/src/media-limits.js";
import { groupLivePhotos } from "../../../packages/content/src/live-photo-upload.js";
import { appendV1Attachment } from "./v1-memory.js";
import { v1AssetIdentity, v1AssetPreviewUrls, v1LibraryAttachment } from "./v1-assets.js";
import { EditorialLayout } from "./EditorialLayout.jsx";
import { Modal } from "./WorkspaceDialog.jsx";
import "./media.css";

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
            <img
              className="admin-media-full-image"
              src={url}
              alt={assetName(asset)}
              onError={() => setError(true)}
            />
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
function useMediaPage(queryMedia, query, kind, revision) {
  const [result, setResult] = useState({
    assets: [],
    total: 0,
    cursor: null,
    loading: true,
    error: "",
  });
  const request = useRef(null),
    generation = useRef(0);
  const load = async (cursor, version) => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setResult((current) => ({ ...current, loading: true, error: "" }));
    try {
      const payload = await queryMedia(
        {
          q: query.trim(),
          ...(kind === "unused" ? { unused: "true" } : { kind }),
          ...(cursor ? { cursor } : {}),
        },
        controller.signal,
      );
      if (controller.signal.aborted || generation.current !== version) return;
      setResult((current) => ({
        assets: cursor ? [...current.assets, ...payload.data] : payload.data,
        total: payload.pagination.total,
        cursor: payload.pagination.nextCursor,
        loading: false,
        error: "",
      }));
    } catch (error) {
      if (!controller.signal.aborted && generation.current === version)
        setResult((current) => ({ ...current, loading: false, error: error.message }));
    }
  };
  useEffect(() => {
    const version = ++generation.current;
    setResult({ assets: [], total: 0, cursor: null, loading: true, error: "" });
    const timer = setTimeout(() => load(null, version), query.trim() ? 180 : 0);
    return () => {
      clearTimeout(timer);
      request.current?.abort();
      generation.current++;
    };
  }, [queryMedia, query, kind, revision]);
  return {
    ...result,
    more: () => load(result.cursor, generation.current),
  };
}
function MediaPagination({ library }) {
  return (
    <div className="admin-media-pagination">
      {library.loading ? <p role="status">Loading media…</p> : null}
      {library.error ? (
        <p role="alert">
          {library.error}{" "}
          <Button type="button" variant="ghost" onClick={library.more}>
            Retry
          </Button>
        </p>
      ) : null}
      {library.cursor && !library.error ? (
        <Button type="button" variant="outline" disabled={library.loading} onClick={library.more}>
          Load more media
        </Button>
      ) : null}
    </div>
  );
}
function useFileUpload({ onUpload, onFile, onBusy, onComplete }) {
  const controller = useRef(null);
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => () => controller.current?.abort(), []);

  async function start(fileList) {
    if (!fileList.length || controller.current) return;
    const abort = new AbortController();
    controller.current = abort;
    let completed = 0;
    let currentName = "";
    setError("");
    onBusy?.(true);
    try {
      const files = groupLivePhotos(fileList);
      for (const [index, file] of files.entries()) {
        abort.signal.throwIfAborted();
        currentName = file.name;
        const report = (value) =>
          setProgress({ ...value, name: file.name, index: index + 1, total: files.length });
        report({ phase: "uploading", percent: 0 });
        const asset = await onUpload(file, abort.signal, report);
        abort.signal.throwIfAborted();
        onFile?.(asset);
        completed++;
      }
      onComplete?.(completed);
    } catch (err) {
      const message =
        err.message === "rate_limited"
          ? "Too many uploads. Try again later."
          : err.message || "Upload failed.";
      const reason = abort.signal.aborted
        ? "Upload cancelled."
        : [currentName, message].filter(Boolean).join(" · ");
      setError(
        completed
          ? `${reason} ${completed} ${completed === 1 ? "file was" : "files were"} added before the upload stopped.`
          : reason,
      );
    } finally {
      controller.current = null;
      setProgress(null);
      onBusy?.(false);
    }
  }
  return { start, progress, error, cancel: () => controller.current?.abort() };
}

function UploadButton({ label, inputLabel, disabled, onFiles, variant }) {
  const input = useRef(null);
  return (
    <>
      <Button
        type="button"
        variant={variant}
        disabled={disabled}
        onClick={() => input.current?.click()}
      >
        <Upload size={16} />
        {label}
      </Button>
      <input
        hidden
        ref={input}
        type="file"
        multiple
        accept={mediaAccept}
        disabled={disabled}
        aria-label={inputLabel}
        onChange={(event) => {
          const files = Array.from(event.target.files || []);
          event.target.value = "";
          void onFiles(files);
        }}
      />
    </>
  );
}

function UploadFeedback({ upload }) {
  const { progress, cancel, error } = upload;
  const phase =
    progress?.phase === "uploading"
      ? "Uploading"
      : progress?.stage === "transcoding"
        ? "Converting"
        : progress?.stage === "finishing" || progress?.phase === "complete"
          ? "Finishing"
          : "Processing";
  return (
    <>
      {progress && (
        <div className="admin-upload-status">
          <span role="status">
            {phase}
            {progress.total > 1 && ` ${progress.index} of ${progress.total}`} · {progress.name}
            {progress.percent != null && ` · ${progress.percent}%`}
          </span>
          <progress aria-label="Upload progress" max="100" value={progress.percent ?? undefined} />
          <Button type="button" variant="ghost" onClick={cancel}>
            Cancel upload
          </Button>
        </div>
      )}
      {error && (
        <p role="alert" className="media-error">
          {error}
        </p>
      )}
    </>
  );
}

function UploadHelp() {
  return (
    <details className="admin-media-help">
      <summary>Formats and Live Photos</summary>
      <p>
        Photos support JPEG, PNG, WebP and GIF. Video supports up to{" "}
        {videoLimits.maxVideoBytes / 1048576} MB and {videoLimits.maxVideoSeconds / 60} minutes.
        Audio supports up to {audioLimits.maxAudioBytes / 1048576} MB and{" "}
        {audioLimits.maxAudioSeconds / 60} minutes. For Live Photos, choose the original photo and
        matching MOV together, or a .livp or .zip archive.
      </p>
    </details>
  );
}

function MediaDialog({
  asset,
  onClose,
  action,
  loadMedia,
  deleteMedia,
  editMemory,
  editPage,
  inPicker,
}) {
  const [detail, setDetail] = useState(null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!loadMedia || !asset.id) return;
    let active = true;
    setError("");
    loadMedia(asset.id)
      .then((result) => {
        if (active) setDetail(result);
      })
      .catch((err) => {
        if (active) setError(err.message);
      });
    return () => {
      active = false;
    };
  }, [asset.id, loadMedia, attempt]);

  async function remove() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await deleteMedia(asset.id);
      onClose();
    } catch (err) {
      setConfirmDelete(false);
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const usage = detail?.usage;
  return (
    <Modal
      open
      className={`admin-editorial editorial-media-dialog${inPicker ? " media-picker-preview" : ""}`}
      title={assetName(asset)}
      description={kindLabels[mediaKind(asset)]}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <div className="admin-media-stage">
        <MediaPlayer asset={asset} />
      </div>
      <div className="admin-media-detail">
        <div className="media-detail-actions">
          {action}
          <Button asChild variant="outline">
            <a href={v1AssetPreviewUrls(asset).download} download target="_blank" rel="noreferrer">
              <Download size={16} />
              {mediaKind(asset) === "live" ? "Download photo + MOV" : "Download file"}
            </a>
          </Button>
        </div>
        {loadMedia && !detail && !error && <p role="status">Checking file usage…</p>}
        {usage && (
          <section className="media-references">
            <h3>
              {usage.length
                ? `Used in ${usage.length} ${usage.length === 1 ? "place" : "places"}`
                : "Unused file"}
            </h3>
            {usage.map((item) => (
              <button
                type="button"
                className="media-owner-link"
                key={item.kind + item.id}
                onClick={() => {
                  onClose();
                  if (item.kind === "page") editPage(item.slug);
                  else editMemory(item.id);
                }}
              >
                <span>
                  {item.title || item.id}
                  <small>
                    {item.kind === "page" ? "Page" : "Memory"} ·{" "}
                    {{ NORMAL: "published", PENDING: "draft" }[item.status] ||
                      item.status.toLowerCase()}
                  </small>
                </span>
                <ChevronRight size={16} />
              </button>
            ))}
            {!usage.length && <p>Available in your library for any memory or page.</p>}
            {!usage.length &&
              detail.canDelete &&
              deleteMedia &&
              (confirmDelete ? (
                <div className="media-delete-confirm">
                  <p>Permanently delete this file and its stored versions?</p>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy}
                    onClick={() => setConfirmDelete(false)}
                  >
                    Cancel
                  </Button>
                  <Button type="button" variant="destructive" disabled={busy} onClick={remove}>
                    {busy ? "Deleting…" : "Delete file"}
                  </Button>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  className="media-delete"
                  onClick={() => setConfirmDelete(true)}
                >
                  Delete unused file
                </Button>
              ))}
          </section>
        )}
        {error && (
          <p className="media-error" role="alert">
            {error}{" "}
            {!detail && loadMedia && (
              <Button type="button" variant="ghost" onClick={() => setAttempt(attempt + 1)}>
                Retry
              </Button>
            )}
          </p>
        )}
      </div>
    </Modal>
  );
}

function LibraryBrowser({ assets, queryMedia, onSelect, attached = [] }) {
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("all");
  const library = useMediaPage(queryMedia, query, kind, assets);
  const hasFilters = Boolean(query || kind !== "all");
  const attachedIds = new Set(attached.map(v1AssetIdentity));
  return (
    <>
      <div className="admin-workspace-toolbar">
        <label className="admin-workspace-search">
          <Search size={17} />
          <Input
            type="search"
            aria-label="Search media"
            placeholder="Search files or titles…"
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
        {!library.loading && !library.error && (
          <span className="admin-workspace-count">
            {library.total} {library.total === 1 ? "file" : "files"}
          </span>
        )}
      </div>
      {!!library.assets.length && (
        <div className="admin-media-grid">
          {library.assets.map((asset) => {
            const attached = attachedIds.has(v1AssetIdentity(asset));
            return (
              <button
                type="button"
                className="admin-media-tile"
                key={asset.id || mediaUrl(asset)}
                disabled={attached}
                onClick={() => onSelect(asset)}
                aria-label={`${attached ? "Already attached" : "Preview"} ${assetName(asset)}`}
              >
                <MediaThumbnail asset={asset} />
                <span className="admin-media-filename">{assetName(asset)}</span>
                <span className="admin-media-caption">
                  {attached
                    ? "Already attached"
                    : asset.usageCount
                      ? `Used in ${asset.usageCount} ${asset.usageCount === 1 ? "place" : "places"}`
                      : "Unused"}
                </span>
              </button>
            );
          })}
        </div>
      )}
      {!library.loading && !library.error && !library.total && (
        <div className="admin-workspace-empty">
          <Images size={28} strokeWidth={1.5} />
          <h3>{hasFilters ? "No matching media" : "Your library is empty"}</h3>
          <p>
            {hasFilters
              ? "Try another search or media type."
              : "Upload a file from this library or an editor to use it again."}
          </p>
          {hasFilters && (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setQuery("");
                setKind("all");
              }}
            >
              Clear filters
            </Button>
          )}
        </div>
      )}
      <MediaPagination library={library} />
    </>
  );
}

export function MediaPicker({ assets, queryMedia, attached, onSelect, onClose, onUpload, onBusy }) {
  const [preview, setPreview] = useState(null);
  const forPage = Boolean(onUpload);
  const upload = useFileUpload({ onUpload, onFile: onSelect, onBusy, onComplete: onClose });
  const actionLabel = forPage ? "Insert into page" : "Attach to memory";
  return (
    <Modal
      open
      className="admin-editorial editorial-media-dialog"
      title={forPage ? "Insert media" : "Add from library"}
      description={
        forPage
          ? "Photos appear inline. Other media appears as a link."
          : "Preview a file, then attach it to this memory."
      }
      onClose={() => {
        if (!upload.progress) onClose();
      }}
    >
      <div className="admin-library-picker">
        {forPage && (
          <>
            <UploadButton
              label="Upload and insert"
              inputLabel="Upload page media"
              variant="outline"
              disabled={Boolean(upload.progress)}
              onFiles={upload.start}
            />
            <UploadFeedback upload={upload} />
            <UploadHelp />
          </>
        )}
        <LibraryBrowser
          assets={assets}
          queryMedia={queryMedia}
          attached={attached}
          onSelect={(asset) => {
            if (!upload.progress) setPreview(asset);
          }}
        />
      </div>
      {preview && (
        <MediaDialog
          inPicker
          asset={preview}
          onClose={() => setPreview(null)}
          action={
            <Button
              type="button"
              onClick={() => {
                onSelect(preview);
                onClose();
              }}
            >
              {actionLabel}
            </Button>
          }
        />
      )}
    </Modal>
  );
}

export function MediaLibrary({
  assets,
  queryMedia,
  onUpload,
  loadMedia,
  deleteMedia,
  scanMedia,
  editMemory,
  editPage,
  onUseInMemory,
  onUploadingChange,
}) {
  const [selected, setSelected] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState("");
  const [notice, setNotice] = useState("");
  const upload = useFileUpload({
    onUpload,
    onBusy: onUploadingChange,
    onComplete: (count) =>
      setNotice(`${count} ${count === 1 ? "file" : "files"} added to the library.`),
  });
  async function scan() {
    setScanning(true);
    setScanError("");
    try {
      await scanMedia();
    } catch (err) {
      setScanError(err.message);
    } finally {
      setScanning(false);
    }
  }
  return (
    <EditorialLayout
      section="Content"
      detail="Attachments"
      title="Attachments"
      description="Upload, preview and reuse files across your memories and pages."
      action={
        <UploadButton
          label="Upload media"
          inputLabel="Choose media files"
          disabled={scanning || Boolean(upload.progress)}
          onFiles={(files) => {
            setNotice("");
            return upload.start(files);
          }}
        />
      }
    >
      <section className="admin-media-workspace editorial-media-library">
        <UploadFeedback upload={upload} />
        {notice && (
          <p role="status" className="media-notice">
            {notice}
          </p>
        )}
        <LibraryBrowser {...{ assets, queryMedia }} onSelect={setSelected} />
        <div className="media-library-utilities">
          <UploadHelp />
          <Button
            type="button"
            variant="ghost"
            disabled={scanning || Boolean(upload.progress)}
            onClick={scan}
          >
            {scanning ? "Checking storage…" : "Find stored files"}
          </Button>
        </div>
        {scanError && (
          <p role="alert" className="media-error">
            {scanError}
          </p>
        )}
        {selected && (
          <MediaDialog
            asset={selected}
            onClose={() => setSelected(null)}
            {...{ loadMedia, deleteMedia, editMemory, editPage }}
            action={
              onUseInMemory && (
                <Button
                  type="button"
                  disabled={Boolean(upload.progress)}
                  onClick={() => {
                    setSelected(null);
                    onUseInMemory(v1LibraryAttachment(selected));
                  }}
                >
                  Use in new memory
                </Button>
              )
            }
          />
        )}
      </section>
    </EditorialLayout>
  );
}

export function EditorAttachments({
  attachments,
  assets,
  queryMedia,
  onUpload,
  onChange,
  onBusy,
  disabled,
}) {
  const [preview, setPreview] = useState(null);
  const [picking, setPicking] = useState(false);
  const latest = useRef(attachments);
  latest.current = attachments;

  function attach(asset) {
    const next = appendV1Attachment(latest.current, asset);
    latest.current = next;
    onChange(next);
  }
  const upload = useFileUpload({ onUpload, onBusy, onFile: attach });
  const locked = disabled || Boolean(upload.progress);
  function arrange(next) {
    onChange(next.map((item, order) => ({ ...item, metadata: { ...item.metadata, order } })));
  }
  function move(index, offset) {
    const next = [...attachments];
    const [asset] = next.splice(index, 1);
    next.splice(index + offset, 0, asset);
    arrange(next);
  }

  return (
    <section className="admin-editor-media editorial-attachments" aria-label="Memory attachments">
      <div className="media-editor-heading">
        <h2>Attachments</h2>
        <div className="media-editor-actions">
          <UploadButton
            label="Upload files"
            inputLabel="Upload attachments"
            variant="outline"
            disabled={locked}
            onFiles={upload.start}
          />
          <Button
            type="button"
            variant="outline"
            disabled={locked}
            onClick={() => setPicking(true)}
          >
            <Images size={16} />
            From library
          </Button>
        </div>
      </div>
      <UploadFeedback upload={upload} />
      {attachments.length > 0 && (
        <ol className="media-attached-list">
          {attachments.map((asset, index) => (
            <li key={asset.id || mediaUrl(asset)}>
              <button
                className="media-attached-preview"
                type="button"
                onClick={() => setPreview(asset)}
                aria-label={`Preview ${assetName(asset)}`}
              >
                <MediaThumbnail asset={asset} />
                <span>
                  <strong>{assetName(asset)}</strong>
                  <small>
                    {index === 0 && "Cover · "}
                    {kindLabels[mediaKind(asset)]}
                  </small>
                </span>
              </button>
              <div className="media-order-actions">
                <Button
                  type="button"
                  variant="ghost"
                  title="Move earlier"
                  aria-label={`Move attachment ${index + 1} earlier`}
                  disabled={locked || index === 0}
                  onClick={() => move(index, -1)}
                >
                  <ArrowUp size={16} />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  title="Move later"
                  aria-label={`Move attachment ${index + 1} later`}
                  disabled={locked || index === attachments.length - 1}
                  onClick={() => move(index, 1)}
                >
                  <ArrowDown size={16} />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  title="Remove from memory"
                  aria-label={`Remove attachment ${index + 1}`}
                  disabled={locked}
                  onClick={() => arrange(attachments.filter((_, order) => index !== order))}
                >
                  <X size={16} />
                </Button>
              </div>
            </li>
          ))}
        </ol>
      )}
      <p className="admin-field-help">
        {attachments.length
          ? "Removing a file here keeps it in the library."
          : "The first attachment becomes the memory cover."}
      </p>
      <UploadHelp />
      {preview && <MediaDialog asset={preview} onClose={() => setPreview(null)} />}
      {picking && (
        <MediaPicker
          {...{ assets, queryMedia }}
          attached={attachments}
          onClose={() => setPicking(false)}
          onSelect={(asset) => attach(v1LibraryAttachment(asset))}
        />
      )}
    </section>
  );
}
