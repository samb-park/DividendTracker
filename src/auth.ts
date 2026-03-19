import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

export const { handlers, signIn, signOut, auth } = NextAuth({
  trustHost: true, // required for self-hosted behind reverse proxy (Cloudflare tunnel)
  debug: false,    // suppress next-auth v5 beta internal /_log calls in dev console
  providers: [Google],
  pages: {
    signIn: "/login",
  },
  callbacks: {
    async signIn({ user }) {
      const allowed = process.env.ALLOWED_EMAIL;
      if (!allowed) {
        console.warn("[AUTH] ALLOWED_EMAIL is not set — any Google account can sign in");
        return true;
      }
      return user.email === allowed;
    },
    authorized({ auth: session }) {
      return !!session?.user;
    },
  },
});
