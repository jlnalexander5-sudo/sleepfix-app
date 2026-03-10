"use client";

import { useEffect, useState } from "react";

export default function InstallAppButton() {
  const [promptEvent, setPromptEvent] = useState<any>(null);

  useEffect(() => {
    const handler = (e: any) => {
      e.preventDefault();
      setPromptEvent(e);
    };

    window.addEventListener("beforeinstallprompt", handler);

    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
    };
  }, []);

  const install = async () => {
    if (!promptEvent) return;

    promptEvent.prompt();
    await promptEvent.userChoice;
    setPromptEvent(null);
  };

  if (!promptEvent) return null;

  return (
    <button
      onClick={install}
      style={{
        padding: "10px 14px",
        background: "#4f46e5",
        color: "#fff",
        borderRadius: 8,
        border: "none",
        cursor: "pointer",
        fontWeight: 700,
        marginTop: 12,
      }}
    >
      Install SleepFix App
    </button>
  );
}
