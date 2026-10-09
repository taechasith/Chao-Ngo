import { DecisionPanel } from "./interior-system";
import { InvestigativeAction } from "./investigative-action";
export const companionUrl = "https://gemini.google.com/gem/45cb7e3f0314";
export function AiCompanionNotice({ href = companionUrl, guideTarget = "case-ai" }: { href?: string; guideTarget?: string }) {
  return <DecisionPanel guideTarget={guideTarget} action={<InvestigativeAction href={href} intent="secondary" rel="noopener noreferrer" target="_blank">เปิด Gemini ↗</InvestigativeAction>} eyebrow="ขั้นตอนบังคับก่อนส่ง / AI คู่คิด / GEMINI" title="ก่อนส่งคำตอบ ต้องคุยกับ AI คู่คิด">
    <p>ใช้ Gemini เพื่อถาม อธิบายแนวคิด และทดสอบคำอธิบายของคุณ จากนั้นบันทึกบทสนทนาเป็น PDF เพื่อแนบตอนส่งคำตอบ</p>
    <p>ต้องใช้ AI คู่คิดที่กำหนด แนบ PDF บทสนทนา และยืนยันการใช้งานก่อนส่งคำตอบ หากใช้ AI อื่นเพิ่มเติม ให้แนบลิงก์ในหน้าส่งคำตอบด้วย</p>
    <p>AI อาจตอบผิดได้ ตรวจคำตอบกับหลักฐานในแฟ้มคดีเสมอ คำตอบสุดท้ายยังเป็นของคุณ</p>
  </DecisionPanel>;
}
