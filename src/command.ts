export const USAGE_ERROR = "missing query: usage: /rhkb [-k kind(s)] [-n limit] <query>";

export interface RhkbArgs {
  query: string;
  kinds?: string[];
  limit?: number;
}

export function parseRhkbArgs(args: string, defaults: { limit?: number }): RhkbArgs {
  const tokens = args.trim().split(/\s+/).filter(Boolean);
  const kinds: string[] = [];
  let limit: number | undefined = defaults.limit;
  const query: string[] = [];

  const pushKind = (v: string) => {
    for (const k of v.split(",")) {
      const t = k.trim();
      if (t && !kinds.includes(t)) kinds.push(t);
    }
  };
  const setLimit = (v: string) => {
    if (!/^\d+$/.test(v)) throw new Error('invalid "limit" (expected integer 1..20)');
    const n = parseInt(v, 10);
    if (n < 1 || n > 20) throw new Error('invalid "limit" (expected integer 1..20)');
    limit = n;
  };

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t === "-k" || t === "--kind") {
      if (i + 1 >= tokens.length) throw new Error('missing value for "kind"');
      pushKind(tokens[++i]);
    } else if (t === "-n" || t === "--limit") {
      if (i + 1 >= tokens.length) throw new Error('missing value for "limit"');
      setLimit(tokens[++i]);
    } else {
      query.push(t);
    }
  }

  if (query.length === 0) throw new Error(USAGE_ERROR);
  return { query: query.join(" "), kinds: kinds.length ? kinds : undefined, limit };
}
