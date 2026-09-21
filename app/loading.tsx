import { AppShell } from "../components/player/app-shell";
import { LoadingState } from "../components/player/states";

export default function Loading() {
  return (
    <AppShell pageTitle="กำลังโหลด">
      <LoadingState />
    </AppShell>
  );
}
