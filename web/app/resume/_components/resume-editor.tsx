"use client";

import { useEffect, useState } from "react";
import { ResumeSheet } from "@/app/resume/_components/resume-sheet";

type SaveState = "saved" | "unsaved" | "saving" | "error";

const SAVE_TEXT: Record<SaveState, string> = {
  saved: "All changes saved",
  unsaved: "Unsaved changes",
  saving: "Saving changes…",
  error: "Could not save changes.",
};

type Props = {
  tag: string;
  existingTags: string[];
  onDirtyChange?: (dirty: boolean) => void;
  onSaved: (version: number) => void;
  onCopied: (tag: string) => void;
};

async function errorText(res: Response | null, fallback: string): Promise<string> {
  const data = (await res?.json().catch(() => ({}))) as { error?: string } | undefined;
  return data?.error ?? fallback;
}

export function ResumeEditor({ tag, existingTags, onDirtyChange, onSaved, onCopied }: Props) {
  const [loaded, setLoaded] = useState<{ tag: string; text: string | null } | null>(null);
  const [text, setText] = useState("");
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [error, setError] = useState<string | null>(null);
  const [newTag, setNewTag] = useState("");
  const [modelReady, setModelReady] = useState(false);
  const [convert, setConvert] = useState<"idle" | "confirm" | "running">("idle");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/resume-convert")
      .then(async (res) => {
        const body = res.ok ? ((await res.json()) as { available?: boolean }) : null;
        if (!cancelled) setModelReady(body?.available === true);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/resumes/${encodeURIComponent(tag)}`)
      .then(async (res) => {
        const body = res.ok ? ((await res.json()) as { text: string | null }) : null;
        if (cancelled) return;
        setLoaded({ tag, text: body?.text ?? null });
        setText(body?.text ?? "");
        setSaveState("saved");
        setError(null);
      })
      .catch(() => {
        if (!cancelled) setLoaded({ tag, text: null });
      });
    return () => {
      cancelled = true;
    };
  }, [tag]);

  useEffect(() => {
    onDirtyChange?.(saveState === "unsaved");
    return () => onDirtyChange?.(false);
  }, [saveState, onDirtyChange]);

  // A result for an older tag never matches, so the old text disappears while the new one loads.
  const current = loaded?.tag === tag ? loaded : null;
  if (current === null) return <p className="loading-row">Loading…</p>;
  if (current.text === null) {
    return <div role="alert" className="alert alert-error">The resume could not be opened.</div>;
  }

  function edit(value: string) {
    setText(value);
    setSaveState("unsaved");
  }

  async function save() {
    setSaveState("saving");
    setError(null);
    const res = await fetch(`/api/resumes/${encodeURIComponent(tag)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    }).catch(() => null);
    if (!res?.ok) {
      setSaveState("error");
      setError(await errorText(res, "The resume could not be saved."));
      return;
    }
    const data = (await res.json()) as { version: number };
    setSaveState("saved");
    onSaved(data.version);
  }

  async function convertWithModel() {
    setConvert("running");
    setError(null);
    const res = await fetch("/api/resume-convert", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    }).catch(() => null);
    setConvert("idle");
    if (!res?.ok) {
      setError(await errorText(res, "The model could not convert the resume."));
      return;
    }
    const data = (await res.json()) as { text: string };
    edit(data.text);
  }

  async function saveCopy() {
    setError(null);
    if (existingTags.includes(newTag)) {
      setError("That tag already exists.");
      return;
    }
    const body = new FormData();
    body.set("tag", newTag);
    body.set("text", text);
    body.set("parent", tag);
    const res = await fetch("/api/resumes", { method: "POST", body }).catch(() => null);
    if (!res?.ok) {
      setError(await errorText(res, "The copy could not be saved."));
      return;
    }
    setNewTag("");
    onCopied(newTag);
  }

  return (
    <div className="resume-editor">
      <div className="resume-editor-bar">
        <span role="status" className={`save-state save-state--${saveState}`}>
          {SAVE_TEXT[saveState]}
        </span>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={save}
          disabled={saveState === "saved" || saveState === "saving"}
        >
          Save
        </button>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => window.print()}>
          Export
        </button>
        {modelReady && convert === "idle" && (
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setConvert("confirm")}>
            Convert with model
          </button>
        )}
        {convert === "confirm" && (
          <>
            <span className="fit-words">{`Send the resume text to the model? About ${text.length} characters.`}</span>
            <button type="button" className="btn btn-primary btn-sm" onClick={convertWithModel}>
              Send
            </button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setConvert("idle")}>
              Cancel
            </button>
          </>
        )}
        {convert === "running" && <span className="fit-words">Converting…</span>}
      </div>
      <div className="resume-editor-panes">
        <textarea
          aria-label="Resume text editor"
          className="input input--textarea resume-editor-input"
          value={text}
          onChange={(e) => edit(e.target.value)}
          spellCheck
        />
        <ResumeSheet text={text} />
      </div>

      <form
        className="resume-actions"
        onSubmit={(e) => {
          e.preventDefault();
          if (newTag !== "") saveCopy();
        }}
      >
        <label className="form-field">
          <span className="form-label">New tag</span>
          <input className="input input--sm" value={newTag} onChange={(e) => setNewTag(e.target.value)} />
        </label>
        <button type="submit" className="btn btn-secondary btn-sm" disabled={newTag === ""}>
          Fork
        </button>
      </form>
      {error && <div role="alert" className="alert alert-error">{error}</div>}
    </div>
  );
}
