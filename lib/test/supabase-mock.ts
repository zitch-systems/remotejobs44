// lib/test/supabase-mock.ts — a small chainable Supabase client stub for
// unit-testing route handlers. NOT a test file itself (no `.test.ts`), so
// vitest doesn't execute it directly.
//
// The real @supabase client exposes a fluent, thenable query builder:
//   await supabase.from('t').select('*').eq('id', x).maybeSingle()
// Every builder method returns the builder; awaiting it runs the query. We
// mirror that: each method records a step and returns `this`; awaiting calls a
// user-supplied resolver with the accumulated context and resolves to its
// `{ data, error, count }`.

export interface QueryContext {
  table: string;
  /** Ordered method names called on the builder, e.g. ['select','eq','maybeSingle']. */
  steps: string[];
  /** Args passed to each step, parallel to `steps`. */
  args: unknown[][];
  /** Convenience: the mutation payload passed to insert/update/upsert, if any. */
  payload?: unknown;
  /** Convenience: map of column → value from every .eq() filter. */
  eq: Record<string, unknown>;
}

export type QueryResolver = (ctx: QueryContext) => { data?: unknown; error?: unknown; count?: number } | undefined;

// Terminal methods that "run" the query when a resolver is available. All other
// methods are chainable. `then` (await) always runs it.
const CHAINABLE = new Set([
  'select', 'eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'is', 'in', 'order', 'limit', 'range', 'match', 'not',
]);

class QueryBuilder {
  private steps: string[] = [];
  private args: unknown[][] = [];
  private payload?: unknown;
  constructor(private table: string, private resolver: QueryResolver) {
    return new Proxy(this, {
      get(target, prop: string, receiver) {
        if (prop === 'then') {
          // Thenable: awaiting the builder runs the query.
          return (onF: (v: any) => any, onR?: (e: any) => any) => {
            try {
              return Promise.resolve(target.run()).then(onF, onR);
            } catch (e) {
              return onR ? Promise.resolve(onR(e)) : Promise.reject(e);
            }
          };
        }
        if (prop in target && typeof (target as any)[prop] === 'function') {
          return Reflect.get(target, prop, receiver);
        }
        // Any other builder method: record it and stay chainable.
        return (...callArgs: unknown[]) => {
          target.steps.push(prop);
          target.args.push(callArgs);
          if (prop === 'insert' || prop === 'update' || prop === 'upsert') {
            target.payload = callArgs[0];
          }
          // maybeSingle/single/csv/then-less terminals still return the builder;
          // the actual run happens on await (then) or explicit terminal below.
          if (prop === 'maybeSingle' || prop === 'single') {
            return target.terminal();
          }
          return receiver;
        };
      },
    });
  }

  private context(): QueryContext {
    const eq: Record<string, unknown> = {};
    this.steps.forEach((s, i) => { if (s === 'eq') eq[String(this.args[i][0])] = this.args[i][1]; });
    return { table: this.table, steps: this.steps, args: this.args, payload: this.payload, eq };
  }

  private run() {
    const r = this.resolver(this.context()) ?? {};
    return { data: r.data ?? null, error: r.error ?? null, count: r.count ?? null };
  }

  // maybeSingle()/single() are awaited themselves: return a resolved thenable.
  private terminal() {
    return Promise.resolve(this.run());
  }
}

/**
 * Build a Supabase-client stub. `resolver` receives every query's context and
 * returns its result. Return `undefined` to get the default empty `{data:null}`.
 * `rpcResolver` (optional) handles `.rpc(name, args)` calls.
 */
export function makeSupabaseMock(
  resolver: QueryResolver,
  rpcResolver?: (name: string, args: unknown) => { data?: unknown; error?: unknown } | undefined,
) {
  return {
    from(table: string) {
      return new QueryBuilder(table, resolver) as any;
    },
    rpc(name: string, args: unknown) {
      const r = rpcResolver?.(name, args) ?? {};
      return Promise.resolve({ data: r.data ?? null, error: r.error ?? null });
    },
    auth: {
      // Overridden per-test where auth matters.
      getUser: async () => ({ data: { user: null }, error: null }),
    },
  };
}
