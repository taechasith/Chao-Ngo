export type ResearchNotice = {
  aiChatPdfNotice: string;
  consentVersion: string;
  controllerContactEmail: string;
  controllerName: string;
  dataCategories: readonly string[];
  dataNoticeVersion: string;
  externalServiceNotice: string;
  lastUpdated: string;
  minimumParticipantAge: number;
  purpose: string;
  recipients: string;
  retentionAndWithdrawalPolicy: string;
  rightsNotice: string;
};

export const researchNotice: ResearchNotice = {
  consentVersion,
  controllerContactEmail: "mailto:creativelab.co.th@gmail.com",
  controllerName: "CreativeLabTH Group",
  dataNoticeVersion,
  lastUpdated: "2026-09-25",
  minimumParticipantAge: 18,
  purpose:
    "แพลตฟอร์มนี้ใช้เพื่อพัฒนาและประเมินประสบการณ์การเรียนรู้วิทยาศาสตร์ผ่านเกมสืบสวนและผู้ช่วย AI โดยวิเคราะห์ผลในรูปแบบที่ลดการระบุตัวบุคคลเท่าที่ทำได้",
  dataCategories: [
    "ข้อมูลบัญชี ได้แก่ อีเมลและชื่อที่ใช้แสดง",
    "ข้อมูลโปรไฟล์ที่ผู้เข้าร่วมให้ ได้แก่ อายุ ระดับการศึกษา เพศ สถานศึกษา ความสนใจด้านวิทยาศาสตร์ และทักษะส่วนตัวที่เลือกพิมพ์เพิ่ม",
    "คำตอบแบบสอบถามก่อนและหลังเล่น คำตอบงานส่ง สถานะความคืบหน้า และรางวัลความสำเร็จ",
    "เหตุการณ์สำคัญของการใช้งาน เช่น การเริ่มหรือจบเกม การเปิดหลักฐาน และการเปิดลิงก์ผู้ช่วย AI โดยไม่เก็บการกดแป้นพิมพ์ พิกัดเมาส์ หรือการเลื่อนหน้า",
    "PDF บทสนทนากับผู้ช่วย AI และข้อมูลไฟล์ที่เกี่ยวข้อง เฉพาะเมื่อผู้เข้าร่วมเลือกอัปโหลดและยินยอมแยกต่างหาก",
  ],
  recipients:
    "เฉพาะผู้รับผิดชอบโครงการ นักวิจัย และผู้ปฏิบัติงานที่ได้รับมอบหมายเท่าที่จำเป็นต่อการดำเนินโครงการ การดูแลระบบ และการวิเคราะห์ผล ข้อมูลจะไม่เผยแพร่แบบระบุตัวบุคคล เว้นแต่กฎหมายกำหนด",
  externalServiceNotice:
    "ผู้ช่วย AI เป็นบริการภายนอก ผู้เข้าร่วมควรอ่านเงื่อนไขและนโยบายของผู้ให้บริการนั้นก่อนใช้งาน เราจะไม่ส่งเนื้อหา PDF ที่อัปโหลดไปยังผู้ให้บริการ AI ภายนอกโดยไม่มีความยินยอมเพิ่มเติมจากผู้เข้าร่วม",
  aiChatPdfNotice: aiChatPdfConsentCheckboxLabel(3),
  retentionAndWithdrawalPolicy: approvedResearchConsentText(3),
  rightsNotice:
    "คุณสามารถติดต่อทีมโครงการเกี่ยวกับข้อมูลของคุณหรือการใช้สิทธิที่เกี่ยวข้องได้ที่ creativelab.co.th@gmail.com หากขอลบข้อมูลก่อนครบกำหนด ทีมโครงการจะดำเนินการตามเงื่อนไข Consent และความเป็นส่วนตัว เว้นแต่กฎหมายกำหนดให้ยังต้องเก็บรักษาข้อมูลนั้น",
};

export type ResearchCollectionPolicy = {
  dataNoticeVersion: string;
  enabled: boolean;
  minimumParticipantAge: number;
  consentVersion: string;
  retentionAndWithdrawalPolicy: string;
  privateStorageReady: boolean;
};

export const researchCollectionPolicy: ResearchCollectionPolicy = {
  consentVersion: researchNotice.consentVersion,
  dataNoticeVersion: researchNotice.dataNoticeVersion,
  enabled: false,
  minimumParticipantAge: researchNotice.minimumParticipantAge,
  retentionAndWithdrawalPolicy: researchNotice.retentionAndWithdrawalPolicy,
  privateStorageReady: true,
};

export function isResearchCollectionReady(policy: ResearchCollectionPolicy): boolean {
  return Boolean(
    policy.enabled &&
      policy.privateStorageReady &&
      policy.consentVersion &&
      policy.dataNoticeVersion &&
      policy.minimumParticipantAge >= 18 &&
      policy.retentionAndWithdrawalPolicy,
  );
}
import { aiChatPdfConsentCheckboxLabel, approvedResearchConsentText, consentVersion, dataNoticeVersion } from "./research-consent-copy";
