import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createAccountSchema } from "@/lib/validations/account";

export async function GET() {
  try {
    const accounts = await prisma.account.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        _count: { select: { holdings: true, transactions: true } },
      },
    });

    return NextResponse.json(accounts);
  } catch (error) {
    console.error("Failed to fetch accounts:", error);
    return NextResponse.json(
      { error: "Failed to fetch accounts" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validated = createAccountSchema.parse(body);

    const account = await prisma.account.create({
      data: validated,
    });

    return NextResponse.json(account, { status: 201 });
  } catch (error) {
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
