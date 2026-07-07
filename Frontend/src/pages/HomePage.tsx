import { Link } from "react-router";
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

export function HomePage() {
  return (
    <div className="flex flex-col items-center gap-4 py-12 text-center">
      <h1 className="text-3xl font-semibold">{APP_NAME}</h1>
      <p className="max-w-xl text-muted-foreground">
        The Dex: a fast, accurate Pokedex, Team Builder, and Damage Calculator. The TrAIner (an AI
        coach on top) lands in a later phase — for now, this is the deterministic core.
      </p>
      <div className="flex gap-4">
        <Link to="/pokedex" className="text-primary underline">
          Browse the Pokedex
        </Link>
        <Link to="/calculator" className="text-primary underline">
          Damage Calculator
        </Link>
        <Link to="/team-builder" className="text-primary underline">
          Build a Team
        </Link>
      </div>
      <div className="rounded-lg border border-border bg-card px-4 py-3 text-sm">
        <HealthIndicator />
      </div>
    </div>
  );
}
