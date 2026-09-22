import { CaseInteriorPage } from "../../../../components/player/case-interior-page";

export default function SpacePage() {
  return (
    <CaseInteriorPage
      description="คดีนี้ชวนคุณตามรอยเหตุการณ์ในอวกาศ อธิบายสิ่งที่เกิดขึ้นกับผู้เกี่ยวข้อง และประเมินว่าระบบใดจะป้องกันเหตุซ้ำได้"
      eyebrow="NODE ZONE / CASE 02 / THIRTEEN DAYS IN UTOPIA"
      image="/node-zone-hero/space/AIenhance_CCTV.png"
      imageAlt="ภาพจากคดีอวกาศ"
      instructions={[
        { title: "อธิบายสาเหตุของผู้เสียชีวิตทั้งสามคน", body: "สร้างคำอธิบายเชิงสรีรวิทยาและวิศวกรรมสำหรับ WIN, TAE และ COMMANDER" },
        { title: "ตามรอยหลักฐานที่เปลี่ยนแบบจำลอง", body: "ระบุว่าหลักฐานใดทำให้คุณปรับหรือยืนยันคำอธิบายของเหตุการณ์" },
        { title: "ประเมิน DEMETER และออกแบบการป้องกัน", body: "พิจารณา DEMETER ในฐานะกลยุทธ์ยืดอายุอาหารฉุกเฉิน แล้วเสนอระบบป้องกันเหตุซ้ำ" },
      ]}
      meta="Space · 1 ผู้เล่น · หลักฐานเปิดให้ตรวจสอบ"
      pageTitle="คดีอวกาศ"
      subgameId="subgame-node-zone-space"
      subtitle="คดีอวกาศ"
      timelineSlug="space"
      title="THIRTEEN DAYS IN UTOPIA"
    />
  );
}
