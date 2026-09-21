"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { gsap } from "gsap";
import { Menu, X } from "lucide-react";

import { HelpButton } from "./help-button";

type AppShellProps = {
  children: ReactNode;
  fullBleed?: boolean;
  pageTitle: string;
};

const primaryLinks = [
  { href: "/", label: "ภาพรวม", match: (path: string) => path === "/" },
  { href: "/play", label: "แฟ้มคดี", match: (path: string) => path.startsWith("/play") },
  { href: "/onboarding", label: "งานวิจัย", match: (path: string) => path === "/onboarding" },
  { href: "/onboarding", label: "เริ่มเล่น", match: () => false },
];

const utilityLinks = [
  { href: "/profile", label: "โปรไฟล์" },
  { href: "/settings", label: "ตั้งค่า" },
  { href: "/submit", label: "ส่งคำตอบ" },
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
  if (pathname === "/settings") return "กำลังปรับประสบการณ์";
  if (pathname === "/login" || pathname === "/signup") return "กำลังกลับเข้าสู่ระบบ";
  return "แฟ้มคดีพร้อม";
}

export function AppShell({ children, fullBleed = false, pageTitle }: AppShellProps) {
  const pathname = usePathname();
  const contentRef = useRef<HTMLElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [utilityOpen, setUtilityOpen] = useState(false);
  const state = stateForPath(pathname);

  useLayoutEffect(() => {
    const content = contentRef.current;
    try {
      const preference = window.localStorage.getItem("jao-ngoh-motion");
      if (preference) document.documentElement.dataset.motion = preference;
    } catch { /* The OS preference still applies when storage is unavailable. */ }
    const motionReduced = document.documentElement.dataset.motion === "reduce"
      || window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (!content || motionReduced) return;

    const context = gsap.context(() => {
      const heading = content.querySelectorAll<HTMLElement>("[data-player-reveal='heading']");
      const primary = content.querySelectorAll<HTMLElement>("[data-player-reveal='primary']");

      if (heading.length) {
        gsap.fromTo(heading, { autoAlpha: 0, y: 16 }, { autoAlpha: 1, y: 0, duration: 0.56, ease: "power3.out" });
      }

      if (primary.length) {
        gsap.fromTo(primary, { autoAlpha: 0, y: 18 }, { autoAlpha: 1, y: 0, duration: 0.66, ease: "power3.out", stagger: 0.09, delay: 0.08 });
      }
    }, content);

    return () => context.revert();
  }, [pathname]);

  useEffect(() => setUtilityOpen(false), [pathname]);

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
      <header className="player-topbar">
        <div className="player-nav-frame">
          <Link aria-label="กลับสู่ภาพรวมเจ้าเงาะ" className="player-brand" href="/">
            เจ้าเงาะ<span aria-hidden="true">.</span>
          </Link>
          <nav aria-label="เมนูหลัก" className="player-primary-nav">
            {primaryLinks.map((link) => (
              <Link
                aria-current={link.match(pathname) ? "page" : undefined}
                className="player-nav-link"
                href={link.href}
                key={link.label}
              >
                {link.label}
              </Link>
            ))}
          </nav>
          <div className="player-nav-actions">
            <p aria-live="polite" className="player-terminal">
              <span aria-hidden="true" className="player-terminal-led" />
              <span className="player-terminal-prefix">mind@jao-ngoh ~ $</span>
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
              <p className="player-menu-state">{state}</p>
              <nav aria-label="เมนูหลักบนโทรศัพท์" className="player-menu-primary">
                {primaryLinks.map((link) => <Link aria-current={link.match(pathname) ? "page" : undefined} href={link.href} key={link.label}>{link.label}</Link>)}
              </nav>
              <p className="player-eyebrow">เครื่องมือของคุณ</p>
              {utilityLinks.map((link) => <Link aria-current={pathname === link.href ? "page" : undefined} href={link.href} key={link.href}>{link.label}</Link>)}
              <HelpButton pageTitle={pageTitle} />
            </div>
          ) : null}
        </div>
      </header>

      <main className={fullBleed ? "player-main player-main--bleed" : "player-main"} id="player-main" ref={contentRef} tabIndex={-1}>
        {children}
      </main>

      <nav aria-label="เมนูด่วน" className="player-mobile-dock">
        <Link aria-current={pathname.startsWith("/play") ? "page" : undefined} className="player-mobile-link" href="/play">แฟ้ม</Link>
        <Link aria-current={pathname === "/profile" ? "page" : undefined} className="player-mobile-link" href="/profile">โปรไฟล์</Link>
        <Link aria-current={pathname === "/submit" ? "page" : undefined} className="player-mobile-link" href="/submit">ส่งคำตอบ</Link>
        <HelpButton compact pageTitle={pageTitle} />
      </nav>
    </div>
  );
}
