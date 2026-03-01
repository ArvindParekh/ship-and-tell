/**
 * Build a Twitter/X Web Intent URL for the first tweet in a thread.
 * No API key or OAuth required — opens twitter.com/intent/tweet in the browser.
 *
 * For threads: encodes tweet 1 in the intent URL and returns the rest as plain
 * text so the caller can surface them for copy-paste.
 */

const INTENT_BASE = "https://twitter.com/intent/tweet";
const MAX_TWEET_LEN = 280;

/** Truncate a tweet to the hard 280-char limit (shouldn't normally be needed). */
function truncate(text: string): string {
  return text.length <= MAX_TWEET_LEN ? text : text.slice(0, MAX_TWEET_LEN - 1) + "…";
}

export interface XIntentResult {
  /** URL to open for the first tweet */
  intentUrl: string;
  /** Remaining tweets in the thread (tweet 2+), for display/copy-paste */
  remainingTweets: string[];
}

/**
 * Returns a web intent URL for the first tweet and the rest of the thread.
 * Returns null if tweets array is empty.
 */
export function buildXThreadIntent(tweets: string[]): XIntentResult | null {
  if (tweets.length === 0) return null;

  const [first, ...rest] = tweets;
  const intentUrl = `${INTENT_BASE}?text=${encodeURIComponent(truncate(first))}`;

  return { intentUrl, remainingTweets: rest };
}
