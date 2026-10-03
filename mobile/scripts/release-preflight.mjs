#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const REQUIRED_URL = 'EXPO_PUBLIC_SUPABASE_URL';
const REQUIRED_KEY = 'EXPO_PUBLIC_SUPABASE_ANON_KEY';
const MAX_ANDROID_VERSION_CODE = 2_100_000_000;

function decodeJwtPayload(value) {
  const parts = value.split('.');
  if (parts.length !== 3) return null;
  try {
    return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

export function validateReleaseEnvironment(env, { requireAndroidVersionCode = false } = {}) {
  const errors = [];
  const rawUrl = typeof env[REQUIRED_URL] === 'string' ? env[REQUIRED_URL].trim() : '';
  const key = typeof env[REQUIRED_KEY] === 'string' ? env[REQUIRED_KEY].trim() : '';

  if (!rawUrl || /placeholder|your-project|example\.(?:com|invalid)/i.test(rawUrl)) {
    errors.push(`${REQUIRED_URL} must be a live project URL`);
  } else {
    try {
      const parsed = new URL(rawUrl);
      if (parsed.protocol !== 'https:' || !parsed.hostname || parsed.username || parsed.password) {
        errors.push(`${REQUIRED_URL} must be a credential-free HTTPS URL`);
      }
    } catch {
      errors.push(`${REQUIRED_URL} must be a valid HTTPS URL`);
    }
  }

  if (!key || /placeholder|your-anon-key|example/i.test(key)) {
    errors.push(`${REQUIRED_KEY} must be a public anon or publishable key`);
  } else if (key.startsWith('sb_secret_')) {
    errors.push(`${REQUIRED_KEY} must never contain a secret key`);
  } else if (/^sb_publishable_[A-Za-z0-9_-]{10,}$/.test(key)) {
    // Current Supabase publishable-key format. The prefix identifies its scope.
  } else {
    const payload = decodeJwtPayload(key);
    if (!payload || payload.role !== 'anon') {
      errors.push(`${REQUIRED_KEY} must be a legacy anon JWT or publishable key`);
    }
  }

  if (requireAndroidVersionCode) {
    const value = typeof env.ANDROID_VERSION_CODE === 'string' ? env.ANDROID_VERSION_CODE.trim() : '';
    if (!/^[1-9]\d*$/.test(value) || Number(value) > MAX_ANDROID_VERSION_CODE) {
      errors.push(`ANDROID_VERSION_CODE must be an integer from 1 to ${MAX_ANDROID_VERSION_CODE}`);
    }
  }

  if (errors.length) {
    throw new Error(`Release preflight failed:\n- ${errors.join('\n- ')}`);
  }
}

export function readEasProfileEnvironment(easJsonPath, profileName) {
  const config = JSON.parse(fs.readFileSync(easJsonPath, 'utf8'));
  const profile = config?.build?.[profileName];
  if (!profile) throw new Error(`Release preflight failed: unknown EAS profile "${profileName}"`);
  return profile.env ?? {};
}

function parseArgs(argv) {
  const args = new Set(argv);
  const profileIndex = argv.indexOf('--eas-profile');
  const profile = profileIndex >= 0 ? argv[profileIndex + 1] : null;
  if (profileIndex >= 0 && (!profile || profile.startsWith('--'))) {
    throw new Error('Release preflight failed: --eas-profile requires a profile name');
  }
  return {
    profile,
    environment: args.has('--environment'),
    requireAndroidVersionCode: args.has('--require-android-version-code'),
  };
}

export function runReleasePreflight(argv, processEnv = process.env, cwd = process.cwd()) {
  const options = parseArgs(argv);
  if (Boolean(options.profile) === options.environment) {
    throw new Error('Release preflight failed: choose exactly one of --eas-profile or --environment');
  }
  const env = options.profile
    ? readEasProfileEnvironment(path.join(cwd, 'eas.json'), options.profile)
    : processEnv;
  validateReleaseEnvironment(env, options);
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (import.meta.url === invokedPath) {
  try {
    runReleasePreflight(process.argv.slice(2));
    console.log('Release preflight passed.');
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Release preflight failed.');
    process.exitCode = 1;
  }
}
