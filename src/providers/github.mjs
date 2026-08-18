import { spawnSync } from 'node:child_process';
import { readGitHubToken } from '../github-auth.mjs';
import { disconnected } from '../service.mjs';

const INCLUDED_AI_CREDITS = 1_500;

export function collectGitHub({
  spawnCommand = spawnSync,
  readToken = readGitHubToken,
  environment = process.env,
  now = () => new Date(),
} = {}) {
  const auth = spawnCommand('gh', ['auth', 'status'], { encoding: 'utf8', timeout: 5_000 });
  if (auth.status !== 0) return disconnected('copilot', 'GitHub Billing API', 'GitHub CLI に再ログインしてください。');

  try {
    const loginResult = spawnCommand('gh', ['api', 'user', '--jq', '.login'], { encoding: 'utf8', timeout: 10_000 });
    if (loginResult.status !== 0) return disconnected('copilot', 'GitHub Billing API', 'GitHub CLI の認証が切れています。gh auth login で再ログインしてください。');
    const login = loginResult.stdout.trim();
    if (!/^[A-Za-z0-9-]{1,39}$/.test(login)) throw new Error('invalid login');
    const token = readToken({ login, environment, spawnCommand });
    if (!token) return disconnected('copilot', 'GitHub Billing API', '`llmeter auth github` で Plan: Read トークンを接続してください。');
    const current = now();
    const endpoint = `/users/${login}/settings/billing/ai_credit/usage?year=${current.getFullYear()}&month=${current.getMonth() + 1}`;
    const usageResult = spawnCommand('gh', ['api', '-H', 'X-GitHub-Api-Version: 2026-03-10', endpoint], {
      encoding: 'utf8',
      timeout: 15_000,
      env: { ...environment, GH_TOKEN: token },
    });
    if (usageResult.status !== 0) return disconnected('copilot', 'GitHub Billing API', 'LLMeter用トークンが期限切れか、Plan: Read 権限がありません。', 'error');
    const payload = JSON.parse(usageResult.stdout);
    const items = Array.isArray(payload?.usageItems) ? payload.usageItems : [];
    const usedValue = items.reduce((sum, item) => sum + (Number(item?.grossQuantity ?? item?.netQuantity) || 0), 0);
    const remainingValue = Math.max(0, INCLUDED_AI_CREDITS - usedValue);
    const remainingPercent = Math.round((remainingValue / INCLUDED_AI_CREDITS) * 100);
    const usageYear = Number(payload?.timePeriod?.year) || current.getFullYear();
    const usageMonth = Number(payload?.timePeriod?.month) || current.getMonth() + 1;
    const resetsAt = Math.floor(Date.UTC(usageYear, usageMonth, 1) / 1_000);
    return {
      id: 'copilot',
      status: 'connected',
      source: 'GitHub Billing API',
      metrics: [{
        id: 'monthly-ai-credits',
        label: '今月の AI クレジット',
        usedValue,
        limitValue: INCLUDED_AI_CREDITS,
        remainingValue,
        remainingPercent,
        resetsAt,
        unit: 'credits',
      }],
    };
  } catch {
    return disconnected('copilot', 'GitHub Billing API', 'Billing API を読む Plan 権限がある GitHub トークンが必要です。', 'error');
  }
}
