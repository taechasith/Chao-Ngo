"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { kaSubgames } from "../../lib/ka-casefiles";
import { InvestigativeActionMarker } from "./investigative-action";
import { StatusBadge } from "./panel";

type ProgressRow = {
  status: string;
  subgame_id: string;
};

function progressLabel(status?: string): string {
  if (status === "completed") return "บันทึกการสืบเสร็จแล้ว";
  if (status === "in_progress") return "มีบันทึกการสืบต่อ";
  return "พร้อมเริ่มสำรวจ";
}

export function KaCasefilesOverview() {
  const [progress, setProgress] = useState<ProgressRow[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/player-progress", { credentials: "same-origin", signal: controller.signal })
      .then(async (response) => response.ok ? await response.json() as { progress?: ProgressRow[] } : null)
      .then((payload) => {
        if (payload?.progress) setProgress(payload.progress);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  const progressBySubgame = useMemo(
    () => new Map(progress.map((entry) => [entry.subgame_id, entry.status])),
    [progress],
  );

  return (
    <div className="player-content player-case-index">
      <header className="player-page-heading" data-guide="ka-overview" data-player-reveal="heading">
        <StatusBadge>CASE FILE 02 / NETLOOD CITY</StatusBadge>
        <h1>THE K.A. CASEFILES</h1>
        <p>
          NetLood City เปิดแฟ้มคดีสองเส้นทางให้คุณอ่านหลักฐาน สร้างแบบจำลองเชิงสาเหตุ
          และเสนอระบบลดความสูญเสียจากสิ่งที่หลักฐานรองรับ
        </p>
      </header>

      <section aria-label="เลือกคดีใน THE K.A. CASEFILES" className="player-route-index" data-guide="ka-case-selection" data-player-reveal="primary">
        <Link className="player-route-card" href={kaSubgames.maimee.route}>
          <Image
            alt="ภาพจากแฟ้มคดี MAIMEE"
            className="player-case-image"
            fill
            priority
            sizes="(max-width: 864px) 100vw, 50vw"
            src="/ka-casefiles/maimee/scene-01.png"
          />
          <div className="player-route-card-content">
            <span className="player-eyebrow">NETLOOD CITY / FINTECH</span>
            <h2>{kaSubgames.maimee.title}</h2>
            <p>เปิดบันทึกเหตุการณ์ การสื่อสาร และร่องรอยในแฟ้ม FinTech โดยไม่ข้ามไปสู่ข้อสรุปก่อนหลักฐาน</p>
            <span className="player-case-status"><span aria-hidden="true" />{progressLabel(progressBySubgame.get(kaSubgames.maimee.id))}</span>
            <InvestigativeActionMarker>เปิดคดี MAIMEE</InvestigativeActionMarker>
          </div>
        </Link>

        <Link className="player-route-card" href={kaSubgames["wa-ve"].route}>
          <Image
            alt="ภาพบุคลากรจากแฟ้มคดี WA VE"
            className="player-case-image"
            fill
            sizes="(max-width: 864px) 100vw, 50vw"
            src="/ka-casefiles/personnel/tete-techametakun.png"
          />
          <div className="player-route-card-content">
            <span className="player-eyebrow">NETLOOD CITY / BIO X PSYCHOLOGY</span>
            <h2>{kaSubgames["wa-ve"].title}</h2>
            <p>สำรวจหลักฐานด้านมนุษย์ สุขภาพ และระบบชีวภาพในคดีเดียว โดยแยกสิ่งที่ยืนยันได้จากสิ่งที่ยังไม่รู้</p>
            <span className="player-case-status"><span aria-hidden="true" />{progressLabel(progressBySubgame.get(kaSubgames["wa-ve"].id))}</span>
            <InvestigativeActionMarker>เปิดคดี WA VE</InvestigativeActionMarker>
          </div>
        </Link>
      </section>

      <section className="player-ai-strip" data-player-reveal="primary">
        <div>
          <span className="player-eyebrow">SUBMISSION / SOURCE CONTRACT</span>
          <h2>ส่งคำอธิบายของคุณเป็นข้อความหรือไฟล์หนึ่งชิ้น</h2>
          <p>ทั้งสองคดีใช้เกณฑ์ NetLood City เดียวกัน: เหตุและไทม์ไลน์ หลักฐาน ความไม่แน่นอน และระบบป้องกันที่คำนึงถึงคน</p>
        </div>
        <Link className="player-button" href="/play">กลับไปเลือกแฟ้มอื่น</Link>
      </section>
    </div>
  );
}
