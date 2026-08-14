const STORAGE_KEY = 'llmeter-quotas-v1';

const defaultServices = [
  { id: 'claude', name: 'Claude', vendor: 'Anthropic', icon: 'AI', color: '#e97855', limit: 1600, remaining: 1248, period: 'Weekly messages', reset: 'Resets Monday', modelLabel: 'Current model', model: 'Claude 3.5 Sonnet' },
  { id: 'codex', name: 'Codex', vendor: 'OpenAI', icon: '⌘', color: '#22a47c', limit: 200, remaining: 84, period: '5-hour limit', reset: 'Resets in 2h 14m', modelLabel: 'Current model', model: 'GPT-5.3-Codex' },
  { id: 'copilot', name: 'GitHub Copilot', vendor: 'GitHub', icon: '◖◗', color: '#6965d8', limit: 300, remaining: 273, period: 'Premium requests', reset: 'Resets Sep 1', modelLabel: 'Plan', model: 'Copilot Pro' },
  { id: 'gemini', name: 'Gemini', vendor: 'Google', icon: '✦', color: '#4c83e9', limit: 1500, remaining: 975, period: 'Daily requests', reset: 'Resets in 8h 42m', modelLabel: 'Current model', model: 'Gemini 2.5 Pro' },
];

const quotaGrid = document.querySelector('#quotaGrid');
const quotaFields = document.querySelector('#quotaFields');
const settingsDialog = document.querySelector('#settingsDialog');
const refreshButton = document.querySelector('#refreshButton');
const toast = document.querySelector('#toast');

function loadServices() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!Array.isArray(saved)) return structuredClone(defaultServices);
    return defaultServices.map((service) => {
      const stored = saved.find((item) => item?.id === service.id);
      const limit = Number(stored?.limit);
      const remaining = Number(stored?.remaining);
      const safeLimit = Number.isFinite(limit) && limit > 0 ? limit : service.limit;
      return {
        ...service,
        limit: safeLimit,
        remaining: Number.isFinite(remaining) && remaining >= 0 ? Math.min(remaining, safeLimit) : service.remaining,
        model: typeof stored?.model === 'string' && stored.model.trim() ? stored.model.slice(0, 80) : service.model,
      };
    });
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }
  return structuredClone(defaultServices);
}

let services = loadServices();

function percentage(service) {
  if (!service.limit) return 0;
  return Math.min(100, Math.max(0, Math.round((service.remaining / service.limit) * 100)));
}

function escapeHTML(value) {
  return String(value).replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  })[character]);
}

function renderDashboard() {
  quotaGrid.innerHTML = services.map((service) => {
    const percent = percentage(service);
    return `<article class="quota-card" data-service="${service.id}">
      <div class="card-top"><div class="service-icon ${service.id}">${service.icon}</div><div><h3>${service.name}</h3><p>${service.vendor}</p></div><span class="connected">Connected</span></div>
      <div class="quota-copy"><span>${service.period}</span><strong>${percent}% <small>remaining</small></strong></div>
      <div class="progress" role="progressbar" aria-label="${service.name} remaining" aria-valuenow="${percent}" aria-valuemin="0" aria-valuemax="100"><i style="--value:${percent}%;--color:${service.color}"></i></div>
      <div class="details"><span><b>${service.remaining.toLocaleString()}</b> of ${service.limit.toLocaleString()} left</span><span>${service.reset}</span></div>
      <div class="model"><span>${service.modelLabel}</span><strong>${escapeHTML(service.model)}</strong></div>
      <button class="edit-card" data-edit="${service.id}" aria-label="${service.name} のクォータを編集">Edit</button>
    </article>`;
  }).join('');

  const average = Math.round(services.reduce((total, service) => total + percentage(service), 0) / services.length);
  const lowest = services.reduce((current, service) => percentage(service) < percentage(current) ? service : current);
  document.querySelector('#averageRemaining').textContent = `${average}%`;
  document.querySelector('#lowestService').textContent = `${lowest.name} · ${percentage(lowest)}%`;
  document.querySelector('#connectedCount').textContent = `${services.length} services`;
  document.querySelector('#insightAverage').textContent = `${average}%`;
  document.querySelector('#insightTitle').textContent = percentage(lowest) < 20 ? `${lowest.name} の残量が少なくなっています` : '現在のクォータに余裕があります';
  document.querySelector('#insightCopy').textContent = percentage(lowest) < 20 ? '上限に達する前に利用ペースを確認してください。' : 'すべてのサービスで20%以上のクォータが残っています。';
}

function renderFields() {
  quotaFields.innerHTML = services.map((service) => `<fieldset>
    <legend><span class="service-icon ${service.id}">${service.icon}</span><span>${service.name}<small>${service.vendor}</small></span></legend>
    <label>残り<input name="${service.id}-remaining" type="number" min="0" value="${service.remaining}" required></label>
    <label>上限<input name="${service.id}-limit" type="number" min="1" value="${service.limit}" required></label>
    <label class="model-input">モデル / プラン<input name="${service.id}-model" value="${escapeHTML(service.model)}" required></label>
  </fieldset>`).join('');
}

function openSettings(serviceId) {
  renderFields();
  document.querySelector('#formError').textContent = '';
  settingsDialog.showModal();
  if (serviceId) quotaFields.querySelector(`[name="${serviceId}-remaining"]`).focus();
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2400);
}

document.querySelector('#themeToggle').addEventListener('click', () => {
  document.body.classList.toggle('dark');
  localStorage.setItem('llmeter-theme', document.body.classList.contains('dark') ? 'dark' : 'light');
});

document.querySelector('#manageConnections').addEventListener('click', () => openSettings());
quotaGrid.addEventListener('click', (event) => {
  const button = event.target.closest('[data-edit]');
  if (button) openSettings(button.dataset.edit);
});

document.querySelector('#quotaForm').addEventListener('submit', (event) => {
  if (event.submitter?.value !== 'save') return;
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  const nextServices = services.map((service) => ({ ...service, remaining: Number(data.get(`${service.id}-remaining`)), limit: Number(data.get(`${service.id}-limit`)), model: data.get(`${service.id}-model`).trim().slice(0, 80) }));
  const invalidService = nextServices.find((service) => service.remaining > service.limit);
  if (invalidService) {
    document.querySelector('#formError').textContent = `${invalidService.name} の残量は上限以下にしてください。`;
    quotaFields.querySelector(`[name="${invalidService.id}-remaining"]`).focus();
    return;
  }
  services = nextServices;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(services));
  renderDashboard();
  settingsDialog.close();
  showToast('クォータを保存しました。');
});

document.querySelector('#resetData').addEventListener('click', () => {
  services = structuredClone(defaultServices);
  localStorage.removeItem(STORAGE_KEY);
  renderFields();
  renderDashboard();
  document.querySelector('#formError').textContent = '';
  showToast('デモデータに戻しました。');
});

refreshButton.addEventListener('click', () => {
  refreshButton.classList.add('loading');
  refreshButton.querySelector('small').textContent = 'Updating…';
  setTimeout(() => {
    refreshButton.classList.remove('loading');
    refreshButton.querySelector('small').textContent = 'Updated just now';
    showToast('All quotas are up to date.');
  }, 750);
});

if (localStorage.getItem('llmeter-theme') === 'dark') document.body.classList.add('dark');
document.querySelector('#todayLabel').textContent = new Intl.DateTimeFormat('ja-JP', { dateStyle: 'full' }).format(new Date());
renderDashboard();
