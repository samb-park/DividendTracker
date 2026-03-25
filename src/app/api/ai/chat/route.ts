import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { callOpenAI, buildPortfolioContext, checkAndIncrementAiCalls } from "@/lib/openai";

export const dynamic = "force-dynamic";

interface ChatMessage { role: string; content: string; }

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;

  const { allowed, remaining } = await checkAndIncrementAiCalls(userId);
  if (!allowed) return NextResponse.json({ error: "Daily AI call limit reached", remaining: 0 }, { status: 429 });

  const { message, history = [] } = (await req.json()) as { message: string; history?: ChatMessage[] };
  if (!message?.trim()) return NextResponse.json({ error: "message is required" }, { status: 400 });

  const context = await buildPortfolioContext(userId);
  const parsed = JSON.parse(context) as { investorProfile?: { age?: number; retirementAge?: number; yearsToRetirement?: number; annualIncomeCAD?: number; rrspRoomEstimate?: number } };
  const profile = parsed.investorProfile;
  const notes: string[] = [];
  if (profile?.retirementAge && profile?.yearsToRetirement !== undefined)
    notes.push(`${profile.retirementAge}세 은퇴 목표 (${profile.yearsToRetirement}년 남음)`);
  if (profile?.annualIncomeCAD)
    notes.push(`연소득 CAD $${profile.annualIncomeCAD.toLocaleString()} (RRSP 연간 한도 추정 ~$${profile.rrspRoomEstimate?.toLocaleString()})`);
  const profileNote = notes.length > 0 ? ` 투자자 정보: ${notes.join(", ")}. 이를 바탕으로 맞춤 조언.` : "";
  const systemPrompt = `캐나다 배당 투자 전문 어시스턴트. TFSA/RRSP/FHSA/NON_REG 계좌 전문가. 간결하게 답변 (3문장 이내).${profileNote} 포트폴리오 데이터:\n${context}`;

  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    ...history.slice(-6),
    { role: "user", content: message.trim() },
  ];

  const reply = await callOpenAI("", messages, 300);
  return NextResponse.json({ reply, remaining });
}
