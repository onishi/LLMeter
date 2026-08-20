const SERVICE_NAMES = {
  claude: 'Claude',
  codex: 'Codex',
  copilot: 'Copilot',
};

const STATUS_LABELS = {
  connected: '接続済み',
  not_connected: '未接続',
  unavailable: '取得不可',
  error: 'エラー',
};

const ANSI = {
  reset: '\u001b[0m', bold: '\u001b[1m', dim: '\u001b[2m',
  green: '\u001b[32m', yellow: '\u001b[33m', red: '\u001b[31m',
};
const ANSI_PATTERN = /\u001b\[[0-9;]*m/g;

function paint(value, code, enabled) {
  return enabled ? `${code}${value}${ANSI.reset}` : value;
}

function characterWidth(character) {
  if (/\p{Mark}/u.test(character)) return 0;
  const code = character.codePointAt(0);
  return code >= 0x1100 && (
    code <= 0x115f || code === 0x2329 || code === 0x232a ||
    (code >= 0x2e80 && code <= 0xa4cf && code !== 0x303f) ||
    (code >= 0xac00 && code <= 0xd7a3) || (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0xfe10 && code <= 0xfe19) || (code >= 0xfe30 && code <= 0xfe6f) ||
    (code >= 0xff00 && code <= 0xff60) || (code >= 0xffe0 && code <= 0xffe6) ||
    (code >= 0x1f300 && code <= 0x1faff)
  ) ? 2 : 1;
}

function displayWidth(value) {
  return [...String(value).replace(ANSI_PATTERN, '')].reduce((width, character) => width + characterWidth(character), 0);
}

function padDisplay(value, width) {
  return `${value}${' '.repeat(Math.max(0, width - displayWidth(value)))}`;
}

function truncateDisplay(value, width) {
  if (displayWidth(value) <= width) return value;
  let result = '';
  let used = 0;
  for (const character of value) {
    const next = characterWidth(character);
    if (used + next > width - 1) break;
    result += character;
    used += next;
  }
  return `${result}…`;
}

function spaceBetween(left, right, width) {
  const gap = Math.max(1, width - displayWidth(left) - displayWidth(right));
  return `${left}${' '.repeat(gap)}${right}`;
}

function formatDate(timestamp, { locale, timeZone }, includeDate = true) {
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) return '';
  return new Intl.DateTimeFormat(locale, includeDate ? {
    month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone,
  } : {
    hour: '2-digit', minute: '2-digit', timeZone,
  }).format(date);
}

function formatReset(timestamp, referenceDate, options) {
  if (!Number.isFinite(Number(timestamp))) return '';
  const date = new Date(Number(timestamp) * 1000);
  if (!Number.isFinite(date.getTime())) return '';
  const seconds = Math.floor((date.getTime() - referenceDate.getTime()) / 1000);
  if (seconds <= 0) return '更新待ち';
  if (seconds < 3_600) return `${Math.max(1, Math.ceil(seconds / 60))}分後`;
  if (seconds < 86_400) {
    const hours = Math.floor(seconds / 3_600);
    const minutes = Math.ceil((seconds % 3_600) / 60);
    return minutes ? `${hours}時間${minutes}分後` : `${hours}時間後`;
  }
  return formatDate(date, options);
}

function percentColor(remainingPercent) {
  if (remainingPercent < 20) return ANSI.red;
  if (remainingPercent < 50) return ANSI.yellow;
  return ANSI.green;
}

function statusColor(status) {
  if (status === 'connected') return ANSI.green;
  if (status === 'error') return ANSI.red;
  return ANSI.yellow;
}

function compactMetricLabel(metric) {
  const byId = {
    'five-hour': '5時間', 'seven-day': '7日間',
    'seven-day-sonnet': '7日間 Sonnet', 'seven-day-opus': '7日間 Opus',
    primary: metric.label.replace('の利用枠', ''), secondary: metric.label.replace('の利用枠', ''),
    'monthly-ai-credits': '今月 AI',
  };
  return byId[metric.id] || metric.label.replace('の利用枠', '');
}

