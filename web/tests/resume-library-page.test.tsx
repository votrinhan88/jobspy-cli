import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ResumePage from "@/app/resume/page";

const json = (status: number, body: unknown) => ({ ok: status < 400, status, json: async () => body });

const meta = (tag: string, over: Record<string, unknown> = {}) => ({
  tag,

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
      json(200, { resumes: [meta("backend", { version: 2 }), meta("notes", { ext: "md" })] }),
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
const row = async (tag: string) => (await screen.findByRole("row", { name: tag })) as HTMLElement;
const detail = () => document.querySelector(".resume-preview") as HTMLElement;
const select = async (tag: string) => {
  const leaf = tag.split("-").pop() as string;
  await userEvent.click(within(await row(tag)).getByRole("button", { name: leaf }));
};
const more = async (tag: string) => {
  await select(tag);
  await userEvent.click(within(detail()).getByRole("button", { name: "More actions" }));
  return detail();
};
const opener = () => screen.getByRole("button", { name: "Create" });
const submitCreate = () =>
  within(screen.queryByRole("dialog") ?? document.body).getByRole("button", { name: "Create" });
const openImport = async () => {
  await row("backend");
  await userEvent.click(opener());
};

describe("Resume library page", () => {
  it("lists the resumes with version and date", async () => {
    render(<ResumePage />);
    expect(await row("backend")).toHaveTextContent("v2");
    await waitFor(() => expect(detail()).toHaveTextContent("backend"));
    expect(detail()).toHaveTextContent(/version 2/i);
    expect(detail()).toHaveTextContent("2026-11-02");
    await select("notes");
    expect(detail()).not.toHaveTextContent("notes.md");
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
    await select("backend");
    expect(screen.getByTitle("Resume viewer")).toHaveAttribute("src", "/api/resumes/backend/file#toolbar=0&navpanes=0&view=FitH");
    await select("notes");
    expect(await screen.findByLabelText("Resume preview")).toHaveTextContent("Notes text");
  });

  it("offers a download link for the original file", async () => {
    render(<ResumePage />);
    const link = within(await more("backend")).getByRole("menuitem", { name: "Download" });
    expect(link).toHaveAttribute("href", "/api/resumes/backend/file?download=1");
  });
});

describe("Resume rename", () => {
  it("renames in place when the user clicks the title", async () => {
    render(<ResumePage />);
    await row("backend");
    await userEvent.click(within(detail()).getByRole("button", { name: "backend" }));
    expect(screen.getByLabelText("New tag for backend")).toHaveValue("backend");
  });

  it("sends no request when the tag stays the same", async () => {
    render(<ResumePage />);
    await row("backend");
    await userEvent.click(within(detail()).getByRole("button", { name: "backend" }));
    await userEvent.type(screen.getByLabelText("New tag for backend"), "{Enter}");
    expect(calls("PATCH /api/resumes/backend")).toHaveLength(0);
    expect(screen.queryByLabelText("New tag for backend")).not.toBeInTheDocument();
  });
});

describe("Resume sort", () => {
  const order = () =>
    within(screen.getByRole("table", { name: "Resumes" }))
      .getAllByRole("row")
      .slice(1)
      .map((tr) => tr.getAttribute("aria-label"));

  beforeEach(() => {
    routes["GET /api/resumes"] = () =>
      json(200, {
        resumes: [
          { ...meta("beta"), importedAt: "2026-03-01T00:00:00Z" },
          { ...meta("alpha"), importedAt: "2026-01-01T00:00:00Z" },
          { ...meta("gamma"), importedAt: "2026-02-01T00:00:00Z", editedAt: "2026-05-01T00:00:00Z" },
        ],
      });
  });

  it("sorts by name from the start and flips on a second click", async () => {
    render(<ResumePage />);
    await row("alpha");
    expect(order()).toEqual(["alpha", "beta", "gamma"]);
    await userEvent.click(screen.getByRole("button", { name: /^Name/ }));
    expect(order()).toEqual(["gamma", "beta", "alpha"]);
    expect(screen.getByRole("columnheader", { name: /Name/ })).toHaveAttribute("aria-sort", "descending");
  });

  it("sorts by last edited, newest first, and keeps the choice", async () => {
    const { unmount } = render(<ResumePage />);
    await row("alpha");
    await userEvent.click(screen.getByRole("button", { name: /^Last edited/ }));
    expect(order()).toEqual(["gamma", "beta", "alpha"]);
    unmount();
    render(<ResumePage />);
    await row("alpha");
    expect(order()).toEqual(["gamma", "beta", "alpha"]);
    localStorage.clear();
  });
});

const manyResumes = (count: number) =>
  [
    meta("research-ai"),
    meta("research-web"),
    meta("engineer-ai"),
    meta("design-lead"),
    meta("data-ops"),
    meta("sales-ops"),
    meta("writer-lead"),
  ].slice(0, count);

describe("Resume tag filter", () => {
  it("hides the tag chips while the library has six or fewer resumes", async () => {
    routes["GET /api/resumes"] = () => json(200, { resumes: manyResumes(6) });
    render(<ResumePage />);
    await row("research-ai");
    expect(screen.queryByRole("group", { name: "Filter by tag" })).not.toBeInTheDocument();
  });

  it("shows the tag chips once the library has more than six resumes", async () => {
    routes["GET /api/resumes"] = () => json(200, { resumes: manyResumes(7) });
    render(<ResumePage />);
    await row("research-ai");
    expect(screen.getByRole("group", { name: "Filter by tag" })).toBeInTheDocument();
  });

  it("drops an active tag filter when the library shrinks to six resumes", async () => {
    let deleted = false;
    routes["GET /api/resumes"] = () => json(200, { resumes: deleted ? manyResumes(7).slice(1) : manyResumes(7) });
    routes["DELETE /api/resumes/research-ai"] = () => {
      deleted = true;
      return json(200, { ok: true });
    };
    render(<ResumePage />);
    await row("research-ai");
    await userEvent.click(screen.getByRole("button", { name: "ai 2" }));
    expect(screen.queryByRole("row", { name: "research-web" })).not.toBeInTheDocument();
    await userEvent.click(within(detail()).getByRole("button", { name: "More actions" }));
    await userEvent.click(within(detail()).getByRole("menuitem", { name: "Delete" }));
    await userEvent.click(screen.getByRole("button", { name: "Yes" }));
    expect(await row("research-web")).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Filter by tag" })).not.toBeInTheDocument();
  });

  it("filters with the tag chips and combines several", async () => {
    routes["GET /api/resumes"] = () => json(200, { resumes: manyResumes(7) });
    render(<ResumePage />);
    await row("research-ai");
    await userEvent.click(screen.getByRole("button", { name: "ai 2" }));
    expect(screen.queryByRole("row", { name: "research-web" })).not.toBeInTheDocument();
    expect(screen.getByRole("row", { name: "research-ai" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "research 2" }));
    expect(screen.queryByRole("row", { name: "engineer-ai" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "web 1" }));
    expect(screen.getByText(/no match/i)).toBeInTheDocument();
  });
});

describe("Resume page entry", () => {
  it("shows the preview pane from the start with the first resume selected", async () => {
    render(<ResumePage />);
    expect(within(await row("backend")).getByRole("button")).toHaveAttribute("aria-current", "true");
    expect(screen.queryByRole("button", { name: "View" })).not.toBeInTheDocument();
    expect(await screen.findByTitle("Resume viewer")).toBeInTheDocument();
  });

  it("lists the resumes first and keeps the import form closed", async () => {
    render(<ResumePage />);
    await row("backend");
    expect(screen.queryByLabelText("Tag")).not.toBeInTheDocument();
    expect(opener()).toBeInTheDocument();
  });

  it("makes Edit the primary action and hides the rare actions in the three-dot menu", async () => {
    render(<ResumePage />);
    await row("backend");
    expect(within(detail()).getByRole("button", { name: "Edit" })).toHaveClass("btn-primary");
    expect(within(detail()).queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
    await userEvent.click(within(detail()).getByRole("button", { name: "More actions" }));
    expect(within(detail()).getByRole("menuitem", { name: "Delete" })).toBeInTheDocument();
  });

  it("closes the menu with Escape and with a click outside", async () => {
    render(<ResumePage />);
    await more("backend");
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    await more("backend");
    await userEvent.click(document.body);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("opens the new resume form with the starter template when the user has no resumes", async () => {
    routes["GET /api/resumes"] = () => json(200, { resumes: [] });
    render(<ResumePage />);
    expect(await screen.findByLabelText("Tag")).toHaveValue("resume");
    expect(screen.getByRole("tab", { name: "Template" })).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByRole("tab", { name: "Fork" })).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
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
    await screen.findByLabelText("Tag");
    await userEvent.click(screen.getByRole("tab", { name: "Import" }));
    await userEvent.clear(screen.getByLabelText("Tag"));
    await userEvent.type(screen.getByLabelText("Tag"), "new-one");
    await userEvent.upload(screen.getByLabelText("Resume file"), file);
    await userEvent.click(submitCreate());
    expect(await row("new-one")).toBeInTheDocument();
    const body = calls("POST /api/resumes")[0][1].body as FormData;
    expect(body.get("tag")).toBe("new-one");
    expect((body.get("file") as File).name).toBe("cv.md");
  });

  it("creates from the starter template and opens the editor", async () => {
    let created = false;
    routes["GET /api/resumes"] = () => json(200, { resumes: created ? [meta("resume", { ext: "txt" })] : [] });
    routes["GET /api/resumes/resume"] = () => json(200, { meta: meta("resume"), text: "# Your Name" });
    routes["POST /api/resumes"] = () => {
      created = true;
      return json(200, { tag: "resume", version: 1 });
    };
    render(<ResumePage />);
    await screen.findByLabelText("Tag");
    await userEvent.click(submitCreate());
    await waitFor(() => expect(calls("POST /api/resumes")).toHaveLength(1));
    const body = calls("POST /api/resumes")[0][1].body as FormData;
    expect(body.get("tag")).toBe("resume");
    expect(body.get("text")).toContain("## Professional Summary");
    expect(await screen.findByRole("textbox", { name: "Resume text editor" })).toBeInTheDocument();
  });

  it("picks a default tag that does not collide", async () => {
    routes["GET /api/resumes"] = () => json(200, { resumes: [meta("resume"), meta("resume-2")] });
    render(<ResumePage />);
    await row("resume");
    await userEvent.click(opener());
    expect(screen.getByLabelText("Tag")).toHaveValue("resume-3");
  });

  it("forks an existing resume from the new resume form", async () => {
    routes["GET /api/resumes/backend"] = () => json(200, { text: "Backend text" });
    routes["POST /api/resumes"] = () => json(200, { tag: "backend-copy", version: 1 });
    render(<ResumePage />);
    await openImport();
    await userEvent.click(screen.getByRole("tab", { name: "Fork" }));
    await userEvent.selectOptions(screen.getByLabelText("Fork of"), "backend");
    expect(screen.getByLabelText("Tag")).toHaveValue("backend-copy");
    await userEvent.click(submitCreate());
    await waitFor(() => expect(calls("POST /api/resumes")).toHaveLength(1));
    const body = calls("POST /api/resumes")[0][1].body as FormData;
    expect(body.get("text")).toBe("Backend text");
    expect(body.get("parent")).toBe("backend");
  });

  it("blocks an invalid tag", async () => {
    render(<ResumePage />);
    await openImport();
    await userEvent.clear(screen.getByLabelText("Tag"));
    await userEvent.type(screen.getByLabelText("Tag"), "Bad Tag");
    expect(submitCreate()).toBeDisabled();
    expect(screen.getByText(/lowercase letters/i)).toBeInTheDocument();
  });

  it("shows the server error and keeps the form values", async () => {
    routes["POST /api/resumes"] = () => json(415, { error: "Use a PDF, TEX, MD or TXT file." });
    render(<ResumePage />);
    await openImport();
    await userEvent.click(screen.getByRole("tab", { name: "Import" }));
    await userEvent.clear(screen.getByLabelText("Tag"));
    await userEvent.type(screen.getByLabelText("Tag"), "x");
    await userEvent.upload(screen.getByLabelText("Resume file"), new File(["x"], "cv.docx"), { applyAccept: false });
    await userEvent.click(submitCreate());
    expect(await screen.findByRole("alert")).toHaveTextContent("Use a PDF, TEX, MD or TXT file.");
    expect(screen.getByLabelText("Tag")).toHaveValue("x");
  });

  it("disables Create for the file source until a file is chosen", async () => {
    render(<ResumePage />);
    await openImport();
    await userEvent.click(screen.getByRole("tab", { name: "Import" }));
    expect(submitCreate()).toBeDisabled();
    await userEvent.upload(screen.getByLabelText("Resume file"), file);
    expect(submitCreate()).toBeEnabled();
  });

  it("blocks Create when the tag already exists", async () => {
    render(<ResumePage />);
    await openImport();
    await userEvent.clear(screen.getByLabelText("Tag"));
    await userEvent.type(screen.getByLabelText("Tag"), "backend");
    expect(screen.getByText(/tag already exists/i)).toBeInTheDocument();
    expect(submitCreate()).toBeDisabled();
  });

  it("forks a resume under a new tag with its text", async () => {
    routes["GET /api/resumes/backend"] = () => json(200, { text: "Body text" });
    routes["POST /api/resumes"] = () => json(200, { tag: "backend-copy", version: 1 });
    render(<ResumePage />);
    await userEvent.click(within(await more("backend")).getByRole("menuitem", { name: "Fork" }));
    const input = screen.getByLabelText("Fork name for backend");
    expect(input).toHaveValue("backend-copy");
    await userEvent.click(screen.getByRole("button", { name: "Fork" }));
    await waitFor(() => expect(calls("POST /api/resumes")).toHaveLength(1));
    const sent = calls("POST /api/resumes")[0][1].body as FormData;
    expect(sent.get("tag")).toBe("backend-copy");
    expect(sent.get("text")).toBe("Body text");
    expect(sent.get("parent")).toBe("backend");
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
    await userEvent.click(await screen.findByRole("button", { name: "backend", description: "Rename" }));
    const input = screen.getByLabelText("New tag for backend");
    await userEvent.clear(input);
    await userEvent.type(input, "fresh{Enter}");
    expect(await row("fresh")).toBeInTheDocument();
    expect(JSON.parse(calls("PATCH /api/resumes/backend")[0][1].body)).toEqual({ tag: "fresh" });
  });

  it("shows a short message when the new tag exists", async () => {
    routes["PATCH /api/resumes/backend"] = () => json(409, { error: "exists" });
    render(<ResumePage />);
    await userEvent.click(await screen.findByRole("button", { name: "backend", description: "Rename" }));
    const input = screen.getByLabelText("New tag for backend");
    await userEvent.clear(input);
    await userEvent.type(input, "notes{Enter}");
    expect(await screen.findByRole("alert")).toHaveTextContent(/already exists/i);
  });

  it("closes the fork and delete popovers when the user clicks away", async () => {
    render(<ResumePage />);
    await userEvent.click(within(await more("backend")).getByRole("menuitem", { name: "Fork" }));
    expect(screen.getByLabelText("Fork name for backend")).toBeInTheDocument();
    await userEvent.click(document.body);
    expect(screen.queryByLabelText("Fork name for backend")).not.toBeInTheDocument();

    await userEvent.click(within(await more("backend")).getByRole("menuitem", { name: "Delete" }));
    expect(screen.getByText("Delete backend?")).toBeInTheDocument();
    await userEvent.click(document.body);
    expect(screen.queryByText("Delete backend?")).not.toBeInTheDocument();
  });

  it("has no Rename item in the more menu", async () => {
    render(<ResumePage />);
    expect(within(await more("backend")).queryByRole("menuitem", { name: "Rename" })).not.toBeInTheDocument();
  });

  it("cancels a rename without a request", async () => {
    render(<ResumePage />);
    await userEvent.click(await screen.findByRole("button", { name: "backend", description: "Rename" }));
    await userEvent.keyboard("{Escape}");
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
    await userEvent.click(within(await more("backend")).getByRole("menuitem", { name: "Delete" }));
    expect(calls("DELETE /api/resumes/backend")).toHaveLength(0);
    expect(screen.getByText(/delete backend\?/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Yes" }));
    await waitFor(() => expect(screen.queryByRole("row", { name: "backend" })).not.toBeInTheDocument());
  });

  it("keeps the resume when the user cancels the delete", async () => {
    render(<ResumePage />);
    await userEvent.click(within(await more("backend")).getByRole("menuitem", { name: "Delete" }));
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(calls("DELETE /api/resumes/backend")).toHaveLength(0);
    expect(await row("backend")).toBeInTheDocument();
  });
});

describe("Resume row selection", () => {
  const selectedName = async (tag: string) =>
    within(await row(tag)).getByRole("button", { name: tag });

  it("selects a resume when the user clicks anywhere on its row", async () => {
    render(<ResumePage />);
    await row("backend");
    const cells = within(await row("notes")).getAllByRole("cell");
    await userEvent.click(cells[cells.length - 1]);
    expect(await selectedName("notes")).toHaveAttribute("aria-current", "true");
    expect(await screen.findByLabelText("Resume preview")).toHaveTextContent("Notes text");
  });

  it("keeps the name button as the keyboard control for the row", async () => {
    render(<ResumePage />);
    await row("backend");
    const name = await selectedName("notes");
    name.focus();
    await userEvent.keyboard("{Enter}");
    expect(name).toHaveAttribute("aria-current", "true");
  });
});

describe("Resume page editing", () => {
  const edit = async (tag: string) => {
    await select(tag);
    await userEvent.click(within(detail()).getByRole("button", { name: "Edit" }));
    await screen.findByRole("textbox", { name: "Resume text editor" });
  };

  it("opens the editor from the Edit button", async () => {
    render(<ResumePage />);
    await edit("notes");
    expect(screen.getByRole("textbox", { name: "Resume text editor" })).toHaveValue("Notes text");
  });

  it("shows the editor as its own page without the list and returns with Back", async () => {
    render(<ResumePage />);
    await edit("notes");

    expect(screen.queryByRole("table", { name: "Resumes" })).not.toBeInTheDocument();
    expect(within(detail()).getByRole("heading", { name: "notes" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(await screen.findByRole("button", { name: "Edit" })).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Resume text editor" })).not.toBeInTheDocument();
    expect(await row("backend")).toBeInTheDocument();
  });

  it("asks before Back drops unsaved changes", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<ResumePage />);
    await edit("notes");
    await userEvent.type(screen.getByRole("textbox", { name: "Resume text editor" }), " more");
    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("textbox", { name: "Resume text editor" })).toBeInTheDocument();
    confirm.mockReturnValue(true);
    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.queryByRole("textbox", { name: "Resume text editor" })).not.toBeInTheDocument();
    confirm.mockRestore();
  });

  it("marks an edited resume in the list", async () => {
    routes["GET /api/resumes"] = () => json(200, { resumes: [meta("notes", { ext: "md", edited: true, version: 2 })] });
    render(<ResumePage />);
    await row("notes");
    await waitFor(() => expect(detail()).toHaveTextContent("edited"));
  });
});
