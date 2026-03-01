/**
 * Fetch a diff from a GitHub URL.
 * Works with both PR diff URLs and compare URLs (push events).
 */
export async function fetchDiff(diffUrl: string): Promise<string> {
  const res = await fetch(diffUrl, {
    headers: {
      Accept: "application/vnd.github.v3.diff",
    },
  });
  if (!res.ok) return "Diff unavailable";
  const text = await res.text();
  // Truncate -- diffs can be huge. 4000 chars is enough for context.
  return text.slice(0, 4000);
}
