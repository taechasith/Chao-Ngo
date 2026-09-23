"use client";

import { useEffect, useRef } from "react";

type TurnstileWidgetApi = {
  remove: (widgetId: string) => void;
  render: (container: HTMLElement, options: {
    action: string;
    callback: (token: string) => void;
    "error-callback": () => void;
    "expired-callback": () => void;
    sitekey: string;
    theme: "dark";
  }) => string;
};

declare global {
  interface Window {
    turnstile?: TurnstileWidgetApi;
  }
}

type TurnstileWidgetProps = {
  action: "login" | "signup";
  onTokenChange: (token: string | null) => void;
  siteKey?: string;
};

const turnstileScriptSelector = 'script[data-player-turnstile="true"]';

export function TurnstileWidget({ action, onTokenChange, siteKey }: TurnstileWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!siteKey || !containerRef.current) {
      onTokenChange(null);
      return;
    }

    let disposed = false;
    let widgetId: string | undefined;
    let script: HTMLScriptElement | null = document.querySelector(turnstileScriptSelector);

    const render = () => {
      if (disposed || !window.turnstile || !containerRef.current) {
        return;
      }

      widgetId = window.turnstile.render(containerRef.current, {
        action,
        callback: (token) => onTokenChange(token),
        "error-callback": () => onTokenChange(null),
        "expired-callback": () => onTokenChange(null),
        sitekey: siteKey,
        theme: "dark",
      });
    };

    if (window.turnstile) {
      render();
    } else {
      if (!script) {
        script = document.createElement("script");
        script.async = true;
        script.defer = true;
        script.dataset.playerTurnstile = "true";
        script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js";
        document.head.appendChild(script);
      }
      script.addEventListener("load", render);
    }

    return () => {
      disposed = true;
      script?.removeEventListener("load", render);
      if (widgetId && window.turnstile) {
        window.turnstile.remove(widgetId);
      }
      onTokenChange(null);
    };
  }, [action, onTokenChange, siteKey]);

  return siteKey ? <div aria-label="Turnstile security check" className="player-turnstile" ref={containerRef} /> : null;
}
