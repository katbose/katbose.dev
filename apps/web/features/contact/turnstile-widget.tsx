"use client";

import Script from "next/script";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";

interface TurnstileApi {
  render(
    container: HTMLElement,
    options: {
      sitekey: string;
      action: string;
      callback: (token: string) => void;
      "error-callback": (errorCode?: string) => void;
      "expired-callback": () => void;
      "response-field": boolean;
      "response-field-name": string;
    },
  ): string;
  remove(widgetId: string): void;
  reset(widgetId: string): void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

export interface TurnstileWidgetHandle {
  reset(): void;
}

interface TurnstileWidgetProps {
  siteKey: string;
  onError(): void;
  onVerified(): void;
}

export const TurnstileWidget = forwardRef<TurnstileWidgetHandle, TurnstileWidgetProps>(
  function TurnstileWidget({ siteKey, onError, onVerified }, ref) {
    const containerRef = useRef<HTMLDivElement>(null);
    const widgetIdRef = useRef<string | null>(null);
    const onErrorRef = useRef(onError);
    const onVerifiedRef = useRef(onVerified);
    const [scriptReady, setScriptReady] = useState(false);

    onErrorRef.current = onError;
    onVerifiedRef.current = onVerified;

    useImperativeHandle(ref, () => ({
      reset() {
        if (widgetIdRef.current) window.turnstile?.reset(widgetIdRef.current);
      },
    }));

    useEffect(() => {
      const container = containerRef.current;
      const turnstile = window.turnstile;
      if (!scriptReady || !siteKey || !container || !turnstile || widgetIdRef.current) return;

      const widgetId = turnstile.render(container, {
        sitekey: siteKey,
        action: "contact",
        callback: () => onVerifiedRef.current(),
        "error-callback": () => onErrorRef.current(),
        "expired-callback": () => onErrorRef.current(),
        "response-field": true,
        "response-field-name": "cf-turnstile-response",
      });
      widgetIdRef.current = widgetId;

      return () => {
        turnstile.remove(widgetId);
        if (widgetIdRef.current === widgetId) widgetIdRef.current = null;
      };
    }, [scriptReady, siteKey]);

    if (!siteKey) return null;

    return (
      <>
        <Script
          id="cloudflare-turnstile"
          onReady={() => setScriptReady(true)}
          src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
          strategy="afterInteractive"
        />
        <div aria-label="Bot verification" ref={containerRef} role="group" />
      </>
    );
  },
);
