// Shared helper to clear a user's AI response cache (briefing / insights /
// projection). Called from /api/ai/cache route and from settings save handlers
// so that next AI page load reflects the latest settings.
import { prisma } from "@/lib/db";

export async function deleteUserAiCache(userId: string): Promise<void> {
  // AI cache keys are versioned via RULEBOOK_PROMPT_VERSION (e.g. ai_briefing_v4.1.8-6).
  // We delete by prefix so any past version's leftover entries are cleared too.
  const prefixes = [
    `${userId}:ai_cache:ai_briefing`,
    `${userId}:ai_cache_ts:ai_briefing`,
    `${userId}:ai_cache:ai_insights`,
    `${userId}:ai_cache_ts:ai_insights`,
    `${userId}:ai_cache:ai_projection`,
    `${userId}:ai_cache_ts:ai_projection`,
  ];
  await Promise.all(
    prefixes.map((p) =>
      prisma.setting.deleteMany({ where: { key: { startsWith: p } } }),
    ),
  );
}
