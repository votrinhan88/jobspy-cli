import { useId } from "react";

export function LinesInput({
  label,
  values,
  onChange,
  onFlush,
  placeholder,
}: {
  label: string;
  values: string[];
  onChange: (v: string[]) => void;
  onFlush?: () => void;
  placeholder?: string;
}) {
  const id = useId();
  function handleChange(raw: string) {
    const lines = raw.split("\n").map((l) => l.trim()).filter(Boolean);
    onChange(lines);
  }

  return (
    <div className="form-field">
      <div className="form-field-head">
        <label className="form-label" htmlFor={id}>{label}</label>
      </div>
      <textarea
        id={id}
        className="input input--textarea"
        rows={10}
        value={values.join("\n")}
        onChange={(e) => handleChange(e.target.value)}
        onBlur={onFlush}
        placeholder={placeholder ?? "One per line"}
      />
    </div>
  );
}
