import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/auth";
import { z } from "zod";

const patchSchema = z.object({
  userId: z.string().min(1),
  approved: z.boolean().optional(),
  role: z.enum(["ADMIN", "USER"]).optional(),
});

async function requireAdmin() {
  const session = await auth();
  if (!session?.user) return null;
  if (session.user.role !== "ADMIN") return null;
  return session;
}

export async function GET() {
  if (!await requireAdmin()) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const users = await prisma.user.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      email: true,
      name: true,
      image: true,
      approved: true,
      role: true,
      createdAt: true,
    },
  });

  return NextResponse.json(users);
}

export async function PATCH(req: NextRequest) {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = patchSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request", details: parsed.error.flatten() }, { status: 400 });
  }
  const { userId, approved, role } = parsed.data;

  // Prevent admin from removing their own admin role
  if (userId === session.user.id && role === "USER") {
    return NextResponse.json({ error: "Cannot demote yourself" }, { status: 400 });
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      ...(approved !== undefined && { approved }),
      ...(role !== undefined && { role }),
    },
    select: { id: true, email: true, name: true, approved: true, role: true },
  });

  return NextResponse.json(updated);
}
