import { Panel } from "./panel";

export function LoadingState() {
  return (
    <Panel aria-live="polite" className="max-w-xl" tone="quiet">
      <span className="player-eyebrow">MIND STATE / LOADING</span>
      <p className="mt-3 text-sm leading-7 text-white/70">กำลังจัดวางข้อมูลในแฟ้ม</p>
    </Panel>
  );
}

export function ErrorState({ onRetry }: { onRetry?: () => void }) {
  return (
    <Panel aria-live="assertive" className="max-w-xl" tone="sealed">
      <span className="player-eyebrow">SYSTEM NOTE</span>
      <h1 className="mt-3 font-display text-3xl leading-tight text-white">ยังเปิดแฟ้มนี้ไม่ได้</h1>
      <p className="mt-3 text-sm leading-7 text-white/80">ไม่สามารถเปิดข้อมูลในขณะนี้ ลองเชื่อมต่อใหม่อีกครั้ง</p>
      {onRetry ? (
        <button
          className="player-button mt-5"
          onClick={onRetry}
          type="button"
        >
          ลองอีกครั้ง
        </button>
      ) : null}
    </Panel>
  );
}
