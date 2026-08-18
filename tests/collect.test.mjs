import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { collectUsage } from '../src/collect.mjs';
import { collectClaude } from '../src/providers/claude.mjs';

test('collects providers in a normalized envelope', async () => {
  const fixed = new Date('2026-08-17T00:00:00.000Z');
  const providers = [
    async () => ({ id: 'one', status: 'connected', metrics: [] }),
    async () => ({ id: 'two', status: 'unavailable', metrics: [] }),
  ];
  const result = await collectUsage({ providers, now: () => fixed });

  assert.equal(result.version, 1);
  assert.equal(result.updatedAt, fixed.toISOString());
  assert.deepEqual(result.services.map((service) => service.id), ['one', 'two']);
});

test('reads Claude quota percentages from a status-line cache', () => {
  const directory = mkdtempSync(join(tmpdir(), 'llmeter-test-'));
  const cachePath = join(directory, 'claude-usage.json');
  writeFileSync(cachePath, JSON.stringify({
    version: 1,
    updatedAt: '2026-08-17T00:00:00.000Z',
    rateLimits: {
      fiveHour: { usedPercent: 26, resetsAt: 1786948200 },
      sevenDay: { usedPercent: 40, resetsAt: 1787155200 },
    },
  }));

  try {
    const service = collectClaude({ cachePaths: [cachePath], now: () => new Date('2026-08-17T05:31:00.000Z') });
    assert.equal(service.status, 'connected');
    assert.deepEqual(service.metrics.map((metric) => metric.remainingPercent), [74, 60]);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('does not report a Claude metric after its reset time', () => {
  const directory = mkdtempSync(join(tmpdir(), 'llmeter-test-'));
  const cachePath = join(directory, 'claude-usage.json');
  writeFileSync(cachePath, JSON.stringify({
    version: 1,
    updatedAt: '2026-08-17T05:30:00.000Z',
    rateLimits: {
      fiveHour: { usedPercent: 26, resetsAt: 1786948200 },
      sevenDay: { usedPercent: 40, resetsAt: 1787155200 },
    },
  }));

  try {
    const service = collectClaude({ cachePaths: [cachePath], now: () => new Date('2026-08-17T09:00:00.000Z') });
    assert.deepEqual(service.metrics.map((metric) => metric.id), ['seven-day']);
    assert.equal(service.expiredMetrics, 1);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
