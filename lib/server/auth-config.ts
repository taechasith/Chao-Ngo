export const minimumAuthSecretLength = 32;

type AuthEnvironment = {
  baseURL?: string;
  secret?: string;
};

export type AuthReadiness =
  | { baseURL?: string; isReady: true; secret: string }
  | { isReady: false };

function readHttpUrl(value: string | undefined): string | undefined {
  const trimmed = value?.trim();

  if (!trimmed) {
    return undefined;
  }

  try {
    const url = new URL(trimmed);

    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return undefined;
    }

    return url.toString().replace(/\/$/, "");
  } catch {
    return undefined;
  }
}

export function getAuthReadiness(environment: AuthEnvironment): AuthReadiness {
  const secret = environment.secret?.trim();

  if (!secret || secret.length < minimumAuthSecretLength) {
    return { isReady: false };
  }

  if (environment.baseURL?.trim() && !readHttpUrl(environment.baseURL)) {
    return { isReady: false };
  }

  return {
    baseURL: readHttpUrl(environment.baseURL),
    isReady: true,
    secret,
  };
}

export function getGoogleAuthConfiguration(environment: AuthEnvironment & { clientId?: string; clientSecret?: string }) {
  const auth = getAuthReadiness(environment);
  const clientId = environment.clientId?.trim();
  const clientSecret = environment.clientSecret?.trim();
  if (!auth.isReady || !auth.baseURL || !clientId?.endsWith(".apps.googleusercontent.com") || !clientSecret) return undefined;
  return { clientId, clientSecret };
}
