import { useQueryClient } from "@tanstack/react-query";
import { LogOut, Menu, Moon, Sun, User as UserIcon, X } from "lucide-react";
import { lazy, Suspense, useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router";
import { LoadingState } from "@/components/LoadingState";
import { PageEnter } from "@/components/PageEnter";
import { SearchBar } from "@/components/SearchBar";
import { SiteFooter } from "@/components/SiteFooter";
import { prefetchPokedexList } from "@/hooks/usePokedex";

/** Floating Rotom + Professor chat — deferred so the shell isn't blocked on
 * the launcher chunk / rotom art on first paint. */
const RotomProfessorLauncher = lazy(() =>
  import("@/components/RotomProfessorLauncher").then((m) => ({
    default: m.RotomProfessorLauncher,
  })),
);

import { AppLogo } from "@/components/AppLogo";
import { UserAvatar } from "@/components/UserAvatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { APP_NAME } from "@/config/branding";
import { useHideOnScroll } from "@/hooks/useHideOnScroll";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/authStore";
import { useThemeStore } from "@/store/themeStore";

/** Fallback while a lazy route chunk downloads. */
function RouteFallback() {
  return <LoadingState label="Loading page" />;
}

const NAV_LINKS = [
  { to: "/pokedex", label: "Pokedex" },
  { to: "/team-builder", label: "Team Builder" },
  { to: "/calculator", label: "Calculator" },
  { to: "/analytics", label: "Analytics" },
];

function ThemeToggle() {
  const theme = useThemeStore((state) => state.theme);
  const toggleTheme = useThemeStore((state) => state.toggleTheme);

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={toggleTheme}
      aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
    >
      {theme === "dark" ? <Sun /> : <Moon />}
    </Button>
  );
}

/** Shows a "Log in" link when signed out, or a small circular initials
 * avatar + dropdown ("My Account" / "Log out") when signed in — see the
 * auth plan's "Header" section. */
function AccountMenu() {
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const navigate = useNavigate();

  if (!user) {
    return (
      <Button
        variant="ghost"
        size="sm"
        className="shrink-0 cursor-pointer"
        onClick={() => navigate("/login")}
      >
        Log in
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className="cursor-pointer rounded-full"
            aria-label="Account menu"
          >
            <UserAvatar className="cursor-pointer" />
          </Button>
        }
      />
      <DropdownMenuContent align="end">
        <DropdownMenuGroup>
          <DropdownMenuLabel>{user.display_name}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem className="cursor-pointer" onClick={() => navigate("/account")}>
            <UserIcon /> My account
          </DropdownMenuItem>
          <DropdownMenuItem
            className="cursor-pointer"
            onClick={() => {
              logout();
              navigate("/");
            }}
          >
            <LogOut /> Log out
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AppLayout() {
  const { pathname } = useLocation();
  const headerHidden = useHideOnScroll();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const queryClient = useQueryClient();
  /** Login / signup use a full-bleed split shell — no content max-width, padding, or footer. */
  const isAuthRoute = pathname === "/login" || pathname === "/signup";

  // SPA navigations keep the previous scroll offset by default — reset so
  // deep links (e.g. homepage → Pokedex detail) always land at the top.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  // Warm the full pokedex after first paint so /pokedex and SpeciesCombobox
  // rarely cold-start on GET /pokedex.
  useEffect(() => {
    const warm = () => {
      void prefetchPokedexList(queryClient);
    };
    if (typeof window.requestIdleCallback === "function") {
      const id = window.requestIdleCallback(warm, { timeout: 2500 });
      return () => window.cancelIdleCallback(id);
    }
    const id = window.setTimeout(warm, 400);
    return () => window.clearTimeout(id);
  }, [queryClient]);

  const warmPokedex = () => {
    void prefetchPokedexList(queryClient);
  };

  return (
    <div id="app-shell" className="flex min-h-screen flex-col text-foreground">
      <header
        id="site-header"
        className={cn(
          "sticky top-0 z-40 border-b border-border bg-card transition-transform duration-300",
          headerHidden ? "-translate-y-full" : "translate-y-0",
        )}
      >
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 sm:gap-6">
          <NavLink to="/" className="flex shrink-0 items-center gap-2 text-lg font-semibold">
            <AppLogo size="sm" />
            <span className="bg-[image:var(--gradient-brand)] bg-clip-text text-transparent">
              {APP_NAME}
            </span>
          </NavLink>
          <nav id="site-nav" className="hidden gap-4 md:flex">
            {NAV_LINKS.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                onMouseEnter={link.to === "/pokedex" ? warmPokedex : undefined}
                onFocus={link.to === "/pokedex" ? warmPokedex : undefined}
                className={({ isActive }) =>
                  cn(
                    "link-underline text-sm font-medium text-muted-foreground hover:text-foreground",
                    isActive && "text-foreground",
                  )
                }
              >
                {link.label}
              </NavLink>
            ))}
          </nav>
          <SearchBar className="ml-auto w-28 sm:w-56 md:w-72" />
          <ThemeToggle />
          <AccountMenu />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="md:hidden"
            aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileMenuOpen}
            aria-controls="site-nav-mobile"
            onClick={() => setMobileMenuOpen((open) => !open)}
          >
            {mobileMenuOpen ? <X /> : <Menu />}
          </Button>
        </div>

        {mobileMenuOpen && (
          <nav
            id="site-nav-mobile"
            className="flex flex-col gap-1 border-t border-border px-4 py-3 md:hidden"
          >
            {NAV_LINKS.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                onClick={() => setMobileMenuOpen(false)}
                onMouseEnter={link.to === "/pokedex" ? warmPokedex : undefined}
                onFocus={link.to === "/pokedex" ? warmPokedex : undefined}
                className={({ isActive }) =>
                  cn(
                    "link-underline rounded-md px-2 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground",
                    isActive && "bg-muted text-foreground",
                  )
                }
              >
                {link.label}
              </NavLink>
            ))}
          </nav>
        )}
      </header>
      <main
        id="main-content"
        className={
          isAuthRoute
            ? "flex w-full flex-1 flex-col"
            : "mx-auto w-full max-w-6xl flex-1 px-4 py-6 pb-24"
        }
      >
        <Suspense fallback={<RouteFallback />}>
          <PageEnter className={isAuthRoute ? "flex min-h-0 flex-1 flex-col" : undefined}>
            <Outlet />
          </PageEnter>
        </Suspense>
      </main>
      {!isAuthRoute && <SiteFooter />}
      {!isAuthRoute && (
        <Suspense fallback={null}>
          <RotomProfessorLauncher />
        </Suspense>
      )}
    </div>
  );
}
