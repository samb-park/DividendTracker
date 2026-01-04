import crypto from "crypto";
import { ParsedRow } from "./parser";

/**
 * SHA256 해시를 계산하여 중복 방지에 사용
 * 해시 입력: rowIndex|transactionDate|settlementDate|action|symbol|description|quantity|price|grossAmount|commission|netAmount|currency|accountNumber|fileHash
 * rowIndex와 fileHash를 포함하여 같은 파일 내 동일 거래도 구분
 */
export function computeRowHash(row: ParsedRow, rowIndex: number, fileHash: string): string {
  const parts = [
    rowIndex.toString(),
    row.transactionDate.toISOString().split("T")[0], // YYYY-MM-DD
    row.settlementDate.toISOString().split("T")[0],
    row.action,
    row.symbol || "",
    row.description.trim().replace(/\s+/g, " "), // normalize whitespace
    row.quantity?.toString() || "",
    row.price?.toString() || "",
    row.grossAmount?.toString() || "",
    row.commission?.toString() || "",
    row.netAmount?.toString() || "",
    row.currency,
    row.accountNumber,
    fileHash,
  ];

  const hashInput = parts.join("|");
  return crypto.createHash("sha256").update(hashInput).digest("hex");
}

/**
 * 파일 해시 계산 (선택적 - 같은 파일 재업로드 감지용)
 */
export function computeFileHash(buffer: Buffer): string {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}
