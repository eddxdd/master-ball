import { Bookmark, Cloud, Sparkles, UserRound } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router";
import { AppLogo } from "@/components/AppLogo";
import { APP_NAME } from "@/config/branding";

const PERKS = [
  {
    icon: UserRound,
    title: "Trainer profile",
    body: `A free identity on ${APP_NAME} — your display name, ready when you are.`,
  },
  {
    icon: Cloud,
    title: "Built for what's next",
    body: "Account-backed teams and progress are on the roadmap. Signing up puts you first in line.",
  },
  {
    icon: Bookmark,
    title: "Stay signed in",
    body: "Keep your session on this device so you can jump straight into the Pokedex or Professor.",
  },
  {
    icon: Sparkles,
    title: "Everything stays free",
    body: "Pokedex, calculator, team tools, and the Professor — no paywall for the core kit.",
  },
] as const;

/** Split auth layout: Master Ball visual + perks on one side, form on the other. */
export function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <div
      id="auth-shell"
      className="flex min-h-[calc(100dvh-3.75rem)] w-full flex-1 flex-col lg:flex-row"
    >
      <aside
        className="relative flex min-h-[min(28rem,50dvh)] flex-1 flex-col justify-start overflow-hidden px-6 py-10 text-white sm:px-10 lg:min-h-0 lg:max-w-none lg:basis-[46%] lg:justify-center lg:px-12 lg:py-14 xl:basis-[44%]"
        style={{
          background:
            "linear-gradient(160deg, rgb(0 0 0 / 0.55), rgb(0 0 0 / 0.72)), " +
            "url('/images/masterball.png') center / cover no-repeat",
        }}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,color-mix(in_oklch,var(--primary)_35%,transparent),transparent_55%)]"
        />

        <div className="relative z-10 lg:absolute lg:inset-x-12 lg:top-14">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-sm font-semibold tracking-wide text-[#f8d030] hover:text-[#ffe066]"
          >
            <AppLogo size="xs" />
            {APP_NAME}
          </Link>
          <h1
            className="mt-6 text-3xl font-bold tracking-tight sm:text-4xl"
            style={{ textShadow: "0 2px 16px rgb(0 0 0 / 0.85)" }}
          >
            {title}
          </h1>
          <p
            className="mt-3 max-w-md text-base text-white/85"
            style={{ textShadow: "0 1px 10px rgb(0 0 0 / 0.75)" }}
          >
            {subtitle}
          </p>
        </div>

        <ul className="relative mt-10 grid w-full gap-3 sm:grid-cols-2 lg:mt-0 lg:grid-cols-1">
          {PERKS.map(({ icon: Icon, title: perkTitle, body }) => (
            <li
              key={perkTitle}
              className="rounded-2xl border border-white/15 bg-black/35 p-3.5 backdrop-blur-sm"
            >
              <div className="flex items-start gap-3">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[image:var(--gradient-brand)] text-white shadow-sm">
                  <Icon className="size-4" aria-hidden />
                </div>
                <div className="min-w-0 text-left">
                  <p className="text-sm font-semibold">{perkTitle}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-white/75">{body}</p>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </aside>

      <div className="flex flex-1 items-center justify-center bg-background px-4 py-10 sm:px-8 lg:px-12">
        <div className="w-full max-w-md">{children}</div>
      </div>
    </div>
  );
}
