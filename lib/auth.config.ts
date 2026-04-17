import { PrismaAdapter } from "@auth/prisma-adapter";
import type { NextAuthConfig } from "next-auth";
import Azure from "@auth/core/providers/azure-ad";
import CredentialsProvider from "@auth/core/providers/credentials";
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
    };
    accessToken?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: "admin" | "manager" | "member" | "viewer";
    azureAdId?: string;
  }
}

export const authConfig: NextAuthConfig = {
  adapter: PrismaAdapter(prisma),
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  providers: [
    // Microsoft Azure AD (Mandatory)
    Azure({
      clientId: process.env.APPLICATION_ID || "",
      clientSecret: process.env.CLIENT_SECRET_VALUE || "",
      tenantId: process.env.TENANT_ID || "",
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
    async jwt({ token, user, account }) {
      // Add user data to token on login
      if (user) {
        token.id = user.id;
        const dbUser = await prisma.user.findUnique({
          where: { id: user.id },
        });
        token.role = (dbUser?.role as any) || "member";
        token.azureAdId = dbUser?.azureAdId;
      }

      // Handle Azure AD login
      if (account?.provider === "azure-ad") {
        token.azureAdId = account.providerAccountId;
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = (token.role as any) || "member";
      }
      return session;
    },
    async signIn({ user, account }) {
      // Always allow credentials login
      if (account?.provider === "credentials") {
        return true;
      }

      // Handle Azure AD sign-in
      if (account?.provider === "azure-ad") {
        // Update or create user with Azure AD info
        if (user.email) {
          await prisma.user.upsert({
            where: { email: user.email },
            update: {
              azureAdId: account.providerAccountId,
              name: user.name || user.email,
              image: user.image,
            },
            create: {
              email: user.email,
              name: user.name || user.email,
              image: user.image,
              role: "member",
              azureAdId: account.providerAccountId,
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
        pathname.startsWith("/team")
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
