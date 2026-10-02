"use client";

import { useEffect, useRef, useState } from "react";

export default function ProfilePage() {
  const [profiles, setProfiles] = useState<string[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [switching, setSwitching] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [notification, setNotification] = useState<{ kind: "success" | "error"; msg: string } | null>(null);
  const [notifFading, setNotifFading] = useState(false);
  const notifTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fadeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    load();
    const pending = sessionStorage.getItem("profile_notif");
    if (pending) {
      sessionStorage.removeItem("profile_notif");
      try {
        const parsed = JSON.parse(pending);
        notify(parsed.kind, parsed.msg);
      } catch {}
    }
  }, []);

  async function load() {
    const res = await fetch("/api/profiles");
    if (!res.ok) return;
    const data: { profiles: string[]; active: string | null } = await res.json();
    setProfiles(data.profiles);
    setActive(data.active);
  }

  function notify(kind: "success" | "error", msg: string) {
    setNotification({ kind, msg });
    setNotifFading(false);
    if (notifTimer.current) clearTimeout(notifTimer.current);
    if (fadeTimer.current) clearTimeout(fadeTimer.current);
    // start fade 1s before removal
    notifTimer.current = setTimeout(() => {
      setNotifFading(true);
      fadeTimer.current = setTimeout(() => setNotification(null), 1000);
    }, 9000);
  }

  async function handleSwitch(name: string) {
    if (switching) return;
    setSwitching(name);
    try {
      const res = await fetch("/api/profiles/switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        const data = await res.json();
        notify("error", data.error ?? "Failed to switch profile");
        return;
      }
      setActive(name);
      sessionStorage.setItem("profile_notif", JSON.stringify({ kind: "success", msg: `Switched to "${name}"` }));
      window.location.reload();
    } finally {
      setSwitching(null);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    try {
      const res = await fetch("/api/profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName }),
      });
      const data = await res.json();
      if (!res.ok) {
        notify("error", data.error ?? "Failed to create profile");
        return;
      }
      setProfiles((prev) => [...prev, data.name].sort());
      setNewName("");
      // auto-switch to the newly created profile
      await fetch("/api/profiles/switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: data.name }),
      });
      sessionStorage.setItem("profile_notif", JSON.stringify({ kind: "success", msg: `Profile "${data.name}" created and activated` }));
      window.location.reload();
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(name: string) {
    setDeleting(name);
    setConfirmDelete(null);
    try {
      const res = await fetch(`/api/profiles/${encodeURIComponent(name)}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) {
        notify("error", data.error ?? "Failed to delete profile");
        return;
      }
      const wasActive = active === name;
      if (wasActive) {
        const msg = data.newActive
          ? `Deleted "${name}", switched to "${data.newActive}"`
          : `Deleted "${name}"`;
        sessionStorage.setItem("profile_notif", JSON.stringify({ kind: "success", msg }));
        window.location.reload();
      } else {
        setProfiles((prev) => prev.filter((p) => p !== name));
        notify("success", `Deleted "${name}"`);
      }
    } finally {
      setDeleting(null);
    }
  }

  function startEdit(name: string) {
    setEditing(name);
    setEditName(name);
  }

  function cancelEdit() {
    setEditing(null);
    setEditName("");
  }

  async function handleRename(oldName: string) {
    const trimmed = editName.trim();
    if (!trimmed || trimmed === oldName) { cancelEdit(); return; }
    setRenaming(true);
    try {
      const res = await fetch(`/api/profiles/${encodeURIComponent(oldName)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        notify("error", data.error ?? "Failed to rename profile");
        return;
      }
      if (active === oldName) {
        sessionStorage.setItem("profile_notif", JSON.stringify({ kind: "success", msg: `Renamed to "${data.name}"` }));
        window.location.reload();
        return;
      }
      setProfiles((prev) => [...prev.filter((p) => p !== oldName), data.name].sort());
      cancelEdit();
      notify("success", `Renamed to "${data.name}"`);
    } catch {
      notify("error", "Failed to rename profile");
    } finally {
      setRenaming(false);
    }
  }

  return (
    <div className="page-content">
      <header className="page-header">
        <h1 className="page-title">Profiles</h1>
        <p className="page-subtitle">
          Each profile is a separate job-search campaign with its own jobs and config.
        </p>
      </header>

      <form onSubmit={handleCreate} className="create-form">
        <input
          className="input"
          type="text"
          placeholder="e.g. ai-engineer-au"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          required
          pattern="[a-zA-Z0-9_\-]{1,64}"
          title="Letters, digits, hyphens, underscores. Max 64 characters."
        />
        <button className="btn btn-primary" type="submit" disabled={creating}>
          {creating ? "Creating..." : "Create"}
        </button>
      </form>
      <p className="hint">Letters, digits, hyphens, underscores only.</p>

      {profiles.length > 0 && (
        <section className="section" style={{ marginTop: "32px" }}>
          <h2 className="section-title">Your profiles</h2>
          <ul className="profile-list">
            {profiles.map((name) => (
              <li
                key={name}
                className={`profile-item profile-item--clickable${switching === name ? " profile-item--switching" : ""}`}
                onClick={() => editing !== name && handleSwitch(name)}
                title={editing !== name ? `Switch to "${name}"` : undefined}
              >
                {editing === name ? (
                  <form
                    className="edit-form"
                    onSubmit={(e) => { e.preventDefault(); handleRename(name); }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <input
                      className="input input--inline"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      autoFocus
                      pattern="[a-zA-Z0-9_\-]{1,64}"
                      aria-label="New profile name"
                      readOnly={renaming}
                      onKeyDown={(e) => e.key === "Escape" && !renaming && cancelEdit()}
                    />
                    <button type="submit" className="btn btn-sm btn-primary" disabled={renaming}>
                      {renaming ? "Saving…" : "Save"}
                    </button>
                    <button type="button" className="btn btn-sm btn-secondary" onClick={cancelEdit} disabled={renaming}>Cancel</button>
                  </form>
                ) : (
                  <>
                    <span className="profile-name">{name}</span>
                    {active === name && <span className="active-tag">Active</span>}
                  </>
                )}

                <div className="profile-actions" onClick={(e) => e.stopPropagation()}>
                  {switching === name && <span className="profile-switching-label">Switching…</span>}
                  {confirmDelete === name ? (
                    <>
                      <span className="delete-confirm-label">Delete?</span>
                      <button
                        className="btn btn-sm btn-danger"
                        onClick={() => handleDelete(name)}
                        disabled={deleting === name}
                      >
                        Yes
                      </button>
                      <button
                        className="btn btn-sm btn-secondary"
                        onClick={() => setConfirmDelete(null)}
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        className="icon-btn"
                        title="Rename"
                        onClick={() => startEdit(name)}
                        aria-label="Rename profile"
                      >
                        <PencilIcon />
                      </button>
                      <button
                        className="icon-btn icon-btn--danger"
                        title="Delete"
                        onClick={() => setConfirmDelete(name)}
                        disabled={deleting === name}
                        aria-label="Delete profile"
                      >
                        <TrashIcon />
                      </button>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {profiles.length === 0 && (
        <p className="empty-state" style={{ marginTop: "24px" }}>No profiles yet. Create one above.</p>
      )}

      {notification && (
        <div className={`toast toast--${notification.kind}${notifFading ? " toast--fading" : ""}`}>
          {notification.msg}
        </div>
      )}
    </div>
  );
}

function PencilIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9.5 1.5l3 3L4 13H1v-3L9.5 1.5z" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="1 3.5 13 3.5" />
      <path d="M4.5 3.5V2a.5.5 0 01.5-.5h4a.5.5 0 01.5.5v1.5" />
      <path d="M2.5 3.5l.9 8.1a.5.5 0 00.5.4h5.2a.5.5 0 00.5-.4l.9-8.1" />
    </svg>
  );
}
