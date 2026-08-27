"use client";

import { useEffect, useRef, useState } from "react";

export default function ProfilePage() {
  const [profiles, setProfiles] = useState<string[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [switching, setSwitching] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [notification, setNotification] = useState<{ kind: "success" | "error"; msg: string } | null>(null);
  const notifTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    const res = await fetch("/api/profiles");
    if (!res.ok) return;
    const data: string[] = await res.json();
    setProfiles(data);
  }

  function notify(kind: "success" | "error", msg: string) {
    setNotification({ kind, msg });
    if (notifTimer.current) clearTimeout(notifTimer.current);
    notifTimer.current = setTimeout(() => setNotification(null), 4000);
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
      notify("success", `Switched to "${name}"`);
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
      notify("success", `Profile "${data.name}" created`);
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(name: string) {
    if (!confirm(`Delete profile "${name}"? This removes all jobs and config for this profile.`)) return;
    setDeleting(name);
    try {
      const res = await fetch(`/api/profiles/${encodeURIComponent(name)}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        notify("error", data.error ?? "Failed to delete profile");
        return;
      }
      setProfiles((prev) => prev.filter((p) => p !== name));
      notify("success", `Deleted "${name}"`);
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
    // create new, then delete old — no rename API needed
    const createRes = await fetch("/api/profiles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: trimmed }),
    });
    if (!createRes.ok) {
      const data = await createRes.json();
      notify("error", data.error ?? "Failed to rename profile");
      return;
    }
    await fetch(`/api/profiles/${encodeURIComponent(oldName)}`, { method: "DELETE" });
    setProfiles((prev) => [...prev.filter((p) => p !== oldName), trimmed].sort());
    cancelEdit();
    notify("success", `Renamed to "${trimmed}"`);
  }

  return (
    <div className="page-content">
      <header className="page-header">
        <h1 className="page-title">Profiles</h1>
        <p className="page-subtitle">
          Each profile is a separate job-search campaign with its own jobs and config.
        </p>
      </header>

      {/* Create form + notification on the same row */}
      <div className="profile-create-row">
        <form onSubmit={handleCreate} className="create-form">
          <input
            className="input"
            type="text"
            placeholder="e.g. ai-engineer-au"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            required
            pattern="[a-zA-Z0-9_-]{1,64}"
            title="Letters, digits, hyphens, underscores. Max 64 characters."
          />
          <button className="btn btn-primary" type="submit" disabled={creating}>
            {creating ? "Creating..." : "Create"}
          </button>
        </form>
        {notification && (
          <span className={`inline-notif inline-notif--${notification.kind}`}>
            {notification.msg}
          </span>
        )}
      </div>
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
                      pattern="[a-zA-Z0-9_-]{1,64}"
                      onKeyDown={(e) => e.key === "Escape" && cancelEdit()}
                    />
                    <button type="submit" className="btn btn-sm btn-primary">Save</button>
                    <button type="button" className="btn btn-sm btn-secondary" onClick={cancelEdit}>Cancel</button>
                  </form>
                ) : (
                  <span className="profile-name">{name}</span>
                )}

                <div className="profile-actions" onClick={(e) => e.stopPropagation()}>
                  {switching === name && <span className="profile-switching-label">Switching…</span>}
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
                    onClick={() => handleDelete(name)}
                    disabled={deleting === name}
                    aria-label="Delete profile"
                  >
                    <TrashIcon />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {profiles.length === 0 && (
        <p className="empty-state" style={{ marginTop: "24px" }}>No profiles yet. Create one above.</p>
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
