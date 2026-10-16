import { X } from "lucide-react";
export function OverlayClose({ onClose, className = "", autoFocus = false }: { onClose: () => void; className?: string; autoFocus?: boolean }) {
  return <button autoFocus={autoFocus} type="button" className={`page-close ${className}`} aria-label="Close page and view city"
    title="Close page and view city" onClick={onClose}><X size={20} /></button>;
}
