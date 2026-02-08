// app/auth/error/page.tsx

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type SearchParams = Record<string, string | string[] | undefined>;

function safeString(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "string") return value;
  return "";
}

function ErrorDetails({ searchParams }: { searchParams?: SearchParams }) {
  const error = safeString(searchParams?.error);
  const errorDescription = safeString(searchParams?.error_description);
  const reason = safeString(searchParams?.reason);
  const msg = safeString(searchParams?.msg);
  const code = safeString(searchParams?.code);

  // Show ALL params for debugging (safe)
  const rawParams =
    searchParams && Object.keys(searchParams).length > 0
      ? Object.entries(searchParams)
          .map(([k, v]) => `${k}=${safeString(v)}`)
          .join("\n")
      : "";

  const hasAny =
    Boolean(error) ||
    Boolean(errorDescription) ||
    Boolean(reason) ||
    Boolean(msg) ||
    Boolean(code) ||
    Boolean(rawParams);

  if (!hasAny) {
    return (
      <p className="text-sm text-muted-foreground">
        Sorry, something went wrong. No additional error details were provided.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {error ? (
        <p className="text-sm text-muted-foreground">
          <span className="font-medium">Error:</span> {error}
        </p>
      ) : null}

      {errorDescription ? (
        <p className="text-sm text-muted-foreground">
          <span className="font-medium">Description:</span> {errorDescription}
        </p>
      ) : null}

      {reason ? (
        <p className="text-sm text-muted-foreground">
          <span className="font-medium">Reason:</span> {reason}
        </p>
      ) : null}

      {msg ? (
        <p className="text-sm text-muted-foreground">
          <span className="font-medium">
