"use client";

export function FetchDescriptionOption({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <div className="form-field form-field--full">
      <label className="checkbox-label">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
        />
        Fetch LinkedIn descriptions
      </label>
      <p className="hint">Scrapes are slower. The text is needed for resume matching and gap analysis.</p>
    </div>
  );
}
