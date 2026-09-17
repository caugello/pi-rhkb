import type { RhkbDoc } from "./search.js";

export interface QueryInfo {
  query: string;
  kinds?: string[];
}

export function EMPTY_RESULT_MESSAGE(query: string, kinds: string[] | undefined): string {
  return `No matches in the Knowledge Portal for '${query}'${kinds && kinds.length ? ` (kinds: ${kinds.join(", ")})` : ""}. Try fewer words or remove the kind filter.`;
}

function fmtDate(s: string): string {
  return s.slice(0, 10);
}

export function formatResults(
  info: QueryInfo,
  result: { docs: RhkbDoc[]; numFound: number },
  portalBaseUrl: string,
): string {
  const { docs } = result;
  if (docs.length === 0) return EMPTY_RESULT_MESSAGE(info.query, info.kinds);

  const parts: string[] = [];
  parts.push(
    `Knowledge Portal: ${docs.length} of ${result.numFound} matches for "${info.query}"` +
      (info.kinds && info.kinds.length ? ` (kinds: ${info.kinds.join(", ")})` : ""),
  );

  docs.forEach((doc, i) => {
    const who = [
      doc.kind ? `[${doc.kind}]` : undefined,
      doc.product,
    ]
      .filter((x): x is string => x !== undefined)
      .join(" ");

    const head =
      `${i + 1}. ${who ? who + " \u2014 " : ""}"${doc.title}"` +
      (doc.version ? ` (${doc.version})` : "") +
      (doc.updated ? ` (${fmtDate(doc.updated)})` : "");
    const block = [head];
    if (doc.url) block.push(`   ${doc.url}`);
    if (doc.excerpt) block.push(`   Excerpt: ${doc.excerpt}`);
    parts.push(block.join("\n"));
  });

  return parts.join("\n\n");
}
