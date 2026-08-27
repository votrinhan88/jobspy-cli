"use client";

import { useEffect, useState } from "react";

type Profile = string;

export default function ProfilePage() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [switching, setSwitching] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    fetchProfiles();
  }, []);

  async function fetchProfiles() {
    const res = await fetch("/api/profiles");
    if (!res.ok) return;
    const data: string[] = await res.json();
    setProfiles(data);

    const scrapeRes = await fetch("/api/scrape/status");
    if (!scrapeRes.ok) return;
  }

  async function handleSwitch(name: string) {
    setSwitching(name);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/profiles/switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Failed to switch profile");
        return;
      }
      setActive(name);
      setSuccess(`Switched to "${name}"`);
      window.location.reload();
    } finally {
      setSwitching(null);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to create profile");
        return;
      }
      setProfiles((prev) => [...prev, data.name].sort());
      setNewName("");
      setSuccess(`Profile "${data.name}" created`);
    } finally {
      setCreating(false);
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

      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      <section className="section">
        <h2 className="section-title">Your profiles</h2>
        {profiles.length === 0 ? (
          <p className="empty-state">No profiles yet. Create one below.</p>
        ) : (
          <ul className="profile-list">
            {profiles.map((name) => (
              <li key={name} className="profile-item">
                <span className="profile-name">{name}</span>
                <button
                  className="btn btn-secondary"
                  onClick={() => handleSwitch(name)}
                  disabled={switching === name}
                >
                  {switching === name ? "Switching..." : "Switch to"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="section">
        <h2 className="section-title">Create profile</h2>
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
        <p className="hint">Letters, digits, hyphens, underscores only.</p>
      </section>
    </div>
  );
}
