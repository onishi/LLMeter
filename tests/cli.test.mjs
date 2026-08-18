import test from 'node:test';
import assert from 'node:assert/strict';
import { parseArgs, runCli } from '../src/cli.mjs';
import { formatSnapshot } from '../src/format.mjs';

function memoryStream(isTTY = false) {
  return {
    isTTY,
    value: '',
    write(chunk) {
      this.value += chunk;
    },
  };
}

const payload = {
  version: 1,
  updatedAt: '2026-08-17T05:31:00.000Z',
  services: [
    {
      id: 'claude',
      status: 'connected',
      source: 'Claude Code status line',
      metrics: [
        { id: 'five-hour', label: '5時間の利用枠', usedPercent: 26, remainingPercent: 74, resetsAt: 1786948200 },
        { id: 'seven-day', label: '7日間の利用枠', usedPercent: 40, remainingPercent: 60, resetsAt: 1787155200 },
      ],
    },
    { id: 'copilot', status: 'not_connected', source: 'GitHub Billing API', message: 'Plan: Read トークンが必要', metrics: [] },
  ],
};

test('parses JSON and watch options', () => {
  assert.deepEqual(parseArgs(['--json', '--watch', '30', '--no-color']), {
    command: 'status',
    json: true,
    watchSeconds: 30,
    color: false,
    help: false,
    version: false,
    openBrowser: true,
  });
  assert.equal(parseArgs(['--watch=1']).watchSeconds, 1);
});

test('parses the GitHub auth command', () => {
  const options = parseArgs(['auth', 'github', '--no-open']);
  assert.equal(options.command, 'auth-github');
  assert.equal(options.openBrowser, false);
});

test('parses the Claude refresh command', () => {
  const options = parseArgs(['refresh', 'claude', '--json', '--no-color']);
  assert.equal(options.command, 'refresh-claude');
  assert.equal(options.json, true);
  assert.equal(options.color, false);
});

test('rejects invalid options', () => {
  assert.throws(() => parseArgs(['--watch', '0']), /greater than or equal to 1/);
  assert.throws(() => parseArgs(['--unknown']), /Unknown option/);
});

test('formats connected and disconnected services without ANSI by default', () => {
  const output = formatSnapshot(payload, { color: false, timeZone: 'UTC', columns: 80 });
  assert.match(output, /LLMeter\s+UPDATED/);
  assert.match(output, /● Claude\s+接続済み/);
  assert.match(output, /5時間\s+█+░+\s+74%/);
  assert.match(output, /7日間\s+█+░+\s+60%/);
  assert.match(output, /○ Copilot\s+未接続/);
  assert.match(output, /GitHub Billing API · Plan: Read トークンが必要/);
  assert.match(output, /接続 1\/2\s+·\s+未接続・取得不可 1/);
  assert.doesNotMatch(output, /\u001b\[/);
});

test('adds ANSI styling only when requested', () => {
  const output = formatSnapshot(payload, { color: true, timeZone: 'UTC', columns: 80 });
  assert.match(output, /\u001b\[/);
});

test('outputs normalized JSON without invoking external formatting', async () => {
  const stdout = memoryStream();
  const stderr = memoryStream();
  const exitCode = await runCli(['--json'], { stdout, stderr, collect: async () => payload });

  assert.equal(exitCode, 0);
  assert.deepEqual(JSON.parse(stdout.value), payload);
  assert.equal(stderr.value, '');
});

test('returns usage error code for an unknown option', async () => {
  const stdout = memoryStream();
  const stderr = memoryStream();
  const exitCode = await runCli(['wat'], { stdout, stderr, collect: async () => payload });

  assert.equal(exitCode, 2);
  assert.match(stderr.value, /Unknown option: wat/);
});

test('routes the GitHub auth command without collecting usage', async () => {
  const stdout = memoryStream();
  const stderr = memoryStream();
  const stdin = { isTTY: true };
  let received;
  const exitCode = await runCli(['auth', 'github', '--no-open'], {
    stdin,
    stdout,
    stderr,
    collect: async () => assert.fail('usage collection should not run'),
    authenticateGitHub: (options) => {
      received = options;
      return 0;
    },
  });

  assert.equal(exitCode, 0);
  assert.equal(received.stdin, stdin);
  assert.equal(received.openBrowser, false);
});

test('refreshes Claude before collecting a new snapshot', async () => {
  const stdout = memoryStream();
  const stderr = memoryStream();
  let refreshed = false;
  const exitCode = await runCli(['refresh', 'claude', '--json'], {
    stdout,
    stderr,
    refreshClaude: async () => {
      refreshed = true;
      return { ok: true };
    },
    collect: async () => {
      assert.equal(refreshed, true);
      return payload;
    },
  });

  assert.equal(exitCode, 0);
  assert.deepEqual(JSON.parse(stdout.value), payload);
  assert.match(stderr.value, /Claudeの利用枠を更新中/);
});
