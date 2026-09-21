import { AppShell } from "../../components/player/app-shell";
import { SubmitFlow } from "../../components/player/submit-flow";

type SubmitPageProps = {
  searchParams: Promise<{ subgameId?: string }>;
};

export default async function SubmitPage({ searchParams }: SubmitPageProps) {
  const { subgameId = "" } = await searchParams;
  const validSubgameId = /^subgame-node-zone-(quantum|space)$/.test(subgameId) ? subgameId : "";

  return (
    <AppShell pageTitle="ส่งคำตอบ">
      <SubmitFlow initialSubgameId={validSubgameId} />
    </AppShell>
  );
}
