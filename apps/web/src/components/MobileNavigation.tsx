import { useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { ArrowUpRight, ChevronRight, Info, X, type LucideIcon } from "lucide-react";
import { ProjectLinks } from "./ProjectLinks";
import { routeUrl, type Page } from "../navigation/routes";

interface Props {
  items: readonly { id: Page; label: string; icon: LucideIcon }[];
  active: Page | null;
  modeLabel: string;
  onNavigate: (page: Page) => boolean;
  onClose: () => void;
}

/** Oxude-style floating page menu, using the existing routes and guarded navigation. */
export function MobileNavigation({ items, active, modeLabel, onNavigate, onClose }: Props) {
  const dialog = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const shell = document.querySelector<HTMLElement>(".app"), wasInert = shell?.inert ?? false;
    if (shell) shell.inert = true;
    dialog.current?.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true });
    const desktop = window.matchMedia("(min-width: 851px)");
    const resize = () => { if (desktop.matches) onClose(); };
    desktop.addEventListener("change", resize);
    return () => {
      desktop.removeEventListener("change", resize);
      if (shell) shell.inert = wasInert;
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, [onClose]);

  return createPortal(<div className="mobile-navigation-layer" onPointerDown={(event) => {
    if (event.target === event.currentTarget) {
      // Avoid the browser's subsequent default focus change undoing restoration.
      event.preventDefault(); onClose();
    }
  }}>
    <section className="mobile-navigation-panel" id="mobile-navigation" ref={dialog}
      role="dialog" aria-modal="true" aria-label="Navigation" onKeyDown={(event) => {
        if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onClose(); }
        if (event.key !== "Tab") return;
        const controls = [...dialog.current!.querySelectorAll<HTMLElement>('a[href], button:not([disabled])')];
        const first = controls[0], last = controls.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }}>
      <header className="mobile-navigation-heading">
        <div className="mobile-navigation-brand"><span className="brand-mark"><img src="/aeco-website-logo.png" alt="" width={32} height={32} /></span>
          <span>Agentic <b>Economy</b><small>A WORLD THAT WORKS</small></span></div>
        <button type="button" className="mobile-navigation-close" aria-label="Close navigation" onClick={onClose}><X size={20} /></button>
      </header>
      <div className="mobile-navigation-intro"><span>Explore the economy</span><span className="mobile-navigation-mode"><i aria-hidden="true" />{modeLabel}</span></div>
      <nav className="mobile-navigation-pages" aria-label="Main navigation">
        {items.map(({ id, label, icon: Icon }) => <a key={id} href={routeUrl(id)} aria-current={active === id ? "page" : undefined}
          onClick={(event) => {
            if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
            event.preventDefault(); onNavigate(id);
          }}><Icon size={18} strokeWidth={1.5} aria-hidden="true" /><span>{label}</span><ChevronRight size={16} aria-hidden="true" /></a>)}
      </nav>
      <footer className="mobile-navigation-footer"><a href={routeUrl("about")} aria-current={active === "about" ? "page" : undefined}
        onClick={(event) => {
          if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
          event.preventDefault(); onNavigate("about");
        }}><Info size={16} aria-hidden="true" />About the world<ArrowUpRight size={15} aria-hidden="true" /></a>
        <ProjectLinks /><p>A World That Works. One living world.</p></footer>
    </section>
  </div>, document.body);
}
