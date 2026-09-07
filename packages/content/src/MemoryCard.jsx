import { memoryPreview } from "./markdown.js";
import "./memory-card.css";

export function MemoryCard({
  memory,
  language = "en",
  timezone = "UTC",
  onOpen,
  readMore = "Read more",
  untitled = "Untitled memory",
}) {
  const preview = memoryPreview(memory);
  const image = memory.attachments?.find((item) => item.type?.startsWith("image/"));
  const date = memory.createdAt ? new Date(memory.createdAt) : null;
  return (
    <article className="songqi-memory-card">
      {image ? <img className="songqi-card-image" src={image.url} alt="" loading="lazy" /> : null}
      <div className="songqi-card-copy">
        {date && Number.isFinite(date.getTime()) ? (
          <time dateTime={date.toISOString()}>
            {new Intl.DateTimeFormat(language, { dateStyle: "medium", timeZone: timezone }).format(
              date,
            )}
          </time>
        ) : null}
        <h2>
          {onOpen ? (
            <button type="button" onClick={() => onOpen(memory)}>
              {preview.title || untitled}
            </button>
          ) : (
            preview.title || untitled
          )}
        </h2>
        <p>
          {preview.text}
          {preview.truncated ? "…" : ""}
        </p>
        <footer>
          <span>{memory.author ?? memory.authorName}</span>
          {preview.longForm && onOpen ? (
            <button type="button" onClick={() => onOpen(memory)}>
              {readMore} <span aria-hidden="true">↗</span>
            </button>
          ) : null}
        </footer>
      </div>
    </article>
  );
}
