import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ResumePage from "@/app/resume/page";

const json = (status: number, body: unknown) => ({ ok: status < 400, status, json: async () => body });

const meta = (tag: string, over: Record<string, unknown> = {}) => ({
  tag,
  fileName: `${tag}.pdf`,
  ext: "pdf",
  importedAt: "2026-11-02T10:00:00.000Z",
  version: 1,
  textHash: "h",
  ...over,
});

let routes: Record<string, (init?: RequestInit) => ReturnType<typeof json>>;
const fetchMock = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  routes = {
    "GET /api/resumes": () =>
      json(200, { resumes: [meta("backend", { version: 2 }), meta("notes", { ext: "md", fileName: "notes.md" })] }),
    "GET /api/resumes/notes": () => json(200, { meta: meta("notes"), text: "Notes text" }),
  };
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    const key = `${init?.method ?? "GET"} ${url}`;
    const handler = routes[key];
    if (!handler) throw new Error(`Unexpected request: ${key}`);
    return handler(init);
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const calls = (key: string) => fetchMock.mock.calls.filter(([url, init]) => `${init?.method ?? "GET"} ${url}` === key);
const row = async (tag: string) => (await screen.findByRole("listitem", { name: tag })) as HTMLElement;

describe("Resume library page", () => {
  it("lists the resumes with file name, version and import date", async () => {
    render(<ResumePage />);
    const backend = await row("backend");
    expect(backend).toHaveTextContent("backend.pdf");
    expect(backend).toHaveTextContent(/version 2/i);
    expect(backend).toHaveTextContent("2026-11-02");
    expect(await row("notes")).toHaveTextContent("notes.md");
  });

  it("shows a short note when there are no resumes", async () => {
    routes["GET /api/resumes"] = () => json(200, { resumes: [] });
    render(<ResumePage />);
    expect(await screen.findByText(/no resumes yet/i)).toBeInTheDocument();
  });

  it("points to the Profile page when there is no active profile", async () => {
    routes["GET /api/resumes"] = () => json(400, { error: "No active profile" });
    render(<ResumePage />);
    expect(await screen.findByRole("link", { name: /create a profile/i })).toHaveAttribute("href", "/profile");
  });

  it("shows an error when the list cannot be loaded", async () => {
    routes["GET /api/resumes"] = () => json(500, { error: "boom" });
    render(<ResumePage />);
    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });

  it("views a pdf resume in the viewer and a text resume as text", async () => {
    render(<ResumePage />);
    await userEvent.click(within(await row("backend")).getByRole("button", { name: "View" }));
    expect(screen.getByTitle("Resume viewer")).toHaveAttribute("src", "/api/resumes/backend/file");
    await userEvent.click(within(await row("notes")).getByRole("button", { name: "View" }));
    expect(await screen.findByLabelText("Resume text")).toHaveTextContent("Notes text");
  });

  it("offers a download link for the original file", async () => {
    render(<ResumePage />);
    const link = within(await row("backend")).getByRole("link", { name: "Download" });
    expect(link).toHaveAttribute("href", "/api/resumes/backend/file?download=1");
  });
});

