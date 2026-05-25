"use client";

import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Link from "next/link";
import { useState } from "react";

export function LoginForm({
  className,
  ...props
}: React.ComponentPropsWithoutRef<"div">) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [debug, setDebug] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    e.stopPropagation();

    setIsLoading(true);
    setError(null);
    setDebug("Starting login...");

    const supabase = createClient();

    try {
      const cleanEmail = email.trim();

      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password,
      });

      if (signInError) {
        setError(signInError.message);
        setDebug(`Supabase rejected login: ${signInError.message}`);
        return;
      }

      if (!data.session) {
        setError("Login succeeded but no session was returned. This is a browser/session storage problem.");
        setDebug("No session returned from signInWithPassword.");
        return;
      }

      const { data: sessionCheck, error: sessionError } = await supabase.auth.getSession();

      if (sessionError) {
        setError(sessionError.message);
        setDebug(`Session check failed: ${sessionError.message}`);
        return;
      }

      if (!sessionCheck.session) {
        setError("Login succeeded, but the browser did not keep the session. Check Safari/Chrome cookies and storage.");
        setDebug("Session missing immediately after login.");
        return;
      }

      setDebug("Login confirmed. Redirecting to dashboard...");

      // Hard navigation is deliberate here. It avoids iOS/router hydration edge cases.
      window.location.href = "/protected/dashboard";
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unexpected login error";
      setError(message);
      setDebug(`Unexpected error: ${message}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">Login</CardTitle>
          <CardDescription>
            Enter your email below to login to your account
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} noValidate>
            <div className="flex flex-col gap-6">
              <div className="grid gap-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  inputMode="email"
                  autoCapitalize="none"
                  autoCorrect="off"
                  autoComplete="email"
                  spellCheck={false}
                  placeholder="m@example.com"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>

              <div className="grid gap-2">
                <div className="flex items-center">
                  <Label htmlFor="password">Password</Label>
                  <Link
                    href="/auth/forgot-password"
                    className="ml-auto inline-block text-sm underline-offset-4 hover:underline"
                  >
                    Forgot your password?
                  </Link>
                </div>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  autoCapitalize="none"
                  autoCorrect="off"
                  autoComplete="current-password"
                  spellCheck={false}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>

              {error && (
                <p
                  role="alert"
                  className="rounded-md border border-red-300 bg-red-50 p-3 text-sm font-semibold text-red-700"
                >
                  {error}
                </p>
              )}

              {debug && (
                <p className="rounded-md border border-gray-200 bg-gray-50 p-3 text-xs text-gray-700">
                  Debug: {debug}
                </p>
              )}

              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? "Logging in..." : "Login"}
              </Button>
            </div>

            <div className="mt-4 text-center text-sm">
              Don&apos;t have an account?{" "}
              <Link
                href="/auth/sign-up"
                className="underline underline-offset-4"
              >
                Sign up
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
