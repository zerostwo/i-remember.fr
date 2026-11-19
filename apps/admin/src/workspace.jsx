import { randomUuid } from "./random-id.js";
import { useEffect, useEffectEvent, useId, useRef, useState } from "react";
import {
  ArrowRight,
  File,
  Image,
  Search,
  Eye,
  Pencil,
  Bold,
  Italic,
  Heading2,
  Link,
  List,
  ExternalLink,
} from "lucide-react";
import { Button, Input } from "@i-remember/ui";
import { markdownToHtml } from "../../../packages/content/src/markdown.js";
import { EditorialLayout } from "./EditorialLayout.jsx";
import { assetName, mediaKind, MediaPicker } from "./MediaWorkspace.jsx";
import { v1AssetPreviewUrls } from "./v1-assets.js";
import { Modal } from "./WorkspaceDialog.jsx";
export { MediaLibrary, EditorAttachments, assetName, mediaKind } from "./MediaWorkspace.jsx";

export function WritingField({
  titleField,
  previewTitle,
  label,
  value = "",
  onChange,
  assets,
  queryMedia,
  onUpload,
  onBusy = () => {},
}) {
  const [mediaOpen, setMediaOpen] = useState(false);
  const insertionRange = useRef(null);
  const valueRef = useRef(value);
  valueRef.current = value;
  const [preview, setPreview] = useState(false),
    textarea = useRef(null),
    id = useId();
  useEffect(() => {
    if (!textarea.current) return;
    textarea.current.style.height = "auto";
    textarea.current.style.height =
      Math.min(420, Math.max(180, textarea.current.scrollHeight)) + "px";
  }, [value, preview]);
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
      text = valueRef.current.slice(start, end) || fallback;
    valueRef.current =
      valueRef.current.slice(0, start) + before + text + after + valueRef.current.slice(end);
    onChange(valueRef.current);
    requestAnimationFrame(() => {
      field.focus();
      const position = start + before.length + text.length;
      field.setSelectionRange(start + before.length, position);
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
                onClick={() => {
                  const field = textarea.current;
                  insertionRange.current = [field.selectionStart, field.selectionEnd];
                  setMediaOpen(true);
                }}
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
          {titleField && (
            <h2 className="editorial-preview-title">{previewTitle || "Page title"}</h2>
          )}
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
      {mediaOpen && (
        <MediaPicker
          {...{ assets, queryMedia, onUpload, onBusy }}
          onClose={() => setMediaOpen(false)}
          onSelect={(asset) => {
            const [start, end] = insertionRange.current;
            const text = valueRef.current;
            const caption = (text.slice(start, end) || assetName(asset)).replace(/[\[\]\r\n]/g, "");
            const image = ["image", "live"].includes(mediaKind(asset));
            const insertion = `\n${image ? "!" : ""}[${caption}](<${v1AssetPreviewUrls(asset).preview}>)\n`;
            valueRef.current = text.slice(0, start) + insertion + text.slice(end);
            const cursor = start + insertion.length;
            insertionRange.current = [cursor, cursor];
            onChange(valueRef.current);
            requestAnimationFrame(() => textarea.current?.setSelectionRange(cursor, cursor));
          }}
        />
      )}
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
                        ? editing.current.slug || `page-${randomUuid().slice(0, 8)}`
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
