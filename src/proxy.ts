import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATH_PREFIXES = ["/_next", "/favicon.ico", "/manifest.json", "/apple-icon"];

function isCronRequest(pathname: string) {
  return pathname.startsWith("/api/cron");
}

function hasCronBearerAuth(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

export default function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (PUBLIC_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return NextResponse.next();
  }

  // Single-user mode removes browser login gates. Automation endpoints stay protected
  // by their existing Bearer CRON_SECRET contract before reaching route handlers.
  if (isCronRequest(pathname) && !hasCronBearerAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
