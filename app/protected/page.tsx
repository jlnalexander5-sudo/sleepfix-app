import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ProtectedPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <main style={{ padding: 24 }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 16 }}>
        Protected
      </h1>

      <p style={{ opacity: 0.8, marginBottom: 16 }}>
        This is a protected page that you can only see as an authenticated user.
      </p>

      <h2 style={{ fontSize: 18, fontWeight: 600
