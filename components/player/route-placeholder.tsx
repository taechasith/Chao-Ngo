import { AppShell } from "./app-shell";
import { Panel, StatusBadge } from "./panel";

type RoutePlaceholderProps = {
  description: string;
  title: string;
};

export function RoutePlaceholder({ description, title }: RoutePlaceholderProps) {
  return (
    <AppShell pageTitle={title}>
      <div className="max-w-3xl space-y-6">
        <div className="space-y-3">
          <StatusBadge>กำลังเตรียม</StatusBadge>
          <h1 className="font-display text-4xl text-white sm:text-5xl">{title}</h1>
        </div>
        <Panel>
          <p className="max-w-prose text-base leading-7 text-white/75">{description}</p>
        </Panel>
      </div>
    </AppShell>
  );
}
