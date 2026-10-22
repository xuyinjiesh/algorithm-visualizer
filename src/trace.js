export const LIMITS = { bytes: 25 * 1024 * 1024, frames: 5000, structures: 24, nodes: 1000, edges: 5000, cells: 40000 };
const states = new Set(['default', 'active', 'visited', 'frontier', 'done']);
const plain = x => x && typeof x === 'object' && !Array.isArray(x);
const fail = message => { throw new Error(message); };
const text = (x, context, max = 10000) => typeof x === 'string' && x.length <= max ? x : fail(`${context} 必须是长度不超过 ${max} 的字符串`);
const value = x => x === null || typeof x === 'boolean' || typeof x === 'string' || (typeof x === 'number' && Number.isFinite(x));
const state = x => x === undefined || states.has(x);

export function validateTrace(records) {
  if (!Array.isArray(records) || !records.length) fail('轨迹为空');
  const [header, ...frames] = records;
  if (!plain(header) || header.type !== 'header' || header.version !== 1) fail('需要 version: 1 的 header 记录');
  text(header.title, '轨迹标题', 200);
  if (header.source !== undefined) {
    if (!plain(header.source)) fail('source 格式错误');
    text(header.source.file, '源文件名', 1000);
    text(header.source.code, '源码', 500000);
  }
  if (!frames.length || frames.length > LIMITS.frames) fail(`帧数必须为 1–${LIMITS.frames}`);
  frames.forEach((frame, index) => {
    const ctx = `第 ${index + 1} 帧`;
    if (!plain(frame) || frame.type !== 'frame' || frame.seq !== index) fail(`${ctx} 的 type 或连续 seq 不正确`);
    text(frame.label, `${ctx}说明`, 2000);
    if (frame.source !== undefined && (!plain(frame.source) || typeof frame.source.file !== 'string' || !Number.isInteger(frame.source.line) || frame.source.line < 1)) fail(`${ctx}源码位置无效`);
    if (frame.variables !== undefined && (!plain(frame.variables) || Object.keys(frame.variables).length > 100 || !Object.values(frame.variables).every(value))) fail(`${ctx}变量无效`);
    if (!Array.isArray(frame.structures) || frame.structures.length > LIMITS.structures) fail(`${ctx}结构列表无效`);
    const structureIds = new Set();
    for (const s of frame.structures) {
      if (!plain(s)) fail(`${ctx}结构无效`);
      text(s.id, '结构 ID', 200); text(s.name, '结构名称', 200);
      if (structureIds.has(s.id)) fail(`${ctx}包含重复结构 ID`);
      structureIds.add(s.id);
      if (['graph', 'tree', 'list'].includes(s.kind)) {
        if (!Array.isArray(s.nodes) || s.nodes.length > LIMITS.nodes || !Array.isArray(s.edges) || s.edges.length > LIMITS.edges || typeof s.directed !== 'boolean') fail(`${ctx}节点或边列表无效或超过限制`);
        const ids = new Set(), edgeIds = new Set();
        s.nodes.forEach(n => {
          if (!plain(n)) fail('节点格式错误');
          text(n.id, '节点 ID', 200); text(n.label, '节点标签', 1000);
          if (ids.has(n.id) || !state(n.state)) fail('节点 ID 重复或状态无效');
          ids.add(n.id);
        });
        s.edges.forEach(e => {
          if (!plain(e)) fail('边格式错误');
          text(e.id, '边 ID', 200);
          if (edgeIds.has(e.id) || !ids.has(e.source) || !ids.has(e.target) || !state(e.state) || (e.weight !== undefined && !value(e.weight))) fail('边 ID 重复、端点缺失或属性无效');
          edgeIds.add(e.id);
        });
        for (const key of ['root', 'head']) if (s[key] !== undefined && s[key] !== null && !ids.has(s[key])) fail(`${key} 指向不存在的节点`);
      } else if (s.kind === 'stack') {
        if (!Array.isArray(s.columns) || s.columns.length < 1 || s.columns.length > 2) fail('栈需要 1–2 个成员列');
        s.columns.forEach(column => text(column, '栈成员名称', 100));
        if (!Array.isArray(s.items) || s.items.length > LIMITS.nodes) fail('栈最多包含 1000 个元素');
        for (const item of s.items) {
          if (!Array.isArray(item) || item.length !== s.columns.length) fail('栈元素的成员数量不一致');
          for (const cell of item) {
            if (!plain(cell)) fail('栈成员格式错误');
            text(cell.text, '栈成员值', 1000);
            if (cell.nodeId !== undefined && cell.nodeId !== null) text(cell.nodeId, '栈节点 ID', 200);
          }
        }
      } else if (s.kind === 'matrix' || s.kind === 'array') {
        if (!Array.isArray(s.values)) fail('矩阵 values 必须是二维数组');
        const columns = s.values[0]?.length ?? 0;
        if (s.values.length > LIMITS.cells || columns > LIMITS.cells || s.values.length * columns > LIMITS.cells || !s.values.every(row => Array.isArray(row) && row.length === columns && row.every(value))) fail('矩阵必须是大小合法的矩形，且仅含标量值');
        const validCell = c => Array.isArray(c) && c.length === 2 && c.every(Number.isInteger) && c[0] >= 0 && c[0] < s.values.length && c[1] >= 0 && c[1] < columns;
        if (s.marks !== undefined && (!Array.isArray(s.marks) || s.marks.length > LIMITS.cells || !s.marks.every(m => plain(m) && validCell([m.row, m.col]) && state(m.state)))) fail('矩阵高亮位置无效');
        if (s.dependencies !== undefined && (!Array.isArray(s.dependencies) || s.dependencies.length > LIMITS.cells || !s.dependencies.every(d => plain(d) && validCell(d.from) && validCell(d.to)))) fail('矩阵依赖位置无效');
      } else fail(`不支持的结构类型：${s.kind}`);
    }
  });
  return { header, frames };
}

export function parseTrace(input) {
  if (new TextEncoder().encode(input).byteLength > LIMITS.bytes) fail('轨迹文件不能超过 25 MB');
  const lines = input.replace(/^\uFEFF/, '').split(/\r?\n/).filter(line => line.trim());
  if (lines.length > LIMITS.frames + 1) fail('轨迹超过 5000 帧');
  return validateTrace(lines.map((line, index) => {
    try { return JSON.parse(line); } catch { return fail(`第 ${index + 1} 行不是有效 JSON`); }
  }));
}

export function serializeTrace(trace) {
  return [trace.header, ...trace.frames].map(record => JSON.stringify(record)).join('\n') + '\n';
}

export function changedItems(current, previous) {
  const changed = new Set();
  if (!previous || previous.kind !== current.kind) return changed;
  if (current.kind === 'stack') {
    current.items.forEach((item, i) => item.forEach((cell, col) => {
      if (JSON.stringify(cell) !== JSON.stringify(previous.items[i]?.[col])) changed.add(`item:${i}:${col}`);
    }));
  } else if (current.values) {
    current.values.forEach((row, r) => row.forEach((v, c) => { if (v !== previous.values?.[r]?.[c]) changed.add(`${r}:${c}`); }));
  } else {
    const nodes = new Map(previous.nodes.map(n => [n.id, n]));
    const edges = new Map(previous.edges.map(e => [e.id, e]));
    current.nodes.forEach(n => { if (JSON.stringify(n) !== JSON.stringify(nodes.get(n.id))) changed.add(`node:${n.id}`); });
    current.edges.forEach(e => { if (JSON.stringify(e) !== JSON.stringify(edges.get(e.id))) changed.add(`edge:${e.id}`); });
  }
  return changed;
}
