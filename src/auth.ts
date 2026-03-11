import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { prisma } from "@/lib/db";

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID || "missing-google-client-id",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "missing-google-client-secret",
    }),
  ],
  session: {
    strategy: "jwt",
  },
  callbacks: {
    async signIn({ user, account, profile }) {
      if (!user.email) return false;

      await prisma.user.upsert({
        where: { email: user.email },
        update: {
          displayName: user.name || null,
          image: user.image || null,
          googleId: typeof profile?.sub === "string" ? profile.sub : undefined,
        },
        create: {
          email: user.email,
          displayName: user.name || null,
          image: user.image || null,
          googleId: typeof profile?.sub === "string" ? profile.sub : null,
        },
      });

      return true;
    },
    async jwt({ token, user }) {
      if (user?.email) {
        const dbUser = await prisma.user.findUnique({ where: { email: user.email } });
        if (dbUser) {
          token.userId = dbUser.id;
          token.picture = dbUser.image || token.picture;
          token.name = dbUser.displayName || token.name;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && typeof token.userId === "string") {
        session.user.id = token.userId;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
});
