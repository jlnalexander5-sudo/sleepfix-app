import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export async function GET(request: Request) {
  const url = new URL(request.url);

  // Helpful: see every param arriving in the callback
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");
  const error_description = url.searchParams.get("error_description");
  const next = url.searchParams.get("next") ?? "/auth/update-password";

  // If Supabase sends error params, surface them
  if (error || error_description) {
    const msg = encodeURIComponent(`${error ?? ""} ${error_description ?? ""}`.trim());
    return NextResponse.redirect(new URL(`/auth/error?reason=${msg}`, url.origin));
  }

  // If we get here with no code, also surface it
  if (!code) {
    const allParams = encodeURIComponent(url.searchParams.toString() || "NO_QUERY_PARAMS");
    return NextResponse.redirect(new URL(`/auth/error?reason=no_code&params=${allParams}`, url.origin));
  }

  const cookieStore = await cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: any) {
          cookieStore.set({ name, value, ...options });
        },
        remove(name: string, options: any) {
          cookieStore.set({ name, value: "", ...options, maxAge: 0 });
        },
      },
    }
  );

  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

  if (exchangeError) {
    const msg = encodeURIComponent(exchangeError.message);
    return NextResponse.redirect(new URL(`/auth/error?reason=exchange_failed&msg=${msg}`, url.origin));
  }

  return NextResponse.redirect(new URL(next, url.origin));
}
