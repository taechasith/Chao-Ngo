export function GET(): Response {
  return new Response(null, {
    headers: {
      "Cache-Control": "public, max-age=86400",
    },
    status: 204,
  });
}
