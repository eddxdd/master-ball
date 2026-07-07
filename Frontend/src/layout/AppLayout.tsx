import { NavLink, Outlet } from "react-router";
import { APP_NAME } from "@/config/branding";
import { cn } from "@/lib/utils";

const NAV_LINKS = [
  { to: "/pokedex", label: "Pokedex" },
  { to: "/calculator", label: "Calculator" },
  { to: "/team-builder", label: "Team Builder" },
];

export function AppLayout() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-6xl items-center gap-6 px-4 py-3">
          <NavLink to="/" className="text-lg font-semibold">
            {APP_NAME}
          </NavLink>
          <nav className="flex gap-4">
            {NAV_LINKS.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                className={({ isActive }) =>
                  cn(
                    "text-sm font-medium text-muted-foreground hover:text-foreground",
                    isActive && "text-foreground",
                  )
                }
              >
                {link.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
