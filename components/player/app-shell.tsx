"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { gsap } from "gsap";
import { Compass, FolderOpen, House, Menu, NotebookPen, Play, Send, UserRound, X } from "lucide-react";

import { AccountGate, type AccountStatus } from "./account-gate";
import { AchievementToast } from "./achievement-toast";
import { AutoGuide, HelpButton } from "./help-button";
import { ContextBreadcrumb } from "./context-breadcrumb";

type AppShellProps = {
  children: ReactNode;
  fullBleed?: boolean;
  pageTitle: string;
};

const primaryLinks = [
  { href: "/", label: "ภาพรวม", match: (path: string) => path === "/", icon: House },
  { href: "/play", label: "แฟ้มคดี", match: (path: string) => path.startsWith("/play"), icon: FolderOpen },
  { href: "/onboarding", label: "งานวิจัย", match: (path: string) => path === "/onboarding", icon: NotebookPen },
  { href: "/onboarding", label: "เริ่มเล่น", match: () => false, icon: Play },
];

const utilityLinks = [
  { href: "/profile", label: "โปรไฟล์", icon: UserRound },
  { href: "/submit", label: "ส่งคำตอบ", icon: Send },
];

function stateForPath(pathname: string) {
  if (pathname === "/play") return "กำลังเลือกแฟ้ม";
  if (pathname === "/play/node-zone") return "เลือกจุดเริ่มต้น";
  if (pathname.includes("/quantum")) return "คดีควอนตัมเปิดอยู่";
  if (pathname.includes("/space")) return "คดีอวกาศเปิดอยู่";
  if (pathname.includes("ka-casefiles")) return "แฟ้มคดียังไม่เปิด";
  if (pathname === "/onboarding") return "กำลังเตรียมก่อนเปิดแฟ้ม";
  if (pathname === "/submit") return "รอการตัดสินใจ";
  if (pathname === "/profile") return "กำลังทบทวนความคืบหน้า";
  if (pathname === "/login" || pathname === "/signup") return "กำลังกลับเข้าสู่ระบบ";
  return "แฟ้มคดีพร้อม";
}

function contextForPath(pathname: string) {
  if (pathname === "/") return null;
  if (pathname === "/play") return { parent: "แฟ้มคดี", current: "CASE INDEX", href: "/play" };
  if (pathname === "/play/node-zone") return { parent: "แฟ้มคดี", current: "NODE ZONE", href: "/play" };
  if (pathname.includes("/quantum")) return { parent: "NODE ZONE", current: "THE CORRECT TRAJECTORY", href: "/play/node-zone" };
  if (pathname.includes("/space")) return { parent: "NODE ZONE", current: "THIRTEEN DAYS IN UTOPIA", href: "/play/node-zone" };
  if (pathname.includes("ka-casefiles")) return { parent: "แฟ้มคดี", current: "THE K.A. CASEFILES", href: "/play" };
  if (pathname === "/onboarding") return { parent: "งานวิจัย", current: "ก่อนเริ่มแฟ้มคดี", href: "/onboarding" };
  if (pathname === "/submit") return { parent: "แฟ้มคดี", current: "ส่งคำตอบ", href: "/play" };
  if (pathname === "/profile") return { parent: "เจ้าเงาะ", current: "ความคืบหน้า", href: "/" };
  if (pathname === "/login" || pathname === "/signup") return { parent: "เจ้าเงาะ", current: "กลับเข้าสู่ระบบ", href: "/" };
  return { parent: "เจ้าเงาะ", current: "แฟ้มคดี", href: "/play" };
}

function guideKeyForPath(pathname: string) {
  if (pathname === "/play/node-zone") return "timeline";
  if (pathname.includes("/quantum")) return "quantum";
  if (pathname.includes("/space")) return "space";
  if (pathname === "/onboarding") return "onboarding";
  if (pathname === "/submit") return "submit";
  return "default";
}

