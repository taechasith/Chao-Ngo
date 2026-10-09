import { DecisionPanel } from "./interior-system";
import { InvestigativeAction } from "./investigative-action";
export const companionUrl = "https://gemini.google.com/gem/45cb7e3f0314";
export function AiCompanionNotice({ href = companionUrl }: { href?: string }) {
  return <DecisionPanel guideTarget="case-ai" action={<InvestigativeAction href={href} intent="secondary" rel="noopener noreferrer" target="_blank">เปิด Gemini ↗</InvestigativeAction>} eyebrow="REQUIRED / AI คู่คิด / GEMINI" title="ก่อนส่งคำตอบ ต้องคุยกับ AI คู่คิด">
    <p>ใช้ Gemini เพื่อถาม อธิบายแนวคิด และทดสอบคำอธิบายของคุณ จากนั้นบันทึกบทสนทนาเป็น PDF เพื่อแนบตอนส่งคำตอบ</p>
    <p>AI อาจตอบผิดได้ ตรวจคำตอบกับหลักฐานในแฟ้มคดีเสมอ คำตอบสุดท้ายยังเป็นของคุณ</p>
  </DecisionPanel>;
}
