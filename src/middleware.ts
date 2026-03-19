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
    pathname === "/pending" ||
    pathname === "/favicon.ico" ||
    pathname === "/manifest.json" ||
    pathname.startsWith("/apple-icon");

  if (isPublic) return NextResponse.next();

  // Allow cron and health endpoints (no session needed)
  if (pathname.startsWith("/api/cron")) return NextResponse.next();
  if (pathname === "/api/health") return NextResponse.next();

  if (!isLoggedIn) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/login", req.nextUrl));
  }

  // Logged in but not approved — redirect to /pending (except API calls get 403)
  const isApproved = req.auth?.user?.approved;
  if (!isApproved) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Account pending approval" }, { status: 403 });
    }
    return NextResponse.redirect(new URL("/pending", req.nextUrl));
  }

  // Admin-only routes
  if (pathname.startsWith("/admin") || pathname.startsWith("/api/admin")) {
    const role = req.auth?.user?.role;
    if (role !== "ADMIN") {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      return NextResponse.redirect(new URL("/", req.nextUrl));
    }
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
