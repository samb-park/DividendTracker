import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await prisma.portfolio.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();
  const { cashCAD, cashUSD } = body;

  const updated = await prisma.portfolio.update({
    where: { id },
    data: {
      ...(cashCAD !== undefined && { cashCAD }),
      ...(cashUSD !== undefined && { cashUSD }),
    },
  });
  return NextResponse.json(updated);
}
