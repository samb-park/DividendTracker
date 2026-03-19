import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { prisma } from "@/lib/db";

export const { handlers, signIn, signOut, auth } = NextAuth({
  trustHost: true, // required for self-hosted behind reverse proxy (Cloudflare tunnel)
  debug: false,    // suppress next-auth v5 beta internal /_log calls in dev console
  providers: [Google],
  pages: {
    signIn: "/login",
  },
  callbacks: {
    async signIn({ user }) {
      if (!user.id || !user.email) return false;

      const adminEmail = process.env.ADMIN_EMAIL ?? process.env.ALLOWED_EMAIL;
      const isAdmin = user.email === adminEmail;

      // Upsert user record — create on first sign-in, update name/image on subsequent logins
      await prisma.user.upsert({
        where: { id: user.id },
        update: { name: user.name, image: user.image },
        create: {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
          approved: isAdmin,
          role: isAdmin ? "ADMIN" : "USER",
        },
      });

      // If admin signs in for the first time, claim all unclaimed portfolios + snapshots
      if (isAdmin) {
        await Promise.all([
          prisma.portfolio.updateMany({
            where: { userId: null },
            data: { userId: user.id },
          }),
          prisma.portfolioSnapshot.updateMany({
            where: { userId: null },
            data: { userId: user.id },
          }),
        ]);
      }

      return true; // allow all sign-ins; approval check happens in middleware
    },

    async jwt({ token, user, trigger }) {
      // On first sign-in, user object is present
      if (user?.id) token.userId = user.id;

      // Re-fetch approval status on every token refresh so admin changes take effect quickly
      if (token.userId) {
        const dbUser = await prisma.user.findUnique({
          where: { id: token.userId as string },
          select: { approved: true, role: true },
        });
        token.approved = dbUser?.approved ?? false;
        token.role = dbUser?.role ?? "USER";
      }

      return token;
    },

    async session({ session, token }) {
      session.user.id = token.userId as string;
      session.user.approved = token.approved as boolean;
      session.user.role = token.role as string;
      return session;
    },

    authorized({ auth: session }) {
      return !!session?.user;
    },
  },
});
