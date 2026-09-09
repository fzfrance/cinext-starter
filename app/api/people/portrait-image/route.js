// Same-origin TMDB images allow the actor hero to sample background pixels.
// Accept only TMDB file names, never arbitrary hosts or URLs.
export async function GET(request) {
  const path = new URL(request.url).searchParams.get("path") ?? "";
  if (!/^\/[a-zA-Z0-9_-]+\.(jpg|jpeg|png|webp)$/.test(path)) {
    return new Response("Invalid image path", { status: 400 });
  }
  try {
    const upstream = await fetch(`https://image.tmdb.org/t/p/h632${path}`, {
      signal: AbortSignal.timeout(15000),
      next: { revalidate: 86400 },
    });
    const type = upstream.headers.get("content-type") ?? "";
    if (!upstream.ok || !/^image\/(jpeg|png|webp)/.test(type)) {
      return new Response("Image unavailable", { status: 502 });
    }
    return new Response(await upstream.arrayBuffer(), {
      headers: { "Content-Type": type, "X-Content-Type-Options": "nosniff" },
    });
  } catch {
    return new Response("Image unavailable", { status: 502 });
  }
}
