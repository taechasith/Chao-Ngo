import { AppShell } from "../../../components/player/app-shell";
import { KaCasefilesOverview } from "../../../components/player/ka-casefiles-overview";

import { getPlayerCatalog } from "../../../lib/server/content/player-catalog";

export default async function KaCasefilesPage() {
  const catalog = await getPlayerCatalog();
  const game = catalog?.find(item => item.slug === "ka-casefiles");
  const cases = game?.status === "playable" ? game.cases : [];
  return (
    <AppShell pageTitle="The K.A. Casefiles">
      <KaCasefilesOverview cases={cases} unavailable={catalog === null} />
    </AppShell>
  );
}
