import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ResumeEditor } from "@/app/resume/_components/resume-editor";

let calls: { url: string; method: string; body?: unknown }[];
let saveStatus: number;
let copyStatus: number;
let modelAvailable: boolean;
let convertReply: { status: number; body: unknown };

beforeEach(() => {
  calls = [];
  saveStatus = 200;
  copyStatus = 200;
  modelAvailable = true;
  convertReply = { status: 200, body: { text: "# Jane Doe\n\n## Skills\n\n- Built A" } };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      const body = init?.body instanceof FormData ? Object.fromEntries(init.body.entries()) : init?.body ? JSON.parse(String(init.body)) : undefined;
      calls.push({ url, method, body });
      if (url === "/api/resume-convert") {
        if (method === "GET") return { ok: true, status: 200, json: async () => ({ available: modelAvailable }) };
        return { ok: convertReply.status === 200, status: convertReply.status, json: async () => convertReply.body };
      }
      if (method === "PUT") {
        return { ok: saveStatus === 200, status: saveStatus, json: async () => ({ version: 2, error: "disk full" }) };
      }
      if (method === "POST") {
        return { ok: copyStatus === 200, status: copyStatus, json: async () => ({ tag: "ai-xero", error: "tag exists" }) };
      }
      return { ok: true, status: 200, json: async () => ({ meta: {}, text: "# Jane\n\n- Built A" }) };
    })
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ResumeEditor", () => {
  it("loads the text into an editor and a preview", async () => {
    render(<ResumeEditor tag="ai" existingTags={["ai"]} onSaved={() => {}} onCopied={() => {}} />);
    const editor = await screen.findByRole("textbox", { name: "Resume text editor" });
    expect(editor).toHaveValue("# Jane\n\n- Built A");
    expect(screen.getByRole("heading", { level: 1, name: "Jane" })).toBeInTheDocument();
    expect(screen.getByText("Built A")).toBeInTheDocument();
  });

  it("updates the preview while typing and shows unsaved changes", async () => {
    const user = userEvent.setup();
    render(<ResumeEditor tag="ai" existingTags={["ai"]} onSaved={() => {}} onCopied={() => {}} />);
    const editor = await screen.findByRole("textbox", { name: "Resume text editor" });
    expect(screen.getByRole("status")).toHaveTextContent("All changes saved");

    await user.type(editor, "\n- Built B");
    expect(screen.getByText("Built B")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Unsaved changes");
  });

  it("saves the text with PUT and reports the new version", async () => {
    const user = userEvent.setup();
    const onSaved = vi.fn();
    render(<ResumeEditor tag="ai" existingTags={["ai"]} onSaved={onSaved} onCopied={() => {}} />);
    const editor = await screen.findByRole("textbox", { name: "Resume text editor" });
    await user.type(editor, "!");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("All changes saved"));
    expect(calls).toContainEqual({ url: "/api/resumes/ai", method: "PUT", body: { text: "# Jane\n\n- Built A!" } });
    expect(onSaved).toHaveBeenCalledWith(2);
  });

  it("shows a save error and keeps the text", async () => {
    saveStatus = 500;
    const user = userEvent.setup();
    render(<ResumeEditor tag="ai" existingTags={["ai"]} onSaved={() => {}} onCopied={() => {}} />);
    const editor = await screen.findByRole("textbox", { name: "Resume text editor" });
    await user.type(editor, "!");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("disk full");
    expect(editor).toHaveValue("# Jane\n\n- Built A!");
  });

  it("saves a copy under a new tag without changing this one", async () => {
    const user = userEvent.setup();
    const onCopied = vi.fn();
    render(<ResumeEditor tag="ai" existingTags={["ai"]} onSaved={() => {}} onCopied={onCopied} />);
    const editor = await screen.findByRole("textbox", { name: "Resume text editor" });
    await user.type(editor, "!");
    await user.type(screen.getByLabelText("New tag"), "ai-xero");
    await user.click(screen.getByRole("button", { name: "Fork" }));

    await waitFor(() => expect(onCopied).toHaveBeenCalledWith("ai-xero"));
    expect(calls).toContainEqual({ url: "/api/resumes", method: "POST", body: { tag: "ai-xero", text: "# Jane\n\n- Built A!", parent: "ai" } });
    expect(calls.some((c) => c.method === "PUT")).toBe(false);
  });

  it("refuses a new tag that already exists and sends nothing", async () => {
    const user = userEvent.setup();
    render(<ResumeEditor tag="ai" existingTags={["ai", "ai-xero"]} onSaved={() => {}} onCopied={() => {}} />);
    await screen.findByRole("textbox", { name: "Resume text editor" });
    await user.type(screen.getByLabelText("New tag"), "ai-xero");
    await user.click(screen.getByRole("button", { name: "Fork" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("That tag already exists.");
    expect(calls.some((c) => c.method === "POST")).toBe(false);
  });

  it("offers a print button for the preview", async () => {
    const print = vi.fn();
    vi.stubGlobal("print", print);
    const user = userEvent.setup();
    render(<ResumeEditor tag="ai" existingTags={["ai"]} onSaved={() => {}} onCopied={() => {}} />);
    await screen.findByRole("textbox", { name: "Resume text editor" });
    await user.click(screen.getByRole("button", { name: "Export" }));
    expect(print).toHaveBeenCalled();
  });

  describe("convert with a model", () => {
    const open = () => render(<ResumeEditor tag="ai" existingTags={["ai"]} onSaved={() => {}} onCopied={() => {}} />);

    it("hides the button when no model is set up", async () => {
      modelAvailable = false;
      open();
      await screen.findByRole("textbox", { name: "Resume text editor" });
      expect(screen.queryByRole("button", { name: "Convert with model" })).not.toBeInTheDocument();
    });

    it("shows the size and sends nothing until the user confirms", async () => {
      const user = userEvent.setup();
      open();
      await user.click(await screen.findByRole("button", { name: "Convert with model" }));
      expect(screen.getByText(/About 17 characters/)).toBeInTheDocument();
      expect(calls.some((c) => c.url === "/api/resume-convert" && c.method === "POST")).toBe(false);

      await user.click(screen.getByRole("button", { name: "Cancel" }));
      expect(screen.queryByText(/About 17 characters/)).not.toBeInTheDocument();
      expect(calls.some((c) => c.url === "/api/resume-convert" && c.method === "POST")).toBe(false);
    });

    it("replaces the text with the converted text as an unsaved change", async () => {
      const user = userEvent.setup();
      open();
      await user.click(await screen.findByRole("button", { name: "Convert with model" }));
      await user.click(screen.getByRole("button", { name: "Send" }));

      const editor = screen.getByRole("textbox", { name: "Resume text editor" });
      await waitFor(() => expect(editor).toHaveValue("# Jane Doe\n\n## Skills\n\n- Built A"));
      expect(screen.getByRole("status")).toHaveTextContent("Unsaved changes");
      expect(calls).toContainEqual({ url: "/api/resume-convert", method: "POST", body: { text: "# Jane\n\n- Built A" } });
      expect(calls.some((c) => c.method === "PUT")).toBe(false);
    });

    it("shows the error and keeps the text when the conversion fails", async () => {
      const user = userEvent.setup();
      convertReply = { status: 502, body: { error: "Overloaded" } };
      open();
      await user.click(await screen.findByRole("button", { name: "Convert with model" }));
      await user.click(screen.getByRole("button", { name: "Send" }));

      expect(await screen.findByRole("alert")).toHaveTextContent("Overloaded");
      expect(screen.getByRole("textbox", { name: "Resume text editor" })).toHaveValue("# Jane\n\n- Built A");
      expect(screen.getByRole("status")).toHaveTextContent("All changes saved");
    });
  });
});
