import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function ProtectedPage() {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  // If not logged in, push them to login
  if (userError || !user) {
    redirect("/login");
  }

  // 1) Ensure this user has a profile row (id = auth.users.id)
  const { error: upsertError } = await supabase
    .from("profiles")
    .upsert(
      {
        id: user.id,
        display_name: user.user_metadata?.full_name ?? user.email ?? null,
      },
      { onConflict: "id" }
    );

  // 2) Read it back (proof RLS + insert works)
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, created_at, display_name, target_bedtime, target_wake_time")
    .eq("id", user.id)
    .single();

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: 24 }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 16 }}>
        Protected
      </h1>

      <p style={{ marginBottom: 8 }}>
        Signed in as: <b>{user.email}</b>
      </p>

      <div style={{ marginTop: 16, padding: 16, border: "1px solid #333", borderRadius: 12 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>
          Profile bootstrap result
        </h2>

        <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", margin: 0 }}>
{JSON.stringify(
  {
    upsertError: upsertError?.message ?? null,
    profileError: profileError?.message ?? null,
    profile,
  },
  null,
  2
)}
        </pre>
      </div>
    </div>
  );
}
