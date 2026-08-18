export function disconnected(id, source, message, status = 'not_connected') {
  return { id, status, source, message, metrics: [] };
}

export function percentMetric(id, label, value, labelForDuration = null) {
  if (!value || !Number.isFinite(Number(value.usedPercent))) return null;
  const usedPercent = Math.min(100, Math.max(0, Math.round(Number(value.usedPercent))));
  const duration = Number(value.windowDurationMins);
  return {
    id,
    label: labelForDuration ? labelForDuration(duration, label) : label,
    usedPercent,
    remainingPercent: 100 - usedPercent,
    resetsAt: Number.isFinite(Number(value.resetsAt)) ? Number(value.resetsAt) : null,
  };
}
