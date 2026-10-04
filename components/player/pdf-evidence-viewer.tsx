"use client";

import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";

/** Canvas rendering also works in browsers without a built-in PDF plug-in. */
export function PdfEvidenceViewer({ url, title }: { url: string; title: string }) {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [message, setMessage] = useState("กำลังเปิดเอกสาร…");
  const [pageText, setPageText] = useState("");
  const [width, setWidth] = useState(0);
  const canvas = useRef<HTMLCanvasElement>(null);
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setPdf(null); setPage(1); setZoom(1); setPageText(""); setMessage("กำลังเปิดเอกสาร…");
    let stopped = false;
    let task: ReturnType<typeof import("pdfjs-dist")["getDocument"]> | undefined;
    void import("pdfjs-dist").then(async (lib) => {
      if (stopped) return;
      lib.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.min.mjs";
      task = lib.getDocument({ url, useWasm: false, cMapUrl: "/pdfjs/cmaps/", cMapPacked: true, standardFontDataUrl: "/pdfjs/standard_fonts/", wasmUrl: "/pdfjs/wasm/" });
      const document = await task.promise;
      if (!stopped) setPdf(document);
    }).catch(() => { if (!stopped) setMessage("แสดงเอกสารในหน้านี้ไม่ได้ กรุณาเปิดไฟล์ต้นฉบับหรือดาวน์โหลดด้านบน"); });
    return () => { stopped = true; void task?.destroy(); };
  }, [url]);

  useEffect(() => {
    if (!container.current) return;
    const observer = new ResizeObserver(entries => setWidth(Math.floor(entries[0].contentRect.width)));
    observer.observe(container.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!pdf || !canvas.current || !container.current) return;
    let stopped = false;
    let rendering: RenderTask | undefined;
    const surface = canvas.current;
    const availableWidth = Math.max(240, (width || container.current.clientWidth) - 24);
    setMessage("กำลังแสดงหน้า…");
    void pdf.getPage(page).then(async (documentPage) => {
      if (stopped) return;
      const fit = availableWidth / documentPage.getViewport({ scale: 1 }).width;
      const viewport = documentPage.getViewport({ scale: fit * zoom });
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      surface.width = Math.ceil(viewport.width * ratio);
      surface.height = Math.ceil(viewport.height * ratio);
      surface.style.width = `${viewport.width}px`;
      surface.style.height = `${viewport.height}px`;
      rendering = documentPage.render({ canvas: surface, viewport, transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0] });
      await rendering.promise;
      const text = await documentPage.getTextContent();
      if (!stopped) {
        setPageText(text.items.map(item => "str" in item ? item.str : "").join(" "));
        setMessage("");
      }
    }).catch(() => { if (!stopped) setMessage("แสดงหน้านี้ไม่ได้ ลองเปิดไฟล์ต้นฉบับหรือดาวน์โหลด"); });
    return () => { stopped = true; rendering?.cancel(); };
  }, [pdf, page, zoom, width]);

  return <div className="w-full min-w-0" ref={container}>
    <div aria-label="ควบคุมเอกสาร PDF" className="flex flex-wrap items-center gap-2 py-3">
      <button className="player-button" disabled={!pdf || page <= 1} onClick={() => setPage(value => value - 1)} type="button">หน้าก่อนหน้า</button>
      <output aria-live="polite">หน้า {page} / {pdf?.numPages ?? "…"}</output>
      <button className="player-button" disabled={!pdf || page >= pdf.numPages} onClick={() => setPage(value => value + 1)} type="button">หน้าถัดไป</button>
      <button aria-label="ย่อเอกสาร" className="player-button" disabled={!pdf || zoom <= .5} onClick={() => setZoom(value => value - .25)} type="button">−</button>
      <button aria-label="ขยายเอกสาร" className="player-button" disabled={!pdf || zoom >= 2} onClick={() => setZoom(value => value + .25)} type="button">+</button>
      <button className="player-button" onClick={() => setZoom(1)} type="button">พอดีหน้าจอ</button>
    </div>
    {message ? <p role="status">{message}</p> : null}
    <div className="max-h-[65vh] overflow-auto bg-white p-3"><canvas aria-label={`${title} หน้า ${page}`} role="img" ref={canvas} /></div>
    {pageText ? <details className="py-3"><summary>อ่านข้อความในหน้านี้</summary><p className="whitespace-pre-wrap leading-7">{pageText}</p></details> : null}
  </div>;
}
