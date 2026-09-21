"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { PlayerDialog } from "./player-dialog";

type HelpButtonProps = {
  compact?: boolean;
  pageTitle: string;
};

function guideFor(pageTitle: string) {
  if (pageTitle.includes("คดี")) return "เริ่มจากสิ่งที่คุณเห็นก่อน แล้วค่อยกลับมาดูหลักฐานชิ้นเดิมได้เสมอ";
  if (pageTitle === "NODE ZONE") return "เลือกคดีจากสิ่งที่คุณอยากรู้ ไม่ต้องเริ่มตามลำดับ";
  if (pageTitle.includes("ส่งคำตอบ")) return "ยังไม่มั่นใจ? กลับไปดูหลักฐานได้ทุกเมื่อก่อนตัดสินใจส่งคำตอบ";
  if (pageTitle.includes("เริ่มต้น")) return "อ่านข้อมูลให้ครบ แล้วเลือกด้วยตัวเองว่าจะเข้าร่วมการวิจัยหรือไม่";
  return "ค่อย ๆ เปิดสิ่งที่คุณสงสัยก่อน แล้วกลับมาดูสิ่งที่พบได้ทุกเมื่อ";
}

export function HelpButton({ compact = false, pageTitle }: HelpButtonProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        className={compact ? "player-mobile-link" : "player-utility-link"}
        onClick={() => setIsOpen(true)}
        type="button"
      >
        ช่วยเหลือ
      </button>
      {isOpen ? (
        <PlayerDialog className="player-guide-dialog" label={`คำแนะนำสำหรับ ${pageTitle}`} onClose={() => setIsOpen(false)}>
          <section className="player-guide-panel">
            <div className="player-guide-heading">
              <div>
                <p className="player-eyebrow">เจ้าเงาะ / ข้อสังเกต</p>
                <p className="font-display text-2xl text-white">{pageTitle}</p>
                <p className="mt-3 text-sm leading-7 text-white/70">{guideFor(pageTitle)}</p>
              </div>
              <button
                aria-label="ปิดคำแนะนำ"
                className="player-close-button"
                onClick={() => setIsOpen(false)}
                type="button"
              >
                <X aria-hidden="true" size={20} />
              </button>
            </div>
          </section>
        </PlayerDialog>
      ) : null}
    </>
  );
}
