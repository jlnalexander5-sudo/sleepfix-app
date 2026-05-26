import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function Page({
  searchParams,
}: {
  searchParams?: { email?: string };
}) {
  const email = searchParams?.email ? decodeURIComponent(searchParams.email) : null;

  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-md">
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-2xl">Check your email</CardTitle>
              <CardDescription>
                Your SleepFixMe account has been created.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-sm text-muted-foreground">
              <p>
                {email ? (
                  <>
                    We sent a confirmation link to <strong>{email}</strong>.
                  </>
                ) : (
                  <>We sent you a confirmation link.</>
                )}
              </p>
              <p>
                Open that email and tap <strong>Confirm your mail</strong> before trying to sign in.
              </p>
              <p>
                If you do not see it, check Spam/Junk or Promotions. The email should come from
                <strong> SleepFixMe</strong>.
              </p>
              <div className="pt-2">
                <Link href="/auth/login" className="underline underline-offset-4">
                  Go to sign in
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
