import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { ensureBootstrapUser } from "@/lib/bootstrap-user";

export async function GET() {
  try {
    const user = await ensureBootstrapUser();

    const accounts = await prisma.account.findMany({
      where: { userId: user.id },
      orderBy: [{ accountType: "asc" }, { createdAt: "asc" }],
      include: {
        _count: {
          select: { transactions: true },
        },
        contributionSettings: {
          orderBy: [{ year: "desc" }],
          take: 1,
        },
      },
    });

    return NextResponse.json(accounts);
  } catch (error) {
    console.error("Error fetching accounts:", error);
    return NextResponse.json({ error: "Failed to fetch accounts" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await ensureBootstrapUser();
    const body = await request.json();
    const {
      name,
      accountType,
      accountNumber,
      baseCurrency,
      currentContributionRoom,
    } = body;

    if (!accountType) {
      return NextResponse.json({ error: "Account type is required" }, { status: 400 });
    }

    const created = await prisma.account.create({
      data: {
        userId: user.id,
        name: name?.trim() || null,
        accountType: accountType.trim(),
        accountNumber: accountNumber?.trim() || null,
        baseCurrency: baseCurrency || "CAD",
        currentContributionRoom:
          currentContributionRoom === "" || currentContributionRoom === null || currentContributionRoom === undefined
            ? null
            : Number(currentContributionRoom),
      },
    });

    return NextResponse.json(created);
  } catch (error) {
    console.error("Error creating account:", error);
    return NextResponse.json({ error: "Failed to create account" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      id,
      name,
      accountType,
      accountNumber,
      baseCurrency,
      currentContributionRoom,
      isActive,
    } = body;

    if (!id) {
      return NextResponse.json({ error: "Account ID is required" }, { status: 400 });
    }

    const updated = await prisma.account.update({
      where: { id },
      data: {
        name: name === undefined ? undefined : name?.trim() || null,
        accountType: accountType === undefined ? undefined : accountType.trim(),
        accountNumber: accountNumber === undefined ? undefined : accountNumber?.trim() || null,
        baseCurrency: baseCurrency || undefined,
        isActive: typeof isActive === "boolean" ? isActive : undefined,
        currentContributionRoom:
          currentContributionRoom === undefined
            ? undefined
            : currentContributionRoom === "" || currentContributionRoom === null
              ? null
              : Number(currentContributionRoom),
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Error updating account:", error);
    return NextResponse.json({ error: "Failed to update account" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Account ID is required" }, { status: 400 });
    }

    await prisma.account.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting account:", error);
    return NextResponse.json({ error: "Failed to delete account" }, { status: 500 });
  }
}
