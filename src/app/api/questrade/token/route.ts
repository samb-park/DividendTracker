import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { exchangeRefreshToken } from "@/lib/questrade";
import { auth } from "@/auth";
import { encrypt, decrypt, isEncrypted } from "@/lib/crypto";

export const dynamic = "force-dynamic";

/** GET — return whether a token is saved (masked) */
export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id!;

  const setting = await prisma.setting.findUnique({ where: { key: `${userId}:qt_refresh_token` } });
  const apiServer = await prisma.setting.findUnique({ where: { key: `${userId}:qt_api_server` } });
  const lastSync = await prisma.setting.findUnique({ where: { key: `${userId}:qt_last_sync` } });

  // Decrypt for preview (support legacy plaintext tokens)
  let tokenPreview: string | null = null;
  if (setting?.value) {
    try {
      const plain = isEncrypted(setting.value) ? decrypt(setting.value) : setting.value;
      tokenPreview = `...${plain.slice(-6)}`;
    } catch {
      tokenPreview = "...(encrypted)";
    }
  }

  return NextResponse.json({
    hasToken: !!setting?.value,
    tokenPreview,
    apiServer: apiServer?.value ?? null,
    lastSync: lastSync?.value ?? null,
  });
}

/** POST { refreshToken } — validate + save token */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id!;

  const { refreshToken } = await req.json();
  if (!refreshToken?.trim()) {
    return NextResponse.json({ error: "refreshToken is required" }, { status: 400 });
  }

  try {
    // Exchange the token to validate it and get the API server URL
    const tokenData = await exchangeRefreshToken(refreshToken.trim());

    // Save new refresh token encrypted (old one is now invalidated by Questrade)
    await prisma.setting.upsert({
      where: { key: `${userId}:qt_refresh_token` },
      update: { value: encrypt(tokenData.refresh_token) },
      create: { key: `${userId}:qt_refresh_token`, value: encrypt(tokenData.refresh_token) },
    });
    await prisma.setting.upsert({
      where: { key: `${userId}:qt_api_server` },
      update: { value: tokenData.api_server },
      create: { key: `${userId}:qt_api_server`, value: tokenData.api_server },
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
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id!;

  await prisma.setting.deleteMany({
    where: { key: { in: [`${userId}:qt_refresh_token`, `${userId}:qt_api_server`, `${userId}:qt_last_sync`] } },
  });
  return NextResponse.json({ ok: true });
}
