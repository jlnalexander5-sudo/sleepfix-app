"use client";
import { useEffect, useState } from "react";

export default function IPhoneInstallPrompt() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const isIphone = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const isStandalone = (window.navigator as any).standalone;

    if (isIphone && !isStandalone) {
      setShow(true);
    }
  }, []);

  if (!show) return null;

  return (
    <div
      style={{
        position: "fixed",
        bottom: 20,
        left: 20,
        right: 20,
        background: "#111",
        color: "white",
        padding: "12px 16px",
        borderRadius: 12,
        fontSize: 14,
        zIndex: 9999,
      }}
    >
      Install SleepFixMe:
      <br />
      Tap <b>Share</b> → <b>Add to Home Screen</b>
    </div>
  );
}
