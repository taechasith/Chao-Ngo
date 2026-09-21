export function withSecurityHeaders(response: Response, request: Request): Response {
  const headers = new Headers(response.headers);
  const isLocalDevelopment = ["localhost", "127.0.0.1"].includes(new URL(request.url).hostname);
  const scriptSource = isLocalDevelopment ? "'self' 'unsafe-inline' 'unsafe-eval'" : "'self' 'unsafe-inline'";
  headers.set(
    "Content-Security-Policy",
    `default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src ${scriptSource}; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://assets.creativelabth.com; media-src 'self' blob: https://assets.creativelabth.com; connect-src 'self'; frame-src 'self'`,
  );
  headers.set("Permissions-Policy", "camera=(), geolocation=(), microphone=(), payment=(), usb=()");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", "DENY");
  headers.set("Cross-Origin-Opener-Policy", "same-origin");
  headers.set("Cross-Origin-Resource-Policy", "same-origin");
  if (new URL(request.url).pathname.startsWith("/api/")) headers.set("Cache-Control", "no-store");
  return new Response(response.body, { headers, status: response.status, statusText: response.statusText });
}
