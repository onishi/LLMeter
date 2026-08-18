import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { disconnected, percentMetric } from '../service.mjs';
import { getStateDirectory } from '../state.mjs';

const legacyCachePath = fileURLToPath(new URL('../../.llmeter/claude-usage.json', import.meta.url));

function readCache(paths) {
  for (const path of paths) {
    try {
      return JSON.parse(readFileSync(path, 'utf8'));
    } catch {
      // Try the next supported cache location.
    }
  }
  return null;
}

export function collectClaude({
  environment = process.env,
  spawnCommand = spawnSync,
  cachePaths,
  now = () => new Date(),
} = {}) {
  const paths = cachePaths ?? [join(getStateDirectory(environment), 'claude-usage.json'), legacyCachePath];
  const cache = readCache(paths);
  const collectedMetrics = [
    percentMetric('five-hour', '5時間の利用枠', cache?.rateLimits?.fiveHour),
    percentMetric('seven-day', '7日間の利用枠', cache?.rateLimits?.sevenDay),
    percentMetric('seven-day-sonnet', '7日間·Sonnet', cache?.rateLimits?.sevenDaySonnet),
    percentMetric('seven-day-opus', '7日間·Opus', cache?.rateLimits?.sevenDayOpus),
  ].filter(Boolean);
  const nowEpochSeconds = Math.floor(now().getTime() / 1000);
  const metrics = collectedMetrics.filter((metric) => !metric.resetsAt || metric.resetsAt > nowEpochSeconds);
  if (metrics.length) {
    return {
      id: 'claude',
      status: 'connected',
      source: 'Claude Code status line',
      observedAt: typeof cache?.updatedAt === 'string' ? cache.updatedAt : null,
      expiredMetrics: collectedMetrics.length - metrics.length,
      metrics,
    };
  }

  const auth = spawnCommand('claude', ['auth', 'status'], { encoding: 'utf8', timeout: 5_000 });
  let loggedIn = false;
  try {
    loggedIn = auth.status === 0 && JSON.parse(auth.stdout)?.loggedIn === true;
  } catch {
    loggedIn = false;
  }
  if (loggedIn) {
    return disconnected('claude', 'Claude Code status line', 'statusLine を設定し、Claude Code で1度応答を取得してください。');
  }
  return disconnected('claude', 'Claude Code status line', 'Claude Code にログインしてください。');
}
