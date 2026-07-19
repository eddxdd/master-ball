import { useDeferredValue } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import { Link } from "react-router";
import remarkGfm from "remark-gfm";
import { CopyButton } from "@/components/CopyButton";
import {
  extractPokedexSpeciesIds,
  PokemonShowcaseCard,
  stripPokemonSpriteMarkdown,
} from "@/components/PokemonShowcaseCard";
import { stabilizeStreamingMarkdown } from "@/lib/streamingMarkdown";
import { cn } from "@/lib/utils";

function isInternalPath(href: string | undefined): href is string {
  return Boolean(href?.startsWith("/") && !href.startsWith("//"));
}

/**
 * Renders an assistant chat message as real markdown (headings, bold/italic,
 * lists, tables, blockquotes, links, code) instead of a raw text blob with
 * literal `**`/`##` characters — see Docs/frontend/README.md's "Conversational
 * Team Doctor" section for where this is used. Deliberately does *not* pull in
 * a syntax-highlighting library (e.g. `react-syntax-highlighter`/`shiki`):
 * this is a Pokemon strategy coach, not a code assistant, so a real code fence
 * is a rare, incidental case (e.g. a pasted Showdown export), not a core use
 * case worth a genuinely heavy dependency for — a bordered, monospaced,
 * copyable block covers it. User-typed messages are intentionally rendered as
 * plain text, not markdown — a user typing a literal `*` shouldn't turn into
 * italics they didn't ask for.
 *
 * During streaming, pass `streaming` so incomplete frontier tokens are
 * stabilized and React can defer re-parses (`useDeferredValue`) without
 * flashing raw `**` / half-written links.
 *
 * Pokemon linked via `/pokedex/{id}` get a type-gradient showcase card (same
 * visual as the Pokedex Team Builder promo). That is a client-side profile/meta
 * fetch — no extra LLM cost.
 */
export default function MarkdownMessage({
  content,
  streaming = false,
}: {
  content: string;
  streaming?: boolean;
}) {
  const deferred = useDeferredValue(content);
  const source = streaming ? stabilizeStreamingMarkdown(deferred) : content;
  const speciesIds = extractPokedexSpeciesIds(source);
  const markdown = speciesIds.length > 0 ? stripPokemonSpriteMarkdown(source) : source;

  return (
    <div className="flex flex-col gap-1">
      {speciesIds.map((id) => (
        <PokemonShowcaseCard key={id} speciesId={id} useMetaSet compact />
      ))}
      <div
        className="prose prose-base dark:prose-invert max-w-none break-words
          prose-headings:mt-3 prose-headings:mb-1.5 prose-headings:font-semibold
          prose-p:my-1.5 prose-p:leading-relaxed
          prose-ul:my-1.5 prose-ol:my-1.5 prose-li:my-0.5
          prose-strong:text-foreground prose-strong:font-semibold
          prose-a:text-primary prose-a:font-medium prose-a:no-underline
          prose-blockquote:border-primary/50 prose-blockquote:text-muted-foreground prose-blockquote:not-italic
          prose-code:rounded prose-code:bg-black/10 prose-code:px-1.5 prose-code:py-0.5 prose-code:font-mono prose-code:text-[0.85em] prose-code:font-normal prose-code:before:content-none prose-code:after:content-none dark:prose-code:bg-white/10
          prose-pre:my-0 prose-pre:bg-transparent prose-pre:p-0
          prose-table:my-2 prose-th:text-foreground
          prose-hr:my-3 prose-hr:border-border
          first:prose-headings:mt-0 first:[&>*]:mt-0 last:[&>*]:mb-0"
      >
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={MARKDOWN_COMPONENTS}>
          {markdown}
        </ReactMarkdown>
        {streaming && <span className="streaming-caret-inline" aria-hidden />}
      </div>
    </div>
  );
}

const MARKDOWN_COMPONENTS: Components = {
  a: ({ href, children, className, ...props }) => {
    if (isInternalPath(href)) {
      return (
        <Link to={href} className={cn("link-underline", className)}>
          {children}
        </Link>
      );
    }
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={cn("link-underline", className)}
        {...props}
      >
        {children}
      </a>
    );
  },
  img: ({ src, alt, className, ...props }) => (
    <img
      src={src}
      alt={alt ?? ""}
      loading="lazy"
      decoding="async"
      className={cn(
        "my-2 inline-block h-20 w-20 object-contain align-middle drop-shadow-sm sm:h-24 sm:w-24",
        className,
      )}
      {...props}
    />
  ),
  // react-markdown always wraps a fenced/indented code block in <pre><code>
  // and an inline code span in a bare <code> with no <pre> parent — the
  // `code` renderer can't see its own parent tag, but a block (even an
  // unfenced ``` with no language) always spans multiple lines, which an
  // inline span never does, so that's the reliable inline/block signal here.
  code: ({ className, children }) => {
    const text = String(children).replace(/\n$/, "");
    const isBlock = text.includes("\n");
    if (!isBlock) {
      return <code className={className}>{children}</code>;
    }
    const language = /language-(\w+)/.exec(className || "")?.[1];
    return <CodeBlock language={language} code={text} />;
  },
  // The `code` override above already renders its own <pre> (inside
  // CodeBlock) for block-level code, so the default <pre> wrapper react-
  // markdown would otherwise add around it is skipped here to avoid
  // double-nesting.
  pre: ({ children }) => <>{children}</>,
};

function CodeBlock({ language, code }: { language?: string; code: string }) {
  return (
    <div className="group relative my-2 overflow-hidden rounded-lg border border-border/60 bg-black/[0.03] dark:bg-black/20">
      <div className="flex items-center justify-between border-b border-border/40 px-3 py-1 text-xs text-muted-foreground">
        <span className="font-mono">{language || "text"}</span>
        <CopyButton text={code} label="Copy code" />
      </div>
      <pre className="overflow-x-auto p-3 text-sm">
        <code className="font-mono">{code}</code>
      </pre>
    </div>
  );
}
