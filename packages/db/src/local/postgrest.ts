/**
 * A small PostgREST stand-in for the music module's local mode (demo, Phase A dev, e2e): a
 * `fetch` that answers supabase-js `from()` / `rpc()` requests with SQL on an in-process Postgres
 * (PGlite). Only the request shapes the music models use are supported; anything else fails
 * loudly (`unsupported`) instead of guessing. Each request runs in its own transaction as the
 * token's role with `request.jwt.claims` set, exactly like PostgREST, so RLS applies.
 *
 * Supported: `select` with columns, `alias:column`, embedded resources (`rel(...)`,
 * `alias:rel!inner(...)`, nested), filters `eq neq gt gte lt lte like ilike is in cs cd ov`
 * (with `not.`), filters and `order`/`limit` on embedded resources, `order`, `limit`, `offset`,
 * `Prefer: count=exact|return=representation|resolution=…|missing=default`, `on_conflict`,
 * single-object responses, insert/upsert/update/delete, RPC (POST/GET/HEAD).
 */

export interface SqlResult {
  readonly rows: Record<string, unknown>[];
}
export interface SqlRunner {
  query(sql: string, params?: unknown[]): Promise<SqlResult>;
}
export interface SqlDb extends SqlRunner {
  transaction<T>(fn: (tx: SqlRunner) => Promise<T>): Promise<T>;
}

export class UnsupportedRequest extends Error {
  constructor(what: string) {
    super(`music local PostgREST: unsupported ${what}`);
  }
}

// ---------------------------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------------------------

interface Column {
  readonly type: string;
  readonly generated: boolean;
}
interface Relation {
  readonly name: string;
  readonly table: string;
  readonly columns: readonly string[];
  readonly refTable: string;
  readonly refColumns: readonly string[];
}
interface FunctionDef {
  readonly args: readonly { name: string; type: string; hasDefault: boolean }[];
  readonly returnsSet: boolean;
  /** `composite`: a row type (table or OUT params); `void`; or a scalar. */
  readonly returns: "composite" | "void" | "scalar";
}
export interface Catalog {
  readonly tables: Map<string, Map<string, Column>>;
  readonly primaryKeys: Map<string, string[]>;
  readonly relations: Relation[];
  readonly functions: Map<string, FunctionDef[]>;
}

