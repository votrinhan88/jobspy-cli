import type { ResumeMeta } from "@/lib/resumes/library";

export type SortKey = "name" | "version" | "edited";
export type Sort = { key: SortKey; dir: "asc" | "desc" };

export const SORT_KEYS: SortKey[] = ["name", "version", "edited"];

export const editedTime = (meta: ResumeMeta) => meta.editedAt ?? meta.importedAt;

export function sortResumes(items: ResumeMeta[], sort: Sort): ResumeMeta[] {
  return [...items].sort((a, b) => {
    const order =
      sort.key === "edited"
        ? editedTime(a).localeCompare(editedTime(b))
        : sort.key === "version"
          ? a.version - b.version
          : a.tag.localeCompare(b.tag);
    return (sort.dir === "asc" ? order : -order) || a.tag.localeCompare(b.tag);
  });
}

export function nextSort(current: Sort, key: SortKey): Sort {
  if (current.key === key) return { key, dir: current.dir === "asc" ? "desc" : "asc" };
  return { key, dir: key === "name" ? "asc" : "desc" };
}
