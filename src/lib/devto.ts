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
        "api-key": process.env.DEVTO_API_KEY!,
      },
      body: JSON.stringify({
        article: {
          title: post.title,
          body_markdown: post.body,
          published: true,
          tags: post.tags.slice(0, 4),
        },
      }),
    });
    if (!res.ok) {
      console.error("dev.to publish failed:", await res.text());
      return null;
    }
    const data = await res.json();
    return data.url as string;
  } catch (err) {
    console.error("dev.to publish error:", err);
    return null;
  }
}
