"use client";

import { useEffect } from "react";

export function UiSound() {
  useEffect(() => {
    let available = false;
    const controller = new AbortController();
    void fetch("/api/player-settings", { signal: controller.signal }).then(response => response.ok ? response.json() as Promise<{ soundEffects?: boolean }> : null).then(settings => { available = settings?.soundEffects === true; }).catch(() => undefined);
    const onClick = (event: MouseEvent) => {
      let enabled = false;
      try { enabled = window.localStorage.getItem("jao-ngoh-sound-effects") === "true"; } catch { /* Use the default when storage is unavailable. */ }
      if (!available || !enabled || !(event.target instanceof Element) || !event.target.closest("button, a, input, select")) return;
      const AudioContextConstructor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextConstructor) return;
      const context = new AudioContextConstructor();
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = 520;
      gain.gain.setValueAtTime(0.018, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.045);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + 0.045);
      oscillator.onended = () => { void context.close(); };
    };
    document.addEventListener("click", onClick, { passive: true });
    return () => { controller.abort(); document.removeEventListener("click", onClick); };
  }, []);
  return null;
}
