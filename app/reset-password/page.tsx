import { redirect } from "next/navigation";
import { authDestination } from "../../lib/auth-navigation";

export default async function LegacyAuthPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  redirect(`/login?next=${encodeURIComponent(authDestination(next))}`);
}
