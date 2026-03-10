"use client";

import { useEffect, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

export default function InstallAppButton() {
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const onBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setPromptEvent(e as BeforeInstallPromptEvent);
    };

    const onAppInstalled = () => {
      setInstalled(true);
      setPromptEvent(null);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onAppInstalled);
    };
  }, []);

  async function handleInstall() {
    if (!promptEvent) return;
    await promptEvent.prompt();
    await promptEvent.userChoice;
    setPromptEvent(null);
  }

  if (installed) {
    return (
      <div
        style={{
          marginTop: 10,
          padding: "10px 12px",
          border: "1px solid #d1d5db",
          borderRadius: 10,
          background: "#f9fafb",
          color: "#374151",
          fontSize: 14,
          fontWeight: 600,
        }}
      >
        SleepFixMe is installed on this device.
      </div>
    );
  }

  return (
    <div
      style={{
        marginTop: 10,
        padding: "12px 14px",
        border: "1px solid #d1d5db",
        borderRadius: 12,
        background: "#f9fafb",
      }}
    >
      <div style={{ fontSize: 14, fontWeight: 700, color: "#111827" }}>
        Install SleepFixMe
      </div>

      {promptEvent ? (
        <>
          <div style={{ marginTop: 6, fontSize: 14, color: "#4b5563" }}>
            The app is ready to install on this phone.
          </div>
          <button
            onClick={handleInstall}
            style={{
              marginTop: 10,
              padding: "10px 14px",
              background: "#4f46e5",
              color: "#fff",
              borderRadius: 8,
              border: "none",
              cursor: "pointer",
              fontWeight: 700,
            }}
          >
            Install SleepFixMe App
          </button>
        </>
      ) : (
        <div style={{ marginTop: 6, fontSize: 14, color: "#4b5563" }}>
          Install prompt not available yet on this browser/device.
        </div>
      )}
    </div>
  );
}
