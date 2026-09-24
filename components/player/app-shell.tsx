"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { gsap } from "gsap";
import { FolderOpen, House, LogOut, Menu, NotebookPen, Play, Send, Settings, UserRound, X } from "lucide-react";

import { AccountGate, type AccountStatus } from "./account-gate";
import { AchievementToast } from "./achievement-toast";
import { AutoGuide, HelpButton } from "./help-button";
import { ContextBreadcrumb } from "./context-breadcrumb";
import { UiSound } from "./ui-sound";

type AppShellProps = {
  children: ReactNode;
  fullBleed?: boolean;
  guideKey?: string;
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
  { href: "/settings", label: "ตั้งค่า", icon: Settings },
  { href: "/submit", label: "ส่งคำตอบ", icon: Send },
];

function stateForPath(pathname: string) {
  if (pathname === "/play") return "กำลังเลือกแฟ้ม";
  if (pathname === "/play/node-zone") return "NODE ZONE";
  if (pathname.includes("/quantum")) return "THE CORRECT TRAJECTORY";
  if (pathname.includes("/space")) return "THIRTEEN DAYS IN UTOPIA";
  if (pathname.includes("ka-casefiles/maimee") || pathname.includes("ka-casefiles/fintech")) return "NETLOOD CITY / คดี MAIMEE";
  if (pathname.includes("ka-casefiles/wa-ve") || pathname.includes("ka-casefiles/psychology") || pathname.includes("ka-casefiles/biotech")) return "NETLOOD CITY / คดี WA VE";
  if (pathname === "/play/ka-casefiles") return "NETLOOD CITY / เลือกคดี";
  if (pathname.includes("ka-casefiles")) return "THE K.A. CASEFILES";
  if (pathname === "/onboarding") return "กำลังเตรียมก่อนเปิดแฟ้ม";
  if (pathname === "/submit") return "รอการตัดสินใจ";
  if (pathname === "/profile") return "CASE ARCHIVE";
  if (pathname === "/settings") return "SYSTEM CONTROL";
  if (pathname === "/login" || pathname === "/signup") return "กำลังกลับเข้าสู่ระบบ";
  return "แฟ้มคดีพร้อม";
}

function contextForPath(pathname: string) {
  if (pathname === "/") return null;
  if (pathname === "/play") return { parent: "แฟ้มคดี", current: "CASE INDEX", href: "/play" };
  if (pathname === "/play/node-zone") return { parent: "แฟ้มคดี", current: "NODE ZONE", href: "/play" };
  if (pathname.includes("/quantum")) return { parent: "NODE ZONE", current: "THE CORRECT TRAJECTORY", href: "/play/node-zone" };
  if (pathname.includes("/space")) return { parent: "NODE ZONE", current: "THIRTEEN DAYS IN UTOPIA", href: "/play/node-zone" };
  if (pathname.includes("ka-casefiles/maimee") || pathname.includes("ka-casefiles/fintech")) return { parent: "THE K.A. CASEFILES", current: "คดี MAIMEE", href: "/play/ka-casefiles" };
  if (pathname.includes("ka-casefiles/wa-ve") || pathname.includes("ka-casefiles/psychology") || pathname.includes("ka-casefiles/biotech")) return { parent: "THE K.A. CASEFILES", current: "คดี WA VE", href: "/play/ka-casefiles" };
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
  if (pathname === "/play/ka-casefiles") return "ka-casefiles";
  if (pathname.includes("ka-casefiles/maimee") || pathname.includes("ka-casefiles/fintech")) return "ka-maimee";
  if (pathname.includes("ka-casefiles/wa-ve") || pathname.includes("ka-casefiles/psychology") || pathname.includes("ka-casefiles/biotech")) return "ka-wa-ve";
  if (pathname === "/onboarding") return "onboarding";
  if (pathname === "/submit") return "submit";
  return "default";
}

