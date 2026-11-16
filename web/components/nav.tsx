"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { label: "Profile", href: "/profile" },
  { label: "Scrape", href: "/scrape" },
  { label: "Jobs", href: "/jobs" },
  { label: "Resume", href: "/resume" },
  { label: "Applications", href: "/applications" },
  { label: "Archived", href: "/archived" },
  { label: "Statistics", href: "/statistics" },
];

const PANEL_ID = "app-nav-panel";

interface NavProps {
  activeProfile: string | null;
}

export function Nav({ activeProfile }: NavProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);

  function close() {
    setOpen(false);
    menuButtonRef.current?.focus();
  }

  useEffect(() => {
    if (!open) return;
    panelRef.current?.querySelector<HTMLElement>("a")?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        menuButtonRef.current?.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const chip = activeProfile ? (
    <span className="profile-chip">{activeProfile}</span>
  ) : (
    <span className="profile-chip profile-chip--none">none</span>
  );

  return (
    <>
      <header className="topbar">
        <span className="sidebar-logo">jobspy</span>
        <button
          ref={menuButtonRef}
          type="button"
          className="menu-btn"
          aria-expanded={open}
          aria-controls={PANEL_ID}
          onClick={() => (open ? close() : setOpen(true))}
        >
          <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
            {open ? (
              <path d="M4 4l10 10M14 4L4 14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            ) : (
              <path d="M3 5h12M3 9h12M3 13h12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            )}
          </svg>
          Menu
        </button>
      </header>

      {open && <div className="nav-backdrop" onClick={close} aria-hidden="true" />}

      <nav
        ref={panelRef}
        id={PANEL_ID}
        className={`sidebar${open ? " sidebar--open" : ""}`}
        aria-label="Main"
      >
        <div className="sidebar-brand">
          <span className="sidebar-logo">jobspy</span>
        </div>

        <ul className="sidebar-nav">
          {NAV_ITEMS.map(({ label, href }) => {
            const isActive = pathname === href || pathname.startsWith(href + "/");
            const isProfile = href === "/profile";
            return (
              <li key={href}>
                <Link
                  href={href}
                  className={`sidebar-link${isActive ? " sidebar-link--active" : ""}`}
                  onClick={() => open && close()}
                >
                  {label}
                  {isProfile && chip}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
