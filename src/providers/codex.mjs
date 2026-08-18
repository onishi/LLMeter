import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { disconnected, percentMetric } from '../service.mjs';

function windowLabel(duration, fallback) {
  if (duration === 300) return '5時間の利用枠';
  if (duration === 10_080) return '7日間の利用枠';
  if (duration === 1_440) return '24時間の利用枠';
  return duration ? `${duration}分間の利用枠` : fallback;
}

export function readCodexRateLimits({ spawnCommand = spawn, timeoutMs = 15_000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawnCommand('codex', ['app-server', '--listen', 'stdio://'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: process.env,
    });
    const lines = createInterface({ input: child.stdout });
    child.stderr.resume();
    let settled = false;

    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      lines.close();
      child.stdin.destroy();
      child.kill();
      callback(value);
    };
    const send = (message) => child.stdin.write(`${JSON.stringify(message)}\n`);
    const timer = setTimeout(() => finish(reject, new Error('Codex App Server timed out')), timeoutMs);

    child.on('error', () => finish(reject, new Error('Codex CLI could not be started')));
    child.on('exit', (code) => {
      if (!settled) finish(reject, new Error(`Codex App Server exited (${code ?? 'unknown'})`));
    });
    lines.on('line', (line) => {
      let message;
      try {
        message = JSON.parse(line);
      } catch {
        return;
      }
      if (message.id === 0 && message.result) {
        send({ method: 'initialized', params: {} });
        send({ id: 1, method: 'account/rateLimits/read', params: {} });
      } else if (message.id === 0 && message.error) {
        finish(reject, new Error('Codex App Server initialization failed'));
      } else if (message.id === 1 && message.result) {
        finish(resolve, message.result);
      } else if (message.id === 1 && message.error) {
        finish(reject, new Error('Codex rate limits request failed'));
      }
    });

    send({
      id: 0,
      method: 'initialize',
      params: {
        clientInfo: { name: 'llmeter', title: 'LLMeter', version: '1.0.0' },
        capabilities: { experimentalApi: false },
      },
    });
  });
}

export async function collectCodex(options = {}) {
  try {
    const response = await readCodexRateLimits(options);
    const buckets = response?.rateLimitsByLimitId ? Object.values(response.rateLimitsByLimitId) : [];
    const snapshot = buckets.find((item) => item?.limitId === 'codex') ?? response?.rateLimits;
    const metrics = [
      percentMetric('primary', '主要利用枠', snapshot?.primary, windowLabel),
      percentMetric('secondary', '二次利用枠', snapshot?.secondary, windowLabel),
    ].filter(Boolean);
    if (!metrics.length) return disconnected('codex', 'Codex App Server', 'レート制限が返されませんでした。', 'error');
    return {
      id: 'codex',
      status: 'connected',
      source: 'Codex App Server',
      plan: snapshot?.planType ? String(snapshot.planType).replaceAll('_', ' ') : '',
      metrics,
    };
  } catch {
    return disconnected('codex', 'Codex App Server', 'Codex CLI へのログインまたは App Server の起動を確認してください。', 'error');
  }
}