export function AppShell({ children, fullBleed = false, guideKey: providedGuideKey, pageTitle }: AppShellProps) {
  const pathname = usePathname();
  const topbarRef = useRef<HTMLElement>(null);
  const navFrameRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [utilityOpen, setUtilityOpen] = useState(false);
  const [accountStatus, setAccountStatus] = useState<AccountStatus>("checking");
  const [showSaveStatus, setShowSaveStatus] = useState(true);
  const state = stateForPath(pathname);
  const context = contextForPath(pathname);
  const guideKey = providedGuideKey ?? guideKeyForPath(pathname);
  const requiresAccount = pathname.startsWith("/play") || pathname === "/submit" || pathname === "/profile";
  const showGameplayTools = requiresAccount && accountStatus === "signed-in";

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

  useEffect(() => {
    try { setShowSaveStatus(window.localStorage.getItem("jao-ngoh-show-save-status") !== "false"); } catch { /* Keep the visible default. */ }
  }, []);

  useEffect(() => {
    const frame = navFrameRef.current;
    if (!frame || window.matchMedia("(prefers-reduced-motion: reduce)").matches || ["reduce", "off"].includes(document.documentElement.dataset.motion ?? "")) return;
    let animationFrame = 0;
    const updateLight = (event: PointerEvent) => {
      const bounds = frame.getBoundingClientRect();
      const x = event.clientX - bounds.left;
      const y = event.clientY - bounds.top;
      cancelAnimationFrame(animationFrame);
      animationFrame = requestAnimationFrame(() => {
        frame.style.setProperty("--mx", `${x.toFixed(1)}px`);
        frame.style.setProperty("--my", `${y.toFixed(1)}px`);
      });
    };
    const enter = () => frame.style.setProperty("--lit", "1");
    const leave = () => frame.style.setProperty("--lit", "0");
    frame.addEventListener("pointermove", updateLight, { passive: true });
    frame.addEventListener("pointerenter", enter);
    frame.addEventListener("pointerleave", leave);
    return () => {
      cancelAnimationFrame(animationFrame);
      frame.removeEventListener("pointermove", updateLight);
      frame.removeEventListener("pointerenter", enter);
      frame.removeEventListener("pointerleave", leave);
    };
  }, []);

  useEffect(() => setUtilityOpen(false), [pathname]);

  useEffect(() => {
    if (!requiresAccount) {
      setAccountStatus("signed-in");
      return;
    }

    const controller = new AbortController();
    void fetch("/api/player-session", { credentials: "same-origin", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          setAccountStatus("unavailable");
          return;
        }
        const payload = await response.json() as { state?: AccountStatus };
        setAccountStatus(payload.state === "signed-in" || payload.state === "signed-out" || payload.state === "unavailable"
          ? payload.state
          : "unavailable");
      })
      .catch(() => {
        if (!controller.signal.aborted) setAccountStatus("unavailable");
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
        <div className="player-nav-frame" ref={navFrameRef}>
          <i aria-hidden="true" className="player-nav-extrusion" />
          <i aria-hidden="true" className="player-nav-frame-lines" />
          <i aria-hidden="true" className="player-nav-glint" />
          <i aria-hidden="true" className="player-nav-corner player-nav-corner--tl" />
          <i aria-hidden="true" className="player-nav-corner player-nav-corner--tr" />
          <i aria-hidden="true" className="player-nav-corner player-nav-corner--bl" />
          <i aria-hidden="true" className="player-nav-corner player-nav-corner--br" />
          <Link aria-label="กลับสู่ภาพรวมเจ้าเงาะ" className="player-brand" href="/">
            <span className="player-brand-wordmark">เจ้าเงาะ</span><span aria-hidden="true" className="player-brand-dot" />
          </Link>
          <nav aria-label="เมนูหลัก" className="player-primary-nav">
            {primaryLinks.map((link) => {
              const Icon = link.icon;
              return <Link aria-current={link.match(pathname) ? "page" : undefined} aria-label={link.label} className="player-nav-link" href={link.href} key={link.label} title={link.label}>
                <span aria-hidden="true" className="player-nav-icon"><Icon size={15} /></span>
                <span className="player-nav-label">{link.label}</span>
              </Link>;
            })}
          </nav>
          <div className="player-nav-actions">
            <p aria-live="polite" className="player-terminal">
              <span aria-hidden="true" className="player-terminal-led" />
              <span className="player-terminal-prefix">mind@chao-ngo ~ $</span>
              <span className="player-terminal-state">{showSaveStatus ? state : ""}</span>
            </p>
            <button aria-expanded={utilityOpen} aria-controls="player-utilities" aria-label="เปิดเมนูเครื่องมือ" title="เมนูและเครื่องมือ" className="player-utility-trigger" ref={triggerRef} onClick={() => setUtilityOpen((open) => !open)} type="button">
              {utilityOpen ? <X aria-hidden="true" size={19} /> : <Menu aria-hidden="true" size={19} />}
            </button>
          </div>
          {utilityOpen ? <div className="player-utility-menu" id="player-utilities" ref={menuRef}>
            <nav aria-label="เมนูหลักบนโทรศัพท์" className="player-menu-primary">
              {primaryLinks.map((link) => <Link aria-current={link.match(pathname) ? "page" : undefined} href={link.href} key={link.label}>{link.label}</Link>)}
            </nav>
            <p className="player-eyebrow">เครื่องมือ</p>
            {utilityLinks.map((link) => {
              const Icon = link.icon;
              return <Link aria-current={pathname === link.href ? "page" : undefined} href={link.href} key={link.href} title={link.label}>
                <span aria-hidden="true" className="player-utility-icon"><Icon size={15} /></span>
                <span>{link.label}</span>
              </Link>;
            })}
            <HelpButton guideKey={guideKey} pageTitle={pageTitle} />
            {accountStatus === "signed-in" ? <button className="player-utility-link" onClick={() => { void fetch("/api/auth/sign-out", { body: "{}", credentials: "same-origin", headers: { "Content-Type": "application/json" }, method: "POST" }).then((response) => { if (response.ok) window.location.assign("/login"); }); }} type="button">
              <span aria-hidden="true" className="player-utility-icon"><LogOut size={15} /></span>
              <span>ออกจากระบบ</span>
            </button> : null}
          </div> : null}
        </div>
      </header>

      {context ? (
        <div className="player-context-wrap">
          <ContextBreadcrumb {...context} />
        </div>
      ) : null}

      <main className={`${fullBleed ? "player-main player-main--bleed" : "player-main"}${showGameplayTools ? " player-main--with-dock" : ""}`} data-guide="player-main" id="player-main" ref={contentRef} tabIndex={-1}>
        {requiresAccount
          ? accountStatus === "signed-in"
            ? children
            : <AccountGate redirectTo={pathname} status={accountStatus} />
          : children}
      </main>

      {showGameplayTools ? <nav aria-label="เครื่องมือหลัก" className="player-corner-tools">
        <Link href="/profile">โปรไฟล์</Link>
        <Link href="/submit">ส่งคำตอบ</Link>
        <HelpButton guideKey={guideKey} pageTitle={pageTitle} />
      </nav> : null}

      {accountStatus === "signed-in" && guideKey !== "default" ? <AutoGuide guideKey={guideKey} pageTitle={pageTitle} /> : null}
      {accountStatus === "signed-in" && requiresAccount ? <AchievementToast /> : null}

      {showGameplayTools ? <nav aria-label="เมนูด่วน" className="player-mobile-dock">
        <Link aria-current={pathname.startsWith("/play") ? "page" : undefined} className="player-mobile-link" href="/play">แฟ้ม</Link>
        <Link aria-current={pathname === "/profile" ? "page" : undefined} className="player-mobile-link" href="/profile">โปรไฟล์</Link>
        <Link aria-current={pathname === "/submit" ? "page" : undefined} className="player-mobile-link" href="/submit">ส่งคำตอบ</Link>
        <HelpButton compact guideKey={guideKey} pageTitle={pageTitle} />
        </nav> : null}
      <UiSound />
    </div>
  );
}
