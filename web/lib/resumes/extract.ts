import path from "path";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { type PdfItem, structurePdf } from "@/lib/resumes/pdf-structure";

const SUPPORTED_EXTENSIONS = new Set(["pdf", "tex", "md", "txt"]);

const PREAMBLE_OR_ENVIRONMENT = /\\(?:documentclass|usepackage)(?:\[[^\]]*\])?\{[^}]*\}|\\(?:begin|end)\{[^}]*\}/g;

export function fileExtension(fileName: string): string {
  return path.extname(fileName).slice(1).toLowerCase();
}

export function isSupportedFile(fileName: string): boolean {
  return SUPPORTED_EXTENSIONS.has(fileExtension(fileName));
}

export function normalizeText(text: string): string {
  return text.replace(/^﻿/, "").replace(/\r\n?/g, "\n").trim();
}

export async function extractText(fileName: string, bytes: Uint8Array): Promise<string> {
  const ext = fileExtension(fileName);
  if (!SUPPORTED_EXTENSIONS.has(ext)) {
    throw new Error(`Unsupported file type: .${ext}`);
  }
  if (ext === "pdf") return extractPdfText(bytes);
  const text = new TextDecoder("utf-8").decode(bytes);
  if (ext === "tex") return stripLatex(text);
  return normalizeText(text);
}

function stripLatex(source: string): string {
  // Escapes must be read before command removal, and comments before escapes,
  // so that "\%" is kept as a percent sign rather than starting a comment.
  const withoutComments = source.replace(/(?<!\\)%.*$/gm, "");
  const withoutPreamble = withoutComments.replace(PREAMBLE_OR_ENVIRONMENT, "");
  const withLinkLabels = withoutPreamble.replace(/\\href\{[^}]*\}\{([^}]*)\}/g, "$1");
  const withoutItems = withLinkLabels.replace(/\\item\b/g, "");
  const withEscapes = withoutItems.replace(/\\([&%$#])/g, "$1");
  const withoutCommands = withEscapes.replace(/\\[a-zA-Z]+\*?|\\[^a-zA-Z\s]/g, "");
  const withoutBraces = withoutCommands.replace(/[{}]/g, "");
  const lines = withoutBraces.split("\n").map((line) => line.trim());
  return normalizeText(lines.join("\n").replace(/\n{3,}/g, "\n\n"));
}

async function extractPdfText(bytes: Uint8Array): Promise<string> {
  // pdfjs takes ownership of the buffer it is given, so the caller's copy must stay intact.
  const task = getDocument({ data: new Uint8Array(bytes), useSystemFonts: true });
  try {
    const document = await task.promise;
    const pages: string[] = [];
    const placed: PdfItem[][] = [];
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber++) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      let pageText = "";
      const pageItems: PdfItem[] = [];
      for (const item of content.items) {
        if (!("str" in item)) continue;
        pageItems.push({
          str: item.str,
          x: item.transform[4],
          y: item.transform[5],
          size: Math.hypot(item.transform[0], item.transform[1]) || item.height,
          width: item.width,
        });
        pageText += item.str;
        if (item.hasEOL) pageText += "\n";
      }
      pages.push(pageText);
      placed.push(pageItems);
    }
    const structured = structurePdf(placed);
    if (structured) return normalizeText(structured);
    const lines = pages
      .join("\n\n")
      .split("\n")
      .map((line) => line.replace(/ +/g, " ").trim());
    return normalizeText(lines.join("\n").replace(/\n{3,}/g, "\n\n"));
  } catch {
    throw new Error("The PDF could not be read");
  } finally {
    await task.destroy();
  }
}
