const refreshButton = document.querySelector('#refreshButton');
const toast = document.querySelector('#toast');
const themeToggle = document.querySelector('#themeToggle');

themeToggle.addEventListener('click', () => {
  document.body.classList.toggle('dark');
  localStorage.setItem('llmeter-theme', document.body.classList.contains('dark') ? 'dark' : 'light');
});

if (localStorage.getItem('llmeter-theme') === 'dark') document.body.classList.add('dark');

refreshButton.addEventListener('click', () => {
  refreshButton.classList.add('loading');
  refreshButton.querySelector('small').textContent = 'Updating…';
  setTimeout(() => {
    refreshButton.classList.remove('loading');
    refreshButton.querySelector('small').textContent = 'Updated just now';
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2400);
  }, 750);
});
