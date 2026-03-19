import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";

// Edge-safe config — no Prisma, used by middleware
export const authConfig = {
  trustHost: true,
  providers: [Google],
  pages: {
    signIn: "/login",
  },
  callbacks: {
    jwt({ token, user }) {
      // Store userId/approved/role on sign-in; subsequent calls just pass through
      if (user?.id) token.userId = user.id;
      return token;
    },
    session({ session, token }) {
      session.user.id = token.userId as string;
      session.user.approved = token.approved as boolean;
      session.user.role = token.role as string;
      return session;
    },
    authorized({ auth: session }) {
      return !!session?.user;
    },
  },
} satisfies NextAuthConfig;
