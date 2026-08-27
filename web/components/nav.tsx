"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { label: "Profile", href: "/profile" },
  { label: "Resume", href: "/resume" },
  { label: "Scrape", href: "/scrape" },
  { label: "Jobs", href: "/jobs" },
  { label: "Applications", href: "/applications" },
  { label: "Statistics", href: "/statistics" },
];

interface NavProps {
  activeProfile: string | null;
}

export function Nav({ activeProfile }: NavProps) {
  const pathname = usePathname();

  return (
    <nav className="sidebar">
      <div className="sidebar-brand">
        <span className="sidebar-logo">jobspy</span>
      </div>

      <ul className="sidebar-nav">
        {NAV_ITEMS.map(({ label, href }) => {
          const isActive = pathname === href || pathname.startsWith(href + "/");
          return (
            <li key={href}>
              <Link
                href={href}
                className={`sidebar-link${isActive ? " sidebar-link--active" : ""}`}
              >
                {label}
              </Link>
            </li>
          );
        })}
      </ul>

      <div className="sidebar-footer">
        {activeProfile ? (
          <span className="profile-chip">{activeProfile}</span>
        ) : (
          <Link href="/profile" className="profile-chip profile-chip--none">
            No profile
          </Link>
        )}
      </div>
    </nav>
  );
}
