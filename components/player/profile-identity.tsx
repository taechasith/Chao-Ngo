"use client";

import { useRef, useState, type FormEvent } from "react";
import { Camera, Pencil, UserRound, X } from "lucide-react";

type Identity = { name: string; email: string; image?: string | null };

async function prepareAvatar(file: File): Promise<string> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 8 * 1024 * 1024) throw new Error("ใช้รูป JPG, PNG หรือ WebP ขนาดไม่เกิน 8 MB");
  const bitmap = await createImageBitmap(file);
  try {
    if (bitmap.width * bitmap.height > 24000000) throw new Error("รูปมีขนาดใหญ่มาก กรุณาย่อรูปก่อนเลือก");
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) throw new Error("ยังเตรียมรูปไม่ได้ ลองอีกครั้ง");
    const side = Math.min(bitmap.width, bitmap.height);
    for (const size of [320, 256]) {
      canvas.width = canvas.height = size;
      context.fillStyle = "#101515"; context.fillRect(0, 0, size, size);
      context.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, size, size);
      for (const quality of [.82, .68, .5, .35]) {
        const result = canvas.toDataURL("image/jpeg", quality);
        if (result.length <= 128000) return result;
      }
    }
    throw new Error("รูปนี้มีรายละเอียดมากเกินไป กรุณาเลือกรูปอื่น");
  } finally { bitmap.close(); }
}

export function ProfileIdentity({ user, onSaved }: { user: Identity; onSaved: (value: Identity) => void }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(user.name);
  const [image, setImage] = useState(user.image ?? null);
  const [saving, setSaving] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [message, setMessage] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  const editButton = useRef<HTMLButtonElement>(null);

  function closeEditor() { setEditing(false); requestAnimationFrame(() => editButton.current?.focus()); }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (saving || preparing || !name.trim()) return;
    setSaving(true); setMessage("");
    try {
      const response = await fetch("/api/player-profile", { method: "PATCH", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: name.trim(), ...(image !== (user.image ?? null) ? { image } : {}) }) });
      if (!response.ok) throw new Error(response.status === 401 ? "เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง" : "บันทึกไม่ได้ กรุณาลองอีกครั้ง");
      const payload = await response.json() as { user: Identity };
      onSaved(payload.user); closeEditor(); setMessage("บันทึกโปรไฟล์แล้ว");
    } catch (error) { setMessage(error instanceof Error ? error.message : "บันทึกไม่ได้ กรุณาลองอีกครั้ง"); }
    finally { setSaving(false); }
  }

  return <section className="player-profile-identity" data-guide="profile-identity" data-player-reveal="primary">
    <div className="player-identity-portrait"><div className="player-profile-avatar">{(editing ? image : user.image) ? <img src={(editing ? image : user.image) ?? ""} alt={`รูปโปรไฟล์ของ ${user.name}`} /> : <UserRound size={40} strokeWidth={1} aria-hidden="true" />}</div><span className="player-eyebrow">PLAYER IDENTITY</span></div>
    <div className="player-profile-identity-copy"><span className="player-eyebrow">นักสืบ / เจ้าเงาะ</span><h2>{user.name}</h2><p>{user.email}</p><span>ทุกการสืบ มีเส้นทางเป็นของตัวเอง</span></div>
    {!editing ? <button className="player-button" ref={editButton} onClick={() => { setName(user.name); setImage(user.image ?? null); setMessage(""); setEditing(true); requestAnimationFrame(() => nameInput.current?.focus()); }} type="button"><Pencil size={15} aria-hidden="true" />แก้ไขโปรไฟล์</button> : <form className="player-profile-edit" onSubmit={save}>
      <header><h3>แก้ไขโปรไฟล์</h3><button aria-label="ยกเลิกการแก้ไขโปรไฟล์" className="player-close-button" disabled={saving || preparing} onClick={closeEditor} type="button"><X size={18} /></button></header>
      <label htmlFor="profile-name">ชื่อที่แสดง<input className="player-input" id="profile-name" maxLength={80} minLength={1} required ref={nameInput} onChange={event => setName(event.target.value)} value={name} /></label>
      <input ref={fileInput} type="file" className="sr-only" aria-label="เลือกรูปโปรไฟล์" accept="image/jpeg,image/png,image/webp" disabled={saving || preparing} onChange={async event => {
        const file = event.currentTarget.files?.[0]; event.currentTarget.value = "";
        if (!file) return;
        setPreparing(true); setMessage("");
        try { setImage(await prepareAvatar(file)); } catch (error) { setMessage(error instanceof Error ? error.message : "เปิดรูปไม่ได้"); } finally { setPreparing(false); }
      }} />
      <div className="player-avatar-actions"><button className="player-button" disabled={saving || preparing} onClick={() => fileInput.current?.click()} type="button"><Camera size={16} aria-hidden="true" />{preparing ? "กำลังเตรียมรูป…" : "เลือกรูปใหม่"}</button>{image ? <button className="player-text-action" disabled={saving || preparing} onClick={() => setImage(null)} type="button">นำรูปออก</button> : null}</div>
      <small>JPG, PNG หรือ WebP · ไม่เกิน 8 MB · ตัดกึ่งกลางเป็นสี่เหลี่ยม</small>
      <p className="player-profile-privacy">ส่วนนี้แก้รูปและชื่อที่แสดง ข้อมูลวิจัยแก้ได้ในส่วนถัดไป</p>
      <div><button className="player-button player-button--primary" disabled={saving || preparing || !name.trim()} type="submit">{saving ? "กำลังบันทึก…" : "บันทึกการเปลี่ยนแปลง"}</button><button className="player-button" disabled={saving || preparing} onClick={closeEditor} type="button">ยกเลิก</button></div>
    </form>}
    {message ? <p className="player-profile-status" role="status">{message}</p> : null}
  </section>;
}
