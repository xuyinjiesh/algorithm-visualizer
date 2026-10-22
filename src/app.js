import { parseTrace, serializeTrace, LIMITS } from './trace.js';
import { element, layoutStructure, renderGraph, renderMatrix, renderStack } from './render.js';
import { WATCH_TYPES, WATCH_FIELDS, defaultWatch, validateWatches } from './watch-config.js';
import { EDITOR_SAMPLES, rebaseWatches } from './editor-samples.js';
import { normalizeExecution, validateExecution } from './execution-config.js';
import { analyzeLeetCode, nodeDefinitionsFor } from './leetcode-analysis.js';
import { captureLines, identifierAt, codeOnly, watchColor, WATCH_COLORS } from './watch-strategy.js';
import { initWorkspace, openWorkspaceDock, syncWorkspaceCards, revealInspector } from './workspace.js';

const $ = id => document.getElementById(id);
const lightWatchColors = ['#46751b', '#0872a1', '#a65113', '#7952ba', '#b83b72', '#087c69', '#886300', '#4b60b8', '#9a42a8', '#367b3d', '#b34236', '#087780'];
function uiWatchColor(watch, watches) {
  const color = watchColor(watch, watches);
  return document.documentElement.dataset.theme === 'light' ? lightWatchColors[WATCH_COLORS.indexOf(color)] ?? color : color;
}
const editor = $('source-editor');
const highlights = element('pre', { class: 'source-highlights', 'aria-hidden': 'true' });
editor.before(highlights);
function syncHighlights() {
  highlights.scrollTop = editor.scrollTop;
  highlights.scrollLeft = editor.scrollLeft;
}
function renderHighlights() {
  const code = codeOnly(editor.value).split('\n'), fragment = document.createDocumentFragment();
  const locations = watches.map(watch => ({ watch, lines: captureLines(editor.value, watch) }));
  editor.value.split('\n').forEach((text, index) => {
    const row = element('span', { class: 'source-highlight-line' });
    const colors = locations.filter(item => item.lines.includes(index + 1)).map(item => uiWatchColor(item.watch, watches));
    if (colors.length) row.style.background = `linear-gradient(90deg, ${colors.flatMap((color, i) => [`${color}16 ${i / colors.length * 100}%`, `${color}16 ${(i + 1) / colors.length * 100}%`]).join(', ')})`;
    let offset = 0;
    for (const match of code[index].matchAll(/\b[a-zA-Z_]\w*\b/g)) {
      const watch = watches.find(w => w.expression === match[0]);
      if (!watch) continue;
      row.append(document.createTextNode(text.slice(offset, match.index)));
      const mark = element('span', {}, match[0]);
      mark.style.color = uiWatchColor(watch, watches);
      mark.style.background = `${uiWatchColor(watch, watches)}18`;
      row.append(mark); offset = match.index + match[0].length;
    }
    row.append(document.createTextNode(text.slice(offset) || (text ? '' : ' ')));
    fragment.append(row);
  });
  highlights.replaceChildren(fragment); syncHighlights();
}
const kinds = { graph: 'GRAPH', tree: 'TREE', list: 'LINKED LIST', matrix: 'MATRIX', array: 'ARRAY', stack: 'STACK' };
const storageKey = 'structure-lab-editor-v2';
let activeSample = 'bfs', drafts = {}, watches = [], previousSource = '';
let trace, frameIndex = 0, resultSignature, resultOrigin, selection, selectedLine = 1, lastRunFailed = false;
let playTimer, toastTimer, controller, runTicket = 0, editingWatch;
const layouts = new Map(), zooms = new Map();

