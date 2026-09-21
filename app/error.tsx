"use client";

import { AppShell } from "../components/player/app-shell";
import { ErrorState } from "../components/player/states";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <AppShell pageTitle="เกิดข้อผิดพลาด">
      <ErrorState onRetry={reset} />
    </AppShell>
  );
}
