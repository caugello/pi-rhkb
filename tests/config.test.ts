import { rmSync, mkdirSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, afterEach } from "vitest";
import { resolveConfig, NO_CONFIG_MESSAGE } from "../src/config.js";

const tmps: string[] = [];
afterEach(() => {
  for (const d of tmps.splice(0)) rmSync(d, { recursive: true, force: true });
});

function dir(): string {
  const d = mkdtempSync(join(tmpdir(), "rhkb-cfg-"));
  tmps.push(d);
  return d;
}

function projectCfg(base: string, obj: unknown): string {
  mkdirSync(join(base, ".pi"));
  writeFileSync(join(base, ".pi", "rhkb.json"), JSON.stringify(obj));
  return base;
}

describe("resolveConfig", () => {
  it("resolves project config when both exist (project wins)", () => {
    const cwd = dir();
    const home = dir();
    process.env.HOME = home;
    mkdirSync(join(home, ".pi", "agent"), { recursive: true });
    writeFileSync(join(home, ".pi", "agent", "rhkb.json"), JSON.stringify({ url: "https://global.example" }));
    projectCfg(cwd, { url: "https://project.example" });
    expect(resolveConfig(cwd).url).toBe("https://project.example");
  });

  it("falls back to global config (HOME-resolved)", () => {
    const cwd = dir();
    const home = dir();
    process.env.HOME = home;
    mkdirSync(join(home, ".pi", "agent"), { recursive: true });
    writeFileSync(join(home, ".pi", "agent", "rhkb.json"), JSON.stringify({ url: "https://global.example" }));
    expect(resolveConfig(cwd).url).toBe("https://global.example");
  });

  it("throws the no-config message when neither exists", () => {
    const cwd = dir();
    process.env.HOME = dir();
    expect(() => resolveConfig(cwd)).toThrowError(NO_CONFIG_MESSAGE);
  });

  it("applies defaults for a minimal config", () => {
    const cwd = projectCfg(dir(), { url: "https://x.example" });
    const cfg = resolveConfig(cwd);
    expect(cfg.solrPath).toBe("/solr/portal/select");
    expect(cfg.limit).toBe(5);
    expect(cfg.maxContentChars).toBe(2000);
    expect(cfg.apiKey).toBeUndefined();
    expect(cfg.kinds).toBeUndefined();
  });

  it("normalizes trailing slash on url", () => {
    const cwd = projectCfg(dir(), { url: "https://x.example/" });
    expect(resolveConfig(cwd).url).toBe("https://x.example");
  });

  it.each([
    [{}, "url"],
    [{ url: "ftp://x.example" }, "url"],
    [{ url: "https://ok.example", solrPath: "no-slash" }, "solrPath"],
    [{ url: "https://ok.example", limit: 0 }, "limit"],
    [{ url: "https://ok.example", limit: 21 }, "limit"],
    [{ url: "https://ok.example", limit: "5" }, "limit"],
    [{ url: "https://ok.example", maxContentChars: 10 }, "maxContentChars"],
    [{ url: "https://ok.example", maxContentChars: 999999 }, "maxContentChars"],
    [{ url: "https://ok.example", maxContentChars: 1.5 }, "maxContentChars"],
    [{ url: "https://ok.example", kinds: "" }, "kinds"],
    [{ url: "https://ok.example", kinds: [] }, "kinds"],
    [{ url: "https://ok.example", kinds: [42] }, "kinds"],
    [{ url: "https://ok.example", apiKey: 42 }, "apiKey"],
  ])("rejects %j naming %s", (cfg, key) => {
    const cwd = projectCfg(dir(), cfg);
    expect(() => resolveConfig(cwd)).toThrowError(new RegExp(`["'\\s]${key}["'\\s:]`));
  });
});
