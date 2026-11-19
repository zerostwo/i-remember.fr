import { useRef } from "react";
import { Dialog } from "radix-ui";
import { X } from "lucide-react";
import { Button } from "@i-remember/ui";

export function Modal({ title, description, children, open, onClose, className = "" }) {
  const previousFocus = useRef(null);
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(value) => {
        if (!value) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="admin-workspace-scrim" />
        <Dialog.Content
          onOpenAutoFocus={() => {
            previousFocus.current = document.activeElement;
          }}
          onCloseAutoFocus={(event) => {
            const opener = previousFocus.current;
            if (opener?.isConnected && opener !== document.body) {
              event.preventDefault();
              opener.focus({ preventScroll: true });
            }
          }}
          className={`i-remember-admin dark admin-workspace-dialog ${className}`}
        >
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
