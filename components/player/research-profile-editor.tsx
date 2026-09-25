"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Pencil, Plus, X } from "lucide-react";

import type { ResearchProfile } from "../../lib/server/research-profile";

const educationOptions = [
  ["lower_secondary", "ม.ต้น"], ["upper_secondary", "ม.ปลาย"],
  ["vocational", "ปวช.–ปวส."], ["bachelor", "ปริญญาตรี"], ["other", "อื่น ๆ"],
] as const;
const genderOptions = [
  ["male", "ชาย"], ["female", "หญิง"],
  ["nonbinary_or_self_described", "ไม่ตรงกับตัวเลือกชาย/หญิง"], ["prefer_not_to_say", "ไม่ประสงค์ระบุ"],
] as const;
const fields = [
  ["quantum", "ฟิสิกส์ควอนตัม"], ["space", "วิทยาศาสตร์อวกาศ"],
  ["psychology", "จิตวิทยา"], ["fintech", "FinTech"], ["biotech", "ชีวเทคโนโลยี"],
] as const;

function labelFor(value: string | null, options: readonly (readonly [string, string])[]) {
  return options.find(([key]) => key === value)?.[1] ?? "ไม่ระบุ";
}

function Rating({ label, onChange, value }: { label: string; onChange: (value: number) => void; value: number }) {
  return <div className="player-research-rating">
    <span>{label}</span>
    <div aria-label={`${label}: ${value} จาก 5`} className="player-research-scale" role="group">
      {[1, 2, 3, 4, 5].map((rating) => <button aria-label={`${label} ${rating} จาก 5`} aria-pressed={rating === value} key={rating} onClick={() => onChange(rating)} type="button">{rating}</button>)}
    </div>
  </div>;
}

