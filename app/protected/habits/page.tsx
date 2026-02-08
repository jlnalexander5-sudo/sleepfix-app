import dynamic from "next/dynamic";

const HabitsClient = dynamic(() => import("./HabitsClient"), { ssr: false });

export default function Page() {
  return <HabitsClient />;
}
