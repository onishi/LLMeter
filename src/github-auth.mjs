import { spawnSync } from 'node:child_process';

export const GITHUB_KEYCHAIN_SERVICE = 'dev.llmeter.github.plan';

export function buildGitHubTokenUrl(login) {
  const parameters = new URLSearchParams({
    name: 'LLMeter',
    description: 'Read personal Copilot billing usage',
    target_name: login,
    expires_in: '90',
    plan: 'read',
  });
  return `https://github.com/settings/personal-access-tokens/new?${parameters}`;
}

export function readGitHubToken({
  login,
  environment = process.env,
  platform = process.platform,
  spawnCommand = spawnSync,
} = {}) {
  if (environment.LLMETER_GITHUB_TOKEN?.trim()) return environment.LLMETER_GITHUB_TOKEN.trim();
  if (platform !== 'darwin' || !login) return null;
  const result = spawnCommand('security', [
    'find-generic-password', '-a', login, '-s', GITHUB_KEYCHAIN_SERVICE, '-w',
  ], { encoding: 'utf8', timeout: 5_000 });
  return result.status === 0 && result.stdout?.trim() ? result.stdout.trim() : null;
}

export function connectGitHub({
  stdin = process.stdin,
  stdout = process.stdout,
  stderr = process.stderr,
  platform = process.platform,
  spawnCommand = spawnSync,
  openBrowser = true,
} = {}) {
  if (!stdin.isTTY) {
    stderr.write('llmeter: GitHub connection requires an interactive terminal.\n');
    return 2;
  }

  const loginResult = spawnCommand('gh', ['api', 'user', '--jq', '.login'], { encoding: 'utf8', timeout: 10_000 });
  const login = loginResult.status === 0 ? loginResult.stdout.trim() : '';
  if (!/^[A-Za-z0-9-]{1,39}$/.test(login)) {
    stderr.write('llmeter: Run `gh auth login` before connecting Copilot.\n');
    return 1;
  }
  if (platform !== 'darwin') {
    stderr.write('llmeter: Automatic credential storage currently supports macOS. Set LLMETER_GITHUB_TOKEN instead.\n');
    return 1;
  }

  const url = buildGitHubTokenUrl(login);
  stdout.write('GitHub Copilot connection\n\n');
  stdout.write('1. Generate the preconfigured fine-grained token in your browser.\n');
  stdout.write('2. Keep the preselected `Plan: Read` permission and click Generate token.\n');
  stdout.write('3. Copy the token, return here, and paste it at the secure keychain prompt.\n\n');
  stdout.write(`${url}\n\n`);

  if (openBrowser) spawnCommand('open', [url], { stdio: 'ignore', timeout: 5_000 });
  stdout.write('The token is stored in macOS Keychain and is not written to the repository.\n');
  const storeResult = spawnCommand('security', [
    'add-generic-password',
    '-a', login,
    '-s', GITHUB_KEYCHAIN_SERVICE,
    '-l', 'LLMeter GitHub Plan API',
    '-j', 'Fine-grained token with Plan: Read only',
    '-U',
    '-w',
  ], { stdio: 'inherit' });
  if (storeResult.status !== 0) {
    stderr.write('llmeter: The GitHub token was not stored.\n');
    return 1;
  }
  stdout.write('\nGitHub credential saved. Run `llmeter` to verify Copilot usage.\n');
  return 0;
}
