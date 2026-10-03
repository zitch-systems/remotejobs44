import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import path from 'node:path';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';

type QueryResult = { data: unknown; error: null | { code?: string } };

type RuntimeOptions = {
  user?: null | { id: string; email?: string; email_confirmed_at?: string | null };
  authError?: null | { message: string };
  authThrow?: Error;
  profile?: QueryResult;
  subscription?: QueryResult;
  fulfillment?: QueryResult;
  fetchImpl?: (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
};

const ROOT = path.resolve(__dirname, '../..');
const USER = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'member@example.com',
  email_confirmed_at: '2026-01-01T00:00:00.000Z',
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

async function edgeRuntime(
  relativePath: 'supabase/functions/paystack-initialize/index.ts' | 'supabase/functions/paystack-verify/index.ts',
  options: RuntimeOptions = {},
) {
  const source = await readFile(path.join(ROOT, relativePath), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;

  const profile = options.profile ?? {
    data: { role: 'user', plan: 'free', plan_expires_at: null, suspended: false },
    error: null,
  };
  const subscription = options.subscription ?? { data: null, error: null };
  const fulfillment = options.fulfillment ?? {
    data: { credited: true, plan: 'pro', expires_at: '2026-11-02T00:00:00.000Z' },
    error: null,
  };
  const rpc = vi.fn(async () => fulfillment);
  const createClient = vi.fn((_url: string, key: string) => {
    if (key === 'anon-key') {
      return {
        auth: {
          getUser: vi.fn(async () => {
            if (options.authThrow) throw options.authThrow;
            return {
              data: { user: options.user === undefined ? USER : options.user },
              error: options.authError ?? null,
            };
          }),
        },
      };
    }
    return {
      from: vi.fn((table: string) => {
        const result = table === 'profiles' ? profile : subscription;
        const query = {
          select: vi.fn(() => query),
          eq: vi.fn(() => query),
          maybeSingle: vi.fn(async () => result),
        };
        return query;
      }),
      rpc,
    };
  });

  let handler: ((request: Request) => Promise<Response>) | undefined;
  const fetchMock = vi.fn(options.fetchImpl ?? (async () => jsonResponse({ status: false })));
  const context = vm.createContext({
    AbortSignal,
    console: { error: vi.fn(), log: vi.fn(), warn: vi.fn() },
    Deno: {
      env: {
        get: (name: string) => ({
          PAYSTACK_SECRET_KEY: 'paystack-secret',
          SUPABASE_URL: 'https://project.supabase.co',
          SUPABASE_ANON_KEY: 'anon-key',
          SUPABASE_SERVICE_ROLE_KEY: 'service-key',
        })[name],
      },
      serve: (candidate: (request: Request) => Promise<Response>) => { handler = candidate; },
    },
    exports: {},
    fetch: fetchMock,
    Headers,
    module: { exports: {} },
    Request,
    Response,
    require: (specifier: string) => {
      if (specifier === 'https://esm.sh/@supabase/supabase-js@2.106.1') return { createClient };
      throw new Error(`Unexpected edge import: ${specifier}`);
    },
    URL,
  });
  new vm.Script(compiled, { filename: relativePath }).runInContext(context);
  if (!handler) throw new Error('Edge function did not register a handler');

  return {
    fetchMock,
    rpc,
    request: (body: unknown, rawBody?: string) => handler!(new Request('https://edge.example.test', {
      method: 'POST',
      headers: { Authorization: 'Bearer user-jwt', 'Content-Type': 'application/json' },
      body: rawBody ?? JSON.stringify(body),
    })),
  };
}

function checkoutBody(overrides: Record<string, unknown> = {}) {
  return {
    status: true,
    data: {
      authorization_url: 'https://checkout.paystack.com/abc_123',
      reference: 'safe_ref-123',
      ...overrides,
    },
  };
}

function transactionBody(overrides: Record<string, unknown> = {}) {
  return {
    status: true,
    data: {
      status: 'success',
      amount: 299_900,
      currency: 'NGN',
      metadata: { user_id: USER.id, selection: 'pro' },
      customer: { customer_code: 'CUS_123' },
      ...overrides,
    },
  };
}

describe('paystack-initialize edge function', () => {
  it('requires a confirmed email before calling Paystack', async () => {
    const edge = await edgeRuntime('supabase/functions/paystack-initialize/index.ts', {
      user: { ...USER, email_confirmed_at: null },
    });
    const response = await edge.request({ plan: 'daily' });

    expect(response.status).toBe(403);
    expect((await response.json()).error).toMatch(/confirm your email/i);
    expect(edge.fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ['missing profile', { data: null, error: null }],
    ['profile read error', { data: null, error: { code: 'PGRST500' } }],
  ])('fails closed on %s', async (_label, profile) => {
    const edge = await edgeRuntime('supabase/functions/paystack-initialize/index.ts', { profile });
    const response = await edge.request({ plan: 'daily' });

    expect(response.status).toBe(503);
    expect(edge.fetchMock).not.toHaveBeenCalled();
  });

  it('denies a suspended account', async () => {
    const edge = await edgeRuntime('supabase/functions/paystack-initialize/index.ts', {
      profile: { data: { role: 'user', plan: 'free', suspended: true }, error: null },
    });
    const response = await edge.request({ plan: 'pro' });

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'Account suspended' });
    expect(edge.fetchMock).not.toHaveBeenCalled();
  });

  it('fails closed when annual/monthly billing cannot be read', async () => {
    const edge = await edgeRuntime('supabase/functions/paystack-initialize/index.ts', {
      profile: {
        data: { role: 'user', plan: 'pro', plan_expires_at: '2099-01-01T00:00:00.000Z', suspended: false },
        error: null,
      },
      subscription: { data: null, error: { code: 'PGRST500' } },
    });
    const response = await edge.request({ plan: 'annual' });

    expect(response.status).toBe(503);
    expect(edge.fetchMock).not.toHaveBeenCalled();
  });

  it('treats a null-expiry manual Pro grant as active', async () => {
    const edge = await edgeRuntime('supabase/functions/paystack-initialize/index.ts', {
      profile: {
        data: { role: 'user', plan: 'pro', plan_expires_at: null, suspended: false },
        error: null,
      },
      subscription: { data: { billing: 'monthly' }, error: null },
    });

    expect((await edge.request({ plan: 'daily' })).status).toBe(409);
    expect(edge.fetchMock).not.toHaveBeenCalled();
  });

  it('fails closed on a malformed plan expiry', async () => {
    const edge = await edgeRuntime('supabase/functions/paystack-initialize/index.ts', {
      profile: {
        data: { role: 'user', plan: 'pro', plan_expires_at: 'not-a-date', suspended: false },
        error: null,
      },
    });

    expect((await edge.request({ plan: 'annual' })).status).toBe(503);
    expect(edge.fetchMock).not.toHaveBeenCalled();
  });

  it('allows a monthly-to-annual upgrade and sends the fixed HTTPS callback', async () => {
    const fetchImpl = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) =>
      jsonResponse(checkoutBody()));
    const edge = await edgeRuntime('supabase/functions/paystack-initialize/index.ts', {
      profile: {
        data: { role: 'user', plan: 'pro', plan_expires_at: '2099-01-01T00:00:00.000Z', suspended: false },
        error: null,
      },
      subscription: { data: { billing: 'monthly' }, error: null },
      fetchImpl,
    });
    const response = await edge.request({ plan: 'annual' });

    expect(response.status).toBe(200);
    const [, init] = fetchImpl.mock.calls[0];
    const sent = JSON.parse(String(init?.body));
    expect(sent.callback_url).toBe('https://remotejobs44.com/mobile/payment-return');
    expect(sent.amount).toBe(2_999_900);
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it.each([
    ['monthly rebuy', { billing: 'monthly' }, 'pro'],
    ['annual downgrade', { billing: 'annually' }, 'pro'],
    ['annual rebuy', { billing: 'annually' }, 'annual'],
  ])('blocks %s as a non-upgrade', async (_label, subscriptionData, requestedPlan) => {
    const edge = await edgeRuntime('supabase/functions/paystack-initialize/index.ts', {
      profile: {
        data: { role: 'user', plan: 'pro', plan_expires_at: '2099-01-01T00:00:00.000Z', suspended: false },
        error: null,
      },
      subscription: { data: subscriptionData, error: null },
    });
    const response = await edge.request({ plan: requestedPlan });

    expect(response.status).toBe(409);
    expect(edge.fetchMock).not.toHaveBeenCalled();
  });

  it('keeps the admin purchase bypass', async () => {
    const edge = await edgeRuntime('supabase/functions/paystack-initialize/index.ts', {
      profile: {
        data: { role: 'admin', plan: 'pro', plan_expires_at: '2099-01-01T00:00:00.000Z', suspended: false },
        error: null,
      },
      fetchImpl: async () => jsonResponse(checkoutBody()),
    });

    expect((await edge.request({ plan: 'daily' })).status).toBe(200);
  });

  it('rejects inherited plan keys before any provider call', async () => {
    const edge = await edgeRuntime('supabase/functions/paystack-initialize/index.ts');
    const response = await edge.request({ plan: '__proto__' });

    expect(response.status).toBe(400);
    expect(edge.fetchMock).not.toHaveBeenCalled();
  });

  it('handles null JSON and auth transport errors without exposing runtime details', async () => {
    const nullJson = await edgeRuntime('supabase/functions/paystack-initialize/index.ts');
    expect((await nullJson.request(null)).status).toBe(400);

    const authFailure = await edgeRuntime('supabase/functions/paystack-initialize/index.ts', {
      authThrow: new Error('private auth transport detail'),
    });
    const response = await authFailure.request({ plan: 'daily' });
    expect(response.status).toBe(503);
    expect(JSON.stringify(await response.json())).not.toContain('private');
  });

  it.each([
    'http://checkout.paystack.com/session',
    'https://user:pass@checkout.paystack.com/session',
    'https://checkout.paystack.com:8443/session',
    'https://checkout.paystack.com.evil.test/session',
  ])('rejects an unsafe checkout URL: %s', async (authorizationUrl) => {
    const edge = await edgeRuntime('supabase/functions/paystack-initialize/index.ts', {
      fetchImpl: async () => jsonResponse(checkoutBody({ authorization_url: authorizationUrl })),
    });
    const response = await edge.request({ plan: 'daily' });

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'Could not start payment. Please try again.' });
  });

  it('rejects an unsafe reference and sanitizes provider/network failures', async () => {
    const invalidReference = await edgeRuntime('supabase/functions/paystack-initialize/index.ts', {
      fetchImpl: async () => jsonResponse(checkoutBody({ reference: 'bad/ref' })),
    });
    expect((await invalidReference.request({ plan: 'daily' })).status).toBe(503);

    const upstream = await edgeRuntime('supabase/functions/paystack-initialize/index.ts', {
      fetchImpl: async () => jsonResponse({ status: false, message: 'Invalid secret key sk_live_PRIVATE' }, 401),
    });
    const upstreamResponse = await upstream.request({ plan: 'daily' });
    expect(upstreamResponse.status).toBe(503);
    expect(JSON.stringify(await upstreamResponse.json())).not.toContain('PRIVATE');

    const network = await edgeRuntime('supabase/functions/paystack-initialize/index.ts', {
      fetchImpl: async () => { throw new Error('socket secret detail'); },
    });
    const networkResponse = await network.request({ plan: 'daily' });
    expect(networkResponse.status).toBe(503);
    expect(JSON.stringify(await networkResponse.json())).not.toContain('socket');
  });
});

