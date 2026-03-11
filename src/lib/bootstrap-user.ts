import { prisma } from "@/lib/db";

const DEFAULT_BOOTSTRAP_EMAIL = "sam@local.dev";

export async function ensureBootstrapUser() {
  const existing = await prisma.user.findFirst({
    orderBy: { createdAt: "asc" },
  });

  if (existing) return existing;

  return prisma.user.create({
    data: {
      email: DEFAULT_BOOTSTRAP_EMAIL,
      displayName: "Sam",
    },
  });
}
