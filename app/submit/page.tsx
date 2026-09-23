import { AppShell } from "../../components/player/app-shell";
import { SubmitFlow } from "../../components/player/submit-flow";

type SubmitPageProps = {
  searchParams: Promise<{ subgameId?: string }>;
};

export default async function SubmitPage({ searchParams }: SubmitPageProps) {
  const { subgameId = "" } = await searchParams;
  const validSubgameId = /^subgame-(?:node-zone-(?:quantum|space)|ka-(?:fintech|wa-ve))$/.test(subgameId)
    ? subgameId
    : "";
  const guideKey = /^subgame-ka-(?:fintech|wa-ve)$/.test(validSubgameId) ? "ka-submit" : "submit";

  return (
    <AppShell guideKey={guideKey} pageTitle="ส่งคำตอบ">
      <SubmitFlow initialSubgameId={validSubgameId} />
    </AppShell>
  );
}
