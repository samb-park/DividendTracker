import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getBroker } from "@/lib/brokers/registry";

export const dynamic = "force-dynamic";

// GET /api/brokers/[broker]/positions
//   404 unknown broker · 501 not implemented · 200 {configured:false} when no keys
//   · 200 {positions} when configured · 502 on upstream error. Never fabricates.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ broker: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { broker: id } = await params;
  const broker = getBroker(id);
  if (!broker) {
    return NextResponse.json({ error: "Unknown broker" }, { status: 404 });
  }
  if (!broker.implemented) {
    return NextResponse.json(
      { broker: broker.id, implemented: false, note: broker.note ?? "미구현" },
      { status: 501 }
    );
  }
  if (!broker.isConfigured()) {
    return NextResponse.json({
      broker: broker.id,
      configured: false,
      requiredEnv: broker.requiredEnv,
    });
  }

  try {
    const positions = await broker.listPositions();
    return NextResponse.json({ broker: broker.id, configured: true, positions });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { broker: broker.id, configured: true, error: msg },
      { status: 502 }
    );
  }
}
