import { setTimeout as delay } from 'node:timers/promises';
import { refreshClaudeUsage } from './claude-refresh.mjs';
import { collectUsage } from './collect.mjs';
import { formatSnapshot } from './format.mjs';
import { connectGitHub } from './github-auth.mjs';

export const VERSION = '1.0.0';

export const HELP = `Usage: llmeter [options]
       llmeter auth github [--no-open]
       llmeter refresh claude [--json] [--no-color]

Local quota meter for Claude, Codex, and GitHub Copilot.

Commands:
  auth github        Connect a Plan: Read token using macOS Keychain
  refresh claude     Refresh Claude quotas through the official Claude CLI

Options:
  --json             Output the normalized payload as JSON
  --watch <seconds>  Refresh continuously (minimum: 1 second)
  --no-color         Disable ANSI colors
  -h, --help         Show this help
  -v, --version      Show the version`;

export function parseArgs(args) {
  const options = { command: 'status', json: false, watchSeconds: null, color: true, help: false, version: false, openBrowser: true };
  if (args[0] === 'auth') {
    if (args[1] !== 'github') throw new Error('Usage: llmeter auth github [--no-open]');
    options.command = 'auth-github';
    for (const argument of args.slice(2)) {
      if (argument === '--no-open') options.openBrowser = false;
      else if (argument === '-h' || argument === '--help') options.help = true;
      else throw new Error(`Unknown option: ${argument}`);
    }
    return options;
  }
  if (args[0] === 'refresh') {
    if (args[1] !== 'claude') throw new Error('Usage: llmeter refresh claude [--json] [--no-color]');
    options.command = 'refresh-claude';
    for (const argument of args.slice(2)) {
      if (argument === '--json') options.json = true;
      else if (argument === '--no-color') options.color = false;
      else if (argument === '-h' || argument === '--help') options.help = true;
      else throw new Error(`Unknown option: ${argument}`);
    }
    return options;
  }
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--json') options.json = true;
    else if (argument === '--no-color') options.color = false;
    else if (argument === '-h' || argument === '--help') options.help = true;
    else if (argument === '-v' || argument === '--version') options.version = true;
    else if (argument === '--watch' || argument.startsWith('--watch=')) {
      const raw = argument === '--watch' ? args[++index] : argument.slice('--watch='.length);
      const seconds = Number(raw);
      if (!Number.isFinite(seconds) || seconds < 1) throw new Error('--watch requires a number of seconds greater than or equal to 1.');
      options.watchSeconds = seconds;
    } else {
      throw new Error(`Unknown option: ${argument}`);
    }
  }
  return options;
}

function outputSnapshot(payload, options, stdout) {
  if (options.json) {
    const json = options.watchSeconds ? JSON.stringify(payload) : JSON.stringify(payload, null, 2);
    stdout.write(`${json}\n`);
    return;
  }
  if (options.watchSeconds && stdout.isTTY) stdout.write('\u001b[2J\u001b[H');
  stdout.write(`${formatSnapshot(payload, {
    color: options.color && Boolean(stdout.isTTY),
    columns: stdout.columns,
  })}\n`);
}

export async function runCli(args, {
  stdin = process.stdin,
  stdout = process.stdout,
  stderr = process.stderr,
  collect = collectUsage,
  wait = delay,
  authenticateGitHub = connectGitHub,
  refreshClaude = refreshClaudeUsage,
} = {}) {
  let options;
  try {
    options = parseArgs(args);
  } catch (error) {
    stderr.write(`llmeter: ${error.message}\nTry 'llmeter --help' for usage.\n`);
    return 2;
  }

  if (options.help) {
    stdout.write(`${HELP}\n`);
    return 0;
  }
  if (options.version) {
    stdout.write(`${VERSION}\n`);
    return 0;
  }
  if (options.command === 'auth-github') {
    return authenticateGitHub({ stdin, stdout, stderr, openBrowser: options.openBrowser });
  }
  if (options.command === 'refresh-claude') {
    stderr.write('Claudeの利用枠を更新中…\n');
    const result = await refreshClaude();
    if (!result.ok) {
      stderr.write(`llmeter: ${result.message}\n`);
      return 1;
    }
    const payload = await collect();
    outputSnapshot(payload, options, stdout);
    return 0;
  }

  do {
    const payload = await collect();
    outputSnapshot(payload, options, stdout);
    if (!options.watchSeconds) return 0;
    await wait(options.watchSeconds * 1000);
  } while (true);
}
