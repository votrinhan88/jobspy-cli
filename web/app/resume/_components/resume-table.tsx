import type { ResumeMeta } from "@/lib/resumes/library";
import { SORT_KEYS, type Sort, type SortKey, editedTime } from "@/lib/resumes/sort";

export function ResumeTable({
  items,
  sort,
  selectedTag,
  onSort,
  onSelect,
}: {
  items: ResumeMeta[];
  sort: Sort;
  selectedTag: string | undefined;
  onSort: (key: SortKey) => void;
  onSelect: (tag: string) => void;
}) {
  return (
    <table className="resume-table" aria-label="Resumes">
      <thead>
        <tr>
          {SORT_KEYS.map((key) => (
            <th key={key} aria-sort={sort.key === key ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}>
              <button type="button" className="resume-sort" onClick={() => onSort(key)}>
                {key === "name" ? "Name" : key === "version" ? "Version" : "Last edited"}
                <span className="resume-sort-mark" aria-hidden="true" data-active={sort.key === key}>
                  {sort.key === key && sort.dir === "desc" ? "▼" : "▲"}
                </span>
              </button>
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {items.map((meta) => (
          <tr
            key={meta.tag}
            aria-label={meta.tag}
            data-selected={selectedTag === meta.tag}
            onClick={() => onSelect(meta.tag)}
          >
            <td>
              <button
                type="button"
                className="resume-node-label"
                data-label={meta.tag}
                aria-current={selectedTag === meta.tag ? "true" : undefined}
              >
                {meta.tag}
              </button>
            </td>
            <td className="muted mono">{`v${meta.version}`}</td>
            <td className="muted mono">{editedTime(meta).slice(0, 10)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
