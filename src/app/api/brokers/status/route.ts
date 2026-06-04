import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { brokerStatuses } from "@/lib/brokers/registry";

export const dynamic = "force-dynamic";

// GET /api/brokers/status → honest config/implementation status per broker.
export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ brokers: brokerStatuses() });
}
