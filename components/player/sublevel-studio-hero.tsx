export function SublevelStudioLandingPage() {
  return (
    <div className="relative h-full min-h-[32rem] overflow-hidden bg-[#080808]">
      <iframe
        className="player-landing-frame absolute inset-0 block size-full border-0 bg-[#080808]"
        loading="eager"
        src="/landing-pages/sublevel-studio.html?v=jao-ngoh-case-entry-1"
        tabIndex={-1}
        title="เจ้าเงาะ - Open-source science detective platform"
      />
      <span aria-hidden="true" className="landing-scene-brand landing-scene-brand--wall">เจ้าเงาะ</span>
      <span aria-hidden="true" className="landing-scene-brand landing-scene-brand--arcade">เจ้าเงาะ</span>
      <span aria-hidden="true" className="landing-scene-brand landing-scene-brand--ticker">เจ้าเงาะ / แฟ้มคดี</span>
    </div>
  );
}
