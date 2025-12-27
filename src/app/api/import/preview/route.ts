import { NextRequest, NextResponse } from "next/server";
import Papa from "papaparse";
import {
  brokerMappings,
  mapTransactionType,
  type ColumnMapping,
} from "@/lib/validations/import";
import type { ImportPreview, ImportPreviewResponse } from "@/types";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;
    const broker = formData.get("broker") as string;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const text = await file.text();
    const parsed = Papa.parse(text, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim(),
    });

    // Get column mapping for broker (or use default)
    const mapping: ColumnMapping = brokerMappings[broker] || {
      ticker: "Symbol",
      type: "Type",
      quantity: "Quantity",
      price: "Price",
      fee: "Fee",
      tradeDate: "Date",
      note: "Note",
    };

    const preview: ImportPreview[] = [];
    const errors: string[] = [];

    for (let i = 0; i < parsed.data.length; i++) {
      const row = parsed.data[i] as Record<string, string>;

      try {
        const rawType = row[mapping.type];
        const type = mapTransactionType(rawType || "");

        if (!type) {
          errors.push(`Row ${i + 1}: Unknown transaction type "${rawType}"`);
          continue;
        }

        const ticker = row[mapping.ticker]?.trim().toUpperCase();
        if (!ticker) {
          errors.push(`Row ${i + 1}: Missing ticker`);
          continue;
        }

        const quantity = parseFloat(row[mapping.quantity]) || 0;
        const price = parseFloat(row[mapping.price]) || 0;
        const fee = mapping.fee ? parseFloat(row[mapping.fee]) || 0 : 0;
        const tradeDate = row[mapping.tradeDate];

        if (!tradeDate) {
          errors.push(`Row ${i + 1}: Missing trade date`);
          continue;
        }

        preview.push({
          rowNumber: i + 1,
          ticker,
          type,
          quantity: Math.abs(quantity),
          price: Math.abs(price),
          fee: Math.abs(fee),
          tradeDate,
          note: mapping.note ? row[mapping.note] : undefined,
          isValid: true,
        });
      } catch (err) {
        errors.push(`Row ${i + 1}: Parse error`);
      }
    }

    const response: ImportPreviewResponse = {
      preview: preview.slice(0, 200), // Limit preview
      totalRows: parsed.data.length,
      validRows: preview.length,
      errors: errors.slice(0, 50), // Limit errors shown
      columns: parsed.meta.fields || [],
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("Import preview failed:", error);
    return NextResponse.json(
      { error: "Failed to parse CSV" },
      { status: 500 }
    );
  }
}
