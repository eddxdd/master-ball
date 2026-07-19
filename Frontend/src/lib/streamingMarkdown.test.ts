import { describe, expect, it } from "vitest";
import { stabilizeStreamingMarkdown } from "@/lib/streamingMarkdown";

describe("stabilizeStreamingMarkdown", () => {
  it("closes unclosed bold markers", () => {
    expect(stabilizeStreamingMarkdown("a **blazing")).toBe("a **blazing**");
  });

  it("keeps the label when a link is still incomplete", () => {
    expect(stabilizeStreamingMarkdown("around [Alakazam-Mega](/pokedex/alakaza")).toBe(
      "around Alakazam-Mega",
    );
  });

  it("leaves complete markdown alone", () => {
    const complete = "See [Ludicolo](/pokedex/ludicolo) — a **dancer**.";
    expect(stabilizeStreamingMarkdown(complete)).toBe(complete);
  });
});
