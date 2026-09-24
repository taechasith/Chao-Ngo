import { AppShell } from "../../../components/player/app-shell";
import { KaCasefilesOverview } from "../../../components/player/ka-casefiles-overview";

export default function KaCasefilesPage() {
  return (
    <AppShell pageTitle="The K.A. Casefiles">
      <KaCasefilesOverview />
    </AppShell>
  );
}
