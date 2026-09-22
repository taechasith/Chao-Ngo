import Image from "next/image";
import type { ReactNode } from "react";

import { AppShell } from "./app-shell";
export { ContextBreadcrumb } from "./context-breadcrumb";
export function PlayerShell({ children, pageTitle }: { children: ReactNode; pageTitle: string }) {
  return <AppShell pageTitle={pageTitle}>{children}</AppShell>;
}

export function PageIntro({ eyebrow, title, description, meta }: { eyebrow: string; title: string; description: string; meta?: string }) {
  return (
    <header className="interior-page-intro" data-player-reveal="heading">
      <span className="player-eyebrow">{eyebrow}</span>
      <h1>{title}</h1>
      <p>{description}</p>
      {meta ? <span className="interior-intro-meta">{meta}</span> : null}
    </header>
  );
}

export function DossierPanel({ image, alt, eyebrow, title, subtitle, children }: { image: string; alt: string; eyebrow: string; title: string; subtitle: string; children: ReactNode }) {
  return (
    <article className="interior-dossier-panel">
      <div className="interior-dossier-image">
        <Image alt={alt} fill priority sizes="(max-width: 54rem) 100vw, 62vw" src={image} />
        <span className="interior-image-index">CASE SCENE / 01</span>
      </div>
      <div className="interior-dossier-body">
        <span className="player-eyebrow">{eyebrow}</span>
        <h2>{title}</h2>
        <p className="interior-dossier-subtitle">{subtitle}</p>
        {children}
      </div>
    </article>
  );
}

export function CasePanel({ eyebrow, title, children }: { eyebrow: string; title: string; children: ReactNode }) {
  return (
    <section className="interior-case-panel">
      <span className="player-eyebrow">{eyebrow}</span>
      <h2>{title}</h2>
      {children}
    </section>
  );
}

export function EvidenceCell({ index, title, kind, viewed = false }: { index: number; title: string; kind: string; viewed?: boolean }) {
  return (
    <div className={`interior-evidence-cell${viewed ? " is-viewed" : ""}`}>
      <span className="interior-evidence-index">EVIDENCE {String(index).padStart(2, "0")}</span>
      <strong>{title}</strong>
      <small>{kind} · {viewed ? "เปิดแล้ว" : "รอการตรวจ"}</small>
    </div>
  );
}

export function SystemStatus({ label, children, tone = "teal" }: { label: string; children: ReactNode; tone?: "teal" | "ember" | "muted" }) {
  return (
    <div className={`interior-system-status interior-system-status--${tone}`} role="status">
      <span className="interior-system-led" aria-hidden="true" />
      <div><span>{label}</span><strong>{children}</strong></div>
    </div>
  );
}

export function DecisionPanel({ eyebrow, title, children, action }: { eyebrow: string; title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <aside className="interior-decision-panel">
      <span className="player-eyebrow">{eyebrow}</span>
      <h2>{title}</h2>
      <div className="interior-decision-copy">{children}</div>
      {action ? <div className="interior-decision-action">{action}</div> : null}
    </aside>
  );
}

export function UtilityStrip({ children }: { children: ReactNode }) {
  return <div className="interior-utility-strip">{children}</div>;
}

export function LockedState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return (
    <section className="interior-locked-state" aria-live="polite">
      <span className="player-eyebrow">SEALED / ยังไม่เปิด</span>
      <h2>{title}</h2>
      <p>{description}</p>
      {action}
    </section>
  );
}

export function EmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return (
    <section className="interior-empty-state" aria-live="polite">
      <span className="player-eyebrow">MIND STATE / EMPTY</span>
      <h2>{title}</h2>
      <p>{description}</p>
      {action}
    </section>
  );
}
