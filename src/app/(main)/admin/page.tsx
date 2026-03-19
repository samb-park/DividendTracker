import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { AdminUserList } from "./user-list";

export default async function AdminPage() {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") redirect("/");

  const users = await prisma.user.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      email: true,
      name: true,
      approved: true,
      role: true,
      createdAt: true,
    },
  });

  return (
    <div className="p-4 space-y-6 max-w-2xl mx-auto">
      <div className="text-xs tracking-widest font-medium" style={{ color: "hsl(var(--primary))" }}>
        ▶ USER MANAGEMENT
      </div>
      <AdminUserList users={users} currentUserId={session.user.id!} />
    </div>
  );
}
