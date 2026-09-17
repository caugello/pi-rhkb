import { describe, expect, it } from "vitest";
import { formatResults, EMPTY_RESULT_MESSAGE } from "../src/format.js";
import type { RhkbDoc } from "../src/search.js";

describe("formatResults", () => {
  it("emits the exact empty message when no docs", () => {
    const text = formatResults(
      { query: "foo" },
      { docs: [], numFound: 0 },
      "https://portal.example",
    );
    expect(text).toBe(EMPTY_RESULT_MESSAGE("foo", undefined));
  });

  it("renders the header with 'n of N', query, and kinds when applied", () => {
    const text = formatResults(
      { query: "OpenShift AI Connector", kinds: ["solution", "article"] },
      { docs: sampleDocs(2), numFound: 353 },
      "https://portal.example",
    );
    expect(text.split("\n")[0]).toBe(
      'Knowledge Portal: 2 of 353 matches for "OpenShift AI Connector" (kinds: solution, article)',
    );
  });

  it("renders a full doc block with all fields (kind, product, title, version+date, URL, excerpt)", () => {
    const text = formatResults({ query: "q" }, { docs: sampleDocs(1), numFound: 1 }, "https://u");
    const block = text.split(/\n\n/)[1];
    expect(block).toBe(
      '1. [solution] Red Hat Developer Hub \u2014 "Doc One" (1.10) (2025-11-02)\n' +
        "   https://portal.example/solutions/0.html\n" +
        "   Excerpt: first words of the body",
    );
  });

  it("omits lines for absent fields (no 'undefined', kind or date)", () => {
    const bare: RhkbDoc = { title: "Bare", excerpt: "some text" };
    const text = formatResults({ query: "q" }, { docs: [bare], numFound: 1 }, "https://u");
    expect(text).not.toContain("undefined");
    expect(text).not.toContain("Excerpt: undefined");
    expect(text).toContain("Bare");
  });

  it("keeps deterministic Solr order (input order unchanged)", () => {
    const docs = sampleDocs(3);
    const text = formatResults({ query: "q" }, { docs, numFound: 3 }, "https://u");
    const idx = (t: string) => text.indexOf(t);
    expect(idx("Doc One")).toBeLessThan(idx("Doc Two"));
    expect(idx("Doc Two")).toBeLessThan(idx("Doc Three"));
  });
});

function sampleDocs(n: number): RhkbDoc[] {
  return Array.from({ length: n }, (_, i) => ({
    title: `Doc ${["One", "Two", "Three"][i] ?? i}`,
    kind: i === 0 ? "solution" : undefined,
    product: i === 0 ? "Red Hat Developer Hub" : undefined,
    version: i === 0 ? "1.10" : undefined,
    url: `https://portal.example/solutions/${i}.html`,
    updated: i === 0 ? "2025-11-02" : undefined,
    excerpt: i === 0 ? "first words of the body" : "text",
  })) as RhkbDoc[];
}
