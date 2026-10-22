import { changedItems } from './trace.js';
import { layoutTree, treeSide } from './tree-layout.js';
const NS = 'http://www.w3.org/2000/svg';
let renderSequence = 0;
const palette = {
  default: { fill:'var(--node-fill)', stroke:'var(--node-stroke)', text:'var(--node-text)' },
  frontier: { fill:'var(--frontier-fill)', stroke:'var(--frontier-stroke)', text:'var(--frontier-text)' },
  active: { fill:'var(--active-fill)', stroke:'var(--active-stroke)', text:'var(--active-text)' },
  done: { fill:'var(--done-fill)', stroke:'var(--done-stroke)', text:'var(--done-text)' },
  visited: { fill:'var(--done-fill)', stroke:'var(--done-stroke)', text:'var(--done-text)' },
};
export function element(tag, attributes = {}, content) {
  const el = document.createElement(tag);
  for (const [key, val] of Object.entries(attributes)) if (val !== undefined) el.setAttribute(key, val);
  if (content !== undefined) el.textContent = content;
  return el;
}
function svgEl(tag, attributes = {}, content) {
  const el = document.createElementNS(NS, tag);
  for (const [key, val] of Object.entries(attributes)) el.setAttribute(key, val);
  if (content !== undefined) el.textContent = content;
  return el;
}

// Graphs/lists keep stable positions across a trace; trees follow the current topology.
export function layoutStructure(structure, frames) {
  if (structure.kind === 'tree') return layoutTree(structure);
  const nodeMap = new Map();
  for (const frame of frames) {
    const s = frame.structures.find(item => item.id === structure.id && item.kind === structure.kind);
    s?.nodes?.forEach(n => nodeMap.set(n.id, n));
  }
  const nodes = [...nodeMap.values()];
  const positions = new Map();
  const width = Math.max(640, structure.kind === 'list' ? nodes.length * 115 + 60 : 640);
  let height = 360;
  if (structure.kind === 'list') {
    nodes.forEach((node, i) => positions.set(node.id, { x: 75 + i * 115, y: 175 }));
  } else {
    // Circle layout avoids inventing algorithm-specific semantics and is deterministic.
    height = Math.max(360, Math.ceil(nodes.length / 18) * 280);
    const radiusX = Math.min(width * .37, 245), radiusY = Math.max(115, height * .35);
    nodes.forEach((n, i) => {
      const angle = -Math.PI / 2 + i * Math.PI * 2 / Math.max(nodes.length, 1);
      positions.set(n.id, nodes.length === 1 ? { x: width/2, y: height/2 } : { x: width/2 + radiusX * Math.cos(angle), y: height/2 + radiusY * Math.sin(angle) });
    });
  }
  return { positions, width, height };
}

