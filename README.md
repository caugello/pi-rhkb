# pi-rhkb

A [pi](https://pi.dev) coding-agent extension that searches the **Red Hat Offline Knowledge Portal** and hands pi synthesize-able, citable results. Retrieval is the portal's Solr index — **no LLM, no API key, one stateless GET** per call.

- **`ask_rhkb` tool** — pi's LLM calls it for "what does Red Hat say / find the KB entry / how-to" questions. Synthesizes the answer and cites portal URLs.
- **`/rhkb` command** — deterministic direct lookup:

  ```
  /rhkb OpenShift AI Connector
  /rhkb -k solution,article "etcd quorum loss"
  /rhkb -n 10 -k documentation rosca oidc
  ```

## Result shape

```
1. [solution] Red Hat Developer Hub — "How to install the OpenShift AI Connector" (1.10) (2026-09-04)
   https://rhkb…/solutions/…
   Excerpt: first ~2000 chars of the portal text…
```

Every URL is clickable and 200-verified. Kinds available in the index (verified via `facet.field` on the portal): `documentation, Errata, Cve, solution, article, page, blog, resource`.

## Setup

Point the extension at your portal. Global config `~/.pi/agent/rhkb.json`:

```json
{ "url": "https://your-portal.example" }
```

Project override: `<project>/.pi/rhkb.json` (wins over global).

Optional keys: `solrPath` (default `/solr/portal/select`), `apiKey` (sent as Bearer; only needed if the portal is gated), `kinds` (default kind filter), `limit` (1–20, default 5), `maxContentChars` (200–20000, default 2000).

Install the built extension for pi (dev or global):

```bash
npm run build
ln -sfn "$PWD/dist/rhkb.ts" ~/.pi/agent/extensions/rhkb.ts   # then /reload in pi
```

or per project: copy `extension/` + `src/` into `<project>/.pi/extensions/rhkb/`.

## Development

```bash
npm test          # vitest suite, fully offline (mock Solr)
npm run typecheck # strict TS
npm run build     # esbuild → dist/rhkb.ts (bundle pi can symlink; externals: typebox, pi)
```

**Portal quirks handled (verified against a live portal):**

- The index's `documentKind` facet values are case-sensitive (`solution`, `Errata`, `Cve`, …) — pass them exactly.
- Disjunction must use boolean `OR`, not `|`: `fq=documentKind:(solution OR article)` works; `|` silently matches 0.
- 0-result and non-JSON (SPA 404) responses are detected and reported with the config key to check, never an unhandled throw.

## Layout

```
src/config.ts     resolveConfig(cwd): project .pi/rhkb.json > ~/.pi/agent/rhkb.json, validation
src/search.ts     searchPortal(): Solr GET, JSON validation, defensive mapping, excerpt cap
src/format.ts     formatResults(): pi-consumable text (pure)
src/command.ts    parseRhkbArgs(): -k/-n flags (pure)
extension/index.ts pi glue: ask_rhkb tool + /rhkb command (sendUserMessage, notify, status)
dist/rhkb.ts      esbuild bundle for global install
tests/            vitest suite incl. extension glue against a local mock Solr server
```
