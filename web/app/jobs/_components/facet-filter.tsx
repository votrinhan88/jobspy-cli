"use client";

import { useEffect, useId, useRef, useState } from "react";

interface FacetFilterProps {
  label: string;
  options: string[];
  selected: string[];
  valueLabel: (value: string) => string;
  onChange: (values: string[]) => void;
}

export function FacetFilter({
  label,
  options,
  selected,
  valueLabel,
  onChange,
}: FacetFilterProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const selectedValues = selected.filter((value) => options.includes(value));
  const allSelected = options.length > 0 && selectedValues.length === options.length;
  const summary =
    selectedValues.length === 0
      ? "All"
      : selectedValues.length === 1
        ? valueLabel(selectedValues[0])
        : `${selectedValues.length} selected`;

  useEffect(() => {
    if (!open) return;
    function onPointer(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpen(false);
      buttonRef.current?.focus();
    }
    document.addEventListener("pointerdown", onPointer, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function toggle(value: string) {
    const next = selectedValues.includes(value)
      ? selectedValues.filter((item) => item !== value)
      : [...selectedValues, value];
    onChange(next);
  }

  return (
    <div className="facet-field facet-field--menu" ref={rootRef}>
      <span className="facet-label">{label}</span>
      <button
        ref={buttonRef}
        type="button"
        className="input input--sm facet-select"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={`${label}: ${summary}`}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="facet-select-text">{summary}</span>
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
          <path d="M2 3.5l3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      </button>

      {open && (
        <div id={menuId} className="facet-menu" role="dialog" aria-label={`${label} filter`}>
          {options.length === 0 ? (
            <p className="facet-empty">No values</p>
          ) : (
            <>
              <div className="facet-options">
                {options.map((value) => (
                  <label key={value} className="facet-option">
                    <input
                      type="checkbox"
                      checked={selectedValues.includes(value)}
                      onChange={() => toggle(value)}
                    />
                    <span>{valueLabel(value)}</span>
                  </label>
                ))}
              </div>
              {options.length > 5 && (
                <div className="facet-actions">
                  <button
                    type="button"
                    className="btn btn-sm btn-secondary"
                    onClick={() => onChange([...options])}
                    disabled={allSelected}
                  >
                    All
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm btn-ghost"
                    onClick={() => onChange([])}
                    disabled={selectedValues.length === 0}
                  >
                    Clear
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