function progressBar(remainingPercent, width, color) {
  const filled = Math.round((remainingPercent / 100) * width);
  const trackColor = percentColor(remainingPercent);
  const emptyColor = trackColor === ANSI.red ? ANSI.red : ANSI.dim;
  return `${paint('█'.repeat(filled), trackColor, color)}${paint('░'.repeat(width - filled), emptyColor, color)}`;
}

function metricLine(metric, referenceDate, options) {
  const label = padDisplay(compactMetricLabel(metric), 13);
  if (Number.isFinite(metric.remainingPercent)) {
    const bar = progressBar(metric.remainingPercent, options.barWidth, options.color);
    const value = paint(padDisplay(`${metric.remainingPercent}%`, 5), percentColor(metric.remainingPercent), options.color);
    const reset = formatReset(metric.resetsAt, referenceDate, options);
    return `  ${label} ${bar}  ${value}${reset ? `  ${paint(`↻ ${reset}`, ANSI.dim, options.color)}` : ''}`;
  }
  if (Number.isFinite(metric.usedValue)) {
    const number = new Intl.NumberFormat(options.locale, { maximumFractionDigits: 2 }).format(metric.usedValue);
    return `  ${label} ${paint(`${number} ${metric.unit || 'used'}`, ANSI.bold, options.color)}`;
  }
  return `  ${label} —`;
}

function summaryText(services) {
  const connected = services.filter((service) => service.status === 'connected').length;
  const errors = services.filter((service) => service.status === 'error').length;
  const unavailable = services.length - connected - errors;
  return [
    `接続 ${connected}/${services.length}`,
    errors ? `エラー ${errors}` : '',
    unavailable ? `未接続・取得不可 ${unavailable}` : '',
  ].filter(Boolean).join('  ·  ');
}

export function formatSnapshot(payload, {
  color = false,
  locale = 'ja-JP',
  timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone,
  columns = 88,
} = {}) {
  const width = Math.min(110, Math.max(60, Number(columns) || 88));
  const options = { color, locale, timeZone, barWidth: width >= 94 ? 24 : width >= 76 ? 18 : 12 };
  const services = Array.isArray(payload?.services) ? payload.services : [];
  const updated = new Date(payload?.updatedAt);
  const referenceDate = Number.isFinite(updated.getTime()) ? updated : new Date();
  const updatedLabel = formatDate(referenceDate, options) || '時刻不明';
  const divider = paint('─'.repeat(width), ANSI.dim, color);
  const lines = [
    spaceBetween(paint('LLMeter', ANSI.bold, color), paint(`UPDATED ${updatedLabel}`, ANSI.dim, color), width),
    divider,
  ];

  services.forEach((service, index) => {
    if (index > 0) lines.push('');
    const name = SERVICE_NAMES[service.id] || service.id;
    const plan = service.plan ? ` · ${String(service.plan).replace(/\b\w/g, (letter) => letter.toUpperCase())}` : '';
    const connected = service.status === 'connected' && service.metrics?.length;
    const bullet = connected ? paint('●', ANSI.green, color) : paint('○', statusColor(service.status), color);
    const title = `${bullet} ${paint(`${name}${plan}`, ANSI.bold, color)}`;
    const status = paint(STATUS_LABELS[service.status] || service.status, statusColor(service.status), color);
    const observed = service.observedAt ? formatDate(service.observedAt, options, false) : '';
    const meta = observed ? `${status} · 観測 ${observed}` : status;
    lines.push(spaceBetween(title, meta, width));

    if (connected) {
      for (const metric of service.metrics) lines.push(metricLine(metric, referenceDate, options));
    } else {
      const source = service.source ? `${service.source} · ` : '';
      const detail = `${source}${service.message || '利用枠を取得できませんでした。'}`;
      lines.push(`  ${paint(truncateDisplay(detail, width - 2), ANSI.dim, color)}`);
    }
  });

  lines.push('', divider, spaceBetween(summaryText(services), paint('--json で詳細を表示', ANSI.dim, color), width));
  return lines.join('\n');
}
