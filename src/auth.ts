import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

export const { handlers, signIn, signOut, auth } = NextAuth({
  trustHost: true, // required for self-hosted behind reverse proxy (Cloudflare tunnel)
  providers: [Google],
  pages: {
    signIn: "/login",
  },
  callbacks: {
    async signIn({ user }) {
      const allowed = process.env.ALLOWED_EMAIL;
      if (!allowed) return true; // no restriction set
      return user.email === allowed;
    },
    authorized({ auth: session }) {
      return !!session?.user;
    },
  },
});
