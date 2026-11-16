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
    </div>
  );
}
