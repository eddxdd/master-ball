import { ErrorState } from "@/components/ErrorState";
import { Seo } from "@/components/Seo";

/**
 * Catch-all for unmatched routes. Note this can only ever return a 200 with a
 * `noindex` meta tag, not a real HTTP 404 — that's an inherent limitation of a
 * client-only SPA with no server-side routing. Whatever eventually serves the
 * production build should be configured to return a true 404 status for
 * unmatched deep-link paths; see Docs/frontend/README.md's SEO section.
 */
export function NotFoundPage() {
  return (
    <>
      <Seo title="Page not found" description="This page doesn't exist on Master Ball." noindex />
      <ErrorState
        id="not-found-page"
        status={404}
        title="Page not found"
        description="The page you're looking for doesn't exist, or may have moved."
        actionTo="/"
        actionLabel="Back to home"
      />
    </>
  );
}
