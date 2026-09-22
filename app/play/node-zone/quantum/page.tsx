import { CaseInteriorPage } from "../../../../components/player/case-interior-page";

export default function QuantumPage() {
  return (
    <CaseInteriorPage
      description="คดีนี้ไม่ได้ถามว่าใครผิด แต่ชวนคุณสร้างคำอธิบายที่ยืนอยู่บนหลักฐาน และกล้าทบทวนเมื่อข้อมูลพาไปอีกทาง"
      eyebrow="NODE ZONE / CASE 01 / THE CORRECT TRAJECTORY"
      image="/node-zone-hero/quantum/AIenhance_CCTV.png"
      imageAlt="ภาพจากคดีควอนตัม"
      instructions={[
        { title: "สร้างแบบจำลองสาเหตุการเสียชีวิต", body: "อธิบายลำดับเหตุการณ์ด้วยหลักฐานที่ตรวจสอบได้ โดยยังไม่ต้องตัดสินว่าเป็นฆาตกรรมหรือไม่" },
        { title: "ชี้หลักฐานที่เปลี่ยนความคิด", body: "บอกว่าไฟล์ใดทำให้แบบจำลองของคุณแข็งแรงขึ้นหรือทำให้ต้องทบทวนสมมติฐาน" },
        { title: "ออกแบบการป้องกัน", body: "เสนอเทคโนโลยี ระบบ หรือขั้นตอนที่ช่วยป้องกันเหตุซ้ำ โดยยึดวิทยาศาสตร์และวิศวกรรม" },
      ]}
      meta="Quantum · 1 ผู้เล่น · หลักฐานเปิดให้ตรวจสอบ"
      pageTitle="คดีควอนตัม"
      subgameId="subgame-node-zone-quantum"
      subtitle="คดีควอนตัม"
      timelineSlug="quantum"
      title="THE CORRECT TRAJECTORY"
    />
  );
}
