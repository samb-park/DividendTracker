import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/auth";
import { z } from "zod";

export const dynamic = "force-dynamic";

const appearanceSchema = z.object({
  theme: z.enum(["dark", "light"]),
});

function themeKey(userId: string) {
  return `${userId}:appearance:theme`;
}

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const setting = await prisma.setting.findUnique({
    where: { key: themeKey(session.user.id!) },
  });

  const theme = setting?.value === "light" ? "light" : "dark";
  return NextResponse.json({ theme });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = appearanceSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  await prisma.setting.upsert({
    where: { key: themeKey(session.user.id!) },
    update: { value: parsed.data.theme },
    create: { key: themeKey(session.user.id!), value: parsed.data.theme },
  });

  return NextResponse.json({ ok: true });
}
