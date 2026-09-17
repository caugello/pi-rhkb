import { readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface PortalSettings {
  url: string;
  solrPath: string;
  apiKey?: string;
  kinds?: string[];
  limit: number;
  maxContentChars: number;
}

export const NO_CONFIG_MESSAGE =
  'no Red Hat Knowledge Portal configured (create .pi/rhkb.json or ~/.pi/agent/rhkb.json with { "url": "https://your-portal.example" })';

function fail(key: string, why: string): never {
  throw new Error(`invalid rhkb.json "${key}": ${why}`);
}

export function resolveConfig(cwd: string): PortalSettings {
  const projectPath = join(cwd, ".pi", "rhkb.json");
  const globalPath = join(homedir(), ".pi", "agent", "rhkb.json");

  const path = existsSync(projectPath) ? projectPath : existsSync(globalPath) ? globalPath : null;
  if (!path) throw new Error(NO_CONFIG_MESSAGE);

  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, "utf8"));
  } catch (e) {
    throw new Error(`invalid rhkb.json "${path}": ${e instanceof Error ? e.message : String(e)}`);
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error(`invalid rhkb.json "${path}": expected a JSON object`);
  }
  const obj = raw as Record<string, unknown>;

  if (!("url" in obj) || typeof obj.url !== "string" || obj.url.trim() === "") {
    fail("url", "required non-empty string starting with http:// or https://");
  }
  let url = (obj.url as string).trim();
  if (!/^https?:\/\//.test(url)) fail("url", "must start with http:// or https://");
  url = url.replace(/\/+$/, "");

  let solrPath = typeof obj.solrPath === "string" && obj.solrPath.startsWith("/")
    ? obj.solrPath
    : "/solr/portal/select";
  if (typeof obj.solrPath === "string" && !obj.solrPath.startsWith("/")) fail("solrPath", "must start with /");

  let apiKey: string | undefined;
  if (obj.apiKey !== undefined) {
    if (typeof obj.apiKey !== "string" || obj.apiKey.trim() === "") fail("apiKey", "optional non-empty string");
    apiKey = obj.apiKey.trim();
  }

  let kinds: string[] | undefined;
  if (obj.kinds !== undefined) {
    if (!Array.isArray(obj.kinds) || obj.kinds.length === 0 || !obj.kinds.every((k) => typeof k === "string" && k.trim() !== "")) {
      fail("kinds", "optional non-empty array of non-empty strings");
    }
    kinds = obj.kinds as string[];
  }

  let limit = 5;
  if (obj.limit !== undefined) {
    if (typeof obj.limit !== "number" || !Number.isInteger(obj.limit) || obj.limit < 1 || obj.limit > 20) {
      fail("limit", "integer 1..20");
    }
    limit = obj.limit;
  }

  let maxContentChars = 2000;
  if (obj.maxContentChars !== undefined) {
    if (typeof obj.maxContentChars !== "number" || !Number.isInteger(obj.maxContentChars) || obj.maxContentChars < 200 || obj.maxContentChars > 20000) {
      fail("maxContentChars", "integer 200..20000");
    }
    maxContentChars = obj.maxContentChars;
  }

  return { url, solrPath, apiKey, kinds, limit, maxContentChars };
}