function executionConfig() {
  return { mode: $('execution-mode').value, method: $('leetcode-method').value,
    arguments: $('leetcode-arguments').value, nodes: $('leetcode-nodes').value };
}
function renderExecutionMode() {
  const leetcode = $('execution-mode').value === 'leetcode';
  editor.closest('.editor-panel').classList.toggle('leetcode-mode', leetcode);
  $('leetcode-config').hidden = !leetcode;
  $('stdin-panel').hidden = leetcode;
  $('execution-summary').textContent = leetcode ? '自动补全运行入口' : '使用源码中的 main()';
  if (!leetcode) return;
  const analysis = analyzeLeetCode(editor.value), config = executionConfig();
  const automatic = analysis.methods.length === 1 ? analysis.methods[0] : '';
  $('leetcode-method').placeholder = automatic ? `自动：${automatic}（留空即可）` : '填写 public 方法名';
  $('leetcode-methods').replaceChildren(...[...new Set(analysis.methods)].map(name => element('option', { value: name })));
  const methodHint = config.method.trim() ? `手动调用：${config.method.trim()}()` : automatic ? `自动调用：${automatic}()`
    : analysis.methods.length ? `检测到多个 public 方法：${analysis.methods.join('、')}，请指定调用方法。` : '未识别到 public 方法，可手动填写方法名。';
  const definitions = nodeDefinitionsFor(config.nodes, analysis);
  $('leetcode-detection').textContent = `${methodHint} · ${definitions.length ? `运行时补全：${definitions.join('、')}` : analysis.definedNodes.length ? `使用源码中的定义：${analysis.definedNodes.join('、')}` : config.nodes === 'none' ? '已关闭节点补全' : '无需补全节点定义'}`;
}
function setExecution(value) {
  const config = normalizeExecution(value);
  $('execution-mode').value = config.mode; $('leetcode-method').value = config.method;
  $('leetcode-arguments').value = config.arguments; $('leetcode-nodes').value = config.nodes;
  renderExecutionMode();
}
function signature() {
  return JSON.stringify({ source: editor.value, watches, stdin: $('stdin').value, execution: executionConfig() });
}
function notify(message, error = false) {
  $('toast').textContent = message;
  $('toast').classList.toggle('error', error);
  $('toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { $('toast').hidden = true; }, 5000);
}
function saveDraft() {
  drafts[activeSample] = { source: editor.value, watches: structuredClone(watches), stdin: $('stdin').value, execution: executionConfig() };
  try {
    localStorage.setItem(storageKey, JSON.stringify({ activeSample, drafts }));
    $('draft-badge').textContent = '草稿已保存';
  } catch { $('draft-badge').textContent = '草稿未保存'; }
}
function stopPlayback() {
  clearInterval(playTimer); playTimer = undefined;
  $('play').textContent = '▶'; $('play').setAttribute('aria-label', '播放');
}
function setFrame(index) {
  if (!trace) return;
  frameIndex = Math.max(0, Math.min(index, trace.frames.length - 1));
  renderResults();
  followExecution();
}
function togglePlayback() {
  if (!trace) return;
  if (playTimer) { stopPlayback(); return; }
  if (frameIndex === trace.frames.length - 1) setFrame(0);
  $('play').textContent = 'Ⅱ'; $('play').setAttribute('aria-label', '暂停');
  playTimer = setInterval(() => {
    setFrame(frameIndex + 1);
    if (frameIndex === trace.frames.length - 1) stopPlayback();
  }, Number($('speed').value));
}
function clearResult() {
  stopPlayback();
  trace = undefined; resultSignature = undefined; resultOrigin = undefined;
  lastRunFailed = false;
  selection = undefined; layouts.clear(); zooms.clear(); frameIndex = 0;
}
function cancelRun() {
  controller?.abort();
  controller = undefined;
  runTicket++;
  $('run-button').disabled = false; $('stop-run').hidden = true;
}
function switchSample(id, initial = false) {
  if (!initial) saveDraft();
  cancelRun(); clearResult();
  activeSample = id;
  const sample = EDITOR_SAMPLES.find(item => item.id === id) || EDITOR_SAMPLES[0];
  let draft = drafts[id] || sample;
  try {
    if (typeof draft.source !== 'string' || typeof draft.stdin !== 'string' || !Array.isArray(draft.watches)) throw new Error();
    if (draft.watches.length) validateWatches(draft.watches, draft.source.split('\n').length);
    normalizeExecution(draft.execution);
  } catch { draft = sample; }
  watches = structuredClone(draft.watches).map((w, index) => ({ ...w, color: w.color || WATCH_COLORS[index % WATCH_COLORS.length] }));
  editor.value = draft.source; previousSource = draft.source; editor.scrollTop = 0;
  $('stdin').value = draft.stdin;
  setExecution(draft.execution);
  $('sample-select').value = id;
  $('run-status').textContent = '准备就绪';
  $('console-output').textContent = '运行后在这里查看标准输出和编译信息。';
  $('console-badge').textContent = ''; $('console-panel').open = false;
  selectedLine = 1;
  saveDraft(); renderWatches(); updateCursor(); renderResults();
}
function currentExecutionLine() {
  return trace && trace.header.source?.code === editor.value ? trace.frames[frameIndex].source?.line : undefined;
}
function renderGutter() {
  const execution = currentExecutionLine();
  const watched = new Map();
  for (const watch of watches) for (const line of captureLines(editor.value, watch)) {
    if (!watched.has(line)) watched.set(line, []);
    watched.get(line).push(watch);
  }
  const lines = editor.value.split('\n');
  $('line-gutter').replaceChildren(...lines.map((_, i) => {
    const line = i + 1;
    const button = element('button', {
      class: `gutter-line ${watched.has(line) ? 'watched' : ''} ${execution === line ? 'current' : ''} ${selectedLine === line && execution !== line ? 'selected' : ''}`,
      'aria-label': `选择第 ${line} 行`, title: `第 ${line} 行${watched.has(line) ? ' · 已添加观察' : ''}`,
    }, String(line));
    for (const [index, watch] of (watched.get(line) || []).entries()) {
      const dot = element('i', { class: 'gutter-watch', title: watch.expression });
      dot.style.background = uiWatchColor(watch, watches);
      dot.style.left = `${3 + index * 5}px`;
      button.append(dot);
    }
    button.addEventListener('click', () => goToLine(line));
    return button;
  }));
  $('line-gutter').scrollTop = editor.scrollTop;
  $('execution-line').textContent = execution ? `回放 · 第 ${execution} 行` : trace ? '源码已变化，重新运行后定位' : '';
  editor.style.backgroundImage = execution
    ? `linear-gradient(transparent ${14 + (execution - 1) * 22}px, var(--execution-highlight) ${14 + (execution - 1) * 22}px, var(--execution-highlight) ${14 + execution * 22}px, transparent ${14 + execution * 22}px)`
    : 'none';
  editor.style.backgroundAttachment = 'local';
}
function updateCursor() {
  const prefix = editor.value.slice(0, editor.selectionStart);
  selectedLine = prefix.split('\n').length;
  $('cursor-position').textContent = `Ln ${selectedLine}, Col ${prefix.length - prefix.lastIndexOf('\n')}`;
  renderGutter();
}
function goToLine(line) {
  const lines = editor.value.split('\n');
  const offset = lines.slice(0, line - 1).reduce((sum, value) => sum + value.length + 1, 0);
  editor.focus(); editor.setSelectionRange(offset, offset);
  editor.scrollTop = Math.max(0, (line - 1) * 22 - editor.clientHeight / 2);
  updateCursor();
}
function followExecution(force = false) {
  const line = currentExecutionLine();
  if (line && (force || document.activeElement !== editor)) {
    const top = (line - 1) * 22;
    if (top < editor.scrollTop || top > editor.scrollTop + editor.clientHeight - 44) editor.scrollTop = Math.max(0, top - editor.clientHeight / 2);
    $('line-gutter').scrollTop = editor.scrollTop;
  }
}
function sourceChanged() {
  stopPlayback();
  watches = rebaseWatches(watches, previousSource, editor.value);
  previousSource = editor.value;
  renderExecutionMode(); saveDraft(); renderWatches(); updateCursor(); renderResults();
}
function renderWatches() {
  $('watch-count').textContent = `${watches.length} 个变量`;
  $('watch-list').replaceChildren(...watches.map(watch => {
    const row = element('div', { class: 'watch-row' });
    row.style.setProperty('--watch-color', uiWatchColor(watch, watches));
    const main = element('div', { class: 'watch-main' });
    main.append(element('strong', {}, watch.expression), element('small', { class: watch.needsReview ? 'needs-review' : '' }, watch.needsReview ? '源码行已删除或替换，请确认采集位置' : WATCH_TYPES[watch.kind]));
    const locations = captureLines(editor.value, watch);
    const location = element('button', { class: 'watch-location', title: `采集行：${locations.join('、') || '未识别到修改位置'}`, 'aria-label': `${watch.expression} 跳转采集行` }, watch.strategy === 'changes' ? `修改处 · ${locations.length} 行` : `L${watch.line}`);
    location.addEventListener('click', () => goToLine(locations[0] || watch.line));
    const edit = element('button', { class: 'quiet-button', 'aria-label': `编辑观察 ${watch.expression}` }, '编辑');
    edit.addEventListener('click', () => openWatch(watch));
    const remove = element('button', { class: 'quiet-button', 'aria-label': `移除观察 ${watch.expression}` }, '✕');
    remove.addEventListener('click', () => {
      stopPlayback(); watches = watches.filter(w => w.id !== watch.id);
      saveDraft(); renderWatches(); renderResults();
    });
    row.append(element('i', { class: 'watch-dot' }), main, location, edit, remove);
    return row;
  }));
  if (!watches.length) $('watch-list').append(element('div', { class: 'watch-help' }, '还没有观察变量。试着添加数组、dp 表或图。'));
  renderGutter(); renderHighlights();
}
function watchFields(config) {
  $('watch-fields').replaceChildren(...WATCH_FIELDS[config.kind].map(([key, title, fallback, choices]) => {
    const label = element('label', {}, title);
    let input;
    if (choices) {
      input = element('select', { 'data-field': key });
      for (const choice of choices) {
        const colon = choice.indexOf(':');
        input.append(element('option', { value: choice.slice(0, colon) }, choice.slice(colon + 1)));
      }
    } else input = element('input', { 'data-field': key, maxlength: 200, spellcheck: 'false' });
    input.value = config[key] ?? fallback;
    label.append(input);
    return label;
  }));
}
function updateCapturePreview() {
  const line = Number($('watch-line').value);
  const automatic = $('watch-strategy').value === 'changes';
  $('watch-line').disabled = automatic;
  const lines = captureLines(editor.value, { strategy: $('watch-strategy').value, expression: $('watch-expression').value.trim(), line });
  $('capture-line-preview').textContent = automatic ? lines.map(n => `L${n}: ${editor.value.split('\n')[n - 1].trim()}`).join('\n') || '未识别到可安全采集的修改行，请使用指定行。' : editor.value.split('\n')[line - 1] ?? '该行不在当前源码范围内';
}
function openWatch(watch, proposed) {
  stopPlayback();
  editingWatch = watch?.id;
  const selected = editor.value.slice(editor.selectionStart, editor.selectionEnd).trim();
  const config = watch || proposed || { ...defaultWatch(), expression: /^[a-zA-Z_][\w.>\-\[\]]*$/.test(selected) ? selected : '', line: selectedLine, strategy: 'changes' };
  $('watch-dialog-title').textContent = watch ? '编辑观察变量' : '添加观察变量';
  $('watch-expression').value = config.expression;
  $('watch-kind').value = config.kind;
  $('watch-line').value = config.line;
  $('watch-strategy').value = config.strategy || 'line';
  $('watch-line').max = editor.value.split('\n').length;
  $('watch-error').hidden = true;
  watchFields(config); updateCapturePreview();
  $('watch-dialog').showModal();
  $('watch-expression').focus();
}
function newWatchDefaults(kind) {
  const config = defaultWatch(kind);
  if ($('execution-mode').value === 'leetcode' && ['tree', 'list'].includes(kind)) config.valueField = 'val';
  return config;
}
function resultSpecs() {
  if (watches.length || resultOrigin !== 'import') return watches.map(w => ({ id: w.id, name: w.expression, kind: w.kind === 'scalar' ? 'array' : ['adjacency', 'graph_matrix', 'forward_star'].includes(w.kind) ? 'graph' : w.kind, line: w.line }));
  const result = new Map();
  for (const frame of trace?.frames ?? []) for (const s of frame.structures) if (!result.has(s.id)) result.set(s.id, { id: s.id, name: s.name, kind: s.kind });
  return [...result.values()];
}
function showSelection() {
  const s = trace?.frames[frameIndex].structures.find(s => s.id === selection?.structureId);
  if (!selection || !s) { $('selection').textContent = '点击任意结构中的节点、边或单元格查看详情。'; return; }
  const parts = [s.name];
  if (selection.type === 'node') {
    const n = s.nodes?.find(n => n.id === selection.id);
    parts.push(n ? `节点 ${n.id} · 值 ${n.label} · ${n.state || 'default'}` : '该节点在本步不存在');
  } else if (selection.type === 'edge') {
    const e = s.edges?.find(e => e.id === selection.id);
    parts.push(e ? `边 ${e.id} · ${e.source} ${s.directed ? '→' : '—'} ${e.target}${e.weight !== undefined && e.weight !== '' ? ` · 权重 ${e.weight}` : ''}` : '该边在本步不存在');
  } else if (selection.type === 'stack-item') {
    const item = s.items?.[selection.index];
    parts.push(item ? `第 ${selection.index} 层${selection.index === s.items.length - 1 ? ' · 栈顶' : ''}` : '该层在本步不存在');
    item?.forEach((cell, c) => parts.push(`${s.columns[c]} = ${cell.text}${cell.nodeId ? `（节点 ID: ${cell.nodeId}）` : ''}`));
  } else {
    const { row, col } = selection;
    parts.push(`位置 [${row}, ${col}] · 值 ${s.values?.[row]?.[col] ?? '不存在'}`);
  }
  $('selection').textContent = parts.join(' / ');
}
function renderResults() {
  const frame = trace?.frames[frameIndex];
  const specs = resultSpecs();
  const stale = Boolean(trace && signature() !== resultSignature);
  $('result-status').classList.toggle('stale', stale || Boolean(trace && lastRunFailed));
  $('result-status').textContent = trace && lastRunFailed ? '最近一次运行失败，下方保留上次成功运行的结果。'
    : stale ? '代码、观察或运行配置已修改。下方为上次运行结果，请重新运行。'
    : trace ? `${trace.frames.length} 个快照 · 所有结构共享时间轴 · 未重新采集的结构保留上次值`
    : '添加变量并运行代码，所有结构将在这里同时显示。';
  $('structure-count').textContent = specs.length;
  $('frame-count').textContent = frame ? `FRAME ${String(frameIndex + 1).padStart(3, '0')} / ${String(trace.frames.length).padStart(3, '0')}` : '等待运行';
  $('step-number').textContent = frame ? `STEP ${String(frameIndex + 1).padStart(2, '0')}` : 'STEP —';
  $('step-label').textContent = frame?.label ?? '等待第一份快照';
  $('timeline').disabled = !trace; $('timeline').max = trace ? trace.frames.length - 1 : 0; $('timeline').value = frameIndex;
  $('play').disabled = !trace; $('export-button').disabled = !trace;
  $('previous').disabled = !trace || frameIndex === 0; $('restart').disabled = !trace || frameIndex === 0;
  $('next').disabled = !trace || frameIndex === trace.frames.length - 1;
  const scrolls = new Map([...$('structure-grid').querySelectorAll('.visualization')].map(el => [el.dataset.id, [el.scrollLeft, el.scrollTop]]));
  const cards = specs.map(spec => {
    const s = frame?.structures.find(s => s.id === spec.id);
    const previous = trace?.frames[frameIndex - 1]?.structures.find(s => s.id === spec.id);
    const card = element('article', { class: 'structure-card wide', 'data-kind': spec.kind, 'data-structure': spec.id, 'aria-label': `${spec.name} 结构视图` });
    const heading = element('div', { class: 'structure-heading' });
    const title = element('div');
    const stats = s ? s.kind === 'stack' ? `${s.items.length} 个元素` : s.values ? `${s.values.length} × ${s.values[0]?.length ?? 0}` : `${s.nodes.length} 节点 / ${s.edges.length} 边` : '等待采集';
    title.append(element('strong', {}, spec.name), element('small', {}, `${kinds[spec.kind]} · ${stats}`));
    const actions = element('div', { class: 'card-actions' });
    actions.append(element('button', { class: 'collapse-card', 'aria-label': `折叠 ${spec.name} 结构卡片`, 'aria-expanded': 'true' }, '⌄'));
    const zoom = zooms.get(spec.id) ?? 1;
    for (const [text, delta, label] of [['−', -.2, '缩小'], [`${Math.round(zoom * 100)}%`, 0, '重置缩放'], ['＋', .2, '放大']]) {
      const button = element('button', { 'aria-label': `${spec.name} ${label}` }, text);
      button.addEventListener('click', () => { zooms.set(spec.id, delta ? Math.max(.5, Math.min(3, zoom + delta)) : 1); renderResults(); });
      actions.append(button);
    }
    heading.append(title, actions);
    const view = element('div', { class: 'visualization', 'data-id': spec.id, tabindex: 0, 'aria-label': `${spec.name} 数据结构` });
    const caption = element('div', { class: 'card-caption' });
    if (s) {
      const select = item => { selection = { ...item, structureId: s.id }; showSelection(); revealInspector(); };
      if (s.kind === 'stack') renderStack(view, s, previous, zoom, select);
      else if (s.values) renderMatrix(view, s, previous, zoom, select);
      else {
        const key = JSON.stringify([s.id, s.kind]);
        const topology = s.kind === 'tree' ? JSON.stringify([s.root, s.nodes.map(n => n.id), s.edges.map(e => [e.source, e.target, e.weight])]) : undefined;
        if (!layouts.has(key) || layouts.get(key).topology !== topology) layouts.set(key, { ...layoutStructure(s, trace.frames), topology });
        renderGraph(view, s, previous, layouts.get(key), zoom, select);
      }
      if (Number.isInteger(s.capturedSeq)) {
        caption.append(element('span', { class: s.capturedSeq === frameIndex ? 'fresh' : '' }, s.capturedSeq === frameIndex ? '本步已采集' : `沿用第 ${s.capturedSeq + 1} 步的值`));
        caption.append(element('span', {}, `采集位置：第 ${s.capturedLine} 行`));
      } else caption.textContent = `第 ${frameIndex + 1} 步的轨迹快照`;
    } else {
      view.append(element('div', { class: 'empty-state' }, trace ? '尚未采集到这个变量' : '运行代码后显示此变量'));
      caption.textContent = `在第 ${spec.line ?? '—'} 行执行后采集`;
    }
    card.append(heading, view, caption);
    return card;
  });
  if (!cards.length) {
    const empty = element('div', { class: 'empty-workspace' }), copy = element('div', { class: 'empty-state' });
    copy.append(element('span', { class: 'empty-icon' }, '⌘'), element('strong', {}, '从一个变量开始'), document.createTextNode('添加需要观察的变量，再点击“编译并运行”。'));
    empty.append(copy); cards.push(empty);
  }
  $('structure-grid').replaceChildren(...cards);
  syncWorkspaceCards();
  for (const el of $('structure-grid').querySelectorAll('.visualization')) {
    const pos = scrolls.get(el.dataset.id); if (pos) { el.scrollLeft = pos[0]; el.scrollTop = pos[1]; }
  }
  $('variables').replaceChildren(...Object.entries(frame?.variables ?? {}).map(([key, value]) => element('span', {}, `${key} = ${value}`)));
  showSelection(); renderGutter();
}
async function run() {
  if (controller) return;
  try {
    validateExecution(executionConfig(), editor.value);
    validateWatches(watches, editor.value.split('\n').length);
    if (watches.some(w => w.needsReview)) throw new Error('请先编辑并确认发生变化的采集行');
  } catch (error) { notify(error.message, true); return; }
  stopPlayback(); saveDraft();
  const ticket = ++runTicket;
  const runController = new AbortController(); controller = runController;
  const fingerprint = signature();
  const execution = executionConfig();
  const payload = { source: editor.value, watches: structuredClone(watches), execution,
    stdin: execution.mode === 'program' ? $('stdin').value : '' };
  $('run-button').disabled = true; $('stop-run').hidden = false;
  $('run-status').textContent = '正在编译并运行…';
  $('console-badge').textContent = '运行中';
  $('console-output').textContent = '正在编译并运行…';
  try {
    const session = await fetch('/api/session', { signal: runController.signal });
    if (!session.ok) throw new Error('无法连接本地编译服务，请通过 npm run dev 启动页面');
    const { token, capabilities } = await session.json();
    if (payload.watches.some(watch => watch.kind === 'stack') && !capabilities?.stack) throw new Error('请重启本地服务（npm run dev），以加载栈观察支持');
    if (execution.mode === 'leetcode' && !capabilities?.leetcode) throw new Error('请重启本地服务（npm run dev），以加载新增的 LeetCode 支持');
    if (execution.mode === 'leetcode' && !capabilities?.leetcodeAuto && (!execution.method.trim() || execution.nodes === 'auto')) throw new Error('请重启本地服务（npm run dev），以加载 LeetCode 自动识别与定义补全');
    const response = await fetch('/api/run', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Structure-Token': token },
      body: JSON.stringify(payload), signal: runController.signal,
    });
    const result = await response.json();
    if (ticket !== runTicket) return;
    $('console-output').textContent = [
      result.stdout ? `标准输出\n${result.stdout}` : '',
      result.stderr ? `标准错误\n${result.stderr}` : '',
      result.diagnostics ? `编译 / 运行信息\n${result.diagnostics}` : '',
      result.error || '',
    ].filter(Boolean).join('\n\n') || '程序正常结束，没有标准输出。';
    if (!response.ok) {
      $('console-panel').open = true; openWorkspaceDock('output'); $('console-badge').textContent = '失败';
      throw new Error(result.error || '运行失败');
    }
    trace = parseTrace(result.trace); frameIndex = 0; resultSignature = fingerprint; resultOrigin = 'run'; lastRunFailed = false;
    layouts.clear(); selection = undefined;
    $('run-status').textContent = `${trace.frames.length} 帧 · ${(result.durationMs / 1000).toFixed(1)}s · ${result.compiler}`;
    $('console-badge').textContent = '成功';
    if (execution.mode === 'leetcode') { $('console-panel').open = true; openWorkspaceDock('output'); }
    renderResults(); followExecution();
  } catch (error) {
    if (ticket !== runTicket) return;
    if (error.name === 'AbortError') {
      $('run-status').textContent = '已停止'; $('console-badge').textContent = '已停止';
      $('console-output').textContent = '运行已停止。';
    }
    else {
      lastRunFailed = true;
      $('run-status').textContent = '运行失败';
      if ($('console-badge').textContent !== '失败') $('console-output').textContent = error.message;
      $('console-badge').textContent = '失败'; $('console-panel').open = true; openWorkspaceDock('output');
      renderResults(); notify(error.message, true);
    }
  } finally {
    if (ticket === runTicket) { controller = undefined; $('run-button').disabled = false; $('stop-run').hidden = true; }
  }
}
function downloadText(text, filename, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  element('a', { href: url, download: filename }).click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
async function importFile(file, forceSource = false) {
  if (!file) return;
  try {
    if (file.size > LIMITS.bytes) throw new Error('文件不能超过 25 MB');
    const text = await file.text();
    const isSource = forceSource || /\.(cpp|cc|cxx|txt)$/i.test(file.name);
    if (isSource && file.size > 200000) throw new Error('源码不能超过 200 KB');
    const imported = isSource ? undefined : parseTrace(text);
    saveDraft(); cancelRun(); clearResult();
    activeSample = 'custom'; $('sample-select').value = 'custom';
    editor.value = isSource ? text : imported.header.source?.code || '';
    previousSource = editor.value; watches = []; selectedLine = 1; $('stdin').value = '';
    setExecution();
    if (imported) { trace = imported; resultOrigin = 'import'; resultSignature = signature(); }
    $('run-status').textContent = imported ? '已导入轨迹' : '源码已打开，请添加观察变量';
    $('console-output').textContent = '运行后在这里查看输出。'; $('console-badge').textContent = ''; $('console-panel').open = false;
    saveDraft(); renderWatches(); updateCursor(); renderResults();
    notify(`已打开 ${file.name}`);
  } catch (error) { notify(`打开失败：${error.message}`, true); }
}

for (const sample of EDITOR_SAMPLES) $('sample-select').append(element('option', { value: sample.id }, sample.title));
for (const [value, title] of Object.entries(WATCH_TYPES)) $('watch-kind').append(element('option', { value }, title));
$('sample-select').addEventListener('change', event => switchSample(event.target.value));
$('watch-kind').addEventListener('change', () => watchFields(newWatchDefaults($('watch-kind').value)));
$('watch-line').addEventListener('input', updateCapturePreview);
$('watch-strategy').addEventListener('change', updateCapturePreview);
$('watch-expression').addEventListener('input', updateCapturePreview);
$('watch-form').addEventListener('submit', event => {
  event.preventDefault();
  const config = {
    ...defaultWatch($('watch-kind').value),
    ...Object.fromEntries([...$('watch-fields').querySelectorAll('[data-field]')].map(input => [input.dataset.field, input.value.trim()])),
    id: editingWatch || `w_${crypto.randomUUID().replaceAll('-', '')}`,
    expression: $('watch-expression').value.trim(), line: Number($('watch-line').value),
    strategy: $('watch-strategy').value,
    color: watches.find(w => w.id === editingWatch)?.color || watches.find(w => w.expression === $('watch-expression').value.trim())?.color || WATCH_COLORS.find(color => !watches.some(w => watchColor(w, watches) === color)) || WATCH_COLORS[0],
  };
  try {
    if (config.strategy === 'changes') {
      const lines = captureLines(editor.value, config);
      if (!lines.length) throw new Error('未识别到可安全采集的修改行，请指定采集行或将语句拆行并补上大括号');
      config.line = lines[0];
    }
    const next = editingWatch ? watches.map(w => w.id === editingWatch ? config : w) : [...watches, config];
    validateWatches(next, editor.value.split('\n').length);
    watches = next; saveDraft(); renderWatches(); renderResults(); $('watch-dialog').close();
  } catch (error) { $('watch-error').textContent = error.message; $('watch-error').hidden = false; }
});
$('add-watch').addEventListener('click', () => openWatch());
for (const id of ['cancel-watch', 'close-watch']) $(id).addEventListener('click', () => $('watch-dialog').close());
$('guide-button').addEventListener('click', () => { stopPlayback(); $('guide').showModal(); });
$('close-guide').addEventListener('click', () => $('guide').close());
editor.addEventListener('input', sourceChanged);
editor.addEventListener('scroll', syncHighlights);
editor.addEventListener('contextmenu', event => {
  const rect = editor.getBoundingClientRect();
  const style = getComputedStyle(editor), canvas = document.createElement('canvas');
  const context = canvas.getContext('2d'); context.font = `${style.fontSize} ${style.fontFamily}`;
  const width = context.measureText('M').width;
  const lines = editor.value.split('\n');
  const row = Math.floor((event.clientY - rect.top + editor.scrollTop - 14) / 22);
  if (row < 0 || row >= lines.length) return;
  const x = event.clientX - rect.left + editor.scrollLeft;
  if (x < 0) return;
  let visual = 0, offset = 0;
  for (; offset < lines[row].length; offset++) {
    visual += lines[row][offset] === '\t' ? width * 4 - visual % (width * 4) : context.measureText(lines[row][offset]).width;
    if (visual > x) break;
  }
  const start = lines.slice(0, row).reduce((sum, text) => sum + text.length + 1, 0);
  const name = identifierAt(editor.value, start + offset);
  if (!name || /^(?:int|long|short|float|double|char|bool|void|auto|const|static|unsigned|signed|struct|class|public|private|protected|return|if|else|while|for|break|continue|new|delete|true|false|nullptr|using|namespace|include|std)$/.test(name)) return;
  event.preventDefault();
  const existing = watches.find(w => w.expression === name);
  if (existing) { openWatch(existing); return; }
  const declaration = codeOnly(editor.value).split('\n').find(line => !/^\s*#/.test(line) && new RegExp(`\\b${name}\\b`).test(line) && /stack|vector|array|deque|list|map|set|int|long|double|float|bool|char|Node/.test(line)) || '';
  const kind = /\bstack\s*</.test(declaration) ? 'stack' : /vector\s*<\s*vector|\[.*\]\s*\[/.test(declaration) ? 'matrix'
    : /vector|array|deque|\[[^\]]*\]/.test(declaration) ? 'array'
    : /TreeNode/.test(declaration) ? 'tree' : /ListNode/.test(declaration) ? 'list' : 'scalar';
  openWatch(undefined, { ...newWatchDefaults(kind), expression: name, line: row + 1, strategy: 'changes' });
});
editor.addEventListener('click', updateCursor);
editor.addEventListener('keyup', updateCursor);
editor.addEventListener('scroll', () => { $('line-gutter').scrollTop = editor.scrollTop; });
editor.addEventListener('keydown', event => {
  if (event.key === 'Tab') {
    event.preventDefault();
    editor.setRangeText('    ', editor.selectionStart, editor.selectionEnd, 'end');
    sourceChanged();
  }
});
$('stdin').addEventListener('input', () => { saveDraft(); renderResults(); });
for (const id of ['execution-mode', 'leetcode-method', 'leetcode-arguments', 'leetcode-nodes']) {
  const input = $(id);
  input.addEventListener(input.tagName === 'SELECT' ? 'change' : 'input', () => {
    stopPlayback(); renderExecutionMode(); saveDraft(); renderResults();
  });
}
$('run-button').addEventListener('click', run);
$('stop-run').addEventListener('click', () => controller?.abort());
$('play').addEventListener('click', togglePlayback);
for (const [id, change] of [['previous', -1], ['next', 1], ['restart', null]]) $(id).addEventListener('click', () => { stopPlayback(); setFrame(change === null ? 0 : frameIndex + change); });
$('timeline').addEventListener('input', event => { stopPlayback(); setFrame(Number(event.target.value)); });
$('speed').addEventListener('change', () => { if (playTimer) { stopPlayback(); togglePlayback(); } });
$('load-source').addEventListener('click', () => $('source-input').click());
$('import-button').addEventListener('click', () => $('file-input').click());
$('source-input').addEventListener('change', event => { importFile(event.target.files[0], true); event.target.value = ''; });
$('file-input').addEventListener('change', event => { importFile(event.target.files[0]); event.target.value = ''; });
$('save-source').addEventListener('click', () => downloadText(editor.value, 'main.cpp', 'text/plain;charset=utf-8'));
$('export-button').addEventListener('click', () => { if (trace) downloadText(serializeTrace(trace), 'trace.jsonl', 'application/x-ndjson'); });
document.addEventListener('keydown', event => {
  if (event.key === 'F5' && !event.ctrlKey && !event.metaKey && !event.altKey) {
    event.preventDefault();
    if (event.repeat || $('watch-dialog').open || $('guide').open) return;
    if (controller) { notify('正在编译运行，请等待完成后单步回放'); return; }
    if (!trace) { notify('请先编译并运行代码，或导入轨迹'); return; }
    stopPlayback();
    const nextIndex = frameIndex + (event.shiftKey ? -1 : 1);
    if (nextIndex < 0) { notify('已到第一步'); return; }
    if (nextIndex >= trace.frames.length) { notify('已到最后一步'); return; }
    setFrame(nextIndex);
    followExecution(true);
    return;
  }
  if ($('watch-dialog').open || $('guide').open) return;
  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') { event.preventDefault(); run(); return; }
  if (['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON'].includes(event.target.tagName) || event.ctrlKey || event.metaKey || event.altKey) return;
  if (event.code === 'Space') { event.preventDefault(); togglePlayback(); }
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); stopPlayback(); setFrame(frameIndex + (event.key === 'ArrowLeft' ? -1 : 1)); }
});
let dragDepth = 0;
document.addEventListener('dragenter', event => { if (event.dataTransfer.types.includes('Files')) { event.preventDefault(); dragDepth++; $('drop-overlay').hidden = false; } });
document.addEventListener('dragleave', () => { dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) $('drop-overlay').hidden = true; });
document.addEventListener('dragover', event => { if (event.dataTransfer.types.includes('Files')) event.preventDefault(); });
document.addEventListener('drop', event => { event.preventDefault(); dragDepth = 0; $('drop-overlay').hidden = true; importFile(event.dataTransfer.files[0]); });
try {
  const stored = JSON.parse(localStorage.getItem(storageKey));
  if (stored && EDITOR_SAMPLES.some(s => s.id === stored.activeSample) && stored.drafts && typeof stored.drafts === 'object') {
    drafts = stored.drafts; activeSample = stored.activeSample;
  }
} catch { /* A fresh workspace is always usable without local storage. */ }
initWorkspace();
switchSample(activeSample, true);
document.addEventListener('themechange', renderWatches);
