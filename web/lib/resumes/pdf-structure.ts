import { CONTACT_SEPARATOR, contactKind } from "@/lib/resumes/preview";

export interface PdfItem {
  str: string;
  x: number;
  y: number;
  size: number;
  width: number;
}

interface PdfLine {
  page: number;
  x: number;
  y: number;
  size: number;
  segments: string[];
  text: string;
}

const SAME_LINE = 0.5;
const SEGMENT_GAP = 3;
const WORD_GAP = 0.15;
const HEADING_RATIO = 1.15;
const PARAGRAPH_GAP = 1.5;
const BULLET = /^(?:[•◦▪▫●○·‣⁃▸►]|[-–—*](?=\s))\s*(.+)$/;
const DATE = /(?:\b(?:19|20)\d{2}\b|\bpresent\b|\bcurrent\b)/i;
const CONTACT_SPLIT = /\s*[|•·●▪]\s*/;
const MAX_DATE_LENGTH = 30;
const PAGE_NUMBER = /^\d{1,3}$/;
// An icon font maps each icon to a short run of odd characters, with no ASCII letter or digit.
const ICON_TOKEN = /^[^\sA-Za-z0-9]{1,2}\s+(?=\S)/;

function round(size: number): number {
  return Math.round(size * 2) / 2;
}

function toLines(pages: PdfItem[][]): PdfLine[] {
  const lines: PdfLine[] = [];
  pages.forEach((items, page) => {
    const sorted = items.filter((item) => item.str.trim() !== "").sort((a, b) => b.y - a.y || a.x - b.x);
    let group: PdfItem[] = [];
    const flush = () => {
      if (group.length === 0) return;
      group.sort((a, b) => a.x - b.x);
      const segments: string[] = [""];
      let previousEnd = group[0].x;
      for (const item of group) {
        const gap = item.x - previousEnd;
        const current = segments.length - 1;
        if (segments[current] !== "" && gap > item.size * SEGMENT_GAP) segments.push(item.str.trim());
        else if (segments[current] === "") segments[current] = item.str.trim();
        else {
          const joined = gap > item.size * WORD_GAP && !/\s$/.test(segments[current]) && !/^\s/.test(item.str);
          segments[current] += (joined ? " " : "") + item.str;
        }
        previousEnd = item.x + item.width;
      }
      const clean = segments.map((s) => s.replace(/\s+/g, " ").trim()).filter((s) => s !== "");
      const heaviest = group.reduce((best, item) => (item.str.length > best.str.length ? item : best));
      lines.push({
        page,
        x: group[0].x,
        y: group[0].y,
        size: heaviest.size,
        segments: clean,
        text: clean.join(" "),
      });
      group = [];
    };
    for (const item of sorted) {
      if (group.length > 0 && Math.abs(item.y - group[0].y) > item.size * SAME_LINE) flush();
      group.push(item);
    }
    flush();
  });
  return lines;
}

function withoutPageNumbers(lines: PdfLine[]): PdfLine[] {
  const lowest = new Map<number, PdfLine>();
  for (const line of lines) {
    const current = lowest.get(line.page);
    if (!current || line.y < current.y) lowest.set(line.page, line);
  }
  return lines.filter((line) => !(lowest.get(line.page) === line && PAGE_NUMBER.test(line.text)));
}

function bodySize(lines: PdfLine[]): number {
  const weight = new Map<number, number>();
  for (const line of lines) weight.set(round(line.size), (weight.get(round(line.size)) ?? 0) + line.text.length);
  return [...weight.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

function contactLine(line: PdfLine): string | null {
  let parts = line.text.split(CONTACT_SPLIT).filter((p) => p !== "");
  if (parts.length < 2) parts = line.segments;
  if (parts.length < 2) return null;
  parts = parts.map((part) => part.replace(ICON_TOKEN, "")).filter((p) => p !== "");
  return parts.some((part) => contactKind(part) !== null) ? parts.join(CONTACT_SEPARATOR) : null;
}

// Reads headings, bullets, the contact line and right-edge dates from font size and position.
// It returns null when the pages show none of them, so the caller keeps the plain text.
export function structurePdf(pages: PdfItem[][]): string | null {
  const lines = withoutPageNumbers(toLines(pages));
  if (lines.length === 0) return null;

  const body = bodySize(lines);
  const headingSizes = [...new Set(lines.map((l) => round(l.size)).filter((s) => s > body * HEADING_RATIO))].sort(
    (a, b) => b - a
  );
  const topSize = headingSizes[0];
  const topIsTitleOnly = topSize !== undefined && lines.filter((l) => round(l.size) === topSize).length === 1 && round(lines[0].size) === topSize;
  const firstLevel = topIsTitleOnly ? 1 : 2;

  type Block = { kind: "heading" | "paragraph" | "bullet"; text: string; line: PdfLine; textX: number; lastY: number };
  const blocks: Block[] = [];
  let structured = false;
  let afterTitle = false;

  for (const line of lines) {
    const rank = headingSizes.indexOf(round(line.size));
    if (rank !== -1) {
      const level = Math.min(3, rank + firstLevel);
      blocks.push({ kind: "heading", text: `${"#".repeat(level)} ${line.text}`, line, textX: line.x, lastY: line.y });
      structured = true;
      afterTitle = level === 1;
      continue;
    }
    if (afterTitle) {
      afterTitle = false;
      const contact = contactLine(line);
      if (contact) {
        blocks.push({ kind: "paragraph", text: contact, line, textX: line.x, lastY: line.y });
        continue;
      }
    }
    const bullet = BULLET.exec(line.text);
    const previous = blocks.at(-1);
    if (bullet) {
      structured = true;
      blocks.push({ kind: "bullet", text: bullet[1], line, textX: line.x + line.size, lastY: line.y });
      continue;
    }
    const closeBelow = previous && previous.line.page === line.page && previous.lastY - line.y <= line.size * PARAGRAPH_GAP;
    if (previous?.kind === "bullet" && closeBelow && line.x >= previous.textX - 1) {
      previous.text += ` ${line.text}`;
      previous.lastY = line.y;
      continue;
    }
    const last = line.segments.at(-1)!;
    const row =
      line.segments.length > 1 && DATE.test(last) && last.length <= MAX_DATE_LENGTH
        ? `${line.segments.slice(0, -1).join(" ")} :: ${last}`
        : line.text;
    if (previous?.kind === "paragraph" && closeBelow) {
      previous.text =
        /[a-z]-$/.test(previous.text) && /^[a-z]/.test(row) ? previous.text.slice(0, -1) + row : `${previous.text}\n${row}`;
      previous.lastY = line.y;
    } else {
      blocks.push({ kind: "paragraph", text: row, line, textX: line.x, lastY: line.y });
    }
  }

  if (!structured) return null;
  const out: string[] = [];
  blocks.forEach((block, index) => {
    const before = blocks[index - 1];
    if (before && !(before.kind === "bullet" && block.kind === "bullet")) out.push("");
    out.push(block.kind === "bullet" ? `- ${block.text}` : block.text);
  });
  return out.join("\n");
}
