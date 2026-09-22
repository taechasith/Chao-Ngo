"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, ArrowRight, CircleHelp, SkipForward, X } from "lucide-react";

type GuideStep = {
  body: string;
  title: string;
  target: string;
};

type HelpButtonProps = {
  compact?: boolean;
  guideKey?: string;
  pageTitle: string;
};

const guideSteps: Record<string, GuideStep[]> = {
  timeline: [
    { target: "node-zone-timeline", title: "Timeline เริ่มตรงนี้", body: "เลือกช่วงเหตุการณ์ที่อยากเปิดก่อนได้ คุณไม่จำเป็นต้องรู้เรื่องทั้งหมดก่อนเริ่ม" },
    { target: "node-zone-evidence", title: "เปิดวัตถุพยานทีละชิ้น", body: "ไฟล์ในแต่ละช่วงช่วยให้คุณเห็นบริบท หลักฐาน และความเชื่อมโยงของเรื่อง" },
    { target: "node-zone-ai", title: "AI คือขั้นตอนของการสืบ", body: "ใช้ AI คู่คิดตามเงื่อนไขของคดี แล้วเก็บบทสนทนาเป็น PDF สำหรับตอนส่งคำตอบ" },
    { target: "node-zone-submit", title: "ส่งเมื่อคุณพร้อม", body: "กลับมาที่หน้า Submit เพื่อทำ post-test และแนบ PDF บทสนทนากับ AI ให้ครบ" },
  ],
  quantum: [
    { target: "case-objective", title: "นี่คือสิ่งที่คดีต้องการให้คุณอธิบาย", body: "ใช้ข้อมูลที่ตรวจสอบได้สร้างคำอธิบายของคุณเองก่อนตัดสินใจ" },
    { target: "case-brief", title: "อ่านบริบทก่อนเริ่มเชื่อมหลักฐาน", body: "Case Brief สรุปวิธีสำรวจคดีโดยไม่บอกคำตอบแทนคุณ" },
    { target: "case-timeline", title: "ดูว่าเหตุการณ์นี้อยู่ตรงไหนของเรื่อง", body: "Timeline ให้คุณเลือกเปิดช่วงเหตุการณ์และย้อนกลับมาดูได้เสมอ" },
    { target: "case-evidence", title: "เปิดวัตถุพยานทีละชิ้น", body: "ลองดูสิ่งที่ไฟล์บอกจริง ๆ แล้วจดสิ่งที่ทำให้สมมติฐานของคุณเปลี่ยน" },
    { target: "case-ai", title: "ใช้ AI เพื่อมองข้อมูลอีกมุม", body: "AI ช่วยตั้งคำถามและทดสอบคำอธิบายได้ แต่ไม่ควรตอบแทนคุณ" },
    { target: "case-submit", title: "พร้อมแล้วค่อยส่งคำตอบ", body: "ตอนส่งคำตอบต้องทำ post-test และแนบ PDF บทสนทนากับ AI ตามเงื่อนไขของคดี" },
  ],
  space: [
    { target: "case-objective", title: "นี่คือสิ่งที่คดีต้องการให้คุณอธิบาย", body: "เริ่มจากสิ่งที่ข้อมูลยืนยันได้ แล้วค่อยเชื่อมเหตุการณ์เข้าด้วยกัน" },
    { target: "case-brief", title: "อ่านบริบทก่อนเริ่มเชื่อมหลักฐาน", body: "Case Brief สรุปวิธีสำรวจคดี โดยไม่เฉลยสิ่งที่คุณต้องตัดสินใจ" },
    { target: "case-timeline", title: "ดูว่าเหตุการณ์นี้อยู่ตรงไหนของเรื่อง", body: "Timeline ให้คุณเลือกเปิดช่วงเหตุการณ์และย้อนกลับมาดูได้เสมอ" },
    { target: "case-evidence", title: "เปิดวัตถุพยานทีละชิ้น", body: "อ่านเหตุการณ์และข้อจำกัดจากไฟล์ ก่อนตัดสินใจว่าข้อมูลชี้ไปทางไหน" },
    { target: "case-ai", title: "ใช้ AI เพื่อมองข้อมูลอีกมุม", body: "ใช้ AI คู่คิดเพื่อถามหรือทดสอบแนวคิด แล้วตรวจกลับกับหลักฐานในแฟ้ม" },
    { target: "case-submit", title: "พร้อมแล้วค่อยส่งคำตอบ", body: "เมื่อคำอธิบายของคุณพร้อม ให้ทำ post-test และแนบ PDF บทสนทนากับ AI" },
  ],
  "evidence-viewer": [
    { target: "evidence-viewer", title: "นี่คือไฟล์ที่กำลังตรวจ", body: "อ่านหรือดูไฟล์ให้จบก่อนกลับไปเชื่อมกับหลักฐานชิ้นอื่น" },
    { target: "evidence-context", title: "ดูบริบทของไฟล์", body: "แถบนี้บอกชนิดของไฟล์และช่วงเหตุการณ์ที่ไฟล์ชิ้นนี้อยู่" },
    { target: "evidence-controls", title: "ใช้ตัวควบคุมตามชนิดไฟล์", body: "ขยายภาพ เลื่อนไฟล์ หรือเปิดต้นฉบับได้เมื่อจำเป็น โดยไม่ต้องรีบสรุป" },
  ],
  submit: [
    { target: "submit-case", title: "เลือกคดีที่กำลังส่ง", body: "เริ่มจากคดีที่คุณเล่นและพร้อมอธิบายด้วยหลักฐาน" },
    { target: "submit-answer", title: "บันทึกคำอธิบายของคุณ", body: "ตอบตามสิ่งที่คุณคิดและหลักฐานที่อ้างอิงได้ ระบบบันทึกแบบร่างระหว่างทำ" },
    { target: "submit-posttest", title: "ทำ post-test ให้ครบ", body: "คำถามส่วนนี้ช่วยให้โครงการเข้าใจประสบการณ์การเรียนรู้หลังเล่นคดี" },
    { target: "submit-ai-pdf", title: "แนบ PDF บทสนทนา AI", body: "แนบ PDF ที่คุณบันทึกจาก AI คู่คิดตามความยินยอมที่ให้ไว้ ไฟล์นี้อยู่ในพื้นที่ส่วนตัว" },
    { target: "submit-final", title: "ตรวจแล้วค่อยส่ง", body: "เมื่อทุกส่วนครบ ระบบจึงเปิดให้ส่งคำตอบและบันทึกสถานะของคดี" },
  ],
  default: [
    { target: "player-main", title: "เจ้าเงาะช่วยดูทางได้", body: "เลือกหัวข้อด้านล่างเพื่อเริ่มคำแนะนำของหน้าที่คุณกำลังอยู่" },
  ],
};

