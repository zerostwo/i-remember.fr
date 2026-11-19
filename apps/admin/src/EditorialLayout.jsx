import { createContext, useContext } from "react";
import { createPortal } from "react-dom";
import { ChevronRight } from "lucide-react";

export const ToolbarTarget = createContext(null);

export function EditorialLayout({
  section,
  detail,
  onBack,
  title,
  description,
  status,
  action,
  children,
}) {
  const target = useContext(ToolbarTarget);
  return (
    <>
      {target &&
        createPortal(
          <>
            <div className="editorial-crumb">
              {onBack ? (
                <button type="button" onClick={onBack}>
                  {section}
                </button>
              ) : (
                <span>{section}</span>
              )}
              <ChevronRight size={14} aria-hidden="true" />
              <strong>{detail}</strong>
            </div>
            <div className="editorial-actions">
              <span role="status" className="editorial-status">
                {status}
              </span>
              {action}
            </div>
          </>,
          target,
        )}
      <header className="editorial-heading">
        <h1>{title}</h1>
        <p>{description}</p>
      </header>
      {children}
    </>
  );
}
