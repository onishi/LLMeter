import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGitHubTokenUrl, connectGitHub, GITHUB_KEYCHAIN_SERVICE, readGitHubToken } from '../src/github-auth.mjs';
import { collectGitHub } from '../src/providers/github.mjs';

function memoryStream() {
  return {
    value: '',
    write(chunk) {
      this.value += chunk;
    },
  };
}

test('builds a minimal Plan: Read token URL', () => {
  const url = new URL(buildGitHubTokenUrl('onishi'));
  assert.equal(url.origin, 'https://github.com');
  assert.equal(url.searchParams.get('target_name'), 'onishi');
  assert.equal(url.searchParams.get('plan'), 'read');
  assert.equal(url.searchParams.get('expires_in'), '90');
  assert.equal(url.searchParams.has('contents'), false);
});

test('prefers an environment token without invoking Keychain', () => {
  const token = readGitHubToken({
    login: 'onishi',
    environment: { LLMETER_GITHUB_TOKEN: 'github_pat_test' },
    spawnCommand: () => assert.fail('Keychain should not be called'),
  });
  assert.equal(token, 'github_pat_test');
});

test('stores a token through the secure macOS Keychain prompt', () => {
  const calls = [];
  const stdout = memoryStream();
  const stderr = memoryStream();
  const exitCode = connectGitHub({
    stdin: { isTTY: true },
    stdout,
    stderr,
    openBrowser: false,
    platform: 'darwin',
    spawnCommand: (command, args, options) => {
      calls.push({ command, args, options });
      if (command === 'gh') return { status: 0, stdout: 'onishi\n' };
      return { status: 0, stdout: '' };
    },
  });

  assert.equal(exitCode, 0);
  const keychainCall = calls.find((call) => call.command === 'security');
  assert.equal(keychainCall.args.at(-1), '-w');
  assert.equal(keychainCall.args.includes(GITHUB_KEYCHAIN_SERVICE), true);
  assert.match(stdout.value, /Plan: Read/);
  assert.equal(stderr.value, '');
});

test('uses the dedicated token only in the GitHub API environment', () => {
  let apiEnvironment;
  const service = collectGitHub({
    environment: { PATH: '/usr/bin' },
    now: () => new Date('2026-08-17T00:00:00.000Z'),
    readToken: () => 'github_pat_secret',
    spawnCommand: (command, args, options) => {
      if (args[0] === 'auth') return { status: 0, stdout: '' };
      if (args[1] === 'user') return { status: 0, stdout: 'onishi\n' };
      apiEnvironment = options.env;
      return {
        status: 0,
        stdout: JSON.stringify({
          timePeriod: { year: 2026, month: 8 },
          usageItems: [{ grossQuantity: 26.561385, netQuantity: 0 }],
        }),
      };
    },
  });

  assert.equal(service.status, 'connected');
  assert.equal(service.metrics[0].usedValue, 26.561385);
  assert.equal(service.metrics[0].limitValue, 1_500);
  assert.equal(service.metrics[0].remainingValue, 1_473.438615);
  assert.equal(service.metrics[0].remainingPercent, 98);
  assert.equal(service.metrics[0].resetsAt, Date.UTC(2026, 8, 1) / 1_000);
  assert.equal(apiEnvironment.GH_TOKEN, 'github_pat_secret');
});

test('asks for LLMeter auth when no dedicated token exists', () => {
  const service = collectGitHub({
    readToken: () => null,
    spawnCommand: (command, args) => args[0] === 'auth'
      ? { status: 0, stdout: '' }
      : { status: 0, stdout: 'onishi\n' },
  });
  assert.equal(service.status, 'not_connected');
  assert.match(service.message, /llmeter auth github/);
});
