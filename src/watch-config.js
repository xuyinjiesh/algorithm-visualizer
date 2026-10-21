export const WATCH_TYPES = {
  adjacency: '图 · 邻接表',
  graph_matrix: '图 · 邻接矩阵',
  forward_star: '图 · 链式前向星',
  tree: '二叉树 · 指针',
  list: '链表 · 指针',
  matrix: '二维矩阵',
  array: '一维数组',
};

export const WATCH_FIELDS = {
  adjacency: [
    ['first', '起始下标', '0'],
    ['count', '节点数量', 'adj.size()'],
    ['entry', '邻接条目', 'scalar', ['scalar:节点编号', 'pair:pair<终点, 权重>', 'fields:结构体字段']],
    ['toField', '终点字段', 'to'],
    ['weightField', '权重字段（可空）', 'weight'],
    ['directed', '边的方向', 'true', ['true:有向图', 'false:无向图（对称存储）']],
    ['active', '当前节点表达式（可空）', ''],
  ],
  graph_matrix: [
    ['first', '起始下标', '0'], ['count', '节点数量', 'n'],
    ['absent', '无边标记', '-1'],
    ['directed', '边的方向', 'true', ['true:有向图', 'false:无向图（对称矩阵）']],
    ['active', '当前节点表达式（可空）', ''],
  ],
  forward_star: [
    ['to', '终点数组', 'to'], ['next', '下一条边数组', 'nxt'],
    ['weight', '权重数组（可空）', 'weight'],
    ['first', '起始节点下标', '0'], ['count', '节点数量', 'n'],
    ['end', '链尾标记', '-1'], ['edgeCount', '边数组有效下标上界', 'm'],
    ['active', '当前节点表达式（可空）', ''],
  ],
  tree: [['valueField', '节点值字段', 'value'], ['left', '左孩子字段', 'left'], ['right', '右孩子字段', 'right']],
  list: [['valueField', '节点值字段', 'value'], ['nextField', 'next 字段', 'next']],
  matrix: [
    ['rows', '行数', 'rows'], ['cols', '列数', 'cols'],
    ['activeRow', '当前行表达式（可空）', ''], ['activeCol', '当前列表达式（可空）', ''],
  ],
  array: [['count', '元素数量', 'n'], ['active', '当前下标表达式（可空）', '']],
};

export function defaultWatch(kind = 'matrix') {
  return { kind, expression: '', line: 1, ...Object.fromEntries(WATCH_FIELDS[kind].map(([key, , value]) => [key, value])) };
}

export function validateWatches(watches, lineCount) {
  if (!Array.isArray(watches) || watches.length < 1 || watches.length > 12) throw new Error('请添加 1–12 个观察变量');
  const ids = new Set();
  for (const watch of watches) {
    if (!watch || !Object.hasOwn(WATCH_TYPES, watch.kind)) throw new Error('不支持的变量结构类型');
    if (typeof watch.id !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(watch.id) || ids.has(watch.id)) throw new Error('观察变量 ID 无效或重复');
    ids.add(watch.id);
    if (!Number.isInteger(watch.line) || watch.line < 1 || watch.line > lineCount) throw new Error(`${watch.expression || '变量'} 的采集行超出源码范围`);
    if (typeof watch.expression !== 'string' || !watch.expression.trim() || watch.expression.length > 200 || /[\r\n#]/.test(watch.expression)) throw new Error('变量表达式不能为空，且必须在一行内');
    for (const [key] of WATCH_FIELDS[watch.kind]) {
      if (typeof watch[key] !== 'string' || watch[key].length > 200 || /[\r\n#]/.test(watch[key])) throw new Error(`${key} 配置无效`);
    }
    if (['tree', 'list'].includes(watch.kind)) {
      for (const key of watch.kind === 'tree' ? ['valueField', 'left', 'right'] : ['valueField', 'nextField'])
        if (!/^[a-zA-Z_]\w*$/.test(watch[key])) throw new Error('节点字段必须是简单的 C++ 成员名');
    }
    if (watch.kind === 'adjacency') {
      if (!['scalar', 'pair', 'fields'].includes(watch.entry)) throw new Error('邻接条目类型无效');
      if (watch.entry === 'fields' && (!/^[a-zA-Z_]\w*$/.test(watch.toField) || (watch.weightField && !/^[a-zA-Z_]\w*$/.test(watch.weightField)))) throw new Error('邻接条目的字段名无效');
    }
    if ('directed' in watch && !['true', 'false'].includes(watch.directed)) throw new Error('图的方向配置无效');
    const required = {
      adjacency: ['first', 'count'], graph_matrix: ['first', 'count', 'absent'],
      forward_star: ['to', 'next', 'first', 'count', 'end', 'edgeCount'],
      matrix: ['rows', 'cols'], array: ['count'], tree: [], list: [],
    }[watch.kind];
    for (const key of required) if (!watch[key].trim()) throw new Error(`${key} 不能为空`);
    if (watch.kind === 'matrix' && Boolean(watch.activeRow.trim()) !== Boolean(watch.activeCol.trim())) throw new Error('当前行和当前列需要一起填写');
  }
  return watches;
}
