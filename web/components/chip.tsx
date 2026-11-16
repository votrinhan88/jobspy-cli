import type { ReactNode } from "react";

export function Chip({
  pressed,
  onClick,
  children,
  disabled,
}: {
  pressed: boolean;
  onClick: () => void;
  children: ReactNode;
  disabled?: boolean;
}) {
  return (
    <button type="button" className="filter-chip" aria-pressed={pressed} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}
