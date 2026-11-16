const TAG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const MAX_TAG_LENGTH = 64;

export function normalizeTag(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_TAG_LENGTH)
    .replace(/-+$/, "");
}

export function isValidTag(input: string): boolean {
  return input.length <= MAX_TAG_LENGTH && TAG_PATTERN.test(input);
}