export function ResearchProfileEditor() {
  const [profile, setProfile] = useState<ResearchProfile | null>(null);
  const [draft, setDraft] = useState<ResearchProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [skillInput, setSkillInput] = useState("");
  const [message, setMessage] = useState("");
  const [loadError, setLoadError] = useState("");
  const ageInput = useRef<HTMLInputElement>(null);
  const editButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/player-research-profile", { credentials: "same-origin", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(response.status === 409 ? "กรอกแบบสอบถามก่อนเล่นให้เสร็จก่อน จึงจะแก้ข้อมูลส่วนนี้ได้" : response.status === 403 ? "ต้องยืนยันการเข้าร่วมวิจัยก่อนจึงจะดูข้อมูลส่วนนี้ได้" : "ยังอ่านข้อมูลวิจัยไม่ได้ ลองโหลดหน้าอีกครั้ง");
        return await response.json() as { profile: ResearchProfile };
      })
      .then(({ profile: result }) => { setProfile(result); setLoading(false); })
      .catch((error: unknown) => { if (!controller.signal.aborted) { setLoadError(error instanceof Error ? error.message : "ยังอ่านข้อมูลวิจัยไม่ได้"); setLoading(false); } });
    return () => controller.abort();
  }, []);

  function closeEditor() { setEditing(false); setSkillInput(""); setMessage(""); requestAnimationFrame(() => editButton.current?.focus()); }
  function addSkill() {
    const value = skillInput.trim();
    if (!draft || value.length < 2 || value.length > 40) { setMessage("ทักษะต้องยาว 2–40 ตัวอักษร"); return; }
    if (draft.personalSkills.length >= 8) { setMessage("เพิ่มทักษะได้ไม่เกิน 8 รายการ"); return; }
    if (draft.personalSkills.some((item) => item.toLocaleLowerCase() === value.toLocaleLowerCase())) { setMessage("ทักษะนี้อยู่ในรายการแล้ว"); return; }
    setDraft({ ...draft, personalSkills: [...draft.personalSkills, value] });
    setSkillInput(""); setMessage("");
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!draft || saving || draft.age < 18 || draft.age > 120) return;
    const pendingSkill = skillInput.trim();
    if (pendingSkill && (pendingSkill.length < 2 || pendingSkill.length > 40 || draft.personalSkills.length >= 8 || draft.personalSkills.some((item) => item.toLocaleLowerCase() === pendingSkill.toLocaleLowerCase()))) {
      setMessage("ตรวจทักษะที่กำลังพิมพ์: ต้องยาว 2–40 ตัวอักษร ไม่ซ้ำ และมีรวมไม่เกิน 8 รายการ");
      return;
    }
    const nextProfile = pendingSkill ? { ...draft, personalSkills: [...draft.personalSkills, pendingSkill] } : draft;
    setSaving(true); setMessage("");
    try {
      const response = await fetch("/api/player-research-profile", { method: "PATCH", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(nextProfile) });
      if (!response.ok) throw new Error(response.status === 429 ? "บันทึกบ่อยเกินไป กรุณารอสักครู่" : response.status === 400 ? "ข้อมูลไม่ถูกต้อง ตรวจอายุและคำตอบอีกครั้ง" : "บันทึกข้อมูลไม่ได้ กรุณาลองอีกครั้ง");
      const payload = await response.json() as { profile: ResearchProfile };
      setProfile(payload.profile); setEditing(false); setSkillInput(""); setMessage("บันทึกข้อมูลแล้ว");
    } catch (error) { setMessage(error instanceof Error ? error.message : "บันทึกข้อมูลไม่ได้"); }
    finally { setSaving(false); }
  }

  return <section className="player-profile-section player-research-profile" data-player-reveal="primary">
    <header className="player-research-profile-heading">
      <div><span className="player-eyebrow">RESEARCH PROFILE / ข้อมูลส่วนตัว</span><h2>ข้อมูลที่ใช้ในงานวิจัย</h2><p>ตรวจและแก้ข้อมูลพื้นฐาน ความสนใจ และทักษะที่คุณระบุได้ที่นี่</p></div>
      {profile && !editing ? <button className="player-button" onClick={() => { setDraft({ ...profile, fieldInterests: { ...profile.fieldInterests }, personalSkills: [...profile.personalSkills] }); setMessage(""); setEditing(true); requestAnimationFrame(() => ageInput.current?.focus()); }} ref={editButton} type="button"><Pencil aria-hidden="true" size={15} />แก้ข้อมูล</button> : null}
    </header>
    {loading ? <p role="status">กำลังอ่านข้อมูลวิจัย…</p> : loadError ? <p className="player-research-note" role="status">{loadError} <Link href="/onboarding">ไปหน้าก่อนเริ่มเล่น</Link></p> : null}
    {profile && !editing ? <>
      <div className="player-research-facts">
        <div><span>อายุ</span><strong>{profile.age} ปี</strong></div>
        <div><span>ระดับการศึกษา</span><strong>{labelFor(profile.educationLevel, educationOptions)}</strong></div>
        <div><span>เพศ</span><strong>{labelFor(profile.gender, genderOptions)}</strong></div>
        <div><span>สถานศึกษา</span><strong>{profile.institution || "ไม่ระบุ"}</strong></div>
        <div><span>ความสนใจวิทยาศาสตร์โดยรวม</span><strong>{profile.scienceInterest} / 5</strong></div>
        <div><span>ทักษะส่วนตัว</span><strong>{profile.personalSkills.length ? profile.personalSkills.join(" · ") : "ยังไม่ได้เพิ่ม"}</strong></div>
      </div>
      <div className="player-research-interests"><span className="player-eyebrow">FIELD INTEREST / ความสนใจรายด้าน</span><div>{fields.map(([key, label]) => <span key={key}>{label} <b>{profile.fieldInterests[key]}/5</b></span>)}</div></div>
    </> : null}
    {editing && draft ? <form className="player-research-form" onSubmit={save}>
      <div className="player-research-form-grid">
        <label>อายุ (ปี)<input className="player-input" max={120} min={18} onChange={(event) => setDraft({ ...draft, age: Number(event.target.value) })} ref={ageInput} required type="number" value={draft.age || ""} /></label>
        <label>ระดับการศึกษา<select className="player-input" onChange={(event) => setDraft({ ...draft, educationLevel: event.target.value as ResearchProfile["educationLevel"] })} value={draft.educationLevel}>{educationOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label>เพศ (ไม่บังคับ)<select className="player-input" onChange={(event) => setDraft({ ...draft, gender: event.target.value ? event.target.value as ResearchProfile["gender"] : null })} value={draft.gender ?? ""}><option value="">ไม่ระบุ</option>{genderOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label>สถานศึกษา (ไม่บังคับ)<input className="player-input" maxLength={120} onChange={(event) => setDraft({ ...draft, institution: event.target.value || null })} value={draft.institution ?? ""} /></label>
      </div>
      <div className="player-research-form-group"><h3>ความสนใจด้านวิทยาศาสตร์</h3><p>ให้คะแนน 1 = น้อยที่สุด, 5 = มากที่สุด</p><Rating label="โดยรวม" onChange={(value) => setDraft({ ...draft, scienceInterest: value })} value={draft.scienceInterest} />{fields.map(([key, label]) => <Rating key={key} label={label} onChange={(value) => setDraft({ ...draft, fieldInterests: { ...draft.fieldInterests, [key]: value } })} value={draft.fieldInterests[key]} />)}</div>
      <div className="player-research-form-group"><h3>ทักษะส่วนตัว</h3><p>พิมพ์ทักษะที่คุณอยากระบุ เช่น วิเคราะห์ข้อมูล หรือการเล่าเรื่อง เพิ่มได้สูงสุด 8 รายการ</p><div className="player-skill-add"><input aria-label="ทักษะส่วนตัว" className="player-input" maxLength={40} onChange={(event) => setSkillInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addSkill(); } }} placeholder="พิมพ์ทักษะของคุณ" value={skillInput} /><button className="player-button" disabled={saving || !skillInput.trim()} onClick={addSkill} type="button"><Plus aria-hidden="true" size={16} />เพิ่มทักษะ</button></div><div aria-label="รายการทักษะส่วนตัว" className="player-skill-list">{draft.personalSkills.map((skill) => <span key={skill}>{skill}<button aria-label={`ลบทักษะ ${skill}`} disabled={saving} onClick={() => setDraft({ ...draft, personalSkills: draft.personalSkills.filter((item) => item !== skill) })} type="button"><X aria-hidden="true" size={14} /></button></span>)}</div></div>
      <p className="player-research-note">ข้อมูลที่แก้จะใช้เป็นโปรไฟล์วิจัยปัจจุบัน คำตอบแบบสอบถามก่อนเล่นและคำแนะนำเดิมจะไม่ถูกคำนวณย้อนหลัง</p>
      {message ? <p aria-live="polite" className="player-profile-status">{message}</p> : null}
      <div className="player-research-form-actions"><button className="player-button player-button--primary" disabled={saving || draft.age < 18 || draft.age > 120} type="submit">{saving ? "กำลังบันทึก…" : "บันทึกข้อมูล"}</button><button className="player-button" disabled={saving} onClick={closeEditor} type="button">ยกเลิก</button></div>
    </form> : null}
    {!editing && message ? <p className="player-profile-status" role="status">{message}</p> : null}
  </section>;
}
