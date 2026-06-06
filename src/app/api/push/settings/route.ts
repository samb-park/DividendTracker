import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSingleUserId } from "@/lib/single-user-mode";

export const dynamic = "force-dynamic";

const exKey = (userId: string) => `${userId}:pocket-notify:ex`;
const payKey = (userId: string) => `${userId}:pocket-notify:pay`;

/** GET /api/push/settings — the two independent Ex/Pay alert flags. */
export async function GET() {
  const userId = getSingleUserId();
  const [ex, pay] = await Promise.all([
    prisma.setting.findUnique({ where: { key: exKey(userId) } }),
    prisma.setting.findUnique({ where: { key: payKey(userId) } }),
  ]);
  return NextResponse.json({ exEnabled: ex?.value === "true", payEnabled: pay?.value === "true" });
}

/** POST /api/push/settings — set either flag ({ exEnabled?, payEnabled? }). */
export async function POST(req: NextRequest) {
  const userId = getSingleUserId();
  const body = await req.json().catch(() => ({}));
  const ops: Promise<unknown>[] = [];
  const upsert = (key: string, value: boolean) =>
    prisma.setting.upsert({
      where: { key },
      update: { value: String(value) },
      create: { key, value: String(value) },
    });
  if (typeof body?.exEnabled === "boolean") ops.push(upsert(exKey(userId), body.exEnabled));
  if (typeof body?.payEnabled === "boolean") ops.push(upsert(payKey(userId), body.payEnabled));
  if (ops.length === 0) return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  await Promise.all(ops);
  return NextResponse.json({ ok: true });
}
