import { betterAuth } from "better-auth";
import { env } from "cloudflare:workers";

import { getAuthReadiness } from "./auth-config";
import { sendPasswordResetEmail, sendVerificationEmail } from "./email";

type AuthBindings = CloudflareEnv & {
  BETTER_AUTH_SECRET?: string;
  BETTER_AUTH_URL?: string;
};

const bindings = env as AuthBindings;

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

  return betterAuth({
    baseURL: readiness.baseURL,
    database: bindings.DB,
    emailAndPassword: {
      autoSignIn: false,
      enabled: true,
      maxPasswordLength: 128,
      minPasswordLength: 12,
      requireEmailVerification: true,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => {
        await sendPasswordResetEmail({ email: user.email, url });
      },
    },
    emailVerification: {
      autoSignInAfterVerification: true,
      sendOnSignIn: true,
      sendOnSignUp: true,
      sendVerificationEmail: async ({ user, url }) => {
        await sendVerificationEmail({ email: user.email, url });
      },
    },
    rateLimit: {
      customRules: {
        "/request-password-reset": { max: 3, window: 60 },
        "/send-verification-email": { max: 3, window: 60 },
        "/sign-in/email": { max: 5, window: 60 },
        "/sign-up/email": { max: 5, window: 60 },
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
