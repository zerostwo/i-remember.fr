import { publicCardDocument } from "./public-card-document.js";
import "./memory-card.css";

// Public styles stay isolated from the admin theme. Drafts cannot run scripts.
export function MemoryCard({ memory }) {
  return (
    <iframe
      className="songqi-public-card-preview"
      title="Public memory card preview"
      sandbox="allow-same-origin"
      srcDoc={publicCardDocument(memory)}
    />
  );
}
