import { betterAuth } from "better-auth";
import { env } from "cloudflare:workers";

import { getAuthReadiness, getGoogleAuthConfiguration } from "./auth-config";
import { verifyLegacyGoogleAccount } from "./google-account-migration";

type AuthBindings = CloudflareEnv & {
  BETTER_AUTH_SECRET?: string;
  BETTER_AUTH_URL?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
};

const bindings = env as AuthBindings;

export function getGoogleAuthConfigurationForRuntime() {
  return getGoogleAuthConfiguration({ baseURL: bindings.BETTER_AUTH_URL, secret: bindings.BETTER_AUTH_SECRET, clientId: bindings.GOOGLE_CLIENT_ID, clientSecret: bindings.GOOGLE_CLIENT_SECRET });
}

export function getAuthReadinessForRuntime() {
  return getAuthReadiness({
    baseURL: bindings.BETTER_AUTH_URL,
    secret: bindings.BETTER_AUTH_SECRET,
  });
}

export function getAuth() {
  const readiness = getAuthReadinessForRuntime();

  if (!readiness.isReady) {
    throw new Error("Authentication is not configured.");
  }
  const google = getGoogleAuthConfigurationForRuntime();

  return betterAuth({
    baseURL: readiness.baseURL,
    database: bindings.DB,
    emailAndPassword: { enabled: false },
    disabledPaths: ["/sign-in/email", "/sign-up/email", "/request-password-reset", "/reset-password", "/send-verification-email", "/verify-email", "/change-password", "/set-password"],
    socialProviders: google ? {
      google: {
        ...google,
        accessType: "online",
        includeGrantedScopes: false,
        prompt: "select_account",
        mapProfileToUser: async (profile) => {
          await verifyLegacyGoogleAccount(bindings.DB, profile);
          return {};
        },
      },
    } : {},
    account: {
      encryptOAuthTokens: true,
      accountLinking: { enabled: true, trustedProviders: [], allowDifferentEmails: false, requireLocalEmailVerified: true, updateUserInfoOnLink: false },
    },
    user: {
      validateUserInfo: ({ user, source }) => {
        if (source.method === "oauth" && (source.oauth?.providerId !== "google" || user.emailVerified !== true)) return { error: "google_email_not_verified" };
      },
    },
    onAPIError: { errorURL: `${readiness.baseURL ?? ""}/login` },
    rateLimit: {
      customRules: {
        "/sign-in/social": { max: 5, window: 60 },
      },
      enabled: true,
      max: 30,
      storage: "database",
      window: 60,
    },
    secret: readiness.secret,
    trustedOrigins: readiness.baseURL ? [readiness.baseURL] : [],
    advanced: {
      ipAddress: {
        ipAddressHeaders: ["cf-connecting-ip", "x-forwarded-for"],
      },
    },
  });
}
