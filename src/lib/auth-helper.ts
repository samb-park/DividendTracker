import { getServerSession } from "next-auth";
import { authOptions } from "./auth";

export async function getSession() {
  return await getServerSession(authOptions);
}

export async function getCurrentUserId(): Promise<string | null> {
  const session = await getSession();
  // Check if user is approved
  if (session?.user && !session.user.approved) {
    return null;
  }
  return session?.user?.id || null;
}

export async function getCurrentUser() {
  const session = await getSession();
  return session?.user || null;
}

export async function isUserApproved(): Promise<boolean> {
  const session = await getSession();
  return session?.user?.approved || false;
}

export async function isAdmin(): Promise<boolean> {
  const session = await getSession();
  return session?.user?.role === "admin";
}

export async function requireAuth() {
  const userId = await getCurrentUserId();
  if (!userId) {
    throw new Error("Unauthorized");
  }
  return userId;
}
