import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getInterestProfile, saveInterestProfile } from "../route";

export const dynamic = "force-dynamic";

// GET: return current interest profile
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const profile = await getInterestProfile(session.user.id);
  return NextResponse.json(profile);
}

// POST: manually add a topic interest
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { topic, count = 1 } = await req.json() as { topic: string; count?: number };
  if (!topic?.trim()) return NextResponse.json({ error: "topic required" }, { status: 400 });

  const profile = await getInterestProfile(session.user.id);
  profile.topics[topic.trim()] = (profile.topics[topic.trim()] ?? 0) + count;
  await saveInterestProfile(session.user.id, profile);
  return NextResponse.json({ ok: true });
}

// DELETE: remove a topic from interests
export async function DELETE(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { topic } = await req.json() as { topic: string };

  const profile = await getInterestProfile(session.user.id);
  delete profile.topics[topic];
  delete profile.tickers[topic];
  await saveInterestProfile(session.user.id, profile);
  return NextResponse.json({ ok: true });
}
