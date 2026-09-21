import { AppShell } from "../../components/player/app-shell";
import { OnboardingFlow } from "../../components/player/onboarding-flow";

export default function OnboardingPage() {
  return (
    <AppShell pageTitle="เริ่มต้นการเล่น">
      <OnboardingFlow />
    </AppShell>
  );
}