function stepsFor(guideKey: string): GuideStep[] {
  return guideSteps[guideKey] ?? guideSteps.default;
}

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return target.matches("input, textarea, select, button, [contenteditable='true']");
}

function targetElement(target: string) {
  return document.querySelector<HTMLElement>(`[data-guide="${target}"]`);
}

export function HelpButton({ compact = false, guideKey = "default", pageTitle }: HelpButtonProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [startAt, setStartAt] = useState<number | null>(null);
  const steps = useMemo(() => stepsFor(guideKey), [guideKey]);

  return <>
    <button aria-label="เปิดคำแนะนำจากเจ้าเงาะ" className={`player-utility-link${compact ? " player-utility-link--compact" : ""}`} onClick={() => setDrawerOpen(true)} title="คำแนะนำ" type="button">
      <CircleHelp aria-hidden="true" size={compact ? 17 : 16} />
      {compact ? <span className="sr-only">ช่วยเหลือ</span> : "ช่วยเหลือ"}
    </button>
    {drawerOpen ? <HelpDrawer guideKey={guideKey} pageTitle={pageTitle} steps={steps} onClose={() => setDrawerOpen(false)} onStart={(index) => { setDrawerOpen(false); setStartAt(index); }} /> : null}
    {startAt !== null ? <GuideTour guideKey={guideKey} initialStep={startAt} pageTitle={pageTitle} steps={steps} onClose={() => setStartAt(null)} /> : null}
  </>;
}

function HelpDrawer({ guideKey, onClose, onStart, pageTitle, steps }: { guideKey: string; onClose: () => void; onStart: (index: number) => void; pageTitle: string; steps: GuideStep[] }) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return createPortal(
    <div className="player-help-drawer-backdrop" role="presentation">
      <aside aria-label="คำแนะนำจากเจ้าเงาะ" aria-modal="true" className="player-help-drawer" role="dialog">
        <header className="player-guide-heading">
          <div><span className="player-eyebrow">HELP / {guideKey.toUpperCase()}</span><h2>เจ้าเงาะช่วยอะไรได้บ้าง?</h2><p>{pageTitle}</p></div>
          <button aria-label="ปิดคำแนะนำ" className="player-close-button" onClick={onClose} type="button"><X aria-hidden="true" size={19} /></button>
        </header>
        <nav aria-label="หัวข้อคำแนะนำ" className="player-help-topics">
          {steps.map((step, index) => <button key={step.target} onClick={() => onStart(index)} type="button"><span>{String(index + 1).padStart(2, "0")}</span>{step.title}</button>)}
        </nav>
        <footer><p>เลือกหัวข้อเพื่อให้เจ้าเงาะพาไปดูบนหน้าจอจริง</p><button className="player-button" onClick={onClose} type="button">ปิด</button></footer>
      </aside>
    </div>,
    document.body,
  );
}

