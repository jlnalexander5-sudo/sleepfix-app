"use client";

import dynamic from "next/dynamic";

const HabitsClient = dynamic(() => import("./HabitsClient"), { ssr: false });

export default function HabitsClientWrapper() {
  return <HabitsClient />;
}
