import { randomUUID } from "crypto";
import type { Dirent } from "fs";
import fs from "fs/promises";
import path from "path";
import { hashText } from "../hash";
import { resumeLibraryDir, resumeLibraryItemDir } from "../profile";
import { isValidTag } from "../tag";
import { extractText, fileExtension, isSupportedFile, normalizeText } from "./extract";

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const TEMP_PREFIX = ".tmp-";
const META_FILE = "meta.json";
const TEXT_FILE = "text.txt";

export interface ResumeMeta {
  tag: string;
  ext: string;
  importedAt: string;
  version: number;
  textHash: string;
  edited?: boolean;
  editedAt?: string;
  parent?: string;
}

export type ImportResult =
  | { ok: true; tag: string; version: number }
  | { ok: false; reason: "invalid_tag" | "unsupported_type" | "too_large" | "unreadable" | "empty" };

export type RenameResult =
  | { ok: true; tag: string }
  | { ok: false; reason: "not_found" | "exists" | "invalid_tag" };

export type SaveTextResult =
  | { ok: true; version: number }
  | { ok: false; reason: "invalid_tag" | "not_found" | "empty" };

export type RewriteResult =
  | { ok: true; text: string }
  | { ok: false; reason: "not_found" | "ambiguous" };

export type DeleteResult = { ok: true } | { ok: false; reason: "not_found" };

export interface OriginalFile {
  ext: string;
  bytes: Uint8Array;
}

interface StoredFile {
  ext: string;
  bytes: Uint8Array;
  text: string;
}

function isMeta(value: unknown, tag: string): value is ResumeMeta {
  if (typeof value !== "object" || value === null) return false;
  const meta = value as Record<string, unknown>;
  return (
    meta.tag === tag &&
    typeof meta.ext === "string" &&
    typeof meta.importedAt === "string" &&
    typeof meta.version === "number" &&
    typeof meta.textHash === "string"
  );
}

async function readMeta(profile: string, tag: string): Promise<ResumeMeta | null> {
  try {
    const raw = await fs.readFile(path.join(resumeLibraryItemDir(profile, tag), META_FILE), "utf-8");
    const parsed: unknown = JSON.parse(raw);
    return isMeta(parsed, tag) ? parsed : null;
  } catch {
    return null;
  }
}

async function isDirectory(dir: string): Promise<boolean> {
  try {
    return (await fs.stat(dir)).isDirectory();
  } catch {
    return false;
  }
}

export async function listResumes(profile: string): Promise<ResumeMeta[]> {
  let entries: Dirent[];
  try {
    entries = await fs.readdir(resumeLibraryDir(profile), { withFileTypes: true });
  } catch {
    return [];
  }
  const tags = entries
    .filter((entry) => entry.isDirectory() && isValidTag(entry.name))
    .map((entry) => entry.name)
    .sort();
  const metas = await Promise.all(tags.map((tag) => readMeta(profile, tag)));
  return metas.filter((meta): meta is ResumeMeta => meta !== null);
}

export async function importFile(
  profile: string,
  tag: string,
  fileName: string,
  bytes: Uint8Array
): Promise<ImportResult> {
  if (!isValidTag(tag)) return { ok: false, reason: "invalid_tag" };
  if (!isSupportedFile(fileName)) return { ok: false, reason: "unsupported_type" };
  if (bytes.byteLength > MAX_FILE_BYTES) return { ok: false, reason: "too_large" };

  let text: string;
  try {
    text = await extractText(fileName, bytes);
  } catch {
    return { ok: false, reason: "unreadable" };
  }
  if (text.trim() === "") return { ok: false, reason: "empty" };

  return store(profile, tag, { ext: fileExtension(fileName), bytes, text });
}

export async function importText(
  profile: string,
  tag: string,
  text: string,
  parent?: string
): Promise<ImportResult> {
  if (!isValidTag(tag)) return { ok: false, reason: "invalid_tag" };
  const cleaned = normalizeText(text);
  if (cleaned === "") return { ok: false, reason: "empty" };

  const known =
    parent !== undefined &&
    parent !== tag &&
    isValidTag(parent) &&
    (await isDirectory(resumeLibraryItemDir(profile, parent)));
  const bytes = new TextEncoder().encode(cleaned);
  return store(profile, tag, { ext: "txt", bytes, text: cleaned }, known ? parent : undefined);
}

async function store(profile: string, tag: string, file: StoredFile, parentTag?: string): Promise<ImportResult> {
  const libraryDir = resumeLibraryDir(profile);
  const target = resumeLibraryItemDir(profile, tag);
  await fs.mkdir(libraryDir, { recursive: true });

  const textHash = hashText(file.text);
  const previous = await readMeta(profile, tag);
  // Same text under the same tag is not a new version, even when the file itself changed.
  const version = previous ? (previous.textHash === textHash ? previous.version : previous.version + 1) : 1;
  const parent = parentTag ?? previous?.parent;
  const meta: ResumeMeta = {
    tag,
    ext: file.ext,
    importedAt: new Date().toISOString(),
    version,
    textHash,
    ...(parent ? { parent } : {}),
  };

  // Build in a temp folder and rename into place so a failed write never leaves a partial resume.
  const staging = path.join(libraryDir, `${TEMP_PREFIX}${randomUUID()}`);
  try {
    await fs.mkdir(staging);
    await fs.writeFile(path.join(staging, `original.${file.ext}`), file.bytes);
    await fs.writeFile(path.join(staging, TEXT_FILE), file.text, "utf-8");
    await fs.writeFile(path.join(staging, META_FILE), JSON.stringify(meta, null, 2), "utf-8");
    await fs.rm(target, { recursive: true, force: true });
    await fs.rename(staging, target);
  } catch (err) {
    await fs.rm(staging, { recursive: true, force: true });
    throw err;
  }
  return { ok: true, tag, version };
}

