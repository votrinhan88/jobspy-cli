const STOP_WORDS = new Set([
  "a", "about", "above", "after", "all", "also", "am", "an", "and", "any", "are", "as", "at",
  "be", "because", "been", "being", "best", "both", "but", "by", "can", "could", "did", "do",
  "does", "doing", "done", "each", "etc", "even", "every", "for", "from", "get", "had", "has",
  "have", "having", "her", "here", "his", "how", "if", "in", "including", "into", "is", "it",
  "its", "just", "like", "more", "most", "must", "new", "no", "not", "of", "on", "one", "only",
  "or", "other", "our", "out", "over", "own", "per", "plus", "same", "should", "so", "some",
  "such", "than", "that", "the", "their", "them", "then", "there", "these", "they", "this",
  "those", "through", "to", "too", "under", "until", "up", "very", "was", "we", "well", "were",
  "what", "when", "where", "which", "while", "who", "why", "will", "with", "within", "would",
  "year", "years", "you", "your",
  "ability", "able", "based", "experience", "required", "requirements", "responsibilities",
  "role", "roles", "skills", "strong", "team", "teams", "work", "working", "candidate",
  "looking", "join", "opportunity", "company", "position", "job", "ideal", "knowledge",
]);

const MIN_TERM_LENGTH = 2;

export function extractTerms(text: string): string[] {
  const seen = new Set<string>();
  const terms: string[] = [];
  for (const raw of text.toLowerCase().split(/[^\p{L}\p{N}+#.]+/u)) {
    const term = raw.replace(/^[.+#]+/, "").replace(/\.+$/, "");
    if (term.length < MIN_TERM_LENGTH) continue;
    if (/^\d+$/.test(term)) continue;
    if (STOP_WORDS.has(term)) continue;
    if (seen.has(term)) continue;
    seen.add(term);
    terms.push(term);
  }
  return terms;
}

export function fold(term: string): string {
  if (term.length > 3 && term.endsWith("s") && !/(ss|us|is)$/.test(term)) {
    return term.slice(0, -1);
  }
  return term;
}

function stripMarkup(text: string): string {
  return text
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1");
}

export function resumeTerms(text: string): Set<string> {
  return new Set(extractTerms(stripMarkup(text)).map(fold));
}

export interface MatchResult {
  score: number;
  matched: string[];
  missing: string[];
}

export function scoreMatch(jobText: string, terms: Set<string>): MatchResult {
  const jobTerms = extractTerms(jobText);
  const matched = jobTerms.filter((term) => terms.has(fold(term)));
  const missing = jobTerms.filter((term) => !terms.has(fold(term)));
  const score = jobTerms.length === 0 ? 0 : Math.round((100 * matched.length) / jobTerms.length);
  return { score, matched, missing };
}

export interface TagRanking extends MatchResult {
  tag: string;
}

export function rankTags(
  jobText: string,
  tagTexts: { tag: string; text: string }[]
): TagRanking[] {
  return tagTexts
    .map(({ tag, text }) => ({ tag, ...scoreMatch(jobText, resumeTerms(text)) }))
    .sort((a, b) => b.score - a.score || a.tag.localeCompare(b.tag));
}
