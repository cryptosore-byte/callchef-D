import { NextResponse, type NextRequest } from "next/server";

/**
 * Optional HTTP Basic auth for a self-hosted instance: set SITE_PASSWORD (any user name works).
 * Protects the paid Apify/Jev calls from strangers. Unset = open (local dev).
 */
export function middleware(req: NextRequest) {
  const pass = process.env.SITE_PASSWORD;
  if (!pass) return NextResponse.next();
  const h = req.headers.get("authorization") ?? "";
  if (h.startsWith("Basic ")) {
    try {
      const decoded = atob(h.slice(6));
      if (decoded.slice(decoded.indexOf(":") + 1) === pass) return NextResponse.next();
    } catch { /* malformed header */ }
  }
  return new NextResponse("Authentication required", { status: 401, headers: { "WWW-Authenticate": 'Basic realm="Restaurant Radar"' } });
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
