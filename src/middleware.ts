import { NextRequest, NextResponse } from "next/server";

export async function middleware(request: NextRequest) {
  // Check for session token cookie (database session strategy)
  const sessionToken = request.cookies.get("next-auth.session-token")?.value;

  if (!sessionToken) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("callbackUrl", request.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/holdings/:path*",
    "/transactions/:path*",
    "/accounts/:path*",
    "/dividends/:path*",
    "/import/:path*",
    "/stock/:path*",
    "/admin/:path*",
  ],
};
