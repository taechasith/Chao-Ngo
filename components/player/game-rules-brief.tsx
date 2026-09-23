export function GameRulesBrief() {
  return (
    <aside className="player-game-brief" aria-labelledby="game-rules-title">
      <div>
        <span className="player-eyebrow">เจ้าเงาะ / ก่อนเปิดแฟ้ม</span>
        <h2 id="game-rules-title">คุณกำลังจะเข้าไปทำอะไร</h2>
        <p>เจ้าเงาะเป็นเกมสืบสวนวิทยาศาสตร์ คุณจะอ่านหลักฐาน ตั้งสมมติฐาน เชื่อมโยงเหตุการณ์ และส่งคำอธิบายของตัวเอง</p>
      </div>
      <ol>
        <li><strong>01</strong><div><b>อ่าน</b><span>เปิด Timeline และไฟล์ที่เกี่ยวข้อง</span></div></li>
        <li><strong>02</strong><div><b>คิด</b><span>ใช้หลักฐานตอบโจทย์ของคดี ไม่ต้องเดาคำตอบจากชื่อเรื่อง</span></div></li>
        <li><strong>03</strong><div><b>คุย</b><span>ใช้ AI คู่คิดตามเงื่อนไขงานวิจัย แล้วเก็บบทสนทนาเป็น PDF</span></div></li>
        <li><strong>04</strong><div><b>ส่ง</b><span>ตอบคำถามของคดี ทำ post-test และแนบไฟล์ให้ครบ</span></div></li>
      </ol>
      <div className="player-game-brief-cases">
        <div><span>NODE ZONE / CASE 01</span><strong>THE CORRECT TRAJECTORY</strong><small>คำถามนำทาง: หลักฐานใดทำให้คำอธิบายของคุณน่าเชื่อถือขึ้น</small></div>
        <div><span>NODE ZONE / CASE 02</span><strong>THIRTEEN DAYS IN UTOPIA</strong><small>คำถามนำทาง: เหตุการณ์และข้อจำกัดใดอธิบายสิ่งที่เกิดขึ้นได้ดีที่สุด</small></div>
      </div>
    </aside>
  );
}
