import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  readEasProfileEnvironment,
  runReleasePreflight,
  validateReleaseEnvironment,
} from './release-preflight.mjs';

const jwt = (role) => [
  Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'),
  Buffer.from(JSON.stringify({ role })).toString('base64url'),
  'test-signature',
].join('.');

const live = {
  EXPO_PUBLIC_SUPABASE_URL: 'https://project-ref.supabase.co',
  EXPO_PUBLIC_SUPABASE_ANON_KEY: jwt('anon'),
};

test('accepts legacy anon and current publishable public keys', () => {
  assert.doesNotThrow(() => validateReleaseEnvironment(live));
  assert.doesNotThrow(() => validateReleaseEnvironment({
    ...live,
    EXPO_PUBLIC_SUPABASE_ANON_KEY: 'sb_publishable_test-only-value',
  }));
});

test('rejects blank and placeholder release configuration', () => {
  assert.throws(
    () => validateReleaseEnvironment({ EXPO_PUBLIC_SUPABASE_URL: '', EXPO_PUBLIC_SUPABASE_ANON_KEY: 'your-anon-key' }),
    /must be a live project URL[\s\S]*must be a public anon or publishable key/,
  );
});

test('rejects secret and service-role keys without printing their values', () => {
  const secret = 'sb_secret_sensitive-test-value';
  assert.throws(
    () => validateReleaseEnvironment({ ...live, EXPO_PUBLIC_SUPABASE_ANON_KEY: secret }),
    (error) => error instanceof Error && /must never contain a secret key/.test(error.message) && !error.message.includes(secret),
  );
  assert.throws(
    () => validateReleaseEnvironment({ ...live, EXPO_PUBLIC_SUPABASE_ANON_KEY: jwt('service_role') }),
    /legacy anon JWT or publishable key/,
  );
});

test('requires an explicit bounded Android version code for Play builds', () => {
  assert.throws(() => validateReleaseEnvironment(live, { requireAndroidVersionCode: true }), /ANDROID_VERSION_CODE/);
  assert.throws(
    () => validateReleaseEnvironment({ ...live, ANDROID_VERSION_CODE: '0' }, { requireAndroidVersionCode: true }),
    /ANDROID_VERSION_CODE/,
  );
  assert.doesNotThrow(() => validateReleaseEnvironment(
    { ...live, ANDROID_VERSION_CODE: '42' },
    { requireAndroidVersionCode: true },
  ));
});

test('loads and validates only the selected EAS profile environment', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rj44-release-preflight-'));
  fs.writeFileSync(path.join(dir, 'eas.json'), JSON.stringify({
    build: { preview: { env: live }, broken: { env: {} } },
  }));
  assert.deepEqual(readEasProfileEnvironment(path.join(dir, 'eas.json'), 'preview'), live);
  assert.doesNotThrow(() => runReleasePreflight(['--eas-profile', 'preview'], {}, dir));
  assert.throws(() => runReleasePreflight(['--eas-profile', 'broken'], {}, dir), /Release preflight failed/);
});
