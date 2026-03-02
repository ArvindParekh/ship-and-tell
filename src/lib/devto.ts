export async function publishToDevTo(post: {
  title: string;
  body: string;
  tags: string[];
}): Promise<string | null> {
  const apiKey = process.env.DEVTO_API_KEY ?? process.env.DEV_TO_API_KEY;
  if (!apiKey) {
    console.error("dev.to publish failed: neither DEVTO_API_KEY nor DEV_TO_API_KEY is set");
    return null;
  }

  try {
    const res = await fetch("https://dev.to/api/articles", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": apiKey,
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
      const errText = await res.text();
      console.error(`dev.to publish failed (${res.status}):`, errText);
      return null;
    }

    const data = await res.json();

    // The dev.to API returns { id, url, ... } for the created article.
    // For drafts, the article edit page is the most useful destination.
    if (data.id) {
      return `https://dev.to/dashboard/editor/${data.id}`;
    }

    // Fallback to the article URL or dashboard
    return data.url ?? "https://dev.to/dashboard";
  } catch (err) {
    console.error("dev.to publish error:", err);
    return null;
  }
}
