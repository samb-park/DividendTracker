import { auth } from "@/auth";
import { NextResponse } from "next/server";

export default auth((req) => {
  const isLoggedIn = !!req.auth;
  const { pathname } = req.nextUrl;

  // Always allow auth routes, static assets, and manifest
  const isPublic =
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/_next") ||
    pathname === "/login" ||
    pathname === "/favicon.ico" ||
    pathname === "/manifest.json" ||
    pathname.startsWith("/apple-icon");

  if (isPublic) return NextResponse.next();

  // Allow cron and health endpoints (no session needed)
  if (pathname.startsWith("/api/cron")) return NextResponse.next();
  if (pathname === "/api/health") return NextResponse.next();

  if (!isLoggedIn) {
    // API routes: return 401 JSON (don't redirect to HTML login page)
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/login", req.nextUrl));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
