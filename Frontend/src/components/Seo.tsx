import { useLocation } from "react-router";
import { APP_NAME } from "@/config/branding";

/** Structured data for a single `<script type="application/ld+json">` block.
 * Kept as `unknown` rather than a schema.org type package — we only ever emit
 * a couple of shapes (see Breadcrumbs.tsx) and pulling in a types dependency
 * for that isn't worth it. */
type JsonLd = Record<string, unknown>;

type SeoProps = {
  /** Page-specific title. APP_NAME is appended automatically — don't include
   * it yourself (so HomePage should pass e.g. "AI-powered competitive Pokemon
   * companion", not the app name again). */
  title: string;
  description: string;
  /** Absolute image URL for social share previews. Omit if none exists yet —
   * see Docs/frontend/README.md's SEO section for why there's no default. */
  image?: string;
  /** Open Graph type. "website" fits every page here — none of them are
   * "article"-shaped content. */
  type?: "website" | "article";
  /** Set true for pages that shouldn't be indexed (e.g. the 404 page). */
  noindex?: boolean;
  jsonLd?: JsonLd | JsonLd[];
};

/**
 * Every routed page must render this once — see Docs/frontend/README.md's SEO
 * section. Relies on React 19's built-in support for hoisting `<title>`,
 * `<meta>`, and `<link>` tags rendered anywhere in the tree up into `<head>`,
 * deduping by name/property automatically. No react-helmet or similar needed.
 *
 * Canonical/OG URLs are derived from `window.location` at render time rather
 * than a hardcoded site URL config, since the production domain isn't decided
 * yet (see Docs/tech-stack.md) — this is correct in every environment
 * (localhost, a preview deploy, or the eventual real domain) with zero config.
 */
export function Seo({ title, description, image, type = "website", noindex, jsonLd }: SeoProps) {
  const location = useLocation();
  const fullTitle = `${title} | ${APP_NAME}`;
  const url =
    typeof window !== "undefined" ? `${window.location.origin}${location.pathname}` : undefined;
  const jsonLdBlocks = jsonLd == null ? [] : Array.isArray(jsonLd) ? jsonLd : [jsonLd];

  return (
    <>
      <title>{fullTitle}</title>
      <meta name="description" content={description} />
      {url && <link rel="canonical" href={url} />}
      <meta name="robots" content={noindex ? "noindex, nofollow" : "index, follow"} />

      <meta property="og:site_name" content={APP_NAME} />
      <meta property="og:type" content={type} />
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={description} />
      {url && <meta property="og:url" content={url} />}
      {image && <meta property="og:image" content={image} />}

      <meta name="twitter:card" content={image ? "summary_large_image" : "summary"} />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={description} />
      {image && <meta name="twitter:image" content={image} />}

      {jsonLdBlocks.map((block, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: static per-render list, never reordered
        <script key={i} type="application/ld+json">
          {/* Escape "<" so a stray "</script>" inside PokeAPI-sourced text can't
           * break out of the script tag early. */}
          {JSON.stringify(block).replace(/</g, "\\u003c")}
        </script>
      ))}
    </>
  );
}
