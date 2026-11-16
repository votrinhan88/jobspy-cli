export const REQUIRED_JOB_COLUMNS = ["job_id", "title", "company", "location"] as const;

export class CsvSchemaError extends Error {
  constructor(missing: string[]) {
    super(`jobs.csv is missing required columns: ${missing.join(", ")}`);
    this.name = "CsvSchemaError";
  }
}

export function missingJobColumns(headers: string[]): string[] {
  const present = new Set(headers);
  return REQUIRED_JOB_COLUMNS.filter((column) => !present.has(column));
}

export function assertJobHeader(headers: string[]): void {
  const missing = missingJobColumns(headers);
  if (missing.length > 0) throw new CsvSchemaError(missing);
}
