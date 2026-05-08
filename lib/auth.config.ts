import { PrismaAdapter } from "@auth/prisma-adapter";
import type { NextAuthConfig } from "next-auth";
import Azure from "next-auth/providers/azure-ad";
import CredentialsProvider from "next-auth/providers/credentials";
import bcryptjs from "bcryptjs";
import { prisma } from "./prisma";

// Extend the Session interface to include role
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email: string;
      name: string;
      image?: string;
      role: "admin" | "manager" | "member" | "viewer";
      mustChangePassword?: boolean;
    };
    accessToken?: string;
  }
}

export const authConfig: NextAuthConfig = {
  adapter: PrismaAdapter(prisma),
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  providers: [
    // Microsoft Azure AD / Entra ID
    Azure({
      clientId: process.env.APPLICATION_ID || "",
      clientSecret: process.env.CLIENT_SECRET_VALUE || "",
      issuer: `https://login.microsoftonline.com/${process.env.TENANT_ID || "common"}/v2.0`,
      allowDangerousEmailAccountLinking: true,
    }),
    // Credentials provider for email/password login
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email", placeholder: "user@example.com" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        try {
          if (!credentials?.email || !credentials?.password) {
            return null;
          }

          const user = await prisma.user.findUnique({
            where: { email: credentials.email as string },
          });

          if (!user || !user.password) {
            return null;
          }

          const isPasswordValid = await bcryptjs.compare(
            credentials.password as string,
            user.password
          );

          if (!isPasswordValid) {
            return null;
          }

          return {
            id: user.id,
            email: user.email,
            name: user.name,
            image: user.image,
          };
        } catch (error) {
          console.error("Credentials auth error:", error);
          return null;
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, account, profile, trigger }) {
      // Add user data to token on login
      if (user) {
        token.id = user.id;
        const dbUser = await prisma.user.findUnique({
          where: { id: user.id },
        });
        token.role = (dbUser?.role as any) || "member";
        token.azureAdId = dbUser?.azureAdId;
        token.mustChangePassword = !!dbUser?.mustChangePassword;
      }

      // After password change we call session.update() — re-read the flag from DB.
      if (trigger === "update" && token.id) {
        const dbUser = await prisma.user.findUnique({
          where: { id: token.id as string },
          select: { mustChangePassword: true, role: true },
        });
        token.mustChangePassword = !!dbUser?.mustChangePassword;
        token.role = (dbUser?.role as any) || token.role;
      }

      // Handle Azure AD login — prefer `oid` (Object ID) over `sub`
      // because `sub` is a pairwise per-app identifier that Graph does not
      // resolve as a user.
      if (account?.provider === "azure-ad") {
        const oid = (profile as { oid?: string } | undefined)?.oid;
        token.azureAdId = oid ?? account.providerAccountId;
        // OAuth users never go through the temp-password flow.
        token.mustChangePassword = false;
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = (token.role as any) || "member";
        session.user.mustChangePassword = !!token.mustChangePassword;
      }
      return session;
    },
    async signIn({ user, account, profile }) {
      // Always allow credentials login
      if (account?.provider === "credentials") {
        return true;
      }

      // Handle Azure AD sign-in
      if (account?.provider === "azure-ad") {
        const oid = (profile as { oid?: string } | undefined)?.oid;
        const azureAdId = oid ?? account.providerAccountId;
        if (user.email) {
          await prisma.user.upsert({
            where: { email: user.email },
            update: {
              azureAdId,
              name: user.name || user.email,
              image: user.image,
            },
            create: {
              email: user.email,
              name: user.name || user.email,
              image: user.image,
              role: "member",
              azureAdId,
            },
          });
        }
        return true;
      }

      return false;
    },
    async authorized({ request, auth }) {
      const { pathname } = request.nextUrl;

      if (pathname.startsWith("/admin")) {
        return auth?.user?.role === "admin";
      }

      if (pathname.startsWith("/settings")) {
        return ["admin", "manager"].includes(auth?.user?.role || "");
      }

      if (
        pathname.startsWith("/dashboard") ||
        pathname.startsWith("/projects") ||
        pathname.startsWith("/board") ||
        pathname.startsWith("/calendar") ||
        pathname.startsWith("/files") ||
        pathname.startsWith("/team") ||
        pathname.startsWith("/reports") ||
        pathname.startsWith("/timeline") ||
        pathname.startsWith("/profile")
      ) {
        return !!auth?.user;
      }

      return true;
    },
  },
  pages: {
    signIn: "/auth/signin",
    error: "/auth/error",
  },
};
