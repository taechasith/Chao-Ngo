import { KaCaseInteriorPage } from "../../../../components/player/ka-case-interior-page";

export default function KaMaimeePage() {
  return (
    <KaCaseInteriorPage
      caseSlug="maimee"
      description="วิเคราะห์ห่วงโซ่เหตุการณ์จากหลักฐานทางกายภาพ ดิจิทัล การเงิน และไทม์ไลน์ แล้วออกแบบระบบที่อาจช่วยให้ความสูญเสียลักษณะนี้เกิดขึ้นยากขึ้น"
      image="/ka-casefiles/maimee/scene-01.png"
      imageAlt="ภาพถ่ายจากคดี MAIMEE"
      instructions={[
        { title: "เริ่มจากสิ่งที่ยืนยันได้", body: "เปรียบเทียบรายละเอียดในภาพ บันทึก และรายงานโดยไม่รีบสรุปจากหลักฐานชิ้นเดียว" },
        { title: "จัดลำดับเหตุการณ์", body: "ใช้รายงานไทม์ไลน์เพื่อวางก่อนเกิดเหตุ จุดเปลี่ยนสำคัญ และผลที่ตามมา" },
        { title: "ทดสอบสมมติฐานทางเลือก", body: "ให้หลักฐานหลายประเภทช่วยท้าทายคำอธิบายของคุณก่อนออกแบบการป้องกัน" },
      ]}
      meta="FinTech · 1 ผู้เล่น · หลักฐานเปิดให้ตรวจสอบ"
      pageTitle="คดี MAIMEE"
    />
  );
}
