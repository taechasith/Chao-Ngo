import Link from "next/link";

const dossierEntries = [
  {
    alt: "บันทึกภาพจากคดีก่อนเริ่ม NODE ZONE",
    label: "ก่อนคดี",
    src: "/node-zone-hero/pre-case/AIenhanceCCTV_Zoom.png",
  },
  {
    alt: "หลักฐานจากคดี Quantum ของ NODE ZONE",
    label: "Quantum",
    src: "/node-zone-hero/quantum/AIenhance_CCTV.png",
  },
];

export function ChaoNgoLandingHero() {
  return (
    <section className="relative isolate h-[calc(100svh-15rem)] min-h-[32rem] overflow-hidden border-b border-white/10 md:h-[calc(100svh-10rem)]" aria-label="แฟ้มคดี NODE ZONE">
      <img
        alt="หลักฐานจากคดี Space ของ NODE ZONE"
        className="absolute inset-0 size-full object-cover object-center"
        fetchPriority="high"
        src="/node-zone-hero/space/AIenhance_CCTV.png"
      />
      <div aria-hidden="true" className="absolute inset-0 bg-black/70" />
      <div aria-hidden="true" className="absolute inset-y-0 right-0 hidden w-[46%] border-l border-white/10 bg-black/30 lg:block" />

      <div className="relative mx-auto flex h-full max-w-7xl flex-col justify-between px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between gap-4 border-b border-white/15 pb-4 text-xs text-white/65">
          <p>NODE ZONE / แฟ้มคดี 01</p>
          <p className="text-cyan-100">เปิดอ่านหลักฐานได้แล้ว</p>
        </div>

        <div className="grid flex-1 items-center gap-8 py-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="max-w-2xl">
            <p className="text-sm text-cyan-100">แพลตฟอร์มการเรียนรู้ผ่านเกมสืบสวน</p>
            <h1 className="mt-3 font-display text-5xl leading-none text-white sm:text-6xl lg:text-7xl">เจ้าเงาะ</h1>
            <p className="mt-5 max-w-xl font-display text-2xl leading-tight text-white sm:text-3xl">
              เปิดแฟ้มคดีวิทยาศาสตร์ แล้วประกอบความจริงด้วยตัวคุณเอง
            </p>
            <p className="mt-5 max-w-xl text-sm leading-6 text-white/75 sm:text-base sm:leading-7">
              สำรวจเส้นเวลา หลักฐาน และคำถามจาก NODE ZONE ผ่านคดี Quantum และ Space โดยผู้เล่นเลือกเส้นทางการสืบสวนได้เอง
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link
                className="inline-flex min-h-11 items-center border border-cyan-200/50 bg-cyan-200/15 px-4 text-sm text-cyan-50 outline-none transition hover:bg-cyan-200/25 focus-visible:ring-2 focus-visible:ring-cyan-200"
                href="/play"
              >
                เข้าสู่แฟ้มคดี
              </Link>
              <Link
                className="inline-flex min-h-11 items-center border border-white/25 bg-black/25 px-4 text-sm text-white/85 outline-none transition hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-cyan-200"
                href="/onboarding"
              >
                อ่านข้อมูลก่อนเล่น
              </Link>
            </div>
          </div>

          <aside className="hidden border-y border-white/15 lg:block" aria-label="ดัชนีหลักฐาน">
            {dossierEntries.map((entry) => (
              <div className="grid grid-cols-[5rem_minmax(0,1fr)] gap-3 border-b border-white/15 py-3 last:border-b-0" key={entry.src}>
                <img alt={entry.alt} className="h-16 w-20 object-cover grayscale" src={entry.src} />
                <div className="self-center">
                  <p className="text-xs text-white/55">หลักฐานที่เปิดอ่านได้</p>
                  <p className="mt-1 font-display text-xl text-white">{entry.label}</p>
                </div>
              </div>
            ))}
          </aside>
        </div>

        <div className="grid border-t border-white/15 pt-4 text-xs text-white/65 sm:grid-cols-3 sm:gap-6">
          <p>2 คดีที่เปิดให้เล่น</p>
          <p className="hidden sm:block">เริ่มได้จาก Quantum หรือ Space</p>
          <p className="hidden text-right sm:block">ความคืบหน้าบันทึกเมื่อการเก็บข้อมูลเปิดใช้</p>
        </div>
      </div>
    </section>
  );
}