describe('paystack-verify edge function', () => {
  it.each(['pending', 'ongoing', 'processing', 'abandoned', 'failed', 'reversed'])(
    'returns owned %s transactions as a specific 402',
    async (status) => {
      const edge = await edgeRuntime('supabase/functions/paystack-verify/index.ts', {
        fetchImpl: async () => jsonResponse(transactionBody({ status })),
      });
      const response = await edge.request({ reference: 'ref_pending' });

      expect(response.status).toBe(402);
      expect(await response.json()).toEqual({
        ok: false,
        error: 'Payment not completed.',
        transaction_status: status,
      });
      expect(edge.rpc).not.toHaveBeenCalled();
    },
  );

  it('checks metadata ownership before disclosing transaction status', async () => {
    const edge = await edgeRuntime('supabase/functions/paystack-verify/index.ts', {
      fetchImpl: async () => jsonResponse(transactionBody({
        status: 'pending',
        metadata: { user_id: 'someone-else', selection: 'pro' },
      })),
    });
    const response = await edge.request({ reference: 'ref_other_user' });
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body).toEqual({ ok: false, error: 'Reference does not match this account.' });
    expect(body).not.toHaveProperty('transaction_status');
  });

  it('maps non-2xx, malformed provider data, and network errors to retryable 503s', async () => {
    const cases: RuntimeOptions['fetchImpl'][] = [
      async () => jsonResponse({ status: false, message: 'secret upstream detail' }, 500),
      async () => jsonResponse({ status: true, data: { metadata: { user_id: USER.id } } }),
      async () => { throw new Error('network secret detail'); },
    ];
    for (const fetchImpl of cases) {
      const edge = await edgeRuntime('supabase/functions/paystack-verify/index.ts', { fetchImpl });
      const response = await edge.request({ reference: 'ref_retry' });
      expect(response.status).toBe(503);
      expect(JSON.stringify(await response.json())).not.toMatch(/secret detail/);
      expect(edge.rpc).not.toHaveBeenCalled();
    }
  });

  it('rejects inherited plan metadata and unsafe references', async () => {
    const inheritedPlan = await edgeRuntime('supabase/functions/paystack-verify/index.ts', {
      fetchImpl: async () => jsonResponse(transactionBody({
        metadata: { user_id: USER.id, selection: '__proto__' },
      })),
    });
    expect((await inheritedPlan.request({ reference: 'ref_safe' })).status).toBe(400);
    expect(inheritedPlan.rpc).not.toHaveBeenCalled();

    const unsafeReference = await edgeRuntime('supabase/functions/paystack-verify/index.ts');
    expect((await unsafeReference.request({ reference: '../unsafe' })).status).toBe(400);
    expect(unsafeReference.fetchMock).not.toHaveBeenCalled();
  });

  it('handles null JSON and auth transport errors as sanitized failures', async () => {
    const nullJson = await edgeRuntime('supabase/functions/paystack-verify/index.ts');
    expect((await nullJson.request(null)).status).toBe(400);

    const authFailure = await edgeRuntime('supabase/functions/paystack-verify/index.ts', {
      authThrow: new Error('private auth transport detail'),
    });
    const response = await authFailure.request({ reference: 'valid_ref' });
    expect(response.status).toBe(503);
    expect(JSON.stringify(await response.json())).not.toContain('private');
  });

  it('fulfills a valid successful charge through the atomic RPC', async () => {
    const edge = await edgeRuntime('supabase/functions/paystack-verify/index.ts', {
      fetchImpl: async () => jsonResponse(transactionBody({
        amount: 2_999_900,
        metadata: { user_id: USER.id, selection: 'annual' },
      })),
    });
    const response = await edge.request({ reference: 'annual_ref' });

    expect(response.status).toBe(200);
    expect(edge.rpc).toHaveBeenCalledWith('fulfill_paystack_charge', {
      p_reference: 'annual_ref',
      p_user_id: USER.id,
      p_selection: 'pro_annual',
      p_amount: 2_999_900,
      p_currency: 'NGN',
      p_customer_code: 'CUS_123',
    });
  });
});
