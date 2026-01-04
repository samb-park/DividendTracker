import * as XLSX from "xlsx";

export interface ParsedRow {
  transactionDate: Date;
  settlementDate: Date;
  action: string;
  symbol: string | null;
  description: string;
  quantity: number | null;
  price: number | null;
  grossAmount: number | null;
  commission: number | null;
  netAmount: number | null;
  currency: string;
  accountNumber: string;
  activityType: string;
  accountType: string;
}

export interface ParseResult {
  rows: ParsedRow[];
  errors: { row: number; message: string; data?: Record<string, unknown> }[];
}

function parseExcelDate(value: unknown): Date | null {
  if (!value) return null;

  if (typeof value === "number") {
    // Excel serial date
    const date = XLSX.SSF.parse_date_code(value);
    return new Date(date.y, date.m - 1, date.d);
  }

  if (typeof value === "string") {
    // Handle "2025-12-31 12:00:00 AM" format
    const cleaned = value.replace(/ 12:00:00 AM$/, "");
    const parsed = new Date(cleaned);
    if (!isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  if (value instanceof Date) {
    return value;
  }

  return null;
}

function parseNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;

  if (typeof value === "number") return value;

  const cleaned = String(value).replace(/[$,]/g, "").trim();
  if (cleaned === "") return null;

  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

function normalizeAction(action: string): string {
  // Normalize case for action
  const upper = action.toUpperCase();
  const mapping: Record<string, string> = {
    BUY: "Buy",
    SELL: "Sell",
    REI: "REI",
    DIV: "DIV",
    CON: "CON",
    WDR: "WDR",
    DIS: "DIS",
    FXT: "FXT",
    ADJ: "ADJ",
    DEP: "DEP",
    INT: "INT",
    FCH: "FCH",
    TFI: "TFI",
    TFO: "TFO",
    EXP: "EXP",
    BRW: "BRW",
  };
  return mapping[upper] || action;
}

/**
 * Description에서 Action을 추론
 */
function inferActionFromDescription(description: string): string | null {
  const desc = description.toUpperCase();

  // 배당 관련
  if (desc.includes("DIVIDEND") || desc.includes("DIV ") || desc.includes("DIST ON") || desc.includes("TAX WITHHELD")) {
    return "DIV";
  }
  // 이자
  if (desc.includes("INTEREST")) {
    return "INT";
  }
  // 입금/출금
  if (desc.includes("CONTRIBUTION") || desc.includes("DEPOSIT")) {
    return "DEP";
  }
  if (desc.includes("WITHDRAWAL")) {
    return "WDR";
  }
  // 환전
  if (desc.includes("FX CONVERSION") || desc.includes("FOREX") || desc.includes("EXCHANGE")) {
    return "FXT";
  }
  // 주식 분할
  if (desc.includes("SPLIT") || desc.includes("DISTRIBUTION")) {
    return "DIS";
  }
  // 재투자
  if (desc.includes("REINVEST") || desc.includes("DRIP")) {
    return "REI";
  }
  // 수수료
  if (desc.includes("FEE") || desc.includes("CHARGE")) {
    return "FCH";
  }
  // 조정
  if (desc.includes("ADJUSTMENT") || desc.includes("REBATE") || desc.includes("REFUND")) {
    return "ADJ";
  }
  // 이체
  if (desc.includes("TRANSFER IN") || desc.includes("TFR IN")) {
    return "TFI";
  }
  if (desc.includes("TRANSFER OUT") || desc.includes("TFR OUT")) {
    return "TFO";
  }
  // 매수/매도
  if (desc.includes("BUY") || desc.includes("BOUGHT") || desc.includes("PURCHASE")) {
    return "Buy";
  }
  if (desc.includes("SELL") || desc.includes("SOLD")) {
    return "Sell";
  }

  return null;
}

export function parseExcelBuffer(buffer: Buffer): ParseResult {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];

  const jsonData = XLSX.utils.sheet_to_json(sheet, {
    raw: false,
    defval: null,
  });

  const rows: ParsedRow[] = [];
  const errors: ParseResult["errors"] = [];

  jsonData.forEach((rawRow: unknown, index: number) => {
    const row = rawRow as Record<string, unknown>;
    const rowNumber = index + 2; // +2 for header row and 0-index

    try {
      const transactionDate = parseExcelDate(row["Transaction Date"]);
      const settlementDate = parseExcelDate(row["Settlement Date"]);

      if (!transactionDate || !settlementDate) {
        errors.push({
          row: rowNumber,
          message: "Invalid date format",
          data: row,
        });
        return;
      }

      let action = row["Action"];
      const description = String(row["Description"] || "").trim();

      // Action이 없으면 Description에서 추론
      if (!action || (typeof action === "string" && action.trim() === "")) {
        const inferredAction = inferActionFromDescription(description);
        if (inferredAction) {
          action = inferredAction;
        } else {
          errors.push({
            row: rowNumber,
            message: `Missing action and could not infer from description: ${description}`,
            data: row,
          });
          return;
        }
      }

      const currency = row["Currency"];
      if (!currency || (currency !== "USD" && currency !== "CAD")) {
        errors.push({
          row: rowNumber,
          message: `Invalid currency: ${currency}`,
          data: row,
        });
        return;
      }

      const accountNumber = row["Account #"];
      if (!accountNumber) {
        errors.push({
          row: rowNumber,
          message: "Missing account number",
          data: row,
        });
        return;
      }

      const parsed: ParsedRow = {
        transactionDate,
        settlementDate,
        action: normalizeAction(String(action)),
        symbol: row["Symbol"] ? String(row["Symbol"]).trim() : null,
        description,
        quantity: parseNumber(row["Quantity"]),
        price: parseNumber(row["Price"]),
        grossAmount: parseNumber(row["Gross Amount"]),
        commission: parseNumber(row["Commission"]),
        netAmount: parseNumber(row["Net Amount"]),
        currency: String(currency),
        accountNumber: String(accountNumber).trim(),
        activityType: String(row["Activity Type"] || "").trim(),
        accountType: String(row["Account Type"] || "").trim(),
      };

      rows.push(parsed);
    } catch (e) {
      errors.push({
        row: rowNumber,
        message: e instanceof Error ? e.message : "Unknown error",
        data: row,
      });
    }
  });

  return { rows, errors };
}
