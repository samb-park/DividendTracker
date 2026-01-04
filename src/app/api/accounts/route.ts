import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// 계좌 목록 조회
export async function GET() {
  try {
    const accounts = await prisma.account.findMany({
      orderBy: { accountType: "asc" },
      include: {
        _count: {
          select: { transactions: true },
        },
      },
    });

    return NextResponse.json(accounts);
  } catch (error) {
    console.error("Error fetching accounts:", error);
    return NextResponse.json({ error: "계좌 조회 실패" }, { status: 500 });
  }
}

// 계좌 수정 (별칭 등)
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, nickname } = body;

    if (!id) {
      return NextResponse.json({ error: "계좌 ID가 필요합니다" }, { status: 400 });
    }

    const updated = await prisma.account.update({
      where: { id },
      data: { nickname },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Error updating account:", error);
    return NextResponse.json({ error: "계좌 수정 실패" }, { status: 500 });
  }
}

// 계좌 삭제 (관련 트랜잭션도 함께 삭제)
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "계좌 ID가 필요합니다" }, { status: 400 });
    }

    await prisma.account.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting account:", error);
    return NextResponse.json({ error: "계좌 삭제 실패" }, { status: 500 });
  }
}
