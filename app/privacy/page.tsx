import type { Metadata } from "next";
import Link from "next/link";

import { AppShell } from "../../components/player/app-shell";
import { researchNotice } from "../../lib/server/research-policy";
import { approvedResearchConsentText } from "../../lib/server/research-consent-copy";
import { getResearchRetentionYears } from "../../lib/server/research-retention";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "ความเป็นส่วนตัว | เจ้าเงาะ" };

export default async function PrivacyPage() {
  const retentionYears = await getResearchRetentionYears();
  return <AppShell pageTitle="ความเป็นส่วนตัว">
    <article className="player-privacy-page">
      <header className="player-page-heading"><span className="player-eyebrow">CHAO NGO / PRIVACY</span><h1>ความเป็นส่วนตัว</h1><p>การเก็บและใช้ข้อมูลในเว็บไซต์เจ้าเงาะ (Chao Ngo)</p><p className="player-auth-note">ปรับปรุงล่าสุด 3 ตุลาคม 2569 · ผู้รับผิดชอบโครงการ {researchNotice.controllerName}</p></header>
      <section><h2>เข้าสู่ระบบด้วย Google</h2><p>เราใช้รหัสบัญชี Google อีเมล สถานะการยืนยันอีเมล ชื่อ และรูปโปรไฟล์ เพื่อยืนยันตัวตน สร้างบัญชีผู้เล่น และเชื่อมบัญชีเดิมที่ใช้อีเมลเดียวกันกับความคืบหน้าของคุณ ชื่อและรูปที่ผู้เล่นแก้เองในบัญชีเดิมจะยังคงอยู่</p><p>เว็บไซต์ขอเฉพาะสิทธิ์ openid, email และ profile ไม่ขอสิทธิ์อ่าน Gmail หรือ Google Drive และไม่รับรหัสผ่านบัญชี Google ของคุณ การยินยอมให้ Google ส่งข้อมูลบัญชีไม่ใช่การยินยอมเข้าร่วมการวิจัย</p></section>
      <section><h2>ข้อมูลที่คุณให้ระหว่างเล่น</h2><ul>{researchNotice.dataCategories.map(category => <li key={category}>{category}</li>)}</ul><p>{researchNotice.purpose}</p><p>ระบบแสดงข้อมูลและขอความยินยอมในขั้นเตรียมก่อนเล่น การอัปโหลด PDF บทสนทนา AI มีการยืนยันแยกจากการเข้าสู่ระบบ</p></section>
      <section><h2>การจัดเก็บและผู้ที่ใช้ข้อมูล</h2><p>เว็บไซต์ทำงานบน Cloudflare โดยใช้ฐานข้อมูลสำหรับบัญชี โปรไฟล์ และความคืบหน้า และพื้นที่ไฟล์ส่วนตัวสำหรับงานส่ง ข้อมูลบัญชี Google เชื่อมกับบัญชีผู้เล่นในระบบ ผู้ปฏิบัติงานที่ได้รับสิทธิ์ใช้ข้อมูลบัญชีเพื่อดูแลระบบ และใช้ข้อมูลประกอบการวิจัยตามความยินยอมที่คุณให้</p><p>{researchNotice.recipients}</p><p>ระบบใช้คุกกี้เพื่อรักษาสถานะการเข้าสู่ระบบ และเก็บการตั้งค่าหน้าจอไว้ในเบราว์เซอร์ การตรวจสอบความปลอดภัยใช้ Cloudflare Turnstile ข้อมูลทางเทคนิค เช่น IP และข้อมูลเบราว์เซอร์ อาจอยู่ในข้อมูลเซสชันและบันทึกการทำงานเพื่อดูแลความปลอดภัยและตรวจสอบข้อผิดพลาด</p><p>{researchNotice.externalServiceNotice}</p></section>
      <section><h2>ระยะเวลาเก็บข้อมูลและความยินยอม</h2>{approvedResearchConsentText(retentionYears).split("\n\n").map(paragraph => <p key={paragraph}>{paragraph}</p>)}</section>
      <section><h2>จัดการข้อมูลและติดต่อเรา</h2><p>คุณแก้ชื่อ รูปโปรไฟล์ และข้อมูลพื้นฐานได้ในหน้าโปรไฟล์ หากต้องการขอลบข้อมูลหรือสอบถามการใช้ข้อมูล โปรดติดต่อทีมโครงการที่ <a href={researchNotice.controllerContactEmail}>creativelab.co.th@gmail.com</a> การถอนสิทธิ์แอป Chao Ngo ในบัญชี Google หยุดสิทธิ์เชื่อมต่อกับ Google แต่ไม่ใช่การลบข้อมูลที่เว็บไซต์เก็บไว้แล้ว</p><p>คำถามเกี่ยวกับการเข้าสู่ระบบ Google ติดต่อ <a href="mailto:tanapol509555@gmail.com">tanapol509555@gmail.com</a></p><Link href="/login" className="player-text-action">กลับไปเข้าสู่ระบบ</Link></section>
    </article>
  </AppShell>;
}
