import type { Job } from "@/lib/csv";

export type FacetKey = "country" | "city" | "work_mode" | "seniority" | "employment_type";

export type FacetSelections = Record<FacetKey, string[]>;

export const FACET_FILTERS: { key: FacetKey; label: string }[] = [
  { key: "country", label: "Country" },
  { key: "city", label: "City" },
  { key: "work_mode", label: "Work mode" },
  { key: "seniority", label: "Seniority" },
  { key: "employment_type", label: "Employment type" },
];

const VALUE_LABELS: Partial<Record<FacetKey, Record<string, string>>> = {
  work_mode: {
    remote: "Remote",
    hybrid: "Hybrid",
    onsite: "On-site",
  },
  seniority: {
    intern: "Intern",
    junior: "Junior",
    mid: "Mid",
    senior: "Senior",
    lead: "Lead",
    manager: "Manager",
    director: "Director",
    executive: "Executive",
  },
  employment_type: {
    full_time: "Full-time",
    part_time: "Part-time",
    contract: "Contract",
    internship: "Internship",
    temporary: "Temporary",
    volunteer: "Volunteer",
    other: "Other",
  },
};

export function facetValueLabel(key: FacetKey, value: string): string {
  const text = (value ?? "").trim();
  return VALUE_LABELS[key]?.[text] ?? text;
}

function matchesOtherFacets(
  job: Job,
  key: FacetKey,
  selections: Partial<FacetSelections>
): boolean {
  for (const { key: other } of FACET_FILTERS) {
    if (other === key) continue;
    const selected = (selections[other] ?? []).map((value) => value.trim()).filter(Boolean);
    if (selected.length === 0) continue;
    if (!selected.includes((job[other] ?? "").trim())) return false;
  }
  return true;
}

export function facetOptions(
  jobs: Job[],
  key: FacetKey,
  selections: Partial<FacetSelections> = {}
): string[] {
  const values = new Set<string>();
  for (const job of jobs) {
    if (!matchesOtherFacets(job, key, selections)) continue;
    const value = (job[key] ?? "").trim();
    if (value) values.add(value);
  }
  return [...values].sort((a, b) => {
    const labelA = facetValueLabel(key, a);
    const labelB = facetValueLabel(key, b);
    return labelA.localeCompare(labelB) || a.localeCompare(b);
  });
}
