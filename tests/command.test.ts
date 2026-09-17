import { describe, expect, it } from "vitest";
import { parseRhkbArgs, USAGE_ERROR } from "../src/command.js";
import type { PortalSettings } from "../src/config.js";
const settings: Partial<PortalSettings> = { limit: 5 };

describe("parseRhkbArgs", () => {
  it("parses a bare query", () => {
    expect(parseRhkbArgs("foo bar baz", settings)).toEqual({ query: "foo bar baz", kinds: undefined, limit: 5 });
  });

  it("parses -k (comma-separated and repeated) and -n", () => {
    expect(parseRhkbArgs("-k solution,article foo", settings).kinds).toEqual(["solution", "article"]);
    expect(parseRhkbArgs("-k solution -k article foo", settings).kinds).toEqual(["solution", "article"]);
    expect(parseRhkbArgs("-n 8 foo", settings).limit).toBe(8);
  });

  it("accepts long flags --kind and --limit", () => {
    expect(parseRhkbArgs("--kind solution foo", settings).kinds).toEqual(["solution"]);
    expect(parseRhkbArgs("--limit 9 foo", settings).limit).toBe(9);
  });

  it("parses flags after the query too", () => {
    const r = parseRhkbArgs("foo -k solution -n 3", settings);
    expect(r.query).toBe("foo");
    expect(r.kinds).toEqual(["solution"]);
    expect(r.limit).toBe(3);
  });

  it("throws USAGE_ERROR for empty input", () => {
    expect(() => parseRhkbArgs("", settings)).toThrowError(USAGE_ERROR);
    expect(() => parseRhkbArgs("-k solution", settings)).toThrowError(USAGE_ERROR);
  });

  it("rejects out-of-range -n", () => {
    expect(() => parseRhkbArgs("-n 0 foo", settings)).toThrowError(/limit/);
    expect(() => parseRhkbArgs("-n 21 foo", settings)).toThrowError(/limit/);
    expect(() => parseRhkbArgs("-n abc foo", settings)).toThrowError(/limit/);
    expect(() => parseRhkbArgs("-n", settings)).toThrowError(/limit/);
  });
});
