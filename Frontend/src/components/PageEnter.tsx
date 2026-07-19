import type { ReactNode } from "react";
import { useLocation } from "react-router";
import { cn } from "@/lib/utils";

/**
 * Soft fade/rise played once when the route changes. Sits around `<Outlet />`
 * so every page lands the same way; scroll reveals stay on `Reveal`.
 */
export function PageEnter({ children, className }: { children: ReactNode; className?: string }) {
  const { pathname } = useLocation();
  return (
    <div key={pathname} className={cn("page-enter", className)}>
      {children}
    </div>
  );
}
