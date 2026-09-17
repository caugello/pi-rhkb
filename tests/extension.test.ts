import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import factory from "../extension/index.js";

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => resolve(data));
  });
}

let server: ReturnType<typeof createServer>;
let base: string;
let lastFq: string | null = null;
let lastUrl: string | null = null;

beforeAll(async () => {
  server = createServer((req, res) => {
    void readBody(req!);
    if (req.url?.startsWith("/solr/portal/select")) {
      const u = new URL(req.url, "http://x");
      lastFq = u.searchParams.get("fq");
      lastUrl = u.searchParams.get("q");
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          response: {
            numFound: 7,
            docs: [
              {
                documentKind: "solution",
                product: "Red Hat Developer Hub",
                id: "/solutions/install-oai.html",
                main_content: "Install the OpenShift AI Connector by deploying the operator\u2026",
                title: "How to install the OpenShift AI Connector",
              },
              {
                documentKind: "documentation",
                documentation_version: "1.10",
                id: "/docs/oaiconnector.html",
                main_content: "OpenShift AI Connector for Red Hat Developer Hub 1.10",
                title: "OpenShift AI Connector overview - RH Developer Hub 1.10",
              },
            ],
          },
        }),
      );
    } else {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
    }
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => new Promise<void>((r) => server.close(() => r())));

function makeCwd(cfg?: unknown): string {
  const cwd = mkdtempSync(join(tmpdir(), "rhkb-ext-"));
  mkdirSync(join(cwd, ".pi"));
  writeFileSync(join(cwd, ".pi", "rhkb.json"), JSON.stringify(cfg ?? { url: base }));
  return cwd;
}

function makeUi(): any {
  const notified: Array<[string, unknown]> = [];
  return { notified, notify: (m: string, t?: unknown) => notified.push([m, t]), setStatus: () => {} };
}

function makePi() {
  const tools: any[] = [];
  const commands: Record<string, any> = {};
  const sent: Array<{ content: unknown; options?: unknown }> = [];
  return {
    tools,
    commands,
    sent,
    registerTool(def: unknown) {
      tools.push(def);
    },
    registerCommand(name: string, opts: unknown) {
      commands[name] = opts;
    },
    sendUserMessage(content: unknown, options?: unknown) {
      sent.push({ content, options });
    },
  };
}

describe("extension glue", () => {
  it("registers ask_rhkb tool and /rhkb command", () => {
    const pi = makePi() as any;
    factory(pi);
    expect(pi.tools).toHaveLength(1);
    expect(pi.tools[0].name).toBe("ask_rhkb");
    expect(pi.tools[0].description).toContain("Red Hat");
    expect(pi.tools[0].parameters.properties.query).toBeDefined();
    expect(pi.tools[0].parameters.properties.kind).toBeDefined();
    expect(pi.commands["rhkb"]).toBeDefined();
    expect(pi.commands["rhkb"].description).toMatch(/\/rhkb/);
  });

  it("tool execute returns formatted docs against a portal (title + URL + excerpt)", async () => {
    const cwd = makeCwd();
    const pi = makePi() as any;
    factory(pi);
    const updates: string[] = [];
    const result = await pi.tools[0].execute(
      "call-1",
      { query: "OpenShift AI Connector install" },
      undefined,
      (u: { content: { text: string }[] }) => updates.push(u.content[0].text),
      { cwd },
    );
    const text = result.content[0].text;
    expect(text).toContain("2 of 7 matches");
    expect(text).toContain("How to install the OpenShift AI Connector");
    expect(text).toContain(`${base}/solutions/install-oai.html`);
    expect(text).toContain("Excerpt: Install the OpenShift AI Connector");
    expect(result.details.numFound).toBe(7);
    expect(result.details.urls).toContain(`${base}/solutions/install-oai.html`);
    expect(updates.length).toBeGreaterThanOrEqual(1);
    expect(updates[0]).toMatch(/searching/i);
  });

  it("tool execute sends fq when kind is given (array form)", async () => {
    const cwd = makeCwd();
    const pi = makePi() as any;
    factory(pi);
    await pi.tools[0].execute("call-2", { query: "q", kind: ["solution", "article"] }, undefined, undefined, { cwd });
    expect(lastFq).toBe("documentKind:(solution OR article)");
  });

  it("tool surfaces no-config and network errors as text (no throw)", async () => {
    const pi = makePi() as any;
    factory(pi);
    const noCfgCwd = mkdtempSync(join(tmpdir(), "rhkb-nocfg-"));
    const realHome = process.env.HOME;
    process.env.HOME = mkdtempSync(join(tmpdir(), "rhkb-home-"));
    try {
      const r = await pi.tools[0].execute("c", { query: "q" }, undefined, undefined, { cwd: noCfgCwd });
      expect(r.content[0].text).toContain("no Red Hat Knowledge Portal configured");
      expect(r.details.error).toBe(true);
    } finally {
      if (realHome === undefined) delete process.env.HOME;
      else process.env.HOME = realHome;
    }

    const badCwd = makeCwd({ url: "http://127.0.0.1:1" });
    const r2 = await pi.tools[0].execute("c2", { query: "q" }, undefined, undefined, { cwd: badCwd });
    expect(r2.content[0].text).toMatch(/portal unreachable|timed out/i);
  });

  it("command handler sends formatted result via sendUserMessage (idle)", async () => {
    const cwd = makeCwd();
    const pi = makePi() as any;
    factory(pi);
    const ctx = { cwd, ui: makeUi(), isIdle: () => true };
    await pi.commands["rhkb"].handler("-k solution,article OpenShift AI Connector", ctx);
    expect(pi.sent).toHaveLength(1);
    expect(pi.sent[0].content).toContain("How to install the OpenShift AI Connector");
    expect(ctx.ui.notified.some(([m]: string[]) => /2 of 7 matches/.test(m))).toBe(true);
  });

  it("command with kind filter sends fq (verified server-side)", async () => {
    const cwd = makeCwd();
    const pi = makePi() as any;
    factory(pi);
    const ctx = { cwd, ui: { notified: [] as string[], setStatus: () => {} }, isIdle: () => true };
    await pi.commands["rhkb"].handler("-k solution q", ctx);
    expect(lastFq).toBe("documentKind:solution");
  });

  it("command surfaces no-config as a notify error (not an unhandled throw)", async () => {
    const pi = makePi() as any;
    factory(pi);
    const cwd = mkdtempSync(join(tmpdir(), "rhkb-nocfg2-"));
    const realHome = process.env.HOME;
    process.env.HOME = mkdtempSync(join(tmpdir(), "rhkb-home2-"));
    const ui: any = makeUi();
    try {
      await pi.commands["rhkb"].handler("foo", { cwd, ui, isIdle: () => true } as any);
      expect(ui.notified.length).toBeGreaterThan(0);
      expect(String(ui.notified[0][0])).toContain("no Red Hat Knowledge Portal configured");
      expect(ui.notified[0][1]).toBe("error");
      expect(pi.sent).toHaveLength(0);
    } finally {
      if (realHome === undefined) delete process.env.HOME;
      else process.env.HOME = realHome;
    }
  });

  it("command usage error for empty query is notified, not thrown", async () => {
    const cwd = makeCwd();
    const pi = makePi() as any;
    factory(pi);
    const ui: any = makeUi();
    await pi.commands["rhkb"].handler("", { cwd, ui, isIdle: () => true } as any);
    expect(String(ui.notified[0]?.[0] ?? ui.notified[0])).toMatch(/missing query|usage/i);
    expect(pi.sent).toHaveLength(0);
  });
});
