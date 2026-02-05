import { NextResponse } from "next/server";
import { createClient } from "@/lib/client";

export async function GET(request: Request) {
  const url = new URL(request.url);

  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "/auth/update-password";

  if (!code) {
    return NextResponse.redirect(new URL("/auth/login", url.origin));
  }

  const supabase = createClient();

  await supabase.auth.exchangeCodeForSession(code);

  return NextResponse.redirect(new URL(next, url.origin));
}
