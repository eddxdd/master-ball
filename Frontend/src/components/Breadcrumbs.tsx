import { Fragment } from "react";
import { Link } from "react-router";

export type BreadcrumbItem = {
  label: string;
  /** Omit for the current (last) page, or for a category level with no
   * browse page of its own (e.g. "Moves" — see Docs/frontend/README.md). */
  to?: string;
};

/**
 * Visible breadcrumb nav + matching BreadcrumbList JSON-LD, rendered together
 * so they can never drift apart (search engines penalize structured data that
 * doesn't match visible content). Every detail page renders this — see
 * Docs/frontend/README.md's SEO section.
 */
export function Breadcrumbs({ items }: { items: BreadcrumbItem[] }) {
  const withHome: BreadcrumbItem[] = [{ label: "Home", to: "/" }, ...items];

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: withHome.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.label,
      ...(item.to && typeof window !== "undefined"
        ? { item: `${window.location.origin}${item.to}` }
        : {}),
    })),
  };

  return (
    <>
      <script type="application/ld+json">{JSON.stringify(jsonLd).replace(/</g, "\\u003c")}</script>
      <nav aria-label="Breadcrumb" className="text-muted-foreground text-sm">
        <ol className="flex flex-wrap items-center gap-1">
          {withHome.map((item, i) => (
            <Fragment key={item.label}>
              {i > 0 && (
                <li aria-hidden className="px-1">
                  /
                </li>
              )}
              <li>
                {item.to ? (
                  <Link to={item.to} className="link-underline hover:text-foreground">
                    {item.label}
                  </Link>
                ) : (
                  <span aria-current={i === withHome.length - 1 ? "page" : undefined}>
                    {item.label}
                  </span>
                )}
              </li>
            </Fragment>
          ))}
        </ol>
      </nav>
    </>
  );
}
