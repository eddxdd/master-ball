import { Link } from "react-router";
import { AppLogo } from "@/components/AppLogo";
import { APP_NAME } from "@/config/branding";

const TOOL_LINKS = [
  { to: "/pokedex", label: "Pokedex" },
  { to: "/team-builder", label: "Team Builder" },
  { to: "/calculator", label: "Damage Calculator" },
  { to: "/analytics", label: "Analytics" },
] as const;

/** Site-wide footer — brand, tool links, and a short product note. */
export function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer id="site-footer" className="mt-auto border-t border-border bg-card">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-10 sm:flex-row sm:justify-between sm:gap-12">
        <div className="max-w-sm">
          <Link to="/" className="inline-flex items-center gap-2 text-lg font-semibold">
            <AppLogo size="sm" />
            <span className="bg-[image:var(--gradient-brand)] bg-clip-text text-transparent">
              {APP_NAME}
            </span>
          </Link>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            A competitive Pokemon companion — real Pokedex data, damage calc, team tools, and a
            Professor grounded in the same sources.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-8 sm:gap-12">
          <div>
            <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Tools
            </p>
            <ul className="mt-3 flex flex-col gap-2">
              {TOOL_LINKS.map((link) => (
                <li key={link.to}>
                  <Link
                    to={link.to}
                    className="link-underline text-sm text-foreground/90 hover:text-foreground"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Data
            </p>
            <ul className="mt-3 flex flex-col gap-2 text-sm text-muted-foreground">
              <li>Gen 9 OU usage from Smogon chaos stats</li>
              <li>Species data via PokeAPI / poke-env</li>
              <li>Not affiliated with Nintendo or The Pokemon Company</li>
            </ul>
          </div>
        </div>
      </div>

      <div className="border-t border-border">
        <div className="mx-auto flex max-w-6xl justify-center px-4 py-4">
          <a
            href="https://eduardolemos.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="link-underline text-center text-xs hover:opacity-80"
            style={{ color: "#D0B565" }}
          >
            © {year} {APP_NAME} · eduardolemos.com
          </a>
        </div>
      </div>
    </footer>
  );
}