export async function readResumeText(profile: string, tag: string): Promise<string | null> {
  if (!isValidTag(tag)) return null;
  try {
    return await fs.readFile(path.join(resumeLibraryItemDir(profile, tag), TEXT_FILE), "utf-8");
  } catch {
    return null;
  }
}

export async function readOriginal(profile: string, tag: string): Promise<OriginalFile | null> {
  if (!isValidTag(tag)) return null;
  const meta = await readMeta(profile, tag);
  if (!meta) return null;
  try {
    const buffer = await fs.readFile(
      path.join(resumeLibraryItemDir(profile, tag), `original.${meta.ext}`)
    );
    return { ext: meta.ext, bytes: new Uint8Array(buffer) };
  } catch {
    return null;
  }
}

export async function renameResume(profile: string, from: string, to: string): Promise<RenameResult> {
  if (!isValidTag(from) || !isValidTag(to)) return { ok: false, reason: "invalid_tag" };
  const source = resumeLibraryItemDir(profile, from);
  if (!(await isDirectory(source))) return { ok: false, reason: "not_found" };
  if (from === to) return { ok: true, tag: to };
  const destination = resumeLibraryItemDir(profile, to);
  if (await isDirectory(destination)) return { ok: false, reason: "exists" };

  const meta = await readMeta(profile, from);
  await fs.rename(source, destination);
  if (meta) {
    await fs.writeFile(
      path.join(destination, META_FILE),
      JSON.stringify({ ...meta, tag: to }, null, 2),
      "utf-8"
    );
  }
  await relinkChildren(profile, from, to);
  return { ok: true, tag: to };
}

// A child of a renamed parent follows the new name. A child of a deleted parent becomes a root,
// so a later resume that reuses the tag does not adopt it.
async function relinkChildren(profile: string, parent: string, next: string | undefined): Promise<void> {
  for (const child of await listResumes(profile)) {
    if (child.parent !== parent) continue;
    const meta: ResumeMeta = { ...child };
    if (next === undefined) delete meta.parent;
    else meta.parent = next;
    await fs.writeFile(
      path.join(resumeLibraryItemDir(profile, child.tag), META_FILE),
      JSON.stringify(meta, null, 2),
      "utf-8"
    );
  }
}

export async function deleteResume(profile: string, tag: string): Promise<DeleteResult> {
  if (!isValidTag(tag)) return { ok: false, reason: "not_found" };
  const dir = resumeLibraryItemDir(profile, tag);
  if (!(await isDirectory(dir))) return { ok: false, reason: "not_found" };
  await fs.rm(dir, { recursive: true, force: true });
  await relinkChildren(profile, tag, undefined);
  return { ok: true };
}

// The original file stays as imported. Only the text copy changes, so the user can always go back to the import.
export async function saveResumeText(profile: string, tag: string, text: string): Promise<SaveTextResult> {
  if (!isValidTag(tag)) return { ok: false, reason: "invalid_tag" };
  const meta = await readMeta(profile, tag);
  if (!meta) return { ok: false, reason: "not_found" };
  const cleaned = normalizeText(text);
  if (cleaned === "") return { ok: false, reason: "empty" };

  const textHash = hashText(cleaned);
  if (textHash === meta.textHash) return { ok: true, version: meta.version };

  const dir = resumeLibraryItemDir(profile, tag);
  const next: ResumeMeta = { ...meta, version: meta.version + 1, textHash, edited: true, editedAt: new Date().toISOString() };
  // Write to a temp file and rename so a failed write never leaves half a resume.
  const staging = path.join(dir, `${TEMP_PREFIX}${randomUUID()}`);
  try {
    await fs.writeFile(staging, cleaned, "utf-8");
    await fs.rename(staging, path.join(dir, TEXT_FILE));
  } catch (err) {
    await fs.rm(staging, { force: true });
    throw err;
  }
  await fs.writeFile(path.join(dir, META_FILE), JSON.stringify(next, null, 2), "utf-8");
  return { ok: true, version: next.version };
}

// Exact match only: a changed or repeated line must never be replaced by guess.
export function applyRewrite(text: string, original: string, suggested: string): RewriteResult {
  const target = original.trim();
  if (target === "") return { ok: false, reason: "not_found" };
  const first = text.indexOf(target);
  if (first === -1) return { ok: false, reason: "not_found" };
  if (text.indexOf(target, first + target.length) !== -1) return { ok: false, reason: "ambiguous" };
  return { ok: true, text: text.slice(0, first) + suggested.trim() + text.slice(first + target.length) };
}
