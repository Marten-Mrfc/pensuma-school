import { getSessionCookie } from "better-auth/cookies";
import { type NextRequest, NextResponse } from "next/server";

/**
 * Optimistic auth check: without a session cookie, /docent/*, /leerling/*
 * and /print/* redirect to /inloggen?next=<path>. This only looks at
 * cookie presence; the real checks happen in the layouts
 * (requireAdmin/requireStudent) and in every tRPC procedure.
 */
export function proxy(request: NextRequest) {
  if (getSessionCookie(request)) return NextResponse.next();

  const { pathname, search } = request.nextUrl;
  const loginUrl = new URL("/inloggen", request.url);
  loginUrl.searchParams.set("next", `${pathname}${search}`);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  // Only the protected areas: api, _next, static files and /pyodide/* never match.
  matcher: [
    "/docent",
    "/docent/:path*",
    "/leerling",
    "/leerling/:path*",
    "/print",
    "/print/:path*",
  ],
};
