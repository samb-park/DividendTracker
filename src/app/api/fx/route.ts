import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const FALLBACK_RATE = Number.parseFloat(process.env.DEFAULT_FX_RATE ?? "1.35");
const SOURCE = "Frankfurter USD/CAD";
const SOURCE_URL = "https://api.frankfurter.app/latest?from=USD&to=CAD";

function fallbackResponse() {
  return NextResponse.json({
    rate: Number.isFinite(FALLBACK_RATE) && FALLBACK_RATE > 0 ? FALLBACK_RATE : 1.35,
    source: "DEFAULT_FX_RATE",
    fallback: true,
    asOf: new Date().toISOString(),
  });
}

export async function GET() {
  try {
    const response = await fetch(SOURCE_URL, {
      next: { revalidate: 60 * 60 * 6 },
      headers: { accept: "application/json" },
    });
    if (!response.ok) return fallbackResponse();

    const data = await response.json() as { rates?: { CAD?: number }; date?: string };
    const rate = data.rates?.CAD;
    if (typeof rate !== "number" || !Number.isFinite(rate) || rate <= 0) return fallbackResponse();

    return NextResponse.json({
      rate,
      source: SOURCE,
      fallback: false,
      asOf: data.date ?? new Date().toISOString(),
    });
  } catch {
    return fallbackResponse();
  }
}
