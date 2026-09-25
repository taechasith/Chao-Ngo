"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

/** Keep the authored scene byte-for-byte; product content lives in the wrapper. */
export function SublevelStudioLandingPage() {
  const [documentSource, setDocumentSource] = useState("");
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/landing-pages/sublevel-studio.html?v=jao-ngoh-case-entry-1", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("LANDING_UNAVAILABLE");
        const source = await response.text();
        // Same library and version as the original import map, served under our CSP.
        const adapted = source.replace("https://cdnjs.cloudflare.com/ajax/libs/three.js/0.160.0/three.module.min.js", "/vendor/three.module.min.js")
          .replaceAll("https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/loaders/GLTFLoader.js", "/vendor/three/addons/loaders/GLTFLoader.js")
          .replace("</head>", '<link rel="stylesheet" href="/landing-pages/player-layer.css"></head>')
          .replace("</body>", '<script src="/landing-pages/player-layer.js"></script></body>');
        if (!controller.signal.aborted) setDocumentSource(adapted);
      }).catch(() => { if (!controller.signal.aborted) setFailed(true); });
    return () => controller.abort();
  }, []);
  return <div className="landing-frame-wrap">
    {documentSource ? <iframe className="landing-frame" srcDoc={documentSource} title="เจ้าเงาะ — สำรวจหลักฐาน ตั้งคำถาม และค้นหาคำตอบ" /> : <div className="landing-loading" role="status"><span className="player-eyebrow">เจ้าเงาะ / SCIENCE DETECTIVE</span><h1>{failed ? "ยังเปิดฉากไม่ได้" : "กำลังเปิดโลกของเจ้าเงาะ"}</h1><p>{failed ? "ลองโหลดหน้าใหม่ หรือเข้าสู่ระบบเพื่อเปิดแฟ้มคดี" : "หลักฐานคือจุดเริ่มต้น คำตอบเป็นของคุณ"}</p><Link className="player-button" href="/play">เข้าสู่แฟ้มคดี →</Link></div>}
  </div>;
}
