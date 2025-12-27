import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { importCommitSchema } from "@/lib/validations/import";
import { syncHoldingsForAccount } from "@/lib/calculations/holdings";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { accountId, transactions } = importCommitSchema.parse(body);

    // Verify account exists
    const account = await prisma.account.findUnique({
      where: { id: accountId },
    });

    if (!account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    // Create transactions in batch
    const created = await prisma.$transaction(async (tx) => {
      const results = [];

      for (const txData of transactions) {
        const transaction = await tx.transaction.create({
          data: {
            accountId,
            ticker: txData.ticker.toUpperCase(),
            type: txData.type,
            quantity: txData.quantity,
            price: txData.price,
            fee: txData.fee || 0,
            tradeDate: new Date(txData.tradeDate),
            note: txData.note,
          },
        });
        results.push(transaction);
      }

      return results;
    });

    // Log the import
    await prisma.importLog.create({
      data: {
        accountId,
        filename: "csv_import",
        rowCount: created.length,
        status: "success",
      },
    });

    // Recalculate holdings
    await syncHoldingsForAccount(accountId);

    return NextResponse.json({
      success: true,
      imported: created.length,
    });
  } catch (error) {
    console.error("Import commit failed:", error);

    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Import failed" }, { status: 500 });
  }
}
