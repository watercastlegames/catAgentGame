import guideHtml from "../../docs/agent-forest-other-pc-install-guide-20260804.html?raw";

export function GET() {
  return new Response(guideHtml, {
    headers: {
      "Cache-Control": "public, max-age=300",
      "Content-Disposition":
        'inline; filename="agent-forest-other-pc-install-guide.html"',
      "Content-Security-Policy":
        "default-src 'self'; img-src 'self' data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'",
      "Content-Type": "text/html; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
