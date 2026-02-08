"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

export default function ProtectedPage() {
  const router = useRouter();

  // Create the client once (not on every render)
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);

  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    const run = async () => {
      const { data, error } = await supabase.auth.getUser();

      if (error || !data?.user) {
        router.replace("/login");
        return;
      }

      setUser(data.user);
      setLoading(false);
    };

    run();
  }, [router, supabase]);

  if (loading) {
    return (
      <main style={{ padding: 24 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700 }}>Protected</h1>
        <p style={{ opacity: 0.8, marginTop: 12 }}>Loading…</p>
      </main>
    );
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
