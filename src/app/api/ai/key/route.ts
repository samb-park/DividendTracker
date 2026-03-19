import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { encrypt, decrypt, isEncrypted } from "@/lib/crypto";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  const setting = await prisma.setting.findUnique({
    where: { key: `${userId}:openai_api_key` },
  });

  if (!setting?.value) {
    return NextResponse.json({ hasKey: false, keyPreview: null });
  }

  let keyPreview: string | null = null;
  try {
    const plain = isEncrypted(setting.value) ? decrypt(setting.value) : setting.value;
    keyPreview = `...${plain.slice(-6)}`;
  } catch {
    keyPreview = "...(encrypted)";
  }

  return NextResponse.json({ hasKey: true, keyPreview });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  const { apiKey } = (await req.json()) as { apiKey?: string };

  if (!apiKey?.trim()) {
    return NextResponse.json({ error: "apiKey is required" }, { status: 400 });
  }
  if (!apiKey.trim().startsWith("sk-")) {
    return NextResponse.json(
      { error: "Invalid API key — must start with sk-" },
      { status: 400 }
    );
  }

  const encrypted = encrypt(apiKey.trim());

  await prisma.setting.upsert({
    where: { key: `${userId}:openai_api_key` },
    update: { value: encrypted },
    create: { key: `${userId}:openai_api_key`, value: encrypted },
  });

  const preview = `...${apiKey.trim().slice(-6)}`;
  return NextResponse.json({ ok: true, keyPreview: preview });
}

export async function DELETE() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  await prisma.setting.deleteMany({
    where: { key: { in: [`${userId}:openai_api_key`] } },
  });

  return NextResponse.json({ ok: true });
}