describe("Resume library import", () => {
  const file = new File(["# Jane"], "cv.md", { type: "text/markdown" });

  it("sends the tag and the chosen file, then reloads the list", async () => {
    let imported = false;
    routes["GET /api/resumes"] = () => json(200, { resumes: imported ? [meta("new-one")] : [] });
    routes["POST /api/resumes"] = () => {
      imported = true;
      return json(200, { tag: "new-one", version: 1 });
    };
    render(<ResumePage />);
    await screen.findByText(/no resumes yet/i);
    await userEvent.type(screen.getByLabelText("Tag"), "new-one");
    await userEvent.upload(screen.getByLabelText("Resume file"), file);
    await userEvent.click(screen.getByRole("button", { name: "Import" }));
    expect(await row("new-one")).toBeInTheDocument();
    const body = calls("POST /api/resumes")[0][1].body as FormData;
    expect(body.get("tag")).toBe("new-one");
    expect((body.get("file") as File).name).toBe("cv.md");
  });

  it("sends pasted text when the user switches to paste", async () => {
    routes["POST /api/resumes"] = () => json(200, { tag: "pasted", version: 1 });
    render(<ResumePage />);
    await row("backend");
    await userEvent.click(screen.getByRole("button", { name: /paste text instead/i }));
    await userEvent.type(screen.getByLabelText("Tag"), "pasted");
    await userEvent.type(screen.getByLabelText("Resume text"), "Python and SQL");
    await userEvent.click(screen.getByRole("button", { name: "Import" }));
    await waitFor(() => expect(calls("POST /api/resumes")).toHaveLength(1));
    const body = calls("POST /api/resumes")[0][1].body as FormData;
    expect(body.get("text")).toBe("Python and SQL");
    expect(body.get("file")).toBeNull();
  });

  it("shows the server error and keeps the form values", async () => {
    routes["POST /api/resumes"] = () => json(415, { error: "Use a PDF, TEX, MD or TXT file." });
    render(<ResumePage />);
    await row("backend");
    await userEvent.type(screen.getByLabelText("Tag"), "x");
    await userEvent.upload(screen.getByLabelText("Resume file"), new File(["x"], "cv.docx"), { applyAccept: false });
    await userEvent.click(screen.getByRole("button", { name: "Import" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Use a PDF, TEX, MD or TXT file.");
    expect(screen.getByLabelText("Tag")).toHaveValue("x");
  });

  it("disables Import until there is a tag and a file or text", async () => {
    render(<ResumePage />);
    await row("backend");
    expect(screen.getByRole("button", { name: "Import" })).toBeDisabled();
    await userEvent.type(screen.getByLabelText("Tag"), "x");
    expect(screen.getByRole("button", { name: "Import" })).toBeDisabled();
    await userEvent.upload(screen.getByLabelText("Resume file"), file);
    expect(screen.getByRole("button", { name: "Import" })).toBeEnabled();
  });

  it("warns that a tag that exists will be replaced", async () => {
    render(<ResumePage />);
    await row("backend");
    await userEvent.type(screen.getByLabelText("Tag"), "backend");
    expect(screen.getByText(/replaces the resume with this tag/i)).toBeInTheDocument();
  });

  it("fills the tag when the user clicks Replace", async () => {
    render(<ResumePage />);
    await userEvent.click(within(await row("backend")).getByRole("button", { name: "Replace" }));
    expect(screen.getByLabelText("Tag")).toHaveValue("backend");
  });
});

describe("Resume library rename and delete", () => {
  it("renames a resume and shows the new tag", async () => {
    let renamed = false;
    routes["GET /api/resumes"] = () => json(200, { resumes: renamed ? [meta("fresh")] : [meta("backend")] });
    routes["PATCH /api/resumes/backend"] = () => {
      renamed = true;
      return json(200, { tag: "fresh" });
    };
    render(<ResumePage />);
    await userEvent.click(within(await row("backend")).getByRole("button", { name: "Rename" }));
    await userEvent.type(screen.getByLabelText("New tag for backend"), "fresh");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await row("fresh")).toBeInTheDocument();
    expect(JSON.parse(calls("PATCH /api/resumes/backend")[0][1].body)).toEqual({ tag: "fresh" });
  });

  it("shows a short message when the new tag exists", async () => {
    routes["PATCH /api/resumes/backend"] = () => json(409, { error: "exists" });
    render(<ResumePage />);
    await userEvent.click(within(await row("backend")).getByRole("button", { name: "Rename" }));
    await userEvent.type(screen.getByLabelText("New tag for backend"), "notes");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/already exists/i);
  });

  it("cancels a rename without a request", async () => {
    render(<ResumePage />);
    await userEvent.click(within(await row("backend")).getByRole("button", { name: "Rename" }));
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByLabelText("New tag for backend")).not.toBeInTheDocument();
    expect(calls("PATCH /api/resumes/backend")).toHaveLength(0);
  });

  it("asks for a confirmation in the row before it deletes", async () => {
    let deleted = false;
    routes["GET /api/resumes"] = () =>
      json(200, { resumes: deleted ? [meta("notes")] : [meta("backend"), meta("notes")] });
    routes["DELETE /api/resumes/backend"] = () => {
      deleted = true;
      return json(200, { ok: true });
    };
    render(<ResumePage />);
    await userEvent.click(within(await row("backend")).getByRole("button", { name: "Delete" }));
    expect(calls("DELETE /api/resumes/backend")).toHaveLength(0);
    expect(screen.getByText(/delete backend\?/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Yes" }));
    await waitFor(() => expect(screen.queryByRole("listitem", { name: "backend" })).not.toBeInTheDocument());
  });

  it("keeps the resume when the user cancels the delete", async () => {
    render(<ResumePage />);
    await userEvent.click(within(await row("backend")).getByRole("button", { name: "Delete" }));
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(calls("DELETE /api/resumes/backend")).toHaveLength(0);
    expect(await row("backend")).toBeInTheDocument();
  });
});
