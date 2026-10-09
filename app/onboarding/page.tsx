import { AppShell } from "../../components/player/app-shell";
import { ResearchPartners } from "../../components/player/research-partners";
import { OnboardingFlow } from "../../components/player/onboarding-flow";

export default function OnboardingPage() {
  return (
    <AppShell pageTitle="เริ่มต้นการเล่น">
      <OnboardingFlow />
      <ResearchPartners />
    </AppShell>
  );
}
