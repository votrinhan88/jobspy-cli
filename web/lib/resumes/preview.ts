export type ResumeBlock =
  | { kind: "h1" | "h2" | "h3" | "p"; text: string }
  | { kind: "list"; items: string[] };

const HEADING = /^(#{1,3})\s+(.*)$/;
const BULLET = /^[-*]\s+(.*)$/;

// A small reader for the Markdown a resume needs. It returns data, not HTML, so the page never injects raw markup.
export function parseResume(text: string): ResumeBlock[] {
  const blocks: ResumeBlock[] = [];
  let paragraph: string[] = [];
  let list: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length > 0) blocks.push({ kind: "p", text: paragraph.join("\n") });
    paragraph = [];
  };
  const flushList = () => {
    if (list.length > 0) blocks.push({ kind: "list", items: list });
    list = [];
  };

  for (const raw of text.split("\n")) {
    const line = raw.trim();
    const heading = HEADING.exec(line);
    const bullet = BULLET.exec(line);
    if (line === "") {
      flushParagraph();
      flushList();
    } else if (heading) {
      flushParagraph();
      flushList();
      blocks.push({ kind: `h${heading[1].length}` as "h1" | "h2" | "h3", text: heading[2] });
    } else if (bullet) {
      flushParagraph();
      list.push(bullet[1]);
    } else {
      flushList();
      paragraph.push(line);
    }
  }
  flushParagraph();
  flushList();
  return blocks;
}

export type Span = { text: string; bold?: boolean; italic?: boolean; href?: string };

// A star opens or closes emphasis only next to a letter, so "5 * 3" stays text.
const INLINE = /\[([^\]]+)\]\(((?:[^()\s]|\([^()\s]*\))+)\)|\*\*(\S(?:.*?\S)?)\*\*|\*(\S(?:.*?\S)?)\*/g;
const SAFE_ADDRESS = /^(https?:\/\/|mailto:)/i;

export function parseInline(text: string): Span[] {
  const spans: Span[] = [];
  let last = 0;
  for (const match of text.matchAll(INLINE)) {
    if (match.index > last) spans.push({ text: text.slice(last, match.index) });
    if (match[1] !== undefined) {
      spans.push(SAFE_ADDRESS.test(match[2]) ? { text: match[1], href: match[2] } : { text: match[1] });
    } else if (match[3] !== undefined) {
      spans.push({ text: match[3], bold: true });
    } else {
      spans.push({ text: match[4], italic: true });
    }
    last = match.index + match[0].length;
  }
  if (last < text.length) spans.push({ text: text.slice(last) });
  return spans.length > 0 ? spans : [{ text }];
}

const ROW_SEPARATOR = " :: ";

// The part after the separator sits at the right edge of the line, as dates do on a printed resume.
export function splitRow(line: string): [string, string | null] {
  const at = line.indexOf(ROW_SEPARATOR);
  if (at === -1) return [line, null];
  return [line.slice(0, at).trim(), line.slice(at + ROW_SEPARATOR.length).trim()];
}

export type ContactKind = "mail" | "phone" | "location" | "linkedin" | "github" | "scholar" | "web";

const EMAIL = /^\S+@\S+\.\S+$/;
// A place reads as "City, Region" or "City, Country". Anything else gets no icon rather than a guess.
const PLACE = /^[\p{L}][\p{L}\s.'-]*,\s*[\p{L}][\p{L}\s.'-]*$/u;
const PHONE = /^\+?[\d\s().-]{7,}$/;

// Names the icon for one item of the contact line, by its link target or by the shape of its text.
// A link to an unknown site gets the generic web icon. Plain text that fits no shape gets none.
export function contactKind(item: string): ContactKind | null {
  const [span] = parseInline(item.trim());
  const href = span?.href;
  if (href) {
    if (/^mailto:/i.test(href)) return "mail";
    if (/linkedin\.com/i.test(href)) return "linkedin";
    if (/github\.com/i.test(href)) return "github";
    if (/scholar\.google\./i.test(href)) return "scholar";
    return "web";
  }
  const text = item.trim();
  if (EMAIL.test(text)) return "mail";
  if (PHONE.test(text)) return "phone";
  return PLACE.test(text) ? "location" : null;
}

export const CONTACT_SEPARATOR = " | ";
