import NextAuth from "next-auth";
import { prisma } from "@/lib/db";
import { authConfig } from "./auth.config";

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  debug: false, // suppress next-auth v5 beta internal /_log calls in dev console
  callbacks: {
    ...authConfig.callbacks,

    async signIn({ user }) {
      if (!user.id || !user.email) return false;

      const adminEmail = process.env.ADMIN_EMAIL ?? process.env.ALLOWED_EMAIL;
      const isAdmin = user.email === adminEmail;

      // Look up by email first — handles legacy records whose ID differs from Google sub
      const existing = await prisma.user.findUnique({ where: { email: user.email } });

      if (existing) {
        // Reuse the stored ID so JWT / session stay consistent with DB relations
        user.id = existing.id;
        await prisma.user.update({
          where: { id: existing.id },
          data: {
            name: user.name,
            image: user.image,
            // Ensure admin always has correct flags (e.g. after migration)
            ...(isAdmin && { approved: true, role: "ADMIN" }),
          },
        });
      } else {
        await prisma.user.create({
          data: {
            id: user.id,
            email: user.email,
            name: user.name,
            image: user.image,
            approved: isAdmin,
            role: isAdmin ? "ADMIN" : "USER",
          },
        });

        // New admin: claim all unclaimed portfolios + snapshots
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
      }

      return true; // allow all sign-ins; approval check happens in middleware
    },

    async jwt({ token, user }) {
      // On sign-in, user is present — fetch approved/role from DB and store in token
      if (user?.id) {
        token.userId = user.id;
        token.validatedAt = Date.now();
        const dbUser = await prisma.user.findUnique({
          where: { id: user.id },
          select: { approved: true, role: true },
        });
        token.approved = dbUser?.approved ?? false;
        token.role = dbUser?.role ?? "USER";
      } else if (token.userId) {
        // Re-validate approved/role from DB every 15 minutes so revocations take effect promptly
        const age = Date.now() - ((token.validatedAt as number) ?? 0);
        if (age > 15 * 60 * 1000) {
          const dbUser = await prisma.user.findUnique({
            where: { id: token.userId as string },
            select: { approved: true, role: true },
          });
          token.approved = dbUser?.approved ?? false;
          token.role = dbUser?.role ?? "USER";
          token.validatedAt = Date.now();
        }
      }
      return token;
    },

    async session({ session, token }) {
      session.user.id = token.userId as string;
      session.user.approved = token.approved as boolean;
      session.user.role = token.role as string;
      return session;
    },
  },
});
