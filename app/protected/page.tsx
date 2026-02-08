import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function ProtectedPage() {
  const supabase = await createClient();

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
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

      <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>
        Your user details
      </h2>

      <pre
        style={{
          background: "rgba(255,255,255,0.06)",
          padding: 16,
          borderRadius: 12,
          overflow: "auto",
          maxWidth: 900,
        }}
      >
        {JSON.stringify(user, null, 2)}
      </pre>
    </main>
  );
}
