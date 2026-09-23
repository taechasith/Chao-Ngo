import { KaCaseInteriorPage } from "../../../../components/player/ka-case-interior-page";

export default function KaWaVePage() {
  return (
    <KaCaseInteriorPage
      caseSlug="wa-ve"
      description="ตรวจสอบความเชื่อมโยงระหว่างข้อมูลทางชีวภาพ พฤติกรรม การเข้าถึงระบบ และบันทึกการสื่อสาร เพื่อสร้างคำอธิบายที่เปิดรับความไม่แน่นอน"
      image="/ka-casefiles/personnel/tete-techametakun.png"
      imageAlt="แฟ้มบุคลากรจากคดี WA VE"
      instructions={[
        { title: "แยกข้อมูลจากคำตีความ", body: "อ่านรายงานและบันทึกแต่ละชิ้นว่าไฟล์ยืนยันอะไรได้ และมีข้อจำกัดอะไร" },
        { title: "เชื่อมหลักฐานต่างประเภท", body: "เปรียบเทียบหลักฐานทางชีวภาพ ดิจิทัล และพฤติกรรมโดยไม่ให้ประเภทใดประเภทหนึ่งตัดสินแทนทั้งหมด" },
        { title: "ออกแบบการป้องกันเป็นชั้น", body: "เมื่อเห็น failure mode ที่เป็นไปได้แล้ว ให้คิดถึงการป้องกัน การตรวจจับ และการส่งต่อมนุษย์" },
      ]}
      meta="Bio x Psychology · 1 ผู้เล่น · หลักฐานเปิดให้ตรวจสอบ"
      pageTitle="คดี WA VE"
    />
  );
}
