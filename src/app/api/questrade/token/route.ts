import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { exchangeRefreshToken } from "@/lib/questrade";

export const dynamic = "force-dynamic";

/** GET — return whether a token is saved (masked) */
export async function GET() {
  const setting = await prisma.setting.findUnique({ where: { key: "qt_refresh_token" } });
  const apiServer = await prisma.setting.findUnique({ where: { key: "qt_api_server" } });
  const lastSync = await prisma.setting.findUnique({ where: { key: "qt_last_sync" } });

  return NextResponse.json({
    hasToken: !!setting?.value,
    tokenPreview: setting?.value ? `...${setting.value.slice(-6)}` : null,
    apiServer: apiServer?.value ?? null,
    lastSync: lastSync?.value ?? null,
  });
}

/** POST { refreshToken } — validate + save token */
export async function POST(req: Request) {
  const { refreshToken } = await req.json();
  if (!refreshToken?.trim()) {
    return NextResponse.json({ error: "refreshToken is required" }, { status: 400 });
  }

  try {
    // Exchange the token to validate it and get the API server URL
    const tokenData = await exchangeRefreshToken(refreshToken.trim());

    // Save new refresh token (old one is now invalidated by Questrade)
    await prisma.setting.upsert({
      where: { key: "qt_refresh_token" },
      update: { value: tokenData.refresh_token },
      create: { key: "qt_refresh_token", value: tokenData.refresh_token },
    });
    await prisma.setting.upsert({
      where: { key: "qt_api_server" },
      update: { value: tokenData.api_server },
      create: { key: "qt_api_server", value: tokenData.api_server },
    });

    return NextResponse.json({
      ok: true,
      apiServer: tokenData.api_server,
      tokenPreview: `...${tokenData.refresh_token.slice(-6)}`,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

/** DELETE — remove token */
export async function DELETE() {
  await prisma.setting.deleteMany({
    where: { key: { in: ["qt_refresh_token", "qt_api_server", "qt_last_sync"] } },
  });
  return NextResponse.json({ ok: true });
}