export function AppShell({ children, fullBleed = false, pageTitle }: AppShellProps) {
  const pathname = usePathname();
  const topbarRef = useRef<HTMLElement>(null);
  const contentRef = useRef<HTMLElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [utilityOpen, setUtilityOpen] = useState(false);
  const [accountStatus, setAccountStatus] = useState<AccountStatus>("checking");
  const state = stateForPath(pathname);
  const context = contextForPath(pathname);
  const guideKey = guideKeyForPath(pathname);
  const requiresAccount = pathname.startsWith("/play");

  useLayoutEffect(() => {
    const content = contentRef.current;
    const topbar = topbarRef.current;
    try {
      const preference = window.localStorage.getItem("jao-ngoh-motion");
      if (preference) document.documentElement.dataset.motion = preference;
    } catch { /* The OS preference still applies when storage is unavailable. */ }
    const motionReduced = document.documentElement.dataset.motion === "reduce"
      || window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (motionReduced) {
      if (topbar) gsap.set(topbar, { autoAlpha: 1, y: 0 });
      if (content) gsap.set(content.querySelectorAll("[data-player-reveal]"), { autoAlpha: 1, y: 0 });
      return;
    }

    const context = gsap.context(() => {
      if (topbar) {
        const brand = topbar.querySelector<HTMLElement>(".player-brand");
        const links = topbar.querySelectorAll<HTMLElement>(".player-nav-link");
        const terminal = topbar.querySelector<HTMLElement>(".player-terminal");
        const trigger = topbar.querySelector<HTMLElement>(".player-utility-trigger");

        gsap.fromTo(topbar, { autoAlpha: 0, y: -16, scale: 0.985 }, { autoAlpha: 1, y: 0, scale: 1, duration: 0.92, ease: "power3.out" });
        if (brand) gsap.fromTo(brand, { autoAlpha: 0, y: -10 }, { autoAlpha: 1, y: 0, duration: 0.72, ease: "power3.out", delay: 0.08 });
        if (links.length) gsap.fromTo(links, { autoAlpha: 0, y: -8 }, { autoAlpha: 1, y: 0, duration: 0.68, ease: "power3.out", stagger: 0.05, delay: 0.12 });
        if (terminal) gsap.fromTo(terminal, { autoAlpha: 0, x: 10 }, { autoAlpha: 1, x: 0, duration: 0.6, ease: "power3.out", delay: 0.18 });
        if (trigger) gsap.fromTo(trigger, { autoAlpha: 0, scale: 0.92 }, { autoAlpha: 1, scale: 1, duration: 0.56, ease: "power3.out", delay: 0.22 });
      }

      if (content) {
        const heading = content.querySelectorAll<HTMLElement>("[data-player-reveal='heading']");
        const primary = content.querySelectorAll<HTMLElement>("[data-player-reveal='primary']");

        if (heading.length) {
          gsap.fromTo(heading, { autoAlpha: 0, y: 16 }, { autoAlpha: 1, y: 0, duration: 0.56, ease: "power3.out" });
        }

        if (primary.length) {
          gsap.fromTo(primary, { autoAlpha: 0, y: 18 }, { autoAlpha: 1, y: 0, duration: 0.66, ease: "power3.out", stagger: 0.09, delay: 0.08 });
        }
      }
    }, topbar || content || undefined);

    return () => context.revert();
  }, [pathname]);

  useEffect(() => setUtilityOpen(false), [pathname]);

  useEffect(() => {
    if (!requiresAccount) {
      setAccountStatus("signed-in");
      return;
    }

    const controller = new AbortController();
    void fetch("/api/auth/get-session", { credentials: "same-origin", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          setAccountStatus("signed-out");
          return;
        }
        const payload = await response.json() as { user?: { id?: string } | null };
        setAccountStatus(payload.user?.id ? "signed-in" : "signed-out");
      })
      .catch(() => {
        if (!controller.signal.aborted) setAccountStatus("signed-out");
      });

    return () => controller.abort();
  }, [pathname, requiresAccount]);

  useEffect(() => {
    if (!utilityOpen) return;
    menuRef.current?.querySelector<HTMLElement>("a, button")?.focus();
    const dismiss = (event: PointerEvent) => {
      if (document.querySelector("dialog[open]")) return;
      if (event.target instanceof Node && !menuRef.current?.contains(event.target) && !triggerRef.current?.contains(event.target)) setUtilityOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !document.querySelector("dialog[open]")) {
        setUtilityOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", escape);
    };
  }, [utilityOpen]);

  useEffect(() => {
    const previousTitle = document.title;
    document.title = `${pageTitle} | เจ้าเงาะ`;
    return () => { document.title = previousTitle; };
  }, [pageTitle]);

  return (
    <div className="player-shell min-h-screen text-white">
      <a className="player-skip-link" href="#player-main">ข้ามไปยังเนื้อหา</a>
      <header className="player-topbar" ref={topbarRef}>
        <div className="player-nav-frame">
            <Link aria-label="กลับสู่ภาพรวมเจ้าเงาะ" className="player-brand" href="/">
            เจ้าเงาะ<img alt="" aria-hidden="true" className="player-brand-mark" src="/rambutan.svg" />
          </Link>
          <nav aria-label="เมนูหลัก" className="player-primary-nav">
            {primaryLinks.map((link) => {
              const Icon = link.icon;
              return (
                <Link
                  aria-current={link.match(pathname) ? "page" : undefined}
                  aria-label={link.label}
                  className="player-nav-link"
                  href={link.href}
                  key={link.label}
                  title={link.label}
                >
                  <span aria-hidden="true" className="player-nav-icon"><Icon size={15} /></span>
                  <span className="player-nav-label">{link.label}</span>
                </Link>
              );
            })}
          </nav>
          <div className="player-nav-actions">
            <p aria-live="polite" className="player-terminal">
              <span aria-hidden="true" className="player-terminal-led" />
              <span className="player-terminal-prefix">mind@chao-ngo ~ $</span>
              <span>{state}</span>
            </p>
            <button
              aria-expanded={utilityOpen}
              aria-controls="player-utilities"
              aria-label="เปิดเมนูเครื่องมือ"
              title="เมนูและเครื่องมือ"
              className="player-utility-trigger"
              ref={triggerRef}
              onClick={() => setUtilityOpen((open) => !open)}
              type="button"
            >
              {utilityOpen ? <X aria-hidden="true" size={19} /> : <Menu aria-hidden="true" size={19} />}
            </button>
          </div>
          {utilityOpen ? (
            <div className="player-utility-menu" id="player-utilities" ref={menuRef}>
              <nav aria-label="เมนูหลักบนโทรศัพท์" className="player-menu-primary">
                {primaryLinks.map((link) => <Link aria-current={link.match(pathname) ? "page" : undefined} href={link.href} key={link.label}>{link.label}</Link>)}
              </nav>
              <p className="player-eyebrow">เครื่องมือ</p>
              {utilityLinks.map((link) => {
                const Icon = link.icon;
                return (
                  <Link aria-current={pathname === link.href ? "page" : undefined} href={link.href} key={link.href} title={link.label}>
                    <span aria-hidden="true" className="player-utility-icon"><Icon size={15} /></span>
                    <span>{link.label}</span>
                  </Link>
                );
              })}
              <HelpButton guideKey={guideKey} pageTitle={pageTitle} />
            </div>
          ) : null}
        </div>
      </header>

      {context ? (
        <div className="player-context-wrap">
          <ContextBreadcrumb {...context} />
        </div>
      ) : null}

      <main className={fullBleed ? "player-main player-main--bleed" : "player-main"} id="player-main" ref={contentRef} tabIndex={-1}>
        {requiresAccount
          ? accountStatus === "signed-in"
            ? children
            : <AccountGate redirectTo={pathname} status={accountStatus} />
          : children}
      </main>

      <nav aria-label="เครื่องมือหลัก" className="player-corner-tools">
        <Link href="/profile">โปรไฟล์</Link>
        <Link href="/submit">ส่งคำตอบ</Link>
        <HelpButton guideKey={guideKey} pageTitle={pageTitle} />
      </nav>

      {accountStatus === "signed-in" && guideKey !== "default" ? <AutoGuide guideKey={guideKey} pageTitle={pageTitle} /> : null}
      {accountStatus === "signed-in" && requiresAccount ? <AchievementToast /> : null}

      <nav aria-label="เมนูด่วน" className="player-mobile-dock">
        <Link aria-current={pathname.startsWith("/play") ? "page" : undefined} className="player-mobile-link" href="/play">แฟ้ม</Link>
        <Link aria-current={pathname === "/profile" ? "page" : undefined} className="player-mobile-link" href="/profile">โปรไฟล์</Link>
        <Link aria-current={pathname === "/submit" ? "page" : undefined} className="player-mobile-link" href="/submit">ส่งคำตอบ</Link>
        <HelpButton compact guideKey={guideKey} pageTitle={pageTitle} />
      </nav>
    </div>
  );
}
