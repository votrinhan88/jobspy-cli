"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import type { JobStatus } from "@/lib/csv";
import { STATUSES, statusLabel } from "@/lib/status";

const MENU_WIDTH = 200;

interface StatusMenuProps {
  current: JobStatus;
  jobTitle: string;
  disabled?: boolean;
  onSelect: (status: JobStatus) => void;
}

const CHOICES: { status: JobStatus; label: string }[] = [
  ...STATUSES.filter((s) => s !== "").map((s) => ({ status: s, label: statusLabel(s) })),
  { status: "", label: "Back to untriaged" },
];

export function StatusMenu({ current, jobTitle, disabled, onSelect }: StatusMenuProps) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);
  const menuId = useId();

  function close(returnFocus: boolean) {
    setOpen(false);
    if (returnFocus) buttonRef.current?.focus();
  }

  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const menuHeight = menuRef.current?.offsetHeight ?? 320;
    const below = rect.bottom + 4;
    const top = below + menuHeight > window.innerHeight - 8 ? Math.max(8, rect.top - 4 - menuHeight) : below;
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - MENU_WIDTH - 8));
    setPos({ top, left });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const items = menuRef.current?.querySelectorAll<HTMLElement>("[role=menuitemradio]");
    const checked = menuRef.current?.querySelector<HTMLElement>("[aria-checked=true]");
    (checked ?? items?.[0])?.focus();

    function onPointer(e: PointerEvent) {
      const target = e.target as Node;
      if (menuRef.current?.contains(target) || buttonRef.current?.contains(target)) return;
      close(false);
    }
    function onViewportChange(e: Event) {
      if (e.type === "scroll" && menuRef.current?.contains(e.target as Node)) return;
      close(false);
    }
    document.addEventListener("pointerdown", onPointer, true);
    window.addEventListener("scroll", onViewportChange, true);
    window.addEventListener("resize", onViewportChange);
    return () => {
      document.removeEventListener("pointerdown", onPointer, true);
      window.removeEventListener("scroll", onViewportChange, true);
      window.removeEventListener("resize", onViewportChange);
    };
  }, [open]);

  function onMenuKeyDown(e: React.KeyboardEvent) {
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLElement>("[role=menuitemradio]") ?? []);
    const index = items.indexOf(document.activeElement as HTMLElement);
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      close(true);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      items[(index + 1) % items.length]?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      items[(index - 1 + items.length) % items.length]?.focus();
    } else if (e.key === "Home") {
      e.preventDefault();
      items[0]?.focus();
    } else if (e.key === "End") {
      e.preventDefault();
      items[items.length - 1]?.focus();
    } else if (e.key === "Tab") {
      close(false);
    }
  }

  function choose(status: JobStatus) {
    close(true);
    if (status !== current) onSelect(status);
  }

  return (
    <div className="status-menu">
      <button
        ref={buttonRef}
        type="button"
        className="btn btn-sm btn-secondary status-menu-button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={`Status of ${jobTitle}`}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" && !open) {
            e.preventDefault();
            setOpen(true);
          }
        }}
      >
        Status
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
          <path d="M2 3.5l3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      </button>
      {open && (
        <ul
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label={`Move ${jobTitle} to`}
          className="status-menu-list"
          style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999, width: MENU_WIDTH }}
          onKeyDown={onMenuKeyDown}
        >
          {CHOICES.map(({ status, label }) => {
            const checked = status === current;
            return (
              <li key={label} role="none" className={status === "" ? "status-menu-sep" : undefined}>
                <button
                  type="button"
                  role="menuitemradio"
                  aria-checked={checked}
                  tabIndex={-1}
                  className="status-menu-item"
                  onClick={() => choose(status)}
                >
                  <span className={`status-dot status-dot--${status || "none"}`} aria-hidden="true" />
                  <span className="status-menu-label">{label}</span>
                  {checked && <span className="status-menu-current">Current</span>}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