export async function loadCatalog(db: SqlRunner): Promise<Catalog> {
  const tables = new Map<string, Map<string, Column>>();
  const cols = await db.query(
    `select c.relname as table, a.attname as name, format_type(a.atttypid, a.atttypmod) as type,
            a.attgenerated <> '' as generated
       from pg_attribute a join pg_class c on c.oid = a.attrelid
       join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind in ('r','v','p') and a.attnum > 0 and not a.attisdropped
      order by a.attnum`,
  );
  for (const r of cols.rows) {
    const t = String(r.table);
    if (!tables.has(t)) tables.set(t, new Map());
    tables.get(t)!.set(String(r.name), { type: String(r.type), generated: r.generated === true });
  }
  const primaryKeys = new Map<string, string[]>();
  const relations: Relation[] = [];
  const cons = await db.query(
    `select con.conname as name, con.contype as kind, c.relname as table, rc.relname as ref_table,
            (select array_agg(a.attname order by k.i) from unnest(con.conkey) with ordinality k(n, i)
               join pg_attribute a on a.attrelid = con.conrelid and a.attnum = k.n) as columns,
            (select array_agg(a.attname order by k.i) from unnest(con.confkey) with ordinality k(n, i)
               join pg_attribute a on a.attrelid = con.confrelid and a.attnum = k.n) as ref_columns
       from pg_constraint con join pg_class c on c.oid = con.conrelid
       join pg_namespace n on n.oid = c.relnamespace
       left join pg_class rc on rc.oid = con.confrelid
      where n.nspname = 'public' and con.contype in ('p', 'f')`,
  );
  for (const r of cons.rows) {
    const columns = r.columns as string[];
    if (r.kind === "p") primaryKeys.set(String(r.table), columns);
    else {
      relations.push({
        name: String(r.name),
        table: String(r.table),
        columns,
        refTable: String(r.ref_table),
        refColumns: r.ref_columns as string[],
      });
    }
  }
  const functions = new Map<string, FunctionDef[]>();
  const fns = await db.query(
    `select p.proname as name, p.proretset as retset, p.pronargdefaults as ndefaults,
            coalesce(p.proargnames, '{}') as argnames, coalesce(p.proargmodes::text[], '{}') as argmodes,
            (select coalesce(array_agg(format_type(t, null) order by i), '{}')
               from unnest(coalesce(p.proallargtypes, p.proargtypes::oid[])) with ordinality u(t, i)) as argtypes,
            format_type(p.prorettype, null) as rettype, rt.typtype as rettyptype
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       join pg_type rt on rt.oid = p.prorettype
      where n.nspname = 'public' and p.prokind = 'f'`,
  );
  for (const r of fns.rows) {
    const names = r.argnames as string[];
    const modes = r.argmodes as string[];
    const types = r.argtypes as string[];
    const inputs = types
      .map((type, i) => ({ name: names[i] ?? "", type, mode: modes[i] ?? "i" }))
      .filter((a) => a.mode === "i" || a.mode === "b" || a.mode === "v");
    const nDefaults = Number(r.ndefaults);
    const def: FunctionDef = {
      args: inputs.map((a, i) => ({
        name: a.name,
        type: a.type,
        hasDefault: i >= inputs.length - nDefaults,
      })),
      returnsSet: r.retset === true,
      returns:
        r.rettype === "void"
          ? "void"
          : r.rettyptype === "c" || r.rettype === "record"
            ? "composite"
            : "scalar",
    };
    const name = String(r.name);
    functions.set(name, [...(functions.get(name) ?? []), def]);
  }
  return { tables, primaryKeys, relations, functions };
}

// ---------------------------------------------------------------------------------------------
// Select / filter parsing
// ---------------------------------------------------------------------------------------------

type SelectItem =
  | { kind: "column"; name: string; alias: string }
  | { kind: "star" }
  | {
      kind: "embed";
      rel: string;
      alias: string;
      hint: string | null;
      inner: boolean;
      items: SelectItem[];
    };

