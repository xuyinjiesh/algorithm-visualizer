// Apply the saved appearance before first paint, independently of editor/layout state.
(() => {
  const key = 'structure-lab-theme-v1';
  let theme = 'dark';
  try { if (localStorage.getItem(key) === 'light') theme = 'light'; } catch { /* Storage is optional. */ }
  function apply() {
    document.documentElement.dataset.theme = theme;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = theme === 'light' ? '#f5f7fa' : '#151a22';
    const button = document.getElementById('theme-toggle');
    if (button) {
      const label = theme === 'light' ? '切换到深色主题' : '切换到浅色主题';
      button.setAttribute('aria-label', label); button.title = label;
    }
  }
  apply();
  document.addEventListener('DOMContentLoaded', () => {
    apply();
    document.getElementById('theme-toggle').addEventListener('click', () => {
      theme = theme === 'light' ? 'dark' : 'light'; apply();
      try { localStorage.setItem(key, theme); } catch { /* Still usable without persistence. */ }
      document.dispatchEvent(new Event('themechange'));
    });
  });
})();
