"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { PlayerDialog } from "./player-dialog";
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

const kaCaseGuideSteps: GuideStep[] = [
  { target: "ka-objective", title: "เริ่มจากภารกิจของคดี", body: "สร้างคำอธิบายที่ยึดหลักฐาน ไม่ต้องรีบเลือกคำตอบเดียวตั้งแต่ต้น" },
  { target: "ka-brief", title: "อ่าน Case Brief อย่างเป็นระบบ", body: "ระบุสิ่งที่แต่ละไฟล์ยืนยันได้ สิ่งที่ยังอนุมาน และคำถามที่ยังเปิดอยู่" },
  { target: "ka-case-timeline", title: "ย้อนดูบริบทและลำดับเหตุการณ์", body: "เปิด NetLood City บุคลากร และแฟ้มคดีเพื่อเชื่อมโยงข้อมูลจากหลายมุม" },
  { target: "ka-case-evidence", title: "ตรวจหลักฐานทีละชิ้น", body: "ใช้หลักฐานอย่างน้อยสามชิ้นจากอย่างน้อยสองประเภท และบอกผลต่อสมมติฐานของคุณ" },
  { target: "ka-submit", title: "ส่งคำอธิบายเมื่อพร้อม", body: "ส่งเป็นข้อความในระบบหรือไฟล์หนึ่งชิ้น โดยสรุปเหตุ ไทม์ไลน์ หลักฐาน ความไม่แน่นอน และแนวทางป้องกัน" },
];

