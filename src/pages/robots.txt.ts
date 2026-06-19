export async function GET() {
  const isStaging = import.meta.env.PUBLIC_APP_ENV === "staging";

  const body = isStaging
    ? [
        "User-agent: *",
        "Disallow: /",
      ].join("\n")
    : [
        "User-agent: *",
        "Allow: /",
        "",
        "Sitemap: https://goodcoiner.com/sitemap.xml",
      ].join("\n");

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=300",
    },
  });
}
