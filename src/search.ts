import type { PortalSettings } from "./config.js";

const TIMEOUT_MS = 10_000;
const FL = "title,product,documentKind,documentation_version,resourceName,id,main_content,lastModifiedDate";
const TRUNCATION_MARKER = "\u2026[truncated]";

export interface RhkbQuery {
  query: string;
  kinds?: string[];
  limit?: number;
}

export interface RhkbDoc {
  title: string;
  kind?: string;
  product?: string;
  version?: string;
  resourceName?: string;
  url?: string;
  updated?: string;
  excerpt?: string;
}

export interface SearchResponse {
  docs: RhkbDoc[];
  numFound: number;
}

function isJson(text: string): boolean {
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
}

function excerptOf(mainContent: unknown, max: number): string | undefined {
  if (typeof mainContent !== "string") return undefined;
  const collapsed = mainContent.replace(/\s+/g, " ").trim();
  if (collapsed.length === 0) return undefined;
  if (collapsed.length <= max) return collapsed;
  return collapsed.slice(0, Math.max(0, max - TRUNCATION_MARKER.length)) + TRUNCATION_MARKER;
}

export async function searchPortal(
  settings: PortalSettings,
  q: RhkbQuery,
  fetchImpl: typeof fetch = fetch,
): Promise<SearchResponse> {
  const kinds = q.kinds ?? settings.kinds;
  const rows = Math.min(Math.max(q.limit ?? settings.limit, 1), 20);

  const url = new URL(settings.solrPath, settings.url);
  url.searchParams.set("q", q.query);
  url.searchParams.set("rows", String(rows));
  url.searchParams.set("wt", "json");
  url.searchParams.set("fl", FL);
  if (kinds && kinds.length > 0) {
    url.searchParams.set(
      "fq",
      kinds.length === 1 ? `documentKind:${kinds[0]}` : `documentKind:(${kinds.join(" OR ")})`,
    );
  }

  const headers: Record<string, string> = { accept: "application/json" };
  if (settings.apiKey) headers.authorization = `Bearer ${settings.apiKey}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetchImpl(url, { headers, signal: controller.signal });
  } catch (e) {
    if (controller.signal.aborted) throw new Error(`portal request timed out after ${TIMEOUT_MS} ms`);
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`portal unreachable: ${msg}`);
  } finally {
    clearTimeout(timer);
  }

  const text = await res.text();
  if (!isJson(text)) {
    throw new Error(
      `portal returned non-JSON at ${url.href} (HTTP ${res.status}) \u2014 check "url" and "solrPath" in rhkb.json`,
    );
  }
  if (!res.ok) {
    const short = text.length <= 300 ? text : `${text.slice(0, 300)}\u2026`;
    const auth = res.status === 401 || res.status === 403 ? " \u2014 auth may be required: set \u201capiKey\u201d in rhkb.json" : "";
    throw new Error(`portal HTTP ${res.status} ${res.statusText || ""} for query \u201c${q.query}\u201d: ${short}${auth}`.trim());
  }
  const body = JSON.parse(text) as any;
  const numFound: number = body?.response?.numFound ?? 0;
  const docsRaw: unknown[] = Array.isArray(body?.response?.docs) ? body.response.docs : [];

  const docs: RhkbDoc[] = docsRaw.map((d: any) => {
    const doc: RhkbDoc = { title: typeof d?.title === "string" && d.title.trim() !== "" ? d.title : "Untitled" };
    if (typeof d?.documentKind === "string") doc.kind = d.documentKind;
    if (typeof d?.product === "string") doc.product = d.product;
    if (typeof d?.documentation_version === "string") doc.version = d.documentation_version;
    if (typeof d?.resourceName === "string") doc.resourceName = d.resourceName;
    if (typeof d?.lastModifiedDate === "string") doc.updated = d.lastModifiedDate;
    if (typeof d?.id === "string" && d.id !== "") doc.url = settings.url + d.id;
    const excerpt = excerptOf(d?.main_content, settings.maxContentChars);
    if (excerpt) doc.excerpt = excerpt;
    return doc;
  });

  return { docs: docs.slice(0, rows), numFound };
}
