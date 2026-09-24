import { AppShell } from "../../../components/player/app-shell";
import { KaCasefilesOverview } from "../../../components/player/ka-casefiles-overview";
import { isPlayerGamePlayable } from "../../../lib/server/content/player-evidence";

export default async function KaCasefilesPage() {
  const playable = await isPlayerGamePlayable("ka-casefiles");
  return (
    <AppShell pageTitle="The K.A. Casefiles">
      <KaCasefilesOverview playable={playable} />
    </AppShell>
  );
}
