/**
 * Serialization utilities for passing data from Server Components to Client Components.
 *
 * Prisma's Decimal type (from decimal.js) is not natively serializable by React's
 * server-to-client props serialization. This module provides utilities to properly
 * convert Prisma data (including Decimals and Dates) into JSON-serializable formats.
 *
 * Usage:
 *   import { serializeForClient } from '@/lib/serialize';
 *   const data = serializeForClient(prismaData);
 */

/**
 * Recursively serialize Prisma/DB objects for client component props.
 * - Decimal objects → string (via toString())
 * - Date objects → ISO string (via toISOString())
 * - Plain objects/arrays are recursed into
 * - Primitives are returned as-is
 *
 * This is a cleaner alternative to JSON.parse(JSON.stringify(...)) which also
 * works but is less explicit about the conversion.
 */
export function serializeForClient(data: unknown): unknown {
  if (data === null || data === undefined) {
    return data;
  }

  // Check for Date first (instanceof works reliably)
  if (data instanceof Date) {
    return data.toISOString();
  }

  // Check for Prisma Decimal-like object
  // Prisma Decimal objects are not plain objects - they have toString but not valueOf as a function
  if (
    typeof data === 'object' &&
    !Array.isArray(data) &&
    'toString' in data &&
    typeof (data as Record<string, unknown>).toString === 'function' &&
    !('valueOf' in data && typeof (data as Record<string, unknown>).valueOf === 'function')
  ) {
    // This is a Decimal-like object - call toString to get the string representation
    return (data as { toString(): string }).toString();
  }

  if (Array.isArray(data)) {
    return data.map(serializeForClient);
  }

  if (typeof data === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
      result[key] = serializeForClient(value);
    }
    return result;
  }

  return data;
}

/**
 * Convert a Decimal-like value to a number, handling string/number inputs safely.
 * Uses parseFloat but with trimming to handle whitespace edge cases.
 *
 * For financial calculations where precision matters, consider using decimal.js
 * or rounding the result to a reasonable number of decimal places.
 */
export function decimalToNumber(value: string | number | null | undefined, decimals = 4): number {
  if (value == null) return 0;
  if (typeof value === 'number') {
    // Round to avoid floating-point precision issues
    return Math.round(value * Math.pow(10, decimals)) / Math.pow(10, decimals);
  }
  const parsed = parseFloat(String(value).trim());
  if (isNaN(parsed)) return 0;
  // Round to avoid floating-point precision issues
  return Math.round(parsed * Math.pow(10, decimals)) / Math.pow(10, decimals);
}

/**
 * Format a number for display with a specific number of decimal places.
 * Useful for financial values where you want consistent formatting.
 */
export function fmtNumber(value: number, decimals = 2): string {
  return value.toLocaleString('en-CA', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}