const guideSteps: Record<string, GuideStep[]> = {
  "case-index": [
    { target: "case-index", title: "เลือกแฟ้มที่คุณสงสัย", body: "แต่ละแฟ้มมีคดีย่อยให้สำรวจ เริ่มจากเรื่องไหนก่อนก็ได้ และกลับมาเล่นต่อได้จากโปรไฟล์" },
  ],
  profile: [
    { target: "profile-identity", title: "ตัวตนในแฟ้มของคุณ", body: "เปลี่ยนรูปและชื่อที่แสดงได้ที่นี่ ข้อมูลคำตอบและแบบสอบถามเดิมจะยังคงอยู่" },
  ],
  settings: [
    { target: "settings-auto-guide", title: "ให้เจ้าเงาะช่วยแนะนำไหม?", body: "เปิดไว้ถ้าคุณต้องการให้คำแนะนำปรากฏเมื่อพบระบบใหม่ครั้งแรก" },
    { target: "settings-reset-guides", title: "อยากเริ่มคำแนะนำใหม่?", body: "ใช้ปุ่มนี้เพื่อให้ระบบถือว่าคุณยังไม่เคยดูคำแนะนำ" },
    { target: "settings-motion", title: "ปรับการเคลื่อนไหว", body: "เลือกให้ระบบทำตามอุปกรณ์ ลดการเคลื่อนไหว หรือปิดทั้งหมด" },
    { target: "settings-sound", title: "เสียงตอบสนอง", body: "เปิดหรือปิดเสียง UI ได้จากตรงนี้" },
    { target: "settings-text-size", title: "ปรับขนาดตัวอักษร", body: "เลือกขนาดที่อ่านสบายที่สุด" },
  ],
  timeline: [
    { target: "timeline", title: "Timeline คือภาพรวมของเรื่อง", body: "แต่ละช่วงแสดงเหตุการณ์และข้อมูลที่เกี่ยวข้องกับเรื่อง คุณเปิดดูช่วงต่าง ๆ ได้ตามที่สนใจ" },
    { target: "timeline-subgame", title: "คดีจะอยู่ใน Timeline", body: "คดีที่เปิดเล่นได้ปรากฏเป็นจุดใน Timeline และคุณไม่จำเป็นต้องเล่นตามลำดับ" },
    { target: "help-control", title: "เรียกเจ้าเงาะได้เสมอ", body: "กด ช่วยเหลือ เพื่อเปิดคำแนะนำของหน้าที่คุณกำลังอยู่ได้ทุกเมื่อ" },
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
  "ka-casefiles": [
    { target: "ka-overview", title: "แฟ้ม NetLood City เปิดแล้ว", body: "เลือกคดีที่คุณอยากสำรวจก่อนได้ ทั้งสองคดีใช้แนวทางอ่านหลักฐานและการส่งคำอธิบายร่วมกัน" },
    { target: "ka-case-selection", title: "เลือกหนึ่งคดีเพื่อเริ่ม", body: "MAIMEE เป็นคดี FinTech และ WA VE เป็นคดี Bio ใน NetLood City" },
    { target: "help-control", title: "เรียกคำแนะนำได้เสมอ", body: "กด ช่วยเหลือ เพื่อย้อนกลับมาดูขั้นตอนของหน้าที่กำลังเปิดได้ทุกเมื่อ" },
  ],
  "ka-maimee": kaCaseGuideSteps,
  "ka-wa-ve": kaCaseGuideSteps,
  "ka-submit": [
    { target: "submit-case", title: "ตรวจว่ากำลังส่งคดีไหน", body: "เลือก MAIMEE หรือ WA VE ที่คุณสำรวจมา แล้วระบบจะเปิดแบบฟอร์มและเกณฑ์ของคดีนั้น" },
    { target: "submit-answer", title: "เขียนคำอธิบายในระบบ", body: "สรุปแบบจำลองเชิงสาเหตุ ไทม์ไลน์ หลักฐานทางเลือก และการแยกสิ่งที่ยืนยันได้ อนุมานได้ หรือยังไม่รู้" },
    { target: "submit-answer-attachment", title: "หรือแนบผลงานหนึ่งชิ้น", body: "หากใช้ไฟล์ ให้ส่งได้หนึ่งไฟล์ตามชนิดที่ระบบอนุญาต แทนข้อความในระบบได้" },
    { target: "submit-final", title: "ตรวจแล้วจึงส่ง", body: "คดีนี้ไม่บังคับ AI-chat PDF หรือ post-test; ระบบจะตรวจว่ามีข้อความหรือไฟล์คำตอบก่อนบันทึกการส่ง" },
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
  if (guideKey === "timeline") {
    const timeline = guideSteps.timeline;
    return [timeline[0], timeline[1], timeline[4], timeline[2]];
  }
  return guideSteps[guideKey] ?? guideSteps.default;
}

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return target.matches("input, textarea, select, [contenteditable='true']");
}

function targetElement(target: string) {
  if (target === "timeline") return document.querySelector<HTMLElement>("[data-guide='node-zone-timeline']");
  if (target === "timeline-subgame") return document.querySelector<HTMLElement>("[data-guide='node-zone-timeline'] button");
  return document.querySelector<HTMLElement>(`[data-guide="${target}"]`);
}

export function HelpButton({ compact = false, guideKey = "default", pageTitle }: HelpButtonProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [startAt, setStartAt] = useState<number | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const steps = useMemo(() => stepsFor(guideKey), [guideKey]);

  return <>
    <button aria-label="เปิดคำแนะนำจากเจ้าเงาะ" className={`player-utility-link${compact ? " player-utility-link--compact" : ""}`} data-guide="help-control" onClick={() => guideKey === "settings" ? setStartAt(0) : setDrawerOpen(true)} ref={triggerRef} title="คำแนะนำ" type="button">
      <CircleHelp aria-hidden="true" size={compact ? 17 : 16} />
      {compact ? <span className="sr-only">ช่วยเหลือ</span> : "ช่วยเหลือ"}
    </button>
    {drawerOpen ? <HelpDrawer guideKey={guideKey} pageTitle={pageTitle} steps={steps} onClose={() => { setDrawerOpen(false); window.requestAnimationFrame(() => triggerRef.current?.focus()); }} onStart={(index) => { setDrawerOpen(false); setStartAt(index); }} /> : null}
    {startAt !== null ? <GuideTour guideKey={guideKey} initialStep={startAt} pageTitle={pageTitle} steps={steps} onClose={() => { setStartAt(null); window.requestAnimationFrame(() => triggerRef.current?.focus()); }} /> : null}
  </>;
}

function HelpDrawer({ guideKey, onClose, onStart, pageTitle, steps }: { guideKey: string; onClose: () => void; onStart: (index: number) => void; pageTitle: string; steps: GuideStep[] }) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <PlayerDialog className="player-help-modal" label="คำแนะนำจากเจ้าเงาะ" onClose={onClose}>
      <aside className="player-help-drawer">
        <header className="player-guide-heading">
          <div><span className="player-eyebrow">HELP / {guideKey.toUpperCase()}</span><h2>เจ้าเงาะช่วยอะไรได้บ้าง?</h2><p>ตอนนี้คุณอยู่ที่ {pageTitle}</p></div>
          <button aria-label="ปิดคำแนะนำ" className="player-close-button" onClick={onClose} type="button"><X aria-hidden="true" size={19} /></button>
        </header>
        <nav aria-label="หัวข้อคำแนะนำ" className="player-help-topics">
          {steps.map((step, index) => <button key={step.target} onClick={() => onStart(index)} type="button"><span>{String(index + 1).padStart(2, "0")}</span>{step.title}</button>)}
        </nav>
        <footer><p>เลือกหัวข้อเพื่อให้เจ้าเงาะพาไปดูบนหน้าจอจริง</p><button className="player-button player-button--primary" onClick={() => onStart(0)} type="button">เริ่มคำแนะนำหน้านี้</button></footer>
      </aside>
    </PlayerDialog>
  );
}

