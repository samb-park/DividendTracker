import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { parseExcelBuffer } from '@/lib/excel/parser';
import { computeRowHash, computeFileHash } from '@/lib/excel/hasher';
import {
  extractCadEquivalent,
  normalizeAccountType,
} from '@/lib/excel/normalizer';
import { resolveSymbol } from '@/lib/mappings/symbolMap';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json(
        { error: '파일이 제공되지 않았습니다' },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const fileHash = computeFileHash(buffer);

    // Excel 파싱
    const { rows, errors } = parseExcelBuffer(buffer);

    if (rows.length === 0) {
      return NextResponse.json(
        {
          error: '파싱된 데이터가 없습니다',
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

    // 1. 기존 데이터 로드를 위한 날짜 범위 계산
    const dates = rows.map((r) => r.transactionDate.getTime());
    const minDate = new Date(Math.min(...dates));
    const maxDate = new Date(Math.max(...dates));

    // 2. 해당 범위의 기존 트랜잭션 조회
    const existingTransactions = await prisma.transaction.findMany({
      where: {
        transactionDate: {
          gte: minDate,
          lte: maxDate,
        },
      },
      select: {
        transactionDate: true,
        action: true,
        symbol: true,
        netAmount: true,
        currency: true,
        account: {
          select: { accountNumber: true },
        },
      },
    });

    // 3. 서명 맵 생성 (Signature -> Count)
    const generateSignature = (r: {
      transactionDate: Date;
      action: string;
      symbol: string | null;
      netAmount: number | null;
      currency: string;
      accountNumber: string;
    }) => {
      const dateStr = r.transactionDate.toISOString().split('T')[0];
      const amountStr = r.netAmount?.toFixed(2) || '0.00';
      return `${dateStr}|${r.action}|${r.symbol || ''}|${amountStr}|${
        r.currency
      }|${r.accountNumber}`;
    };

    const signatureMap = new Map<string, number>();
    existingTransactions.forEach((tx) => {
      const sig = generateSignature({
        ...tx,
        accountNumber: tx.account.accountNumber,
      });
      signatureMap.set(sig, (signatureMap.get(sig) || 0) + 1);
    });

    let insertedCount = 0;
    let skippedCount = 0;
    const failedRows: Array<{ row: number; message: string }> = [...errors];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNumber = i + 2; // +2 for header and 0-index

      try {
        const rowHash = computeRowHash(row, i, fileHash);

        // 4. 중복 체크: FileHash 기반이 아닌 컨텐츠 기반 체크
        const currentSig = generateSignature(row);
        const existingCount = signatureMap.get(currentSig) || 0;

        if (existingCount > 0) {
          // 동일한 내용의 트랜잭션이 이미 존재하면 스킵
          signatureMap.set(currentSig, existingCount - 1); // 카운트 차감 (1:1 매칭)
          skippedCount++;
          continue;
        }

        // 혹시 같은 파일을 재업로드하는 경우를 대비해 sourceRowHash 체크도 유지 (DB constraint 에러 방지)
        // 하지만 위에서 내용 기반으로 걸러지므로, 내용이 같은데 Hash가 다른 경우(다른 파일)는 위에서 걸러짐.
        // 내용이 같은데 Hash가 같은 경우(같은 파일 재업로드)도 위에서 걸러짐.
        // 단, Hash가 이미 존재하면 무조건 스킵 (Unique constraint)
        const hashExists = await prisma.transaction.findUnique({
          where: { sourceRowHash: rowHash },
        });
        if (hashExists) {
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
        if (row.action === 'CON' || row.action === 'WDR') {
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
          message: e instanceof Error ? e.message : 'Unknown error',
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
    console.error('Import error:', error);
    return NextResponse.json(
      {
        error: 'Import 실패',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

// Import 기록 조회
export async function GET() {
  try {
    const imports = await prisma.importFile.findMany({
      orderBy: { importedAt: 'desc' },
      take: 20,
    });

    return NextResponse.json(imports);
  } catch (error) {
    console.error('Error fetching imports:', error);
    return NextResponse.json(
      { error: 'Failed to fetch imports' },
      { status: 500 }
    );
  }
}
