import { Type } from "typebox";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { NO_CONFIG_MESSAGE, resolveConfig } from "../src/config.js";
import { searchPortal } from "../src/search.js";
import { formatResults } from "../src/format.js";
import { parseRhkbArgs, USAGE_ERROR } from "../src/command.js";

const KINDS_VOCAB = ["solution", "article", "documentation", "Errata", "Cve", "PortalProduct", "page", "blog", "resource"];

export default function rhkb(pi: ExtensionAPI) {
  pi.registerTool({
    name: "ask_rhkb",
    label: "Red Hat Knowledge Portal",
    description:
      "Search the Red Hat Knowledge Portal (KB solutions, articles, and documentation) for an " +
      "authoritative Red Hat answer with citable URLs. Use it for 'what does Red Hat say / find the " +
      "KB entry / how-to' questions about RH products.",
    promptSnippet: "Query the Red Hat Knowledge Portal (solutions/articles/docs)",
    promptGuidelines: [
      "Use ask_rhkb when the user asks about a specific Red Hat product, error code, upgrade/patch, or 'how does Red Hat recommend\u2026' \u2014 the portal returns citable docs.",
      "Query with 2-5 keywords, not a full sentence. Prefer mechanism/product keywords over casual phrasing (e.g. for 'clear old alerts on the dashboard' try 'disable alert prometheus alertmanager openshift', not 'how can we clear old alerts').",
      "The portal ranks keyword-literal: if the first result set looks off-topic, re-query once or twice with different keyword phrasings before giving up; pick the phrasing whose top hits are most specific.",
      "Pass `kind` to narrow results (solution, article, documentation). Omit for all.",
      "The result is search hits with URLs \u2014 synthesize an answer and cite the URLs.",
    ],
    parameters: Type.Object({
      query: Type.String({ description: "2-5 keywords describing the topic or mechanism (not a full sentence). Example: 'disable alert prometheus openshift' rather than a question form." }),
      kind: Type.Optional(
        Type.Union([Type.String(), Type.Array(Type.String())], {
          description: "Document kind(s): solution | article | documentation (or other portal kinds). " + "Default: whatever rhkb.json `kinds` sets, else all kinds.",
        }),
      ),
      limit: Type.Optional(Type.Number({ description: "Max results (1-20, default 5)." })),
    }),
    async execute(_id, params, _signal, onUpdate, ctx) {
      onUpdate?.({ content: [{ type: "text", text: "RHKB: searching\u2026" }], details: {} });
      let settings;
      try {
        settings = resolveConfig(ctx.cwd);
      } catch (e) {
        return { content: [{ type: "text", text: `RHKB: ${e instanceof Error ? e.message : String(e)}` }], details: { error: true } };
      }
      const kinds =
        params.kind === undefined ? undefined
          : Array.isArray(params.kind) ? params.kind
            : [params.kind];
      try {
        const result = await searchPortal(settings, { query: params.query, kinds, limit: params.limit });
        return {
          content: [{ type: "text", text: formatResults({ query: params.query, kinds }, result, settings.url) }],
          details: { numFound: result.numFound, urls: result.docs.map((d) => d.url).filter((u): u is string => !!u) },
        };
      } catch (e) {
        return { content: [{ type: "text", text: `RHKB: ${e instanceof Error ? e.message : String(e)}` }], details: { error: true } };
      }
    },
  });

  pi.registerCommand("rhkb", {
    description: "Search the Red Hat Knowledge Portal: /rhkb [-k kind(s)] [-n limit] <query>",
    getArgumentCompletions: (prefix: string) => {
      if (!prefix || prefix.startsWith("-k") === false) return null;
      if (/^(k|kind|--kind|-k)$/.test(prefix)) return KINDS_VOCAB.map((k) => ({ value: k, label: k }));
      return null;
    },
    async handler(args: string, ctx: any) {
      let settings;
      try {
        settings = resolveConfig(ctx.cwd);
      } catch (e) {
        ctx.ui?.notify?.(e instanceof Error ? e.message : String(e), "error");
        return;
      }
      let parsed;
      try {
        parsed = parseRhkbArgs(args, { limit: settings.limit });
      } catch (e) {
        ctx.ui?.notify?.(e instanceof Error ? e.message : USAGE_ERROR, "error");
        return;
      }
      ctx.ui?.setStatus?.("rhkb", "Searching Knowledge Portal\u2026");
      try {
        const result = await searchPortal(settings, { query: parsed.query, kinds: parsed.kinds, limit: parsed.limit });
        const text = formatResults({ query: parsed.query, kinds: parsed.kinds }, result, settings.url);
        const n = result.docs.length;
        const m = result.numFound;
        if (n > 0) ctx.ui?.notify?.(`RHKB: ${n} of ${m} matches \u2014 sent to the conversation.`, "info");
        const idle = typeof ctx?.isIdle === "function" ? ctx.isIdle() : true;
        if (idle) pi.sendUserMessage(text);
        else pi.sendUserMessage(text, { deliverAs: "followUp" });
      } catch (e) {
        ctx.ui?.notify?.(e instanceof Error ? e.message : String(e), "error");
      } finally {
        ctx.ui?.setStatus?.("rhkb", undefined);
      }
    },
  });
}
