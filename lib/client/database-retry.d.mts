export function fetchWithDatabaseRetry(input: string | URL, init?: RequestInit, options?: {
  fetcher?: typeof fetch;
  sleep?: (milliseconds: number) => Promise<void>;
  onRetry?: (attempt: number) => void;
}): Promise<Response>;
