import { type NextAuthOptions } from "next-auth";
import type { Adapter, AdapterAccount, AdapterUser } from "next-auth/adapters";
import GoogleProvider from "next-auth/providers/google";
import { prisma } from "./db";

const ADMIN_EMAIL = "goorooru@gmail.com";

// Helper to convert Prisma user to AdapterUser
function toAdapterUser(user: {
  id: string;
  name: string | null;
  email: string | null;
  emailVerified: Date | null;
  image: string | null;
}): AdapterUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email || "",
    emailVerified: user.emailVerified,
    image: user.image,
  };
}

// Custom adapter that uses AuthAccount instead of Account
function CustomPrismaAdapter(): Adapter {
  return {
    createUser: async (data: Omit<AdapterUser, "id">) => {
      // Auto-approve and set role for admin email
      const isAdmin = data.email === ADMIN_EMAIL;
      const user = await prisma.user.create({
        data: {
          name: data.name,
          email: data.email,
          emailVerified: data.emailVerified,
          image: data.image,
          role: isAdmin ? "admin" : "user",
          approved: isAdmin,
        },
      });
      return toAdapterUser(user);
    },
    getUser: async (id) => {
      const user = await prisma.user.findUnique({ where: { id } });
      return user ? toAdapterUser(user) : null;
    },
    getUserByEmail: async (email) => {
      const user = await prisma.user.findUnique({ where: { email } });
      return user ? toAdapterUser(user) : null;
    },
    getUserByAccount: async (provider_providerAccountId) => {
      const account = await prisma.authAccount.findUnique({
        where: {
          provider_providerAccountId: {
            provider: provider_providerAccountId.provider,
            providerAccountId: provider_providerAccountId.providerAccountId,
          },
        },
        include: { user: true },
      });
      return account?.user ? toAdapterUser(account.user) : null;
    },
    updateUser: async ({ id, ...data }) => {
      const user = await prisma.user.update({ where: { id }, data });
      return toAdapterUser(user);
    },
    deleteUser: async (id) => {
      await prisma.user.delete({ where: { id } });
    },
    linkAccount: async (data: AdapterAccount) => {
      await prisma.authAccount.create({
        data: {
          userId: data.userId,
          type: data.type,
          provider: data.provider,
          providerAccountId: data.providerAccountId,
          refresh_token: data.refresh_token,
          access_token: data.access_token,
          expires_at: data.expires_at,
          token_type: data.token_type,
          scope: data.scope,
          id_token: data.id_token,
          session_state: data.session_state as string | undefined,
        },
      });
      return data;
    },
    unlinkAccount: async (provider_providerAccountId) => {
      await prisma.authAccount.delete({
        where: {
          provider_providerAccountId: {
            provider: provider_providerAccountId.provider,
            providerAccountId: provider_providerAccountId.providerAccountId,
          },
        },
      });
    },
    createSession: (data) => {
      return prisma.session.create({ data });
    },
    getSessionAndUser: async (sessionToken) => {
      const sessionAndUser = await prisma.session.findUnique({
        where: { sessionToken },
        include: { user: true },
      });
      if (!sessionAndUser) return null;
      const { user, ...session } = sessionAndUser;
      return { user: toAdapterUser(user), session };
    },
    updateSession: (data) => {
      return prisma.session.update({
        where: { sessionToken: data.sessionToken },
        data,
      });
    },
    deleteSession: async (sessionToken) => {
      await prisma.session.delete({ where: { sessionToken } });
    },
    createVerificationToken: (data) => {
      return prisma.verificationToken.create({ data });
    },
    useVerificationToken: async (identifier_token) => {
      try {
        return await prisma.verificationToken.delete({
          where: {
            identifier_token: {
              identifier: identifier_token.identifier,
              token: identifier_token.token,
            },
          },
        });
      } catch {
        return null;
      }
    },
  };
}

export const authOptions: NextAuthOptions = {
  adapter: CustomPrismaAdapter(),
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  session: {
    strategy: "database",
  },
  cookies: {
    sessionToken: {
      name: `next-auth.session-token`,
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: false,
      },
    },
  },
  callbacks: {
    session: async ({ session, user }) => {
      // Fetch user with role and approved status
      const dbUser = await prisma.user.findUnique({
        where: { id: user.id },
        select: { role: true, approved: true },
      });
      return {
        ...session,
        user: {
          ...session.user,
          id: user.id,
          role: dbUser?.role || "user",
          approved: dbUser?.approved || false,
        },
      };
    },
    signIn: async ({ user }) => {
      // Check if user is approved
      const dbUser = await prisma.user.findUnique({
        where: { id: user.id },
        select: { approved: true, email: true },
      });
      // Admin is always allowed
      if (dbUser?.email === ADMIN_EMAIL) {
        return true;
      }
      // Allow sign in but will redirect to pending page via middleware
      return true;
    },
    redirect: ({ url, baseUrl }) => {
      // Always redirect to dashboard after sign in
      if (url.includes("callbackUrl")) {
        const callbackUrl = new URL(url, baseUrl).searchParams.get("callbackUrl");
        if (callbackUrl) {
          return callbackUrl.startsWith("/") ? `${baseUrl}${callbackUrl}` : callbackUrl;
        }
      }
      if (url.startsWith("/")) return `${baseUrl}${url}`;
      if (url.startsWith(baseUrl)) return url;
      return `${baseUrl}/dashboard`;
    },
  },
  pages: {
    signIn: "/login",
  },
  debug: process.env.NODE_ENV === "development",
};
