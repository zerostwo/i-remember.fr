import { randomUuid } from "./random-id.js";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { ExternalLink } from "lucide-react";
import { Button, Input } from "@i-remember/ui";
import { MemoryCard } from "../../../packages/content/src/MemoryCard.jsx";
import { EditorialLayout } from "./EditorialLayout.jsx";
import { EditorAttachments } from "./MediaWorkspace.jsx";
import { Modal } from "./WorkspaceDialog.jsx";
import { WritingField } from "./workspace.jsx";
import "./memory-editor.css";

const statuses = {
  published: "Published",
  pending: "Draft",
  archived: "Archived",
  rejected: "Rejected",
};
const visibilityDescriptions = {
  PUBLIC: "Visible in the galaxy and search.",
  UNLISTED: "Anyone with the link can read it. Hidden from the galaxy and search.",
  PRIVATE: "Only you can read it in admin.",
};
const transitions = {
  published: "Publish memory",
  pending: "Move to draft",
  archived: "Archive memory",
};

export function MemoryEditor({
  memory,
  siteSettings,
  initialAttachment,
  saveMemory,
  savingMemory,
  reportDirty,
  onUploadingChange,
  assets,
  queryMedia,
  uploadEditorFile,
  navigationPending,
  navigate,
  editMemory,
}) {
  const [record, setRecord] = useState(memory);
  const [draftKey] = useState(() => (memory ? undefined : randomUuid()));
  const [draft, setDraft] = useState(() => ({
    title: memory?.title || "",
    bodyMarkdown: memory?.bodyMarkdown || "",
    author: memory?.author ?? (siteSettings.ownerName || "Songqi Duan"),
    locationName: memory?.locationName || "",
    visibility: memory?.visibility || "PUBLIC",
    attachments: memory?.attachments || (initialAttachment ? [initialAttachment] : []),
  }));
  const [baseline, setBaseline] = useState(!memory && initialAttachment ? null : draft);
  const [error, setError] = useState(null);
  const [validationMessage, setValidationMessage] = useState("");
  const [intent, setIntent] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [cardOpen, setCardOpen] = useState(false);
  const [savedMessage, setSavedMessage] = useState("");
  const editing = useRef(draft);
  const inFlight = useRef(false);
  const startedWithAttachment = useRef(!memory && Boolean(initialAttachment));
  const status = record?.status || "pending";
  const dirty = draft !== baseline;
  const publicId = draft.linkId ?? record?.publicId ?? "";
  const idValid =
    publicId === (record?.publicId || "") || /^[A-Za-z][A-Za-z0-9-]{3,31}$/.test(publicId);
  const hasText = Boolean(draft.title.trim() || draft.bodyMarkdown.trim());
  useEffect(() => {
    if (startedWithAttachment.current) reportDirty(true);
    if (new URLSearchParams(window.location.search).get("section") === "settings") {
      document.getElementById("memory-publishing")?.scrollIntoView({ block: "start" });
    }
    return () => onUploadingChange(false);
  }, [reportDirty, onUploadingChange]);

  function update(fields) {
    const next = { ...editing.current, ...fields };
    editing.current = next;
    setDraft(next);
    setError((current) => (current?.code === "memory_changed" ? current : null));
    setValidationMessage("");
    reportDirty(true);
  }

  function validate(nextStatus) {
    let message = "";
    if (!idValid)
      message =
        "In Advanced, enter a public ID of 4–32 letters, numbers or hyphens, starting with a letter.";
    else if (!hasText || (nextStatus === "published" && !draft.title.trim()))
      message = "Enter a title for this memory.";
    else if (nextStatus === "published" && !draft.bodyMarkdown.trim())
      message = "Write some content before publishing this memory.";
    setValidationMessage(message);
    return !message;
  }

  async function persist(nextStatus, automatic = false) {
    if (inFlight.current || uploading || (!automatic && !validate(nextStatus))) return;
    const snapshot = editing.current;
    inFlight.current = true;
    setError(null);
    try {
      const saved = await saveMemory(record, {
        ...snapshot,
        draftKey,
        status: nextStatus,
        metadata: record?.metadata,
        source: record?.source,
        attachmentsDirty: snapshot.attachments !== baseline?.attachments,
      });
      // Use the relation IDs assigned by the server on subsequent gallery edits.
      const canonical = { ...snapshot, attachments: saved.attachments };
      const current = editing.current;
      const next =
        current === snapshot
          ? canonical
          : {
              ...current,
              attachments:
                current.attachments === snapshot.attachments
                  ? saved.attachments
                  : current.attachments,
            };
      editing.current = next;
      setRecord(saved);
      setBaseline(canonical);
      setDraft(next);
      setSavedMessage(nextStatus === status && nextStatus !== "pending" ? "Changes saved" : "");
      reportDirty(next !== canonical);
    } catch (cause) {
      setError({
        message: cause.message,
        code: cause.code,
        recordId: cause.recordId,
        attemptedStatus: nextStatus,
      });
    } finally {
      inFlight.current = false;
    }
  }

  const autosave = useEffectEvent(() => persist("pending", true));
  useEffect(() => {
    if (
      status !== "pending" ||
      !dirty ||
      !hasText ||
      !idValid ||
      savingMemory ||
      uploading ||
      intent ||
      navigationPending ||
      error
    )
      return;
    const timer = setTimeout(autosave, 900);
    return () => clearTimeout(timer);
  }, [
    draft,
    status,
    dirty,
    hasText,
    idValid,
    savingMemory,
    uploading,
    intent,
    navigationPending,
    error,
  ]);

  function requestTransition(nextStatus) {
    if (!inFlight.current && !uploading && validate(nextStatus)) setIntent(nextStatus);
  }
  const busy = uploading || savingMemory;
  const publish = status === "pending";
  const statusText = uploading
    ? "Uploading…"
    : savingMemory
      ? "Saving…"
      : error || validationMessage
        ? "Needs attention"
        : dirty
          ? "Edited"
          : !record
            ? "New draft"
            : publish
              ? "Draft saved"
              : savedMessage || statuses[status];

  return (
    <EditorialLayout
      section="Memories"
      detail={draft.title.trim() || "New memory"}
      onBack={() => navigate("memory")}
      title={record ? "Edit memory" : "New memory"}
      description="Write a memory and choose who can read it."
      status={statusText}
      action={
        <Button type="submit" form="memory-editor-form" disabled={busy || (!publish && !dirty)}>
          {publish ? "Publish…" : "Save changes"}
        </Button>
      }
    >
      {(error || validationMessage) && (
        <div className="editorial-error" role="alert">
          {error?.message || validationMessage}
          {error?.code === "memory_changed" ? (
            <button type="button" onClick={() => editMemory(error.recordId || record.id)}>
              Reopen saved memory…
            </button>
          ) : (
            error?.attemptedStatus === "pending" &&
            publish &&
            dirty &&
            hasText &&
            idValid && (
              <button type="button" onClick={() => persist("pending")}>
                Retry draft save
              </button>
            )
          )}
        </div>
      )}
      <form
        id="memory-editor-form"
        className="editorial-page memory-editor"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          if (publish) requestTransition("published");
          else if (dirty) void persist(status);
        }}
      >
        <section className="editorial-document">
          <WritingField
            label="Memory content"
            value={draft.bodyMarkdown}
            previewTitle={draft.title}
            onChange={(bodyMarkdown) => update({ bodyMarkdown })}
            titleField={
              <input
                className="editorial-title"
                aria-label="Title"
                placeholder="Memory title"
                value={draft.title}
                maxLength={180}
                onChange={(event) => update({ title: event.target.value })}
              />
            }
          />
          <EditorAttachments
            attachments={draft.attachments}
            assets={assets}
            queryMedia={queryMedia}
            onUpload={uploadEditorFile}
            disabled={savingMemory}
            onChange={(attachments) => update({ attachments })}
            onBusy={(value) => {
              setUploading(value);
              onUploadingChange(value);
            }}
          />
          <details
            className="editorial-advanced memory-card-preview"
            onToggle={(event) => setCardOpen(event.currentTarget.open)}
          >
            <summary>Card preview</summary>
            {cardOpen && <MemoryCard memory={{ ...record, ...draft }} settings={siteSettings} />}
          </details>
        </section>
        <aside className="editorial-inspector" id="memory-publishing">
          <h2>Publishing</h2>
          <div className="inspector-row">
            Status <span>{statuses[status]}</span>
          </div>
          <label className="inspector-row">
            Visibility
            <select
              aria-label="Visibility"
              value={draft.visibility}
              onChange={(event) => update({ visibility: event.target.value })}
            >
              <option value="PUBLIC">Public</option>
              <option value="UNLISTED">Unlisted</option>
              <option value="PRIVATE">Private</option>
            </select>
          </label>
          <p>
            {status === "pending" && !hasText && dirty
              ? "Add a title or write some text to save this draft."
              : status === "pending"
                ? "Drafts save automatically and stay private until you publish."
                : status === "published"
                  ? visibilityDescriptions[draft.visibility]
                  : "Hidden from visitors."}
          </p>
          <details className="editorial-advanced">
            <summary>Advanced</summary>
            <label className="admin-workspace-field">
              Author display name
              <Input
                value={draft.author}
                maxLength={120}
                onChange={(event) => update({ author: event.target.value })}
              />
            </label>
            <label className="admin-workspace-field">
              Public ID
              <Input
                value={publicId}
                autoCapitalize="none"
                spellCheck={false}
                maxLength={32}
                placeholder="Generated automatically"
                onChange={(event) => update({ linkId: event.target.value })}
              />
            </label>
            <p className="admin-field-help">Old links keep working after a change.</p>
            <label className="admin-workspace-field">
              Location
              <Input
                value={draft.locationName}
                maxLength={160}
                onChange={(event) => update({ locationName: event.target.value })}
              />
            </label>
            {record && (
              <div className="editorial-lifecycle">
                {status !== "pending" && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => requestTransition("pending")}
                  >
                    {status === "published" ? "Move to draft…" : "Restore draft…"}
                  </button>
                )}
                {status !== "published" && status !== "pending" && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => requestTransition("published")}
                  >
                    Publish…
                  </button>
                )}
                {status !== "archived" && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => requestTransition("archived")}
                  >
                    Archive memory…
                  </button>
                )}
              </div>
            )}
          </details>
          {status === "published" && record.visibility !== "PRIVATE" && (
            <a
              className="editorial-public-link"
              href={record.publicUrl}
              target="_blank"
              rel="noreferrer"
            >
              Open on site <ExternalLink size={14} />
            </a>
          )}
        </aside>
      </form>
      <Modal
        className="editorial-confirm-dialog"
        open={Boolean(intent)}
        onClose={() => setIntent(null)}
        title={transitions[intent] || ""}
        description={
          intent === "published"
            ? visibilityDescriptions[draft.visibility]
            : intent === "archived"
              ? "Save your changes and archive this memory. You can restore it from the editor."
              : "Save your changes as a private draft."
        }
      >
        <div className="editorial-confirm">
          <Button type="button" variant="outline" onClick={() => setIntent(null)}>
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
            {transitions[intent]}
          </Button>
        </div>
      </Modal>
    </EditorialLayout>
  );
}