export function GuideTour({ guideKey, initialStep = 0, onClose, pageTitle, steps }: { guideKey: string; initialStep?: number; onClose: () => void; pageTitle: string; steps?: GuideStep[] }) {
  const allSteps = steps ?? stepsFor(guideKey);
  const [stepIndex, setStepIndex] = useState(Math.min(initialStep, allSteps.length - 1));
  const [rect, setRect] = useState<DOMRect | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const bubbleRef = useRef<HTMLElement>(null);
  const step = allSteps[stepIndex];

  useEffect(() => setStepIndex(Math.min(initialStep, allSteps.length - 1)), [allSteps.length, initialStep]);
  useEffect(() => {
    const target = targetElement(step.target);
    const action = target?.matches(".investigative-action") ? target : target?.querySelector<HTMLElement>(".investigative-action");
    if (!action || document.documentElement.dataset.motion === "off" || document.documentElement.dataset.motion === "reduce") return;
    action.classList.remove("is-guided");
    void action.offsetWidth;
    action.classList.add("is-guided");
    const timeout = window.setTimeout(() => action.classList.remove("is-guided"), 1300);
    return () => { window.clearTimeout(timeout); action.classList.remove("is-guided"); };
  }, [step.target]);
  useEffect(() => {
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    bubbleRef.current?.focus({ preventScroll: true });
    return () => { window.requestAnimationFrame(() => returnFocusRef.current?.focus()); };
  }, []);

  useEffect(() => {
    let frame = 0;
    let timeout = 0;
    let observer: ResizeObserver | undefined;
    const element = targetElement(step.target);
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setRect(element?.getBoundingClientRect() ?? null));
    };

    element?.scrollIntoView({ behavior: ["off", "reduce"].includes(document.documentElement.dataset.motion ?? "") || matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center", inline: "nearest" });
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
      if (event.key === "Tab") {
        const controls = [...(bubbleRef.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? [])];
        const first = controls[0]; const last = controls.at(-1);
        if (event.shiftKey && (document.activeElement === first || document.activeElement === bubbleRef.current)) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
        return;
      }
      if (event.key === "Escape") { event.preventDefault(); onClose(); return; }
      if (event.key === "ArrowLeft" && !isTypingTarget(event.target) && stepIndex > 0) { event.preventDefault(); setStepIndex((value) => value - 1); return; }
      if (event.key === "Enter" && !isTypingTarget(event.target) && !(event.target instanceof Element && event.target.closest("button, a"))) {
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
  const bubbleStyle = rect ? (() => {
    const bubbleWidth = Math.min(368, window.innerWidth - 24);
    const rightPosition = rect.right + 18;
    const leftPosition = rect.left - bubbleWidth - 18;
    const left = rightPosition + bubbleWidth <= window.innerWidth - 12
      ? rightPosition
      : Math.max(12, leftPosition);
    return {
      left: `${left}px`,
      top: `${Math.max(12, Math.min(rect.top, window.innerHeight - 340))}px`,
    };
  })() : undefined;

  return createPortal(
    <div className="player-tour-layer" role="presentation">
      <div className="player-tour-dimmer" />
      {rect ? <div aria-hidden="true" className="player-tour-spotlight" style={boxStyle} /> : null}
      <aside ref={bubbleRef} tabIndex={-1} aria-label={`คำแนะนำ: ${step.title}`} aria-modal="true" className="player-tour-bubble" role="dialog" style={bubbleStyle}>
        <header><span className="player-eyebrow">GUIDE / {String(stepIndex + 1).padStart(2, "0")} OF {String(allSteps.length).padStart(2, "0")}</span><button aria-label="ปิดคำแนะนำ" className="player-close-button" onClick={onClose} type="button"><X aria-hidden="true" size={18} /></button></header>
        <div className="player-tour-copy"><h2>{step.title}</h2><p>{step.body}</p><small>{pageTitle}</small></div>
        <img alt="" aria-hidden="true" className="player-tour-cat" src="/jao-ngoh-cat.png" />
        <footer>
          <button className="player-text-action" onClick={onClose} type="button"><SkipForward aria-hidden="true" size={15} /> ข้ามคำแนะนำ</button>
          <div>
            <button aria-label="ขั้นก่อนหน้า" className="player-button" disabled={stepIndex === 0} onClick={() => setStepIndex((value) => value - 1)} title="ก่อนหน้า" type="button"><ArrowLeft aria-hidden="true" size={16} /></button>
            <button className="player-button player-button--primary" onClick={() => stepIndex === allSteps.length - 1 ? onClose() : setStepIndex((value) => value + 1)} type="button">{stepIndex === allSteps.length - 1 ? "จบคำแนะนำ" : <>ถัดไป <ArrowRight aria-hidden="true" size={16} /></>}</button>
          </div>
        </footer>
      </aside>
    </div>,
    document.querySelector("dialog[open] .player-dialog-content") ?? document.body,
  );
}

export function AutoGuide({ guideKey = "default", pageTitle }: { guideKey?: string; pageTitle: string }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    try {
      if (window.localStorage.getItem("jao-ngoh-auto-guide") === "false") return;
      const seenKey = `jao-ngoh-guide-state:${guideKey}:v2`;
      if (window.localStorage.getItem(seenKey)) return;
      window.localStorage.setItem(seenKey, "dismissed");
      const timeout = window.setTimeout(() => setOpen(true), 550);
      return () => window.clearTimeout(timeout);
    } catch { return undefined; }
  }, [guideKey]);
  return open ? <GuideTour guideKey={guideKey} onClose={() => setOpen(false)} pageTitle={pageTitle} /> : null;
}
