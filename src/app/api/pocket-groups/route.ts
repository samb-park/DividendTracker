import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/auth";
import {
  MAX_GROUP_NAME,
  MAX_GROUPS,
  MAX_TICKERS_PER_GROUP,
  sanitizeAccounts,
  sanitizeColor,
  sanitizeIcon,
  sanitizeTickers,
  serializeGroup,
} from "@/lib/pocket-groups";

export const dynamic = "force-dynamic";

/** GET /api/pocket-groups — list the current user's ticker groups, ordered. */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const groups = await prisma.pocketGroup.findMany({
    where: { userId: session.user.id },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
  return NextResponse.json(groups.map(serializeGroup));
}

/** POST /api/pocket-groups — create a new group ({ name, color?, icon?, tickers? }). */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;

  const body = await req.json().catch(() => ({}));
  const name = (typeof body?.name === "string" ? body.name.trim() : "").slice(0, MAX_GROUP_NAME);
  if (!name) return NextResponse.json({ error: "이름을 입력하세요." }, { status: 400 });
  if (Array.isArray(body?.tickers) && body.tickers.length > MAX_TICKERS_PER_GROUP) {
    return NextResponse.json({ error: `종목은 최대 ${MAX_TICKERS_PER_GROUP}개까지예요.` }, { status: 400 });
  }

  const count = await prisma.pocketGroup.count({ where: { userId } });
  if (count >= MAX_GROUPS) {
    return NextResponse.json({ error: `포트폴리오는 최대 ${MAX_GROUPS}개까지예요.` }, { status: 400 });
  }

  const dup = await prisma.pocketGroup.findFirst({ where: { userId, name } });
  if (dup) return NextResponse.json({ error: "같은 이름의 포트폴리오가 이미 있어요." }, { status: 409 });

  const last = await prisma.pocketGroup.findFirst({
    where: { userId },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });

  const created = await prisma.pocketGroup.create({
    data: {
      userId,
      name,
      color: sanitizeColor(body?.color),
      icon: sanitizeIcon(body?.icon),
      accounts: sanitizeAccounts(body?.accounts),
      tickers: sanitizeTickers(body?.tickers),
      sortOrder: (last?.sortOrder ?? -1) + 1,
    },
  });
  return NextResponse.json(serializeGroup(created));
}