export function GuideTour({ guideKey, initialStep = 0, onClose, pageTitle, steps }: { guideKey: string; initialStep?: number; onClose: () => void; pageTitle: string; steps?: GuideStep[] }) {
  const allSteps = steps ?? stepsFor(guideKey);
  const [stepIndex, setStepIndex] = useState(Math.min(initialStep, allSteps.length - 1));
  const [rect, setRect] = useState<DOMRect | null>(null);
  const step = allSteps[stepIndex];

  useEffect(() => setStepIndex(Math.min(initialStep, allSteps.length - 1)), [allSteps.length, initialStep]);

  useEffect(() => {
    let frame = 0;
    let timeout = 0;
    let observer: ResizeObserver | undefined;
    const element = targetElement(step.target);
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setRect(element?.getBoundingClientRect() ?? null));
    };

    element?.scrollIntoView({ behavior: document.documentElement.dataset.motion === "off" ? "auto" : "smooth", block: "center", inline: "nearest" });
    timeout = window.setTimeout(update, 320);
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    if (element && "ResizeObserver" in window) {
      observer = new ResizeObserver(update);
      observer.observe(element);
    }
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(timeout);
      observer?.disconnect();
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [step.target]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); onClose(); return; }
      if (event.key === "Enter" && !isTypingTarget(event.target)) {
        event.preventDefault();
        if (stepIndex === allSteps.length - 1) onClose();
        else setStepIndex((value) => value + 1);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [allSteps.length, onClose, stepIndex]);

  const boxStyle = rect ? {
    height: `${Math.max(rect.height + 16, 36)}px`,
    left: `${Math.max(rect.left - 8, 6)}px`,
    top: `${Math.max(rect.top - 8, 6)}px`,
    width: `${Math.min(rect.width + 16, window.innerWidth - Math.max(rect.left - 8, 6) - 6)}px`,
  } : undefined;

  return createPortal(
    <div className="player-tour-layer" role="presentation">
      <div className="player-tour-dimmer" />
      {rect ? <div aria-hidden="true" className="player-tour-spotlight" style={boxStyle} /> : null}
      <aside aria-label={`คำแนะนำ: ${step.title}`} aria-modal="true" className="player-tour-bubble" role="dialog">
        <header><span className="player-eyebrow">GUIDE / {String(stepIndex + 1).padStart(2, "0")} OF {String(allSteps.length).padStart(2, "0")}</span><button aria-label="ปิดคำแนะนำ" className="player-close-button" onClick={onClose} type="button"><X aria-hidden="true" size={18} /></button></header>
        <div className="player-tour-copy"><h2>{step.title}</h2><p>{step.body}</p><small>{pageTitle}</small></div>
        <footer>
          <button className="player-text-action" onClick={onClose} type="button"><SkipForward aria-hidden="true" size={15} /> ข้ามคำแนะนำ</button>
          <div>
            <button aria-label="ขั้นก่อนหน้า" className="player-button" disabled={stepIndex === 0} onClick={() => setStepIndex((value) => value - 1)} title="ก่อนหน้า" type="button"><ArrowLeft aria-hidden="true" size={16} /></button>
            <button className="player-button player-button--primary" onClick={() => stepIndex === allSteps.length - 1 ? onClose() : setStepIndex((value) => value + 1)} type="button">{stepIndex === allSteps.length - 1 ? "จบคำแนะนำ" : <>ถัดไป <ArrowRight aria-hidden="true" size={16} /></>}</button>
          </div>
        </footer>
      </aside>
    </div>,
    document.body,
  );
}

export function AutoGuide({ guideKey = "default", pageTitle }: { guideKey?: string; pageTitle: string }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    try {
      if (window.localStorage.getItem("jao-ngoh-auto-guide") === "false") return;
      const seenKey = `jao-ngoh-guide-seen:${guideKey}`;
      if (window.sessionStorage.getItem(seenKey)) return;
      window.sessionStorage.setItem(seenKey, "true");
      const timeout = window.setTimeout(() => setOpen(true), 550);
      return () => window.clearTimeout(timeout);
    } catch { return undefined; }
  }, [guideKey]);
  return open ? <GuideTour guideKey={guideKey} onClose={() => setOpen(false)} pageTitle={pageTitle} /> : null;
}
