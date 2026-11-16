import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Briefcase, Code, GraduationCap, Globe, Mail, MapPin, Phone, type LucideIcon } from "lucide-react";
import { CONTACT_SEPARATOR, type ContactKind, contactKind, parseInline, parseResume, splitRow } from "@/lib/resumes/preview";

const CONTACT_ICON: Record<ContactKind, LucideIcon> = {
  mail: Mail,
  phone: Phone,
  location: MapPin,
  linkedin: Briefcase,
  github: Code,
  scholar: GraduationCap,
  web: Globe,
};

function ContactLine({ text }: { text: string }) {
  const items = text.split(CONTACT_SEPARATOR);
  return (
    <>
      {items.map((item, i) => {
        const kind = contactKind(item);
        const Icon = kind ? CONTACT_ICON[kind] : null;
        return (
          <span key={i} className="resume-contact-item">
            {i > 0 && <span className="resume-contact-sep">{"|"}</span>}
            {Icon && <Icon className="resume-contact-icon" data-kind={kind} aria-hidden="true" />}
            <Inline text={item.trim()} />
          </span>
        );
      })}
    </>
  );
}

function Inline({ text }: { text: string }) {
  return (
    <>
      {parseInline(text).map((span, i) => {
        if (span.href) {
          return (
            <a key={i} href={span.href} target="_blank" rel="noopener noreferrer" className="resume-link">
              {span.text}
            </a>
          );
        }
        if (span.bold) return <strong key={i}>{span.text}</strong>;
        if (span.italic) return <em key={i}>{span.text}</em>;
        return span.text;
      })}
    </>
  );
}

function Line({ text }: { text: string }) {
  const [start, end] = splitRow(text);
  if (end === null) return <Inline text={start} />;
  return (
    <span className="resume-row">
      <span>
        <Inline text={start} />
      </span>
      <span className="resume-row-end">
        <Inline text={end} />
      </span>
    </span>
  );
}

// 210 mm in CSS pixels. The page is shrunk as a whole, so the text wraps exactly as it does on paper.
const PAGE_WIDTH_PX = 793.7;

export function ResumeSheet({ text }: { text: string }) {
  const blocks = useMemo(() => parseResume(text), [text]);
  const frame = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const node = frame.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => setScale(Math.min(1, node.clientWidth / PAGE_WIDTH_PX)));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={frame} className="resume-sheet-frame">
      <article aria-label="Resume preview" className="resume-sheet" style={{ zoom: scale }}>
        {blocks.map((block, i): ReactNode => {
          const isContact = block.kind === "p" && i > 0 && blocks[i - 1].kind === "h1";
          if (block.kind === "list") {
            return (
              <ul key={i}>
                {block.items.map((item, j) => (
                  <li key={j}>
                    <Line text={item} />
                  </li>
                ))}
              </ul>
            );
          }
          if (block.kind === "p") {
            return (
              <p key={i}>
                {block.text.split("\n").map((line, j) => (
                  <span key={j} className="resume-line">
                    {isContact ? <ContactLine text={line} /> : <Line text={line} />}
                  </span>
                ))}
              </p>
            );
          }
          const Tag = block.kind;
          return (
            <Tag key={i}>
              <Line text={block.text} />
            </Tag>
          );
        })}
      </article>
    </div>
  );
}