export function renderGraph(container, structure, previous, layout, zoom, select) {
  const markerPrefix = `arrow-${++renderSequence}`;
  const { positions, width, height } = layout;
  const svg = svgEl('svg', { class: 'graph-svg', viewBox: `0 0 ${width} ${height}`, role: 'group', 'aria-label': structure.name });
  svg.style.width = `${zoom * 100}%`; svg.style.minWidth = `${zoom * 100}%`; svg.style.height = `${zoom * 100}%`;
  const defs = svgEl('defs');
  for (const [name, color] of Object.entries({ normal:'var(--edge)', active:'var(--green)', changed:'var(--changed)' })) {
    const marker = svgEl('marker', { id: `${markerPrefix}-${name}`, markerWidth: 8, markerHeight: 8, refX: 7, refY: 4, orient: 'auto', markerUnits: 'userSpaceOnUse' });
    marker.append(svgEl('path', { d: 'M 0 1 L 7 4 L 0 7 z', fill: color })); defs.append(marker);
  }
  svg.append(defs);
  const changes = changedItems(structure, previous);
  const pairs = new Map();
  structure.edges.forEach(e => { const key = JSON.stringify([e.source, e.target].sort()); if (!pairs.has(key)) pairs.set(key, []); pairs.get(key).push(e); });
  for (const e of structure.edges) {
    const a = positions.get(e.source), b = positions.get(e.target);
    if (!a || !b) continue;
    const group = pairs.get(JSON.stringify([e.source, e.target].sort()));
    let path, lx, ly;
    if (e.source === e.target) {
      const offset = group.indexOf(e) * 18;
      path = `M ${a.x-14} ${a.y-20} C ${a.x-70-offset} ${a.y-95-offset}, ${a.x+70+offset} ${a.y-95-offset}, ${a.x+15} ${a.y-21}`;
      lx = a.x; ly = a.y - 68 - offset;
    } else {
      const dx = b.x-a.x, dy = b.y-a.y, distance = Math.hypot(dx,dy) || 1;
      const ux = dx/distance, uy = dy/distance;
      const bend = (group.indexOf(e) - (group.length-1)/2) * 35;
      const sign = e.source < e.target ? 1 : -1;
      const cx = (a.x+b.x)/2 - uy*bend*sign, cy = (a.y+b.y)/2 + ux*bend*sign;
      const startD = Math.hypot(cx-a.x,cy-a.y) || 1, endD = Math.hypot(b.x-cx,b.y-cy) || 1;
      const radius = structure.kind === 'list' ? 35 : 27;
      const sx = a.x+(cx-a.x)/startD*radius, sy = a.y+(cy-a.y)/startD*radius;
      const ex = b.x-(b.x-cx)/endD*(radius+4), ey = b.y-(b.y-cy)/endD*(radius+4);
      path = `M ${sx} ${sy} Q ${cx} ${cy} ${ex} ${ey}`;
      lx = .25*sx+.5*cx+.25*ex; ly = .25*sy+.5*cy+.25*ey - 7;
    }
    const changed = changes.has(`edge:${e.id}`), active = e.state === 'active';
    const color = active ? 'var(--green)' : changed ? 'var(--changed)' : 'var(--edge)';
    const side = structure.kind === 'tree' ? treeSide(e) : undefined;
    const description = `${side === 'left' ? '左孩子' : side === 'right' ? '右孩子' : '边'} ${e.id}: ${e.source} → ${e.target}`;
    const g = svgEl('g', { class: 'edge', tabindex: 0, role: 'button', 'aria-label': description });
    if (side) g.append(svgEl('title', {}, description));
    g.append(svgEl('path', { class: 'edge-hit', d: path }));
    g.append(svgEl('path', { class: 'edge-line', d: path, fill: 'none', stroke: color, 'stroke-width': active ? 2.5 : 1.5, ...(structure.directed ? { 'marker-end': `url(#${markerPrefix}-${active ? 'active' : changed ? 'changed' : 'normal'})` } : {}) }));
    const sideVisibleInLayout = side && b.y > a.y && (side === 'left' ? b.x < a.x : b.x > a.x);
    if (e.weight !== undefined && e.weight !== '' && !sideVisibleInLayout) {
      g.append(svgEl('text', { x: lx, y: ly, fill: 'var(--muted)', 'font-size': 11, 'text-anchor': 'middle', 'paint-order': 'stroke', stroke: 'var(--bg)', 'stroke-width': 5 }, String(e.weight)));
    }
    const onSelect = () => select({ type: 'edge', id: e.id });
    g.addEventListener('click', onSelect); g.addEventListener('keydown', event => { if (event.key === 'Enter') onSelect(); });
    svg.append(g);
  }
  for (const n of structure.nodes) {
    const p = positions.get(n.id); if (!p) continue;
    const colors = palette[n.state ?? 'default'];
    const g = svgEl('g', { class: 'node', transform: `translate(${p.x},${p.y})`, tabindex: 0, role: 'button', 'aria-label': `节点 ${n.label}，${n.state ?? 'default'}` });
    const list = structure.kind === 'list';
    if (changes.has(`node:${n.id}`)) g.append(list ? svgEl('rect', { class: 'changed-ring', x:-38,y:-30,width:76,height:60,rx:10 }) : svgEl('circle', { class: 'changed-ring', r:33 }));
    g.append(list ? svgEl('rect', { class:'node-body',x:-32,y:-24,width:64,height:48,rx:8,fill:colors.fill,stroke:colors.stroke,'stroke-width':1.5 }) : svgEl('circle', { class:'node-body',r:26,fill:colors.fill,stroke:colors.stroke,'stroke-width':1.5 }));
    g.append(svgEl('text', { y:5,'text-anchor':'middle',fill:colors.text,'font-size':n.label.length>5 ? 11 : 16,'font-weight':500 }, n.label.length>16 ? n.label.slice(0,14)+'…' : n.label));
    g.append(svgEl('title', {}, `id: ${n.id}\nvalue: ${n.label}`));
    if (n.id === structure.head || n.id === structure.root) g.append(svgEl('text', { y:-43,'text-anchor':'middle',fill:'var(--accent-ink)','font-size':10 }, n.id === structure.head ? 'head ↓' : 'root ↓'));
    if (list && !structure.edges.some(e => e.source === n.id)) g.append(svgEl('text', { y:51,'text-anchor':'middle',class:'null-label' }, 'next = nullptr'));
    const onSelect = () => select({ type:'node', id:n.id });
    g.addEventListener('click', onSelect); g.addEventListener('keydown', event => { if (event.key === 'Enter') onSelect(); });
    svg.append(g);
  }
  container.replaceChildren(svg);
}

