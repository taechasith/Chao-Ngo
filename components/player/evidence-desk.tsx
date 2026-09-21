"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Download, ExternalLink, FileText, Image as ImageIcon, Minus, Plus, RotateCcw, Volume2, X } from "lucide-react";
import { gsap } from "gsap";
import type { PlayerEvidence, PlayerTimelineNode } from "../../lib/server/content/player-evidence";
import { PlayerDialog } from "./player-dialog";

const nodeLabels: Record<string, string> = {
  "pre-case": "ก่อนคดี", quantum: "คดีควอนตัม", space: "คดีอวกาศ", "post-case": "บันทึกหลังคดี",
};
const typeLabels: Record<PlayerEvidence["kind"], string> = {
  image: "ภาพ", pdf: "PDF", text: "ข้อความ / ข้อมูล", audio: "เสียง", video: "วิดีโอ", other: "ไฟล์",
};

export function EvidenceDesk({ initialSlug = "pre-case", nodes }: { initialSlug?: string; nodes: PlayerTimelineNode[] | null }) {
  const [selectedSlug, setSelectedSlug] = useState(initialSlug);
  const [visited, setVisited] = useState<Set<string>>(() => new Set([initialSlug]));
  const [opened, setOpened] = useState<Set<string>>(() => new Set());
  const [activeFile, setActiveFile] = useState<string | null>(null);
  const [kindFilter, setKindFilter] = useState("all");
  const [showAll, setShowAll] = useState(false);
  const lineRef = useRef<HTMLDivElement>(null);
  const node = nodes?.find((item) => item.slug === selectedSlug) ?? nodes?.[0];
  const fileIndex = node?.files.findIndex((file) => file.id === activeFile) ?? -1;
  const file = fileIndex >= 0 ? node?.files[fileIndex] : undefined;
  const filteredFiles = node?.files.filter((item) => kindFilter === "all" || item.kind === kindFilter) ?? [];
  const visibleFiles = showAll ? filteredFiles : filteredFiles.slice(0, 6);

  useLayoutEffect(() => {
    if (!lineRef.current || document.documentElement.dataset.motion === "reduce" || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const context = gsap.context(() => {
      gsap.fromTo(lineRef.current, { scaleY: 0 }, { scaleY: 1, duration: 0.8, ease: "power2.out" });
    });
    return () => context.revert();
  }, []);

  function openEvidence(id: string) {
    setActiveFile(id);
    setOpened((previous) => new Set(previous).add(id));
  }

  return (
    <section className="player-evidence-desk" id="timeline">
      <div className="player-evidence-heading">
        <div className="grid gap-2"><span className="player-eyebrow">CASE TIMELINE / EVIDENCE</span><h2>เรียงเหตุการณ์ เปิดหลักฐาน</h2></div>
        <p>กลับมามองสิ่งที่พบ จากจุดอื่นของเรื่องราว</p>
      </div>
      {!nodes?.length || !node ? (
        <div className="player-empty-memory"><p>{nodes ? "ยังไม่มีหลักฐานที่เปิดให้สำรวจ" : "โหลดโต๊ะหลักฐานไม่ได้ในขณะนี้"}</p><button className="player-button mt-4" onClick={() => window.location.reload()} type="button">ลองอีกครั้ง</button></div>
      ) : (
        <div className="player-timeline-layout">
          <nav aria-label="ช่วงเหตุการณ์ใน NODE ZONE" className="player-timeline-spine">
            <div aria-hidden="true" className="player-timeline-line" ref={lineRef} />
            {nodes.map((item, index) => <button
              aria-current={item.id === node.id ? "step" : undefined}
              className="player-timeline-node"
              key={item.id}
              onClick={() => { setSelectedSlug(item.slug); setVisited((previous) => new Set(previous).add(item.slug)); setShowAll(false); setKindFilter("all"); }}
              type="button"
            >
              <span className="player-timeline-number">{String(index).padStart(2, "0")}</span>
              <span><strong>{nodeLabels[item.slug] ?? item.title}</strong><small>{item.id === node.id ? "กำลังเปิด" : visited.has(item.slug) ? "เปิดแล้วในครั้งนี้" : `${item.files.length} หลักฐาน`}</small></span>
            </button>)}
          </nav>
          <div className="player-timeline-event" id="evidence">
            <header className="player-event-heading">
              <div><span className="player-eyebrow">NODE ZONE / {nodeLabels[node.slug] ?? node.slug}</span><h3>{node.slug === "pre-case" || node.slug === "post-case" ? nodeLabels[node.slug] : node.title}</h3></div>
              <span className="player-file-count">{node.files.length} หลักฐาน</span>
            </header>
            <label className="player-evidence-filter">ชนิดหลักฐาน
              <select onChange={(event) => { setKindFilter(event.target.value); setShowAll(false); }} value={kindFilter}>
                <option value="all">ทั้งหมด</option>
                {[...new Set(node.files.map((item) => item.kind))].map((kind) => <option key={kind} value={kind}>{typeLabels[kind]}</option>)}
              </select>
            </label>
            <div className="player-evidence-grid" id="evidence-files">
              {visibleFiles.map((item) => <button className="player-evidence-cell" key={item.id} onClick={() => openEvidence(item.id)} type="button">
                <span className="player-evidence-meta"><span>EVIDENCE {String(node.files.indexOf(item) + 1).padStart(2, "0")}</span>{item.kind === "image" ? <ImageIcon aria-hidden="true" size={19} /> : item.kind === "audio" ? <Volume2 aria-hidden="true" size={19} /> : <FileText aria-hidden="true" size={19} />}</span>
                <strong>{item.title}</strong>
                <small>{typeLabels[item.kind]}<span>{opened.has(item.id) ? "เปิดแล้วในครั้งนี้" : "เปิดหลักฐาน"}</span></small>
              </button>)}
            </div>
            {filteredFiles.length > 6 ? <button aria-controls="evidence-files" aria-expanded={showAll} className="player-button mt-3 w-full" onClick={() => setShowAll((value) => !value)} type="button">{showAll ? "ย่อรายการหลักฐาน" : `ดูหลักฐานทั้งหมด ${filteredFiles.length} ชิ้น`}</button> : null}
            {!node.files.length ? <p className="player-empty-memory">ยังไม่มีไฟล์ในช่วงเหตุการณ์นี้</p> : null}
          </div>
        </div>
      )}
      {file && node ? <PlayerDialog className="player-evidence-dialog" label={`หลักฐาน ${file.title}`} onClose={() => setActiveFile(null)}>
        <header className="player-viewer-toolbar">
          <button className="player-text-action" onClick={() => setActiveFile(null)} type="button"><ArrowLeft aria-hidden="true" size={16} /> กลับ Timeline</button>
          <span className="player-eyebrow">EVIDENCE {String(fileIndex + 1).padStart(2, "0")} / {node.files.length}</span>
          <button aria-label="ปิดหลักฐาน" className="player-close-button" onClick={() => setActiveFile(null)} title="ปิดหลักฐาน" type="button"><X aria-hidden="true" size={20} /></button>
        </header>
        <div className="player-viewer-layout">
          <EvidenceContent file={file} key={file.id} />
          <aside className="player-evidence-rail">
            <div><span className="player-eyebrow">สิ่งที่คุณกำลังตรวจ</span><h2>{file.title}</h2></div>
            <dl><div><dt>ชนิด</dt><dd>{typeLabels[file.kind]}</dd></div><div><dt>แฟ้มคดี</dt><dd>NODE ZONE</dd></div><div><dt>ช่วงเหตุการณ์</dt><dd>{nodeLabels[node.slug] ?? node.title}</dd></div></dl>
            <p className="player-viewer-visit">เปิดแล้วในการเยี่ยมชมครั้งนี้</p>
            <div className="player-viewer-pagination">
              <button aria-label="หลักฐานก่อนหน้า" className="player-button" disabled={fileIndex <= 0} onClick={() => openEvidence(node.files[fileIndex - 1].id)} title="หลักฐานก่อนหน้า" type="button"><ArrowLeft aria-hidden="true" size={19} /></button>
              <span>{fileIndex + 1} / {node.files.length}</span>
              <button aria-label="หลักฐานถัดไป" className="player-button" disabled={fileIndex >= node.files.length - 1} onClick={() => openEvidence(node.files[fileIndex + 1].id)} title="หลักฐานถัดไป" type="button"><ArrowRight aria-hidden="true" size={19} /></button>
            </div>
            {file.url ? <a className="player-text-action" href={file.url} rel="noopener noreferrer" target="_blank">เปิดไฟล์ต้นฉบับ <ExternalLink aria-hidden="true" size={15} /></a> : null}
          </aside>
        </div>
      </PlayerDialog> : null}
    </section>
  );
}

function EvidenceContent({ file }: { file: PlayerEvidence }) {
  const [zoom, setZoom] = useState(1);
  const [error, setError] = useState(false);
  const [text, setText] = useState<string | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!file.url || (file.kind !== "text" && file.kind !== "pdf")) return;
    const controller = new AbortController();
    let objectUrl: string | undefined;
    void fetch(file.url, { credentials: "omit", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("EVIDENCE_UNAVAILABLE");
        if (file.kind === "text") {
          const content = await response.text();
          if (!controller.signal.aborted) setText(content);
        } else {
          const blob = await response.blob();
          if (!controller.signal.aborted) {
            objectUrl = URL.createObjectURL(new Blob([blob], { type: "application/pdf" }));
            setPdfUrl(objectUrl);
          }
        }
      }).catch(() => { if (!controller.signal.aborted) setError(true); });
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [file.kind, file.url, attempt]);

  if (!file.url || error) return <div className="player-evidence-unavailable" role="status">
    <FileText aria-hidden="true" size={32} strokeWidth={1} />
    <h3>ยังเปิดไฟล์นี้ไม่ได้</h3><p>ไฟล์หลักฐานยังไม่พร้อม หรือการเชื่อมต่อขัดข้อง คุณกลับไปดูชิ้นอื่นก่อนได้</p>
    {file.url ? <button className="player-button" onClick={() => { setError(false); setAttempt((value) => value + 1); }} type="button"><RotateCcw aria-hidden="true" size={16} /> ลองอีกครั้ง</button> : null}
  </div>;

  return <div className="player-evidence-canvas">
    {file.kind === "image" ? <>
      <div aria-label="การขยายภาพ" className="player-image-controls">
        <button aria-label="ย่อภาพ" disabled={zoom <= 1} onClick={() => setZoom((value) => Math.max(1, value - 0.5))} title="ย่อภาพ" type="button"><Minus aria-hidden="true" size={18} /></button>
        <output aria-live="polite">{Math.round(zoom * 100)}%</output>
        <button aria-label="ขยายภาพ" disabled={zoom >= 3} onClick={() => setZoom((value) => Math.min(3, value + 0.5))} title="ขยายภาพ" type="button"><Plus aria-hidden="true" size={18} /></button>
        <button aria-label="คืนขนาดภาพ" onClick={() => setZoom(1)} title="คืนขนาดภาพ" type="button"><RotateCcw aria-hidden="true" size={16} /></button>
      </div>
      <div aria-label="ภาพหลักฐาน" className="player-image-scroll" tabIndex={0}>
        {/* Evidence retains its original colors and proportions. */}
        <img alt={file.title} onError={() => setError(true)} src={file.url} style={{ width: `${zoom * 100}%` }} />
      </div>
    </> : file.kind === "pdf" ? pdfUrl ? <object aria-label={file.title} className="player-pdf-viewer" data={pdfUrl} type="application/pdf"><p>เปิด PDF ในแท็บใหม่เพื่ออ่านเอกสาร <a href={file.url} rel="noopener noreferrer" target="_blank">เปิด PDF</a></p></object> : <p className="player-viewer-loading" role="status">กำลังเปิดเอกสาร…</p>
      : file.kind === "text" ? text === null ? <p className="player-viewer-loading" role="status">กำลังเปิดบันทึก…</p> : <pre className="player-record-text" tabIndex={0}>{text}</pre>
        : file.kind === "audio" ? <div className="player-media-viewer"><Volume2 aria-hidden="true" size={48} strokeWidth={1} /><audio aria-label={file.title} controls onError={() => setError(true)} preload="metadata" src={file.url} /></div>
          : file.kind === "video" ? <video aria-label={file.title} className="player-video-viewer" controls onError={() => setError(true)} playsInline preload="metadata" src={file.url} />
            : <div className="player-evidence-unavailable"><FileText aria-hidden="true" size={32} /><p>ไฟล์นี้เปิดดูได้จากต้นฉบับ</p><a className="player-button" href={file.url} rel="noopener noreferrer" target="_blank"><Download aria-hidden="true" size={18} /> เปิดไฟล์</a></div>}
  </div>;
}
