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
