const $ = id => document.getElementById(id);
const storageKey = 'structure-lab-layout-v1';
const defaults = () => ({ split:44, dockHeight:180, dock:'watch', closed:false, focus:'', cards:[], inspector:false });
let layout = defaults();
try {
  const value = JSON.parse(localStorage.getItem(storageKey));
  if (value && typeof value === 'object') {
    layout.split = Number.isFinite(value.split) ? Math.max(28, Math.min(72, value.split)) : 44;
    layout.dockHeight = Number.isFinite(value.dockHeight) ? Math.max(80, Math.min(340, value.dockHeight)) : 180;
    layout.dock = ['watch','input','output'].includes(value.dock) ? value.dock : 'watch';
    layout.closed = value.closed === true;
    layout.focus = ['code','structures'].includes(value.focus) ? value.focus : '';
    layout.cards = Array.isArray(value.cards) ? value.cards.filter(id => typeof id === 'string').slice(0, 200) : [];
    layout.inspector = value.inspector === true;
  }
} catch { /* Layout preferences are optional; the workspace also works without storage. */ }
function persist() {
  try { localStorage.setItem(storageKey, JSON.stringify(layout)); } catch { /* Private/storage-limited browser. */ }
}
function setMobile(value) {
  $('workspace').dataset.mobile = value;
  document.querySelectorAll('[data-mobile]').forEach(button => {
    if (button.tagName === 'BUTTON') button.setAttribute('aria-pressed', String(button.dataset.mobile === value));
  });
}
function resizeLayout() {
  const workspace = $('workspace');
  const width = workspace.clientWidth;
  const lower = Math.max(28, 320 / width * 100);
  const upper = Math.min(72, (width - 357) / width * 100);
  const split = Math.max(lower, Math.min(upper, layout.split));
  workspace.style.setProperty('--split', `${split}%`);
  $('workspace-splitter').setAttribute('aria-valuenow', String(Math.round(split)));
  $('workspace-splitter').setAttribute('aria-valuemin', String(Math.ceil(lower)));
  $('workspace-splitter').setAttribute('aria-valuemax', String(Math.floor(upper)));
  // Leave useful editing space even when a saved drawer was taller on another screen.
  const height = Math.max(80, Math.min(layout.dockHeight, workspace.clientHeight - 380));
  workspace.style.setProperty('--dock-height', `${height}px`);
  $('dock-resizer').setAttribute('aria-valuenow', String(Math.round(height)));
  $('dock-resizer').setAttribute('aria-valuemin', '80');
  $('dock-resizer').setAttribute('aria-valuemax', String(Math.max(80, Math.min(340, workspace.clientHeight - 380))));
}
export function syncWorkspaceCards() {
  if (layout.dock === 'output') $('console-panel').open = true;
  if (layout.dock === 'input') $('stdin-panel').open = true;
  const cards = [...$('structure-grid').querySelectorAll('.structure-card')];
  for (const card of cards) {
    const closed = layout.cards.includes(card.dataset.structure);
    card.classList.toggle('collapsed', closed);
    const button = card.querySelector('.collapse-card');
    if (button) {
      button.textContent = closed ? '›' : '⌄';
      button.setAttribute('aria-expanded', String(!closed));
      button.setAttribute('aria-label', `${closed ? '展开' : '折叠'} ${card.querySelector('strong').textContent} 结构卡片`);
      button.title = button.getAttribute('aria-label');
    }
  }
  const allClosed = cards.length > 0 && cards.every(card => layout.cards.includes(card.dataset.structure));
  $('toggle-all-cards').textContent = allClosed ? '全部展开' : '全部折叠';
  $('toggle-all-cards').disabled = !cards.length;
}
function applyLayout() {
  const workspace = $('workspace');
  workspace.classList.toggle('focus-code', layout.focus === 'code');
  workspace.classList.toggle('focus-structures', layout.focus === 'structures');
  $('config-dock').classList.toggle('closed', layout.closed);
  $('dock-resizer').hidden = layout.closed;
  $('toggle-dock').textContent = layout.closed ? '⌃' : '⌄';
  $('toggle-dock').setAttribute('aria-expanded', String(!layout.closed));
  $('toggle-dock').setAttribute('aria-label', layout.closed ? '展开配置区' : '折叠配置区');
  $('toggle-dock').title = $('toggle-dock').getAttribute('aria-label');
  document.querySelectorAll('[data-dock]').forEach(button => {
    const selected = button.dataset.dock === layout.dock;
    button.setAttribute('aria-selected', String(selected));
    button.tabIndex = selected ? 0 : -1;
    $(`dock-${button.dataset.dock}`).hidden = !selected;
  });
  if (layout.dock === 'input') $('stdin-panel').open = true;
  if (layout.dock === 'output') $('console-panel').open = true;
  document.querySelectorAll('[data-focus]').forEach(button => {
    const selected = button.dataset.focus === layout.focus;
    button.setAttribute('aria-pressed', String(selected));
    button.setAttribute('aria-label', selected ? '退出专注模式' : `专注${button.dataset.focus === 'code' ? '代码' : '结构'}面板`);
    button.title = button.getAttribute('aria-label');
    button.textContent = selected ? '⊡' : '⛶';
  });
  resizeLayout(); syncWorkspaceCards(); persist();
}
export function openWorkspaceDock(tab) {
  layout.dock = tab; layout.closed = false;
  if (layout.focus === 'structures') layout.focus = '';
  setMobile('code'); applyLayout();
}
export function revealInspector() {
  $('inspector-panel').open = true;
}
export function initWorkspace() {
  applyLayout();
  $('inspector-panel').open = layout.inspector;
  $('inspector-panel').addEventListener('toggle', () => { layout.inspector = $('inspector-panel').open; persist(); });
  document.querySelectorAll('[data-dock]').forEach(button => button.addEventListener('click', () => openWorkspaceDock(button.dataset.dock)));
  document.querySelector('.dock-tabs').addEventListener('keydown', event => {
    if (!event.target.matches('[role=tab]') || !['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
    event.preventDefault(); event.stopPropagation();
    const tabs = [...document.querySelectorAll('[data-dock]')], index = tabs.indexOf(event.target);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length;
    tabs[next].focus(); tabs[next].click();
  });
  $('toggle-dock').addEventListener('click', () => { layout.closed = !layout.closed; applyLayout(); });
  document.querySelectorAll('[data-focus]').forEach(button => button.addEventListener('click', () => {
    layout.focus = layout.focus === button.dataset.focus ? '' : button.dataset.focus;
    applyLayout();
  }));
  $('reset-layout').addEventListener('click', () => {
    layout = defaults(); $('inspector-panel').open = false; applyLayout();
  });
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || document.querySelector('dialog[open]') || !layout.focus) return;
    layout.focus = ''; applyLayout();
  });
  document.querySelectorAll('button[data-mobile]').forEach(button => button.addEventListener('click', () => setMobile(button.dataset.mobile)));
  $('structure-grid').addEventListener('click', event => {
    const button = event.target.closest('.collapse-card');
    if (!button) return;
    const id = button.closest('.structure-card').dataset.structure;
    layout.cards = layout.cards.includes(id) ? layout.cards.filter(value => value !== id) : [...layout.cards, id];
    syncWorkspaceCards(); persist();
  });
  $('toggle-all-cards').addEventListener('click', () => {
    const ids = [...$('structure-grid').querySelectorAll('.structure-card')].map(card => card.dataset.structure);
    const expand = ids.every(id => layout.cards.includes(id));
    layout.cards = layout.cards.filter(id => !ids.includes(id));
    if (!expand) layout.cards.push(...ids);
    syncWorkspaceCards(); persist();
  });
  const inputLabel = () => { $('input-tab-label').textContent = $('execution-mode').value === 'leetcode' ? '测试参数' : '标准输入'; };
  inputLabel(); $('execution-mode').addEventListener('change', inputLabel);
  $('more-actions').addEventListener('click', () => {
    const open = $('file-actions').classList.toggle('open');
    $('more-actions').setAttribute('aria-expanded', String(open));
  });
  document.addEventListener('click', event => {
    if (event.target.closest('#more-actions')) return;
    $('file-actions').classList.remove('open'); $('more-actions').setAttribute('aria-expanded', 'false');
  });
  new MutationObserver(inputLabel).observe($('leetcode-config'), { attributes:true, attributeFilter:['hidden'] });
  function separator(id, axis, update, reset) {
    const handle = $(id);
    let activePointer;
    handle.addEventListener('pointerdown', event => {
      if (event.button !== 0) return;
      handle.focus();
      activePointer = event.pointerId; handle.setPointerCapture(event.pointerId);
      handle.classList.add('dragging'); document.body.classList.add('is-resizing'); event.preventDefault();
    });
    handle.addEventListener('pointermove', event => {
      if (activePointer !== event.pointerId) return;
      const rect = $('workspace').getBoundingClientRect();
      if (axis === 'x') layout.split = Math.max(28, Math.min(72, (event.clientX - rect.left) / rect.width * 100));
      else layout.dockHeight = Math.max(80, Math.min(340, rect.bottom - event.clientY - document.querySelector('.run-toolbar').offsetHeight));
      resizeLayout();
    });
    const finish = () => { activePointer = undefined; handle.classList.remove('dragging'); document.body.classList.remove('is-resizing'); persist(); };
    handle.addEventListener('pointerup', event => { if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId); finish(); });
    handle.addEventListener('pointercancel', finish); handle.addEventListener('lostpointercapture', finish);
    handle.addEventListener('dblclick', () => { reset(); resizeLayout(); persist(); });
    handle.addEventListener('keydown', event => {
      const negative = axis === 'x' ? 'ArrowLeft' : 'ArrowDown', positive = axis === 'x' ? 'ArrowRight' : 'ArrowUp';
      if (![negative,positive,'Home'].includes(event.key)) return;
      event.preventDefault(); event.stopPropagation();
      if (event.key === 'Home') reset(); else update((event.key === positive ? 1 : -1) * (event.shiftKey ? 5 : 1));
      resizeLayout(); persist();
    });
  }
  separator('workspace-splitter', 'x', delta => { layout.split = Math.max(28, Math.min(72, Number($('workspace-splitter').getAttribute('aria-valuenow')) + delta)); }, () => { layout.split = 44; });
  separator('dock-resizer', 'y', delta => { layout.dockHeight = Math.max(80, Math.min(340, Number($('dock-resizer').getAttribute('aria-valuenow')) + delta * 10)); }, () => { layout.dockHeight = 180; });
  new ResizeObserver(resizeLayout).observe($('workspace'));
}
