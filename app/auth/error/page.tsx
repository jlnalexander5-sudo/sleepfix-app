import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Suspense } from "react";

async function ErrorContent({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;

  return (
    <>
      {params?.reason ? (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            Reason: {String(params.reason)}
          </p>
          {params?.msg && (
            <p className="text-sm text-muted-foreground">
              Message: {String(params.msg)}
            </p>
          )}
          {params?.params && (
            <p className="text-sm text-muted-foreground">
              Params: {String(params.params)}
            </p>
          )}
          <pre className="text-xs text-muted-foreground whitespace-pre-wrap">
            {JSON.stringify(params, null, 2)}
          </pre>
        </div>
      ) : params?.error ? (
        <p className="text-sm text-muted-foreground">
          Code error: {String(params.error)}
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">
          An unspecified error occurred.
        </p>
      )}
    </>
  );
}
