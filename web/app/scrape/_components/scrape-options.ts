export const PROVIDERS: { id: string; label: string }[] = [
  { id: "greenhouse", label: "Greenhouse" },
  { id: "lever",      label: "Lever" },
  { id: "ashby",      label: "Ashby" },
  { id: "workday",    label: "Workday" },
];

export const SITES: { id: string; label: string; unavailable?: boolean }[] = [
  { id: "linkedin",      label: "LinkedIn" },
  { id: "indeed",        label: "Indeed" },
  { id: "zip_recruiter", label: "ZipRecruiter" },
  { id: "glassdoor",     label: "Glassdoor" },
  { id: "google",        label: "Google Jobs (unavailable)", unavailable: true },
];

export function providerLabel(entry: string): string {
  const id = entry.split(":")[0];
  return PROVIDERS.find((p) => p.id === id)?.label ?? id;
}
