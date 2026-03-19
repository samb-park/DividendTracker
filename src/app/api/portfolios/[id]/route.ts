import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/auth";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  try {
    await prisma.portfolio.delete({ where: { id, userId: session.user.id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const { cashCAD, cashUSD, name, accountType } = body;
  const validAccountTypes = ["TFSA", "RRSP", "FHSA", "NON_REG", "CASH"];

  try {
    const updated = await prisma.portfolio.update({
      where: { id, userId: session.user.id },
      data: {
        ...(name !== undefined && { name }),
        ...(cashCAD !== undefined && { cashCAD }),
        ...(cashUSD !== undefined && { cashUSD }),
        ...(accountType && validAccountTypes.includes(accountType) && { accountType }),
      },
    });
    return NextResponse.json(updated);
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
