import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const url = new URL(request.url);

  // For password recovery emails Supabase typically sends:
  //   ?token_hash=...&type=recovery
  // For OAuth / PKCE flows:
  //   ?code=...
  const code = url.searchParams.get("code");
  const token_hash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type"); // "recovery" etc.
  const next = url.searchParams.get("next") ?? "/auth/update-password";

  const origin = url.origin;
  const supabase = await createClient();

  try {
    // ✅ 1) PASSWORD RECOVERY FLOW (NO PKCE STORAGE REQUIRED)
    if (token_hash && type) {
      const { error } = await supabase.auth.verifyOtp({
        type: type as any,
        token_hash,
      });

      if (error) {
        return NextResponse.redirect(
          new URL(
            `/auth/error?reason=verify_failed&msg=${encodeURIComponent(
              error.message
            )}`,
            origin
          )
        );
      }

      return NextResponse.redirect(new URL(next, origin));
    }

    // ✅ 2) PKCE / OAUTH FLOW (NEEDS code_verifier in storage)
    if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);

      if (error) {
        return NextResponse.redirect(
          new URL(
            `/auth/error?reason=exchange_failed&msg=${encodeURIComponent(
              error.message
            )}`,
            origin
          )
        );
      }

      return NextResponse.redirect(new URL(next, origin));
    }

    // Nothing usable in query
    return NextResponse.redirect(
      new URL(`/auth/error?reason=missing_params`, origin)
    );
  } catch (e: any) {
    return NextResponse.redirect(
      new URL(
        `/auth/error?reason=unexpected&msg=${encodeURIComponent(
          e?.message ?? "Unknown error"
        )}`,
        origin
      )
    );
  }
}