export function renderStack(container, structure, previous, zoom, select) {
  if (!structure.items.length) { container.replaceChildren(element('p', { class: 'empty-state' }, '空栈 · size() = 0')); return; }
  const wrapper = element('div', { class: 'stack-wrap', role: 'group', 'aria-label': `${structure.name}，从栈顶到栈底` });
  wrapper.style.zoom = zoom;
  const columns = `32px repeat(${structure.columns.length}, minmax(0, 1fr))`;
  const header = element('div', { class: 'stack-columns' }); header.style.gridTemplateColumns = columns;
  for (const title of ['层', ...structure.columns]) header.append(element('span', {}, title));
  wrapper.append(element('div', { class: 'stack-top' }, '栈顶 ↓  top()'), header);
  const changes = changedItems(structure, previous);
  for (let i = structure.items.length - 1; i >= 0; i--) {
    const item = structure.items[i];
    const row = element('button', { class: `stack-row${i === structure.items.length - 1 ? ' top' : ''}`, 'aria-label': `${i === structure.items.length - 1 ? '栈顶，' : ''}第 ${i} 层，${item.map((cell, c) => `${structure.columns[c]} = ${cell.nodeId ? '节点 ' : ''}${cell.text}`).join('，')}` });
    row.style.gridTemplateColumns = columns;
    row.append(element('span', { class: 'stack-index' }, String(i)));
    item.forEach((cell, c) => {
      const content = element('span', { class: `stack-cell${changes.has(`item:${i}:${c}`) ? ' changed' : ''}`, title: cell.nodeId ? `节点 ID: ${cell.nodeId}\n值: ${cell.text}` : cell.text });
      content.append(element('span', {}, `${cell.nodeId ? '→ ' : ''}${cell.text}`));
      if (cell.nodeId) content.append(element('small', {}, `#${cell.nodeId}`));
      row.append(content);
    });
    row.addEventListener('click', () => select({ type: 'stack-item', index: i }));
    wrapper.append(row);
  }
  wrapper.append(element('div', { class: 'stack-bottom' }, '栈底 · 第 0 层'));
  container.replaceChildren(wrapper);
}

export function renderMatrix(container, structure, previous, zoom, select) {
  const rows = structure.values.length, cols = structure.values[0]?.length ?? 0;
  if (!rows || !cols) { container.replaceChildren(element('p',{class:'empty-state'},'当前矩阵为空')); return; }
  const wrapper = element('div',{class:'matrix-wrap'}), grid = element('div',{class:'matrix-grid',role:'group','aria-label':structure.name});
  grid.style.gridTemplateColumns = `24px repeat(${cols}, auto)`;
  wrapper.style.zoom = zoom;
  const marks = new Map((structure.marks ?? []).map(m => [`${m.row}:${m.col}`,m.state]));
  const changes = changedItems(structure, previous);
  grid.append(element('div'));
  for (let c=0;c<cols;c++) grid.append(element('div',{class:'matrix-index'},String(c)));
  for (let r=0;r<rows;r++) {
    grid.append(element('div',{class:'matrix-index'},String(r)));
    for (let c=0;c<cols;c++) {
      const v = String(structure.values[r][c]);
      const cell = element('button',{class:`matrix-cell ${marks.get(`${r}:${c}`) ?? 'default'} ${changes.has(`${r}:${c}`)?'changed':''}`,'aria-label':`[${r}, ${c}] = ${v}`,title:`[${r}, ${c}] = ${v}`},v.length>6?v.slice(0,5)+'…':v);
      cell.addEventListener('click',()=>select({type:'cell',row:r,col:c})); grid.append(cell);
    }
  }
  wrapper.append(grid);
  if (structure.dependencies?.length) wrapper.append(element('div',{class:'matrix-dependencies'},structure.dependencies.map(d=>`[${d.from.join(', ')}] → [${d.to.join(', ')}]`).join('   ·   ')));
  container.replaceChildren(wrapper);
}
