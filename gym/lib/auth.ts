import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { env } from "./env";

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 30 },
  secret: env.NEXTAUTH_SECRET,
  providers: [
    CredentialsProvider({
      name: "Password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = credentials?.email?.toLowerCase().trim();
        const password = credentials?.password;
        if (!email || !password) return null;
        if (!env.AUTH_ALLOWED_EMAIL || !env.AUTH_PASSWORD_HASH) return null;
        if (email !== env.AUTH_ALLOWED_EMAIL.toLowerCase()) return null;
        const ok = await bcrypt.compare(password, env.AUTH_PASSWORD_HASH);
        if (!ok) return null;
        return { id: "kyle", email, name: "Kyle" };
      },
    }),
  ],
  pages: { signIn: "/login" },
  callbacks: {
    async jwt({ token, user }) {
      if (user) token.email = user.email;
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.email) session.user.email = token.email as string;
      return session;
    },
  },
};

export async function verifyPassword(password: string): Promise<boolean> {
  if (!env.AUTH_PASSWORD_HASH) return false;
  return bcrypt.compare(password, env.AUTH_PASSWORD_HASH);
}
