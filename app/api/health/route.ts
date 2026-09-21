export const dynamic = "force-dynamic";

export function GET(): Response {
  return Response.json(
    {
      service: "chao-ngo-player",
      status: "ok",
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