function splitTop(text: string, sep = ","): string[] {
  const out: string[] = [];
  let depth = 0;
  let quote = false;
  let cur = "";
  for (const ch of text) {
    if (ch === '"') quote = !quote;
    if (!quote && (ch === "(" || ch === "{")) depth++;
    if (!quote && (ch === ")" || ch === "}")) depth--;
    if (!quote && depth === 0 && ch === sep) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  if (cur !== "") out.push(cur);
  return out.map((s) => s.trim()).filter((s) => s !== "");
}

export function parseSelect(text: string): SelectItem[] {
  return splitTop(text.replace(/\s+/g, "")).map((part): SelectItem => {
    if (part === "*") return { kind: "star" };
    const open = part.indexOf("(");
    const head = open === -1 ? part : part.slice(0, open);
    const [aliasPart, namePart] = head.includes(":") ? head.split(":") : [null, head];
    if (open === -1) {
      if (/[^\w]/.test(namePart!)) throw new UnsupportedRequest(`select column "${part}"`);
      return { kind: "column", name: namePart!, alias: aliasPart ?? namePart! };
    }
    if (!part.endsWith(")")) throw new UnsupportedRequest(`select "${part}"`);
    const [rel, ...hints] = namePart!.split("!");
    const inner = hints.includes("inner");
    const hint = hints.find((h) => h !== "inner" && h !== "left") ?? null;
    return {
      kind: "embed",
      rel: rel!,
      alias: aliasPart ?? rel!,
      hint,
      inner,
      items: parseSelect(part.slice(open + 1, -1)),
    };
  });
}

interface Filter {
  readonly column: string;
  readonly negate: boolean;
  readonly op: string;
  readonly value: string;
}
interface OrderTerm {
  readonly column: string;
  readonly desc: boolean;
  readonly nulls: "first" | "last" | null;
}
/** A top-level `or=(a.eq.1,b.is.false,and(c.eq.2,d.eq.3))`: each term is an AND group of filters. */
type OrGroup = Filter[][];
interface Modifiers {
  filters: Filter[];
  /** Top-level `or` parameters; every one must hold (they are ANDed with the filters). */
  ors: OrGroup[];
  order: OrderTerm[];
  limit: number | null;
  offset: number | null;
}
const RESERVED = new Set(["select", "order", "limit", "offset", "on_conflict", "columns"]);
const OPS = new Set([
  "eq",
  "neq",
  "gt",
  "gte",
  "lt",
  "lte",
  "like",
  "ilike",
  "is",
  "in",
  "cs",
  "cd",
  "ov",
]);

function parseFilter(column: string, raw: string): Filter {
  let rest = raw;
  let negate = false;
  if (rest.startsWith("not.")) {
    negate = true;
    rest = rest.slice(4);
  }
  const dot = rest.indexOf(".");
  const op = dot === -1 ? rest : rest.slice(0, dot);
  if (!OPS.has(op)) throw new UnsupportedRequest(`filter operator "${op}" on ${column}`);
  return { column, negate, op, value: rest.slice(dot + 1) };
}

function parseOr(raw: string): OrGroup {
  const inner = raw.replace(/^\(/, "").replace(/\)$/, "");
  return splitTop(inner).map((term) => {
    const dot = term.indexOf(".");
    if (term.startsWith("and(") && term.endsWith(")")) {
      return splitTop(term.slice(4, -1)).map((part) => {
        const d = part.indexOf(".");
        return parseFilter(part.slice(0, d), part.slice(d + 1));
      });
    }
    if (dot === -1) throw new UnsupportedRequest(`or term "${term}"`);
    return [parseFilter(term.slice(0, dot), term.slice(dot + 1))];
  });
}

function parseOrder(raw: string): OrderTerm[] {
  return splitTop(raw).map((term) => {
    const [column, ...flags] = term.split(".");
    return {
      column: column!,
      desc: flags.includes("desc"),
      nulls: flags.includes("nullsfirst") ? "first" : flags.includes("nullslast") ? "last" : null,
    };
  });
}

/** Query parameters grouped by embed path ("" = top level). */
function parseModifiers(params: URLSearchParams): Map<string, Modifiers> {
  const byPath = new Map<string, Modifiers>();
  const get = (path: string) => {
    let m = byPath.get(path);
    if (!m) byPath.set(path, (m = { filters: [], ors: [], order: [], limit: null, offset: null }));
    return m;
  };
  for (const [key, value] of params) {
    if (key === "or") {
      get("").ors.push(parseOr(value));
      continue;
    }
    if (key === "and" || key.endsWith(".or") || key.endsWith(".and")) {
      throw new UnsupportedRequest(`logical filter "${key}"`);
    }
    const dot = key.lastIndexOf(".");
    const path = dot === -1 ? "" : key.slice(0, dot);
    const last = dot === -1 ? key : key.slice(dot + 1);
    if (last === "select" || last === "on_conflict" || last === "columns") continue;
    if (last === "order") get(path).order = parseOrder(value);
    else if (last === "limit") get(path).limit = Number(value);
    else if (last === "offset") get(path).offset = Number(value);
    else if (!RESERVED.has(key)) get(path).filters.push(parseFilter(last, value));
  }
  return byPath;
}

// ---------------------------------------------------------------------------------------------
// SQL building
// ---------------------------------------------------------------------------------------------

const ident = (name: string) => `"${name.replaceAll('"', '""')}"`;

class Params {
  readonly values: unknown[] = [];
  add(value: unknown, cast?: string): string {
    this.values.push(value);
    return cast ? `$${this.values.length}::${cast}` : `$${this.values.length}`;
  }
}

/** Splits a PostgREST list value `(a,"b c")` into its items. */
function listItems(value: string): string[] {
  const inner = value.replace(/^\(/, "").replace(/\)$/, "");
  return splitTop(inner).map((v) =>
    v.startsWith('"') ? v.slice(1, -1).replaceAll('\\"', '"') : v,
  );
}

class Builder {
  private alias = 0;
  constructor(
    private readonly catalog: Catalog,
    readonly params: Params,
    private readonly mods: Map<string, Modifiers>,
  ) {}

  nextAlias(): string {
    return `t${this.alias++}`;
  }

  columnsOf(table: string): Map<string, Column> {
    const cols = this.catalog.tables.get(table);
    if (!cols) throw new UnsupportedRequest(`table "${table}"`);
    return cols;
  }

  private filterSql(table: string, alias: string, f: Filter): string {
    const col = this.columnsOf(table).get(f.column);
    if (!col) throw new UnsupportedRequest(`filter column ${table}.${f.column}`);
    const lhs = `${alias}.${ident(f.column)}`;
    const cmp: Record<string, string> = {
      eq: "=",
      neq: "<>",
      gt: ">",
      gte: ">=",
      lt: "<",
      lte: "<=",
    };
    let sql: string;
    if (f.op in cmp) sql = `${lhs} ${cmp[f.op]} ${this.params.add(f.value, col.type)}`;
    else if (f.op === "like" || f.op === "ilike") {
      sql = `${lhs}::text ${f.op === "like" ? "like" : "ilike"} ${this.params.add(f.value.replaceAll("*", "%"))}`;
    } else if (f.op === "is") {
      const v = f.value.toLowerCase();
      if (!["null", "true", "false", "unknown"].includes(v))
        throw new UnsupportedRequest(`is.${v}`);
      sql = `${lhs} is ${v}`;
    } else if (f.op === "in") {
      sql = `${lhs} = any(${this.params.add(listItems(f.value), `${col.type}[]`)})`;
    } else {
      const op = { cs: "@>", cd: "<@", ov: "&&" }[f.op]!;
      sql = `${lhs} ${op} ${this.params.add(f.value, col.type)}`;
    }
    return f.negate ? `not (${sql})` : sql;
  }

  private orderSql(alias: string, order: readonly OrderTerm[]): string {
    if (order.length === 0) return "";
    return ` order by ${order
      .map(
        (o) =>
          `${alias}.${ident(o.column)} ${o.desc ? "desc" : "asc"}${o.nulls ? ` nulls ${o.nulls}` : ""}`,
      )
      .join(", ")}`;
  }

  private relation(parent: string, item: Extract<SelectItem, { kind: "embed" }>) {
    const candidates = this.catalog.relations.filter(
      (r) =>
        ((r.table === item.rel && r.refTable === parent) ||
          (r.table === parent && r.refTable === item.rel)) &&
        // The tenant FK of every table is not a relation between two music tables.
        !(r.columns.length === 1 && r.columns[0] === "tenant_id") &&
        (item.hint === null || r.name === item.hint || r.columns.includes(item.hint)),
    );
    if (candidates.length !== 1) {
      throw new UnsupportedRequest(
        `embedding "${item.rel}" in "${parent}" (${candidates.length} relationships)`,
      );
    }
    const r = candidates[0]!;
    const toMany = r.table === item.rel && r.refTable === parent;
    // join: child columns = parent columns
    const pairs = toMany
      ? r.columns.map((c, i) => ({ target: c, source: r.refColumns[i]! }))
      : r.columns.map((c, i) => ({ target: r.refColumns[i]!, source: c }));
    return { toMany, pairs };
  }

  /** The select list for `table` aliased `alias` (columns and embedded subqueries). */
  selectList(table: string, alias: string, items: SelectItem[], path: string): string {
    const cols = this.columnsOf(table);
    const out: string[] = [];
    for (const item of items) {
      if (item.kind === "star") out.push(`${alias}.*`);
      else if (item.kind === "column") {
        if (!cols.has(item.name)) throw new UnsupportedRequest(`column ${table}.${item.name}`);
        out.push(`${alias}.${ident(item.name)} as ${ident(item.alias)}`);
      } else {
        const sub = this.embedSql(table, alias, item, path ? `${path}.${item.alias}` : item.alias);
        out.push(`${sub.value} as ${ident(item.alias)}`);
      }
    }
    return out.join(", ");
  }

  private embedSql(
    parent: string,
    parentAlias: string,
    item: Extract<SelectItem, { kind: "embed" }>,
    path: string,
  ): { value: string; exists: string } {
    const { toMany, pairs } = this.relation(parent, item);
    const a = this.nextAlias();
    const m = this.mods.get(path);
    const join = pairs.map((p) => `${a}.${ident(p.target)} = ${parentAlias}.${ident(p.source)}`);
    const where = [...join, ...(m?.filters ?? []).map((f) => this.filterSql(item.rel, a, f))];
    // Inner embeds below this one also restrict it.
    const innerChildren = item.items.filter(
      (i): i is Extract<SelectItem, { kind: "embed" }> => i.kind === "embed" && i.inner,
    );
    for (const child of innerChildren) {
      where.push(this.embedSql(item.rel, a, child, `${path}.${child.alias}`).exists);
    }
    const from = `from ${ident(item.rel)} ${a} where ${where.join(" and ")}`;
    const list = this.selectList(item.rel, a, item.items, path);
    const order = this.orderSql(a, m?.order ?? []);
    const limit = m?.limit != null ? ` limit ${m.limit}` : "";
    const offset = m?.offset != null ? ` offset ${m.offset}` : "";
    const value = toMany
      ? `coalesce((select json_agg(s) from (select ${list} ${from}${order}${limit}${offset}) s), '[]'::json)`
      : `(select row_to_json(s) from (select ${list} ${from} limit 1) s)`;
    return { value, exists: `exists (select 1 ${from})` };
  }

  /** WHERE conditions of the top level (filters + inner embeds). */
  where(table: string, alias: string, items: SelectItem[]): string[] {
    const top = this.mods.get("");
    const conds = (top?.filters ?? []).map((f) => this.filterSql(table, alias, f));
    for (const or of top?.ors ?? []) {
      conds.push(
        `(${or.map((term) => `(${term.map((f) => this.filterSql(table, alias, f)).join(" and ")})`).join(" or ")})`,
      );
    }
    for (const item of items) {
      if (item.kind === "embed" && item.inner) {
        conds.push(this.embedSql(table, alias, item, item.alias).exists);
      }
    }
    return conds;
  }

  topOrder(alias: string): string {
    return this.orderSql(alias, this.mods.get("")?.order ?? []);
  }
  topLimit(): string {
    const top = this.mods.get("");
    return `${top?.limit != null ? ` limit ${top.limit}` : ""}${top?.offset != null ? ` offset ${top.offset}` : ""}`;
  }
  topOffset(): number {
    return this.mods.get("")?.offset ?? 0;
  }
}

// ---------------------------------------------------------------------------------------------
// Request handling
// ---------------------------------------------------------------------------------------------

export interface LocalPostgrestOptions {
  readonly db: SqlDb;
  readonly catalog: () => Promise<Catalog>;
  /** Role and claims of the request (what PostgREST takes from the JWT). */
  readonly role: string;
  readonly claims: Record<string, unknown>;
}

interface PgError {
  code?: string;
  message?: string;
  detail?: string;
  hint?: string;
}

function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

function errorResponse(error: unknown): Response {
  if (error instanceof UnsupportedRequest) {
    return json(400, { code: "PGRST000", message: error.message, details: null, hint: null });
  }
  const e = error as PgError;
  const code = e.code ?? "";
  const status =
    code === "42501"
      ? 403
      : code === "23505" || code === "23503"
        ? 409
        : code === "P0002"
          ? 404
          : 400;
  return json(status, {
    code,
    message: e.message ?? String(error),
    details: e.detail ?? null,
    hint: e.hint ?? null,
  });
}

function preferOf(headers: Headers): Set<string> {
  // `Headers.get` joins repeated headers with ", ".
  return new Set(
    (headers.get("prefer") ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

/** Builds the `fetch` given to supabase-js (`global.fetch`). Storage requests go to `storage`. */
export function localPostgrestFetch(
  options: LocalPostgrestOptions,
  storage?: (request: Request) => Promise<Response>,
): typeof fetch {
  return async (input, init) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    // The client may live under a base path (local mode serves its signed URLs from an app route).
    if (url.pathname.includes("/storage/v1/")) {
      if (!storage) throw new UnsupportedRequest("storage request");
      return storage(request);
    }
    const prefix = "/rest/v1/";
    const at = url.pathname.indexOf(prefix);
    if (at < 0) throw new UnsupportedRequest(`path ${url.pathname}`);
    const resource = decodeURIComponent(url.pathname.slice(at + prefix.length));
    const bodyText =
      request.method === "GET" || request.method === "HEAD" ? "" : await request.text();
    const body: unknown = bodyText === "" ? undefined : JSON.parse(bodyText);
    try {
      const catalog = await options.catalog();
      const headers = Object.fromEntries(request.headers);
      return await options.db.transaction(async (tx) => {
        await tx.query(`set local role ${ident(options.role)}`);
        await tx.query(
          `select set_config('request.jwt.claims', $1, true), set_config('request.headers', $2, true)`,
          [JSON.stringify(options.claims), JSON.stringify(headers)],
        );
        if (resource.startsWith("rpc/")) {
          return await rpc(tx, catalog, resource.slice(4), request, url, body);
        }
        return await table(tx, catalog, resource, request, url, body);
      });
    } catch (error) {
      return errorResponse(error);
    }
  };
}

function singleObject(request: Request): boolean {
  return (request.headers.get("accept") ?? "").includes("vnd.pgrst.object");
}

function respondRows(
  request: Request,
  rows: unknown[],
  status: number,
  count: number | null,
  offset: number,
): Response {
  const range =
    rows.length === 0
      ? `*/${count ?? "*"}`
      : `${offset}-${offset + rows.length - 1}/${count ?? "*"}`;
  if (singleObject(request)) {
    if (rows.length !== 1) {
      return json(406, {
        code: "PGRST116",
        message: "JSON object requested, multiple (or no) rows returned",
        details: `The result contains ${rows.length} rows`,
        hint: null,
      });
    }
    return json(status, rows[0], { "content-range": range });
  }
  return json(status, request.method === "HEAD" ? undefined : rows, { "content-range": range });
}

async function table(
  tx: SqlRunner,
  catalog: Catalog,
  name: string,
  request: Request,
  url: URL,
  body: unknown,
): Promise<Response> {
  const prefer = preferOf(request.headers);
  const params = new Params();
  const b = new Builder(catalog, params, parseModifiers(url.searchParams));
  const columns = b.columnsOf(name);
  const items = parseSelect(url.searchParams.get("select") ?? "*");
  const t = b.nextAlias();
  const method = request.method;

  if (method === "GET" || method === "HEAD") {
    const where = b.where(name, t, items);
    const whereSql = where.length ? ` where ${where.join(" and ")}` : "";
    let count: number | null = null;
    if ([...prefer].some((p) => p.startsWith("count="))) {
      const res = await tx.query(
        `select count(*)::int as n from ${ident(name)} ${t}${whereSql}`,
        params.values,
      );
      count = Number(res.rows[0]?.n);
    }
    if (method === "HEAD") return respondRows(request, [], 200, count, b.topOffset());
    const sql = `select coalesce(json_agg(q), '[]'::json) as rows from (select ${b.selectList(name, t, items, "")} from ${ident(name)} ${t}${whereSql}${b.topOrder(t)}${b.topLimit()}) q`;
    const res = await tx.query(sql, params.values);
    return respondRows(request, res.rows[0]?.rows as unknown[], 200, count, b.topOffset());
  }

  const returning = prefer.has("return=representation");
  const writable = (keys: string[]) => {
    for (const k of keys) {
      const c = columns.get(k);
      if (!c) throw new UnsupportedRequest(`column ${name}.${k}`);
      if (c.generated) throw new UnsupportedRequest(`write to generated column ${name}.${k}`);
    }
    return keys;
  };
  let mutation: string;
  if (method === "POST") {
    const rows = (Array.isArray(body) ? body : [body]) as Record<string, unknown>[];
    const conflict =
      url.searchParams.get("on_conflict")?.split(",") ?? catalog.primaryKeys.get(name) ?? [];
    const resolution = [...prefer].find((p) => p.startsWith("resolution="))?.slice(11) ?? null;
    const statements = rows.map((row) => {
      const keys = writable(Object.keys(row));
      const rec = params.add(JSON.stringify(row), "json");
      const cols = keys.map(ident).join(", ");
      let sql =
        keys.length === 0
          ? `insert into ${ident(name)} default values`
          : `insert into ${ident(name)} (${cols}) select ${cols} from json_populate_record(null::${ident(name)}, ${rec})`;
      if (resolution === "merge-duplicates") {
        const updates = keys.filter((k) => !conflict.includes(k));
        sql += ` on conflict (${conflict.map(ident).join(", ")}) do ${
          updates.length
            ? `update set ${updates.map((k) => `${ident(k)} = excluded.${ident(k)}`).join(", ")}`
            : "nothing"
        }`;
      } else if (resolution === "ignore-duplicates") {
        sql += ` on conflict (${conflict.map(ident).join(", ")}) do nothing`;
      }
      return `${sql} returning *`;
    });
    if (statements.length === 0) return respondRows(request, [], 201, null, 0);
    // One statement per row (each its own column list), collected through CTEs.
    mutation = statements.map((s, i) => `m${i} as (${s})`).join(", ");
    const union = statements.map((_, i) => `select * from m${i}`).join(" union all ");
    mutation = `with ${mutation}, w as (${union})`;
  } else if (method === "PATCH") {
    const row = (body ?? {}) as Record<string, unknown>;
    const keys = writable(Object.keys(row));
    if (keys.length === 0) throw new UnsupportedRequest("empty update");
    const rec = params.add(JSON.stringify(row), "json");
    const where = b.where(name, t, []);
    mutation = `with w as (update ${ident(name)} ${t} set ${keys
      .map((k) => `${ident(k)} = r.${ident(k)}`)
      .join(", ")} from json_populate_record(null::${ident(name)}, ${rec}) r${
      where.length ? ` where ${where.join(" and ")}` : ""
    } returning ${t}.*)`;
  } else if (method === "DELETE") {
    const where = b.where(name, t, []);
    mutation = `with w as (delete from ${ident(name)} ${t}${
      where.length ? ` where ${where.join(" and ")}` : ""
    } returning ${t}.*)`;
  } else {
    throw new UnsupportedRequest(`method ${method}`);
  }
  const r = b.nextAlias();
  const list = returning ? b.selectList(name, r, items, "") : "1 as x";
  const res = await tx.query(
    `${mutation} select coalesce(json_agg(q), '[]'::json) as rows from (select ${list} from w ${r}) q`,
    params.values,
  );
  const rows = res.rows[0]?.rows as unknown[];
  const status = method === "POST" ? 201 : 200;
  if (!returning) {
    return new Response(null, {
      status: method === "POST" ? 201 : 204,
      headers: { "content-range": `*/${rows.length}` },
    });
  }
  return respondRows(request, rows, status, null, 0);
}

/** A JSON value as the text Postgres reads for `type`. */
function argValue(value: unknown, type: string): unknown {
  if (value === null || value === undefined) return null;
  if (type === "json" || type === "jsonb") return JSON.stringify(value);
  if (type.endsWith("[]")) {
    const items = Array.isArray(value)
      ? value
      : String(value)
          .replace(/^\{|\}$/g, "")
          .split(",")
          .filter((s) => s !== "");
    return `{${items
      .map((v) =>
        v === null ? "NULL" : `"${String(v).replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`,
      )
      .join(",")}}`;
  }
  return typeof value === "object" ? JSON.stringify(value) : String(value);
}

async function rpc(
  tx: SqlRunner,
  catalog: Catalog,
  name: string,
  request: Request,
  url: URL,
  body: unknown,
): Promise<Response> {
  const args: Record<string, unknown> =
    request.method === "POST"
      ? ((body ?? {}) as Record<string, unknown>)
      : Object.fromEntries(
          [...url.searchParams].filter(([k]) => !RESERVED.has(k) && !k.includes(".")),
        );
  const given = Object.keys(args);
  const defs = (catalog.functions.get(name) ?? []).filter(
    (d) =>
      given.every((g) => d.args.some((a) => a.name === g)) &&
      d.args.every((a) => a.hasDefault || given.includes(a.name)),
  );
  if (defs.length !== 1)
    throw new UnsupportedRequest(`function ${name}(${given.join(", ")}): ${defs.length} matches`);
  const def = defs[0]!;
  const params = new Params();
  const call = `${ident(name)}(${def.args
    .filter((a) => given.includes(a.name))
    .map((a) => `${ident(a.name)} => ${params.add(argValue(args[a.name], a.type), a.type)}`)
    .join(", ")})`;
  if (url.searchParams.has("select") && url.searchParams.get("select") !== "*") {
    throw new UnsupportedRequest(`select on rpc ${name}`);
  }
  const mods = parseModifiers(
    new URLSearchParams([...url.searchParams].filter(([k]) => !given.includes(k))),
  );
  if (
    (mods.get("")?.filters.length ?? 0) > 0 ||
    (mods.get("")?.ors.length ?? 0) > 0 ||
    mods.size > 1
  ) {
    throw new UnsupportedRequest(`filters on rpc ${name}`);
  }
  let value: unknown;
  if (def.returns === "void") {
    await tx.query(`select ${call}`, params.values);
    value = null;
  } else if (def.returnsSet) {
    const order = mods.get("")?.order ?? [];
    const top = mods.get("");
    const sql = `select coalesce(json_agg(r), '[]'::json) as v from (select * from ${call} r${
      order.length
        ? ` order by ${order.map((o) => `${ident(o.column)} ${o.desc ? "desc" : "asc"}`).join(", ")}`
        : ""
    }${top?.limit != null ? ` limit ${top.limit}` : ""}${top?.offset != null ? ` offset ${top.offset}` : ""}) r`;
    const res = await tx.query(sql, params.values);
    value = res.rows[0]?.v;
    if (def.returns === "scalar") {
      value = (value as Record<string, unknown>[]).map((row) => Object.values(row)[0]);
    }
  } else if (def.returns === "composite") {
    const res = await tx.query(`select row_to_json(r) as v from ${call} r`, params.values);
    value = res.rows[0]?.v ?? null;
  } else {
    const res = await tx.query(`select to_json(${call}) as v`, params.values);
    value = res.rows[0]?.v ?? null;
  }
  if (request.method === "HEAD") return json(200, undefined);
  if (Array.isArray(value)) return respondRows(request, value, 200, null, 0);
  return json(200, value);
}
