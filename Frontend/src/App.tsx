import { useEffect } from "react";
import { APP_NAME } from "@/config/branding";
import { useHealth } from "@/hooks/useHealth";

function HealthIndicator() {
  const { data, isPending, isError, error } = useHealth();

  if (isPending) {
    return <span className="text-muted-foreground">Checking backend connection…</span>;
  }

  if (isError) {
    return (
      <span className="text-destructive">
        Backend unreachable ({error instanceof Error ? error.message : "unknown error"})
      </span>
    );
  }

  return (
    <span className="text-emerald-600 dark:text-emerald-400">
      Backend connected — {data.status} ({data.app_name})
    </span>
  );
}

function App() {
  useEffect(() => {
    document.title = APP_NAME;
  }, []);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background p-8 text-foreground">
      <h1 className="text-3xl font-semibold">{APP_NAME}</h1>
      <p className="text-muted-foreground">
        Phase 0 foundations — this is a wiring check, not the real UI yet.
      </p>
      <div className="rounded-lg border border-border bg-card px-4 py-3 text-sm">
        <HealthIndicator />
      </div>
    </main>
  );
}

export default App;
