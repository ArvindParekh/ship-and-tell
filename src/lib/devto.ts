export async function publishToDevTo(post: {
  title: string;
  body: string;
  tags: string[];
}): Promise<string | null> {
  try {
    const res = await fetch("https://dev.to/api/articles", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": process.env.DEV_TO_API_KEY!,
      },
      body: JSON.stringify({
        article: {
          title: post.title,
          body_markdown: post.body,
          published: false,
          tags: post.tags.slice(0, 4),
        },
      }),
    });
    if (!res.ok) {
      console.error("dev.to publish failed:", await res.text());
      return null;
    }
    const data = await res.json();
    // Draft articles return a public URL that 404s. Redirect to the
    // dashboard instead — the new draft appears at the top.
    return `https://dev.to/dashboard`;
  } catch (err) {
    console.error("dev.to publish error:", err);
    return null;
  }
}
