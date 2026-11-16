// @vitest-environment happy-dom
import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useDismiss } from "@/components/use-dismiss";

function Probe({ active, onDismiss }: { active: boolean; onDismiss: () => void }) {
  useDismiss(active, ".inside", onDismiss);
  return (
    <div>
      <button className="inside">in</button>
      <button className="outside">out</button>
    </div>
  );
}

describe("useDismiss", () => {
  it("dismisses on a mousedown outside", () => {
    const onDismiss = vi.fn();
    const { container } = render(<Probe active onDismiss={onDismiss} />);
    fireEvent.mouseDown(container.querySelector(".outside")!);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("ignores a mousedown inside", () => {
    const onDismiss = vi.fn();
    const { container } = render(<Probe active onDismiss={onDismiss} />);
    fireEvent.mouseDown(container.querySelector(".inside")!);
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it("dismisses on Escape only", () => {
    const onDismiss = vi.fn();
    render(<Probe active onDismiss={onDismiss} />);
    fireEvent.keyDown(document, { key: "a" });
    expect(onDismiss).not.toHaveBeenCalled();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("does nothing while inactive", () => {
    const onDismiss = vi.fn();
    const { container } = render(<Probe active={false} onDismiss={onDismiss} />);
    fireEvent.mouseDown(container.querySelector(".outside")!);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onDismiss).not.toHaveBeenCalled();
  });
});
