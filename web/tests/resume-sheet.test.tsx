import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { ResumeSheet } from "@/app/resume/_components/resume-sheet";

const TEXT = [
  "# Jane Smith",
  "",
  "jane@example.com | Melbourne",
  "",
  "## Education",
  "",
  "### Deakin University :: July 2023 – July 2025",
  "",
  "Master of Data Science",
  "",
  "*Applied machine learning*",
  "",
  "- **Award:** Winner of InnoFes 2024",
].join("\n");

describe("ResumeSheet contact icons", () => {
  const text = [
    "# Jane Smith",
    "",
    "Melbourne, VIC | +61 400 000 000 | [jane@example.com](mailto:jane@example.com) | [GitHub](https://github.com/jane)",
    "",
    "## Skills",
    "",
    "Python | C++",
  ].join("\n");
  const kindsOf = (container: HTMLElement) =>
    [...container.querySelectorAll(".resume-contact-icon")].map((node) => node.getAttribute("data-kind"));

  it("puts an icon before each item of the contact line", () => {
    const { container } = render(<ResumeSheet text={text} />);
    expect(kindsOf(container)).toEqual(["location", "phone", "mail", "github"]);
  });

  it("adds no icon to an item it does not recognise", () => {
    const { container } = render(<ResumeSheet text={"# Jane\n\nMelbourne, VIC | Open to relocation"} />);
    expect(kindsOf(container)).toEqual(["location"]);
    expect(container).toHaveTextContent("Open to relocation");
  });

  it("hides the icons from screen readers", () => {
    const { container } = render(<ResumeSheet text={text} />);
    for (const node of container.querySelectorAll(".resume-contact-icon")) {
      expect(node).toHaveAttribute("aria-hidden", "true");
    }
  });
});

describe("ResumeSheet", () => {
  it("shows an entry heading with the dates in their own right-hand part", () => {
    render(<ResumeSheet text={TEXT} />);
    const heading = screen.getByRole("heading", { level: 3 });
    expect(within(heading).getByText("Deakin University")).toBeInTheDocument();
    expect(within(heading).getByText("July 2023 – July 2025")).toHaveClass("resume-row-end");
  });

  it("shows bold and italic spans as strong and em text", () => {
    render(<ResumeSheet text={TEXT} />);
    expect(screen.getByText("Award:").tagName).toBe("STRONG");
    expect(screen.getByText("Applied machine learning").tagName).toBe("EM");
  });

  it("splits a plain line on the separator too", () => {
    render(<ResumeSheet text={"Deakin :: 2022"} />);
    expect(screen.getByText("2022")).toHaveClass("resume-row-end");
  });

  it("shows a link as a real anchor that opens in a new tab", () => {
    render(<ResumeSheet text={"[GitHub](https://github.com/example)"} />);
    const link = screen.getByRole("link", { name: "GitHub" });
    expect(link).toHaveAttribute("href", "https://github.com/example");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
  });

  it("does not make an anchor from an unsafe address", () => {
    render(<ResumeSheet text={"[x](javascript:alert(1))"} />);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("is a labelled article with no raw markup", () => {
    render(<ResumeSheet text={"**x**"} />);
    const sheet = screen.getByRole("article", { name: "Resume preview" });
    expect(sheet).not.toHaveTextContent("**");
  });
});
