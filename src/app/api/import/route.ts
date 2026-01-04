import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { parseExcelBuffer } from "@/lib/excel/parser";
import { computeRowHash, computeFileHash } from "@/lib/excel/hasher";
import { extractCadEquivalent, normalizeAccountType } from "@/lib/excel/normalizer";
import { resolveSymbol } from "@/lib/mappings/symbolMap";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json({ error: "파일이 제공되지 않았습니다" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const fileHash = computeFileHash(buffer);

    // Excel 파싱
    const { rows, errors } = parseExcelBuffer(buffer);

    if (rows.length === 0) {
      return NextResponse.json(
        {
          error: "파싱된 데이터가 없습니다",
          parseErrors: errors.slice(0, 10),
        },
        { status: 400 }
      );
    }

    // Import 기록 생성
    const importFile = await prisma.importFile.create({
      data: {
        filename: file.name,
        fileHash,
        rowCount: rows.length,
        insertedCount: 0,
        skippedCount: 0,
        failedCount: errors.length,
      },
    });

    let insertedCount = 0;
    let skippedCount = 0;
    const failedRows: Array<{ row: number; message: string }> = [...errors];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNumber = i + 2; // +2 for header and 0-index

      try {
        const rowHash = computeRowHash(row, i, fileHash);

        // 중복 체크 (같은 파일 재업로드 시 스킵)
        const existing = await prisma.transaction.findUnique({
          where: { sourceRowHash: rowHash },
        });

        if (existing) {
          skippedCount++;
          continue;
        }

        // 계좌 생성 또는 조회
        const account = await prisma.account.upsert({
          where: { accountNumber: row.accountNumber },
          create: {
            accountNumber: row.accountNumber,
            accountType: normalizeAccountType(row.accountType),
          },
          update: {},
        });

        // 심볼 매핑 해결
        const symbolMapped = await resolveSymbol(row.symbol, row.description);

        // CON/WDR의 경우 CAD Equivalent 추출
        let cadEquivalent: number | null = null;
        if (row.action === "CON" || row.action === "WDR") {
          cadEquivalent = extractCadEquivalent(row.description);
        }

        // 트랜잭션 생성
        await prisma.transaction.create({
          data: {
            sourceRowHash: rowHash,
            transactionDate: row.transactionDate,
            settlementDate: row.settlementDate,
            action: row.action,
            symbol: row.symbol,
            symbolMapped,
            description: row.description,
            quantity: row.quantity,
            price: row.price,
            grossAmount: row.grossAmount,
            commission: row.commission,
            netAmount: row.netAmount,
            currency: row.currency,
            activityType: row.activityType,
            cadEquivalent,
            accountId: account.id,
            importFileId: importFile.id,
          },
        });

        insertedCount++;
      } catch (e) {
        failedRows.push({
          row: rowNumber,
          message: e instanceof Error ? e.message : "Unknown error",
        });
      }
    }

    // Import 기록 업데이트
    await prisma.importFile.update({
      where: { id: importFile.id },
      data: {
        insertedCount,
        skippedCount,
        failedCount: failedRows.length,
      },
    });

    return NextResponse.json({
      success: true,
      summary: {
        total: rows.length,
        inserted: insertedCount,
        skipped: skippedCount,
        failed: failedRows.length,
      },
      errors: failedRows.slice(0, 20), // 처음 20개 에러만 반환
    });
  } catch (error) {
    console.error("Import error:", error);
    return NextResponse.json(
      {
        error: "Import 실패",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

// Import 기록 조회
export async function GET() {
  try {
    const imports = await prisma.importFile.findMany({
      orderBy: { importedAt: "desc" },
      take: 20,
    });

    return NextResponse.json(imports);
  } catch (error) {
    console.error("Error fetching imports:", error);
    return NextResponse.json({ error: "Failed to fetch imports" }, { status: 500 });
  }
}
