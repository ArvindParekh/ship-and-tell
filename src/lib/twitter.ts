/**
 * Build a Twitter Web Intent URL for composing a tweet.
 * No API keys needed -- opens twitter.com/intent/tweet in the user's browser.
 */
export function buildTwitterIntentUrl(text: string): string {
  return `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
}
