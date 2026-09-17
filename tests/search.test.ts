import { describe, expect, it } from "vitest";
import { searchPortal } from "../src/search.js";
import type { PortalSettings } from "../src/config.js";

const settings: PortalSettings = {
  url: "https://portal.example",
  solrPath: "/solr/portal/select",
  limit: 5,
  maxContentChars: 200,
};

function okDocs(n = 2) {
  return {
    response: {
      numFound: n,
      start: 0,
      docs: Array.from({ length: n }, (_, i) => ({
        documentKind: i === 0 ? "solution" : "documentation",
        documentation_version: i === 0 ? undefined : "1.10",
        id: `/docs/i${i}.html`,
        lastModifiedDate: "2025-11-02T00:00:00Z",
        main_content: `word ${i} `,
        product: "Red Hat Developer Hub",
        resourceName: `doc-${i}`,
        score: 10 - i,
        title: `Doc ${i}`,
      })),
    },
  };
}

describe("searchPortal", () => {
  it("builds the exact Solr URL with q/rows/wt/fl", async () => {
    const seen: string[] = [];
    const fetchImpl = (async (input: any) => {
      seen.push(String(input));
      return new Response(JSON.stringify(okDocs()), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch;
    await searchPortal(settings, { query: "OpenShift AI Connector" }, fetchImpl);
    const [u] = seen;
    const parsed = new URL(u);
    expect(parsed.origin + parsed.pathname).toBe("https://portal.example/solr/portal/select");
    expect(parsed.searchParams.get("q")).toBe("OpenShift AI Connector");
    expect(parsed.searchParams.get("rows")).toBe("5");
    expect(parsed.searchParams.get("wt")).toBe("json");
    expect(parsed.searchParams.get("fl")).toBe("title,product,documentKind,documentation_version,resourceName,id,main_content,lastModifiedDate");
    expect(parsed.searchParams.has("fq")).toBe(false);
  });

  it("adds fq=documentKind:(a|b) [OR] when kinds are requested, and URL-encodes them", async () => {
    const seen: string[] = [];
    const fetchImpl = (async (input: any) => {
      seen.push(String(input));
      return new Response(JSON.stringify({ response: { numFound: 0, docs: [] } }), { status: 200 });
    }) as typeof fetch;
    await searchPortal(settings, { query: "q", kinds: ["solution", "article"] }, fetchImpl);
    const fq = new URL(seen[0]).searchParams.get("fq");
    expect(decodeURIComponent(fq!)).toBe("documentKind:(solution OR article)");
  });

  it("sends Authorization only when apiKey is set", async () => {
    const headers: Array<Record<string, string>> = [];
    const fetchImpl = (async (_input: any, init: any) => {
      headers.push(init?.headers ?? {});
      return new Response(JSON.stringify({ response: { numFound: 0, docs: [] } }), { status: 200 });
    }) as typeof fetch;
    await searchPortal(settings, { query: "q" }, fetchImpl);
    expect(headers[0].authorization).toBeUndefined();
    await searchPortal({ ...settings, apiKey: "sk-1" }, { query: "q" }, fetchImpl);
    expect(headers[1].authorization).toBe("Bearer sk-1");
  });

  it("maps the Solr record shape to RhkbDoc (defensively)", async () => {
    const fetchImpl = (async () => new Response(JSON.stringify(okDocs()), { status: 200 })) as typeof fetch;
    const { docs, numFound } = await searchPortal(settings, { query: "q" }, fetchImpl);
    expect(numFound).toBe(2);
    expect(docs).toHaveLength(2);
    expect(docs[0]).toMatchObject({
      title: "Doc 0",
      kind: "solution",
      product: "Red Hat Developer Hub",
      url: "https://portal.example/docs/i0.html",
      updated: "2025-11-02T00:00:00Z",
      resourceName: "doc-0",
    });
    expect(docs[0]!.version).toBeUndefined();
    expect(docs[1]!.version).toBe("1.10");
  });

  it("truncates main_content to maxContentChars with a truncation marker only when cut", async () => {
    const body = {
      response: {
        numFound: 1,
        docs: [{
          title: "T", id: "/t.html",
          main_content: ("x ".repeat(500)).trim(),
        }],
      },
    };
    const fetchImpl = (async () => new Response(JSON.stringify(body), { status: 200 })) as typeof fetch;
    const { docs } = await searchPortal(settings, { query: "q" }, fetchImpl);
    const ex = (docs[0] as any).excerpt; expect(ex.length).toBeLessThanOrEqual(200 + 20); expect(ex.endsWith("\u2026[truncated]")).toBe(true);

    const bodyExact = {
      response: { numFound: 1, docs: [{ title: "T", id: "/t.html", main_content: "just a little text" }] },
    };
    const fetchExact = (async () => new Response(JSON.stringify(bodyExact), { status: 200 })) as typeof fetch;
    const r2 = await searchPortal(settings, { query: "q" }, fetchExact);
    const ex2 = r2.docs[0].excerpt;
    expect(ex2).toBe("just a little text");
    expect(ex2).not.toContain("[truncated]");
  });

  it("returns zero docs without throwing (numFound preserved)", async () => {
    const fetchImpl = (async () => new Response(
      JSON.stringify({ response: { numFound: 17, docs: [] } }), { status: 200 })) as typeof fetch;
    const r = await searchPortal(settings, { query: "nothing" }, fetchImpl);
    expect(r.docs).toEqual([]);
    expect(r.numFound).toBe(17);
  });

  it("throws the non-JSON error on an HTML 404 (mentions url + solrPath)", async () => {
    const fetchImpl = (async () => new Response("<html>404 page not found</html>", { status: 404, headers: { "content-type": "text/html" } })) as typeof fetch;
    await expect(searchPortal(settings, { query: "q" }, fetchImpl)).rejects.toThrowError(/solrPath.*rhkb\.json|rhkb\.json/i);
  });

  it("throws an HTTP error with status on non-2xx JSON", async () => {
    const fetchImpl = (async () => new Response(JSON.stringify({ error: "boom" }), { status: 500, headers: { "content-type": "application/json" } })) as typeof fetch;
    await expect(searchPortal(settings, { query: "q" }, fetchImpl)).rejects.toThrowError(/500/);
  });

  it("hints at apiKey on 401/403", async () => {
    const fetchImpl = (async () => new Response(JSON.stringify({}), { status: 401, headers: { "content-type": "application/json" } })) as typeof fetch;
    await expect(searchPortal(settings, { query: "q" }, fetchImpl)).rejects.toThrowError(/apiKey/);
  });

  it("wraps network failures as 'portal unreachable'", async () => {
    const fetchImpl = (async () => { throw new TypeError("fetch failed"); }) as typeof fetch;
    await expect(searchPortal(settings, { query: "q" }, fetchImpl)).rejects.toThrowError(/portal unreachable/);
  });

  it("honors q.limit for rows and caps at 20", async () => {
    const seen: string[] = [];
    const fetchImpl = (async (input: any) => {
      seen.push(String(input));
      return new Response(JSON.stringify({ response: { numFound: 0, docs: [] } }), { status: 200 });
    }) as typeof fetch;
    await searchPortal(settings, { query: "q", limit: 9 }, fetchImpl);
    expect(new URL(seen[0]).searchParams.get("rows")).toBe("9");
    await searchPortal(settings, { query: "q", limit: 999 }, fetchImpl);
    expect(new URL(seen[1]).searchParams.get("rows")).toBe("20");
  });

  it("omits url when id is missing", async () => {
    const body = { response: { numFound: 1, docs: [{ title: "NoID", main_content: "x" }] } };
    const fetchImpl = (async () => new Response(JSON.stringify(body), { status: 200 })) as typeof fetch;
    const { docs } = await searchPortal(settings, { query: "q" }, fetchImpl);
    expect(docs[0]!.url).toBeUndefined();
  });
});
