/**
 * Softens incomplete markdown at the streaming frontier so half-written
 * tokens (`**bold`, `[Link](/pok…`) don't flash as raw syntax before the
 * closing characters arrive.
 */
export function stabilizeStreamingMarkdown(text: string): string {
  let s = text;

  // Incomplete image / link at the end — keep the visible label when we have one.
  s = s.replace(/!\[[^\]]*\]\([^)]*$/g, "");
  s = s.replace(/\[([^\]]*)\]\([^)]*$/g, "$1");
  s = s.replace(/\[[^\]]*$/g, "");

  // Unclosed emphasis / fence — close so the parser can render what we have.
  if ((s.match(/\*\*/g) ?? []).length % 2 === 1) s += "**";
  if ((s.match(/```/g) ?? []).length % 2 === 1) s += "\n```";

  return s;
}
