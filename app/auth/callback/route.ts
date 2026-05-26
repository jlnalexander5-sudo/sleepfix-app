import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const url = new URL(request.url);

  const code = url.searchParams.get("code");
  const token_hash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");
  const origin = url.origin;

  const defaultNext = type === "recovery" ? "/auth/update-password" : "/protected/dashboard";
  const next = url.searchParams.get("next") ?? defaultNext;
  const supabase = await createClient();

  try {
    if (token_hash && type) {
      const { error } = await supabase.auth.verifyOtp({
        type: type as any,
        token_hash,
      });

      if (error) {
        return NextResponse.redirect(
          new URL(
            `/auth/error?reason=verify_failed&msg=${encodeURIComponent(error.message)}`,
            origin
          )
        );
      }

      return NextResponse.redirect(new URL(next, origin));
    }

    if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);

      if (error) {
        return NextResponse.redirect(
          new URL(
            `/auth/error?reason=exchange_failed&msg=${encodeURIComponent(error.message)}`,
            origin
          )
        );
      }

      return NextResponse.redirect(new URL(next, origin));
    }

    return NextResponse.redirect(new URL(`/auth/error?reason=missing_params`, origin));
  } catch (e: any) {
    return NextResponse.redirect(
      new URL(
        `/auth/error?reason=unexpected&msg=${encodeURIComponent(e?.message ?? "Unknown error")}`,
        origin
      )
    );
  }
}
