import { auth } from "@/auth";
import { prisma } from "@/lib/db";

export async function requireCurrentUser() {
  const session = await auth();
  const email = session?.user?.email;

  if (!email) {
    throw new Error("UNAUTHORIZED");
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    throw new Error("UNAUTHORIZED");
  }

  return user;
}
