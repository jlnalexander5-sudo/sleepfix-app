import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const url = new URL(request.url);

  const code = url.searchParams.get("code");
  const token_hash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");
  const next = url.searchParams.get("next") ?? "/auth/update-password";

  if (!code && !(token_hash && type)) {
    return NextResponse.redirect(
      new URL("/auth/error?reason=missing_code_or_token", url.origin)
    );
  }

  const supabase = await createServerSupabaseClient();

  // Newer flow (PKCE): code
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      return NextResponse.redirect(
        new URL(
          `/auth/error?reason=exchange_failed&msg=${encodeURIComponent(error.message)}`,
          url.origin
        )
      );
    }
    return NextResponse.redirect(new URL(next, url.origin));
  }

  // Older flow: token_hash + type (recovery)
  const { error } = await supabase.auth.verifyOtp({
    token_hash: token_hash!,
    type: type as any,
  });

  if (error) {
    return NextResponse.redirect(
      new URL(
        `/auth/error?reason=verify_failed&msg=${encodeURIComponent(error.message)}`,
        url.origin
      )
    );
  }

  return NextResponse.redirect(new URL(next, url.origin));
}
