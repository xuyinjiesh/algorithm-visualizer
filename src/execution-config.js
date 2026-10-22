import { analyzeLeetCode, nodeDefinitionsFor } from './leetcode-analysis.js';

export const DEFAULT_EXECUTION = { mode: 'program', method: '', arguments: '[]', nodes: 'auto' };

export function normalizeExecution(value) {
  if (value === undefined) return { ...DEFAULT_EXECUTION };
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('运行模式配置无效');
  const config = { ...DEFAULT_EXECUTION, ...value };
  if (!['program', 'leetcode'].includes(config.mode)) throw new Error('运行模式无效');
  if (!['auto', 'none', 'list', 'tree', 'both'].includes(config.nodes)) throw new Error('节点定义配置无效');
  if (typeof config.method !== 'string' || config.method.length > 100) throw new Error('方法名不能超过 100 个字符');
  if (typeof config.arguments !== 'string' || config.arguments.length > 65536) throw new Error('测试参数不能超过 64 KB');
  return { mode: config.mode, method: config.method.trim(), arguments: config.arguments, nodes: config.nodes };
}

export function validateExecution(value, source = '') {
  const config = normalizeExecution(value);
  if (config.mode === 'program') return config;
  const analysis = analyzeLeetCode(source);
  if (!config.method) {
    if (!analysis.methods.length) throw new Error('未识别到可调用的 public 方法，请检查 Solution 或手动填写方法名');
    if (analysis.methods.length > 1) throw new Error(`检测到多个 public 方法（${analysis.methods.join('、')}），请手动填写调用方法名；重载方法需在源码中改为不同名称`);
    config.method = analysis.methods[0];
  }
  if (!/^[a-zA-Z_]\w*$/.test(config.method)) throw new Error('方法名须为 Solution 中的 public 方法名，例如 runningSum');
  if (analysis.allMethods.filter(name => name === config.method).length > 1) throw new Error('调用方法存在重载，请先在源码中为要调用的方法使用唯一名称');
  const definitions = nodeDefinitionsFor(config.nodes, analysis);
  config.nodes = definitions.length === 2 ? 'both' : definitions[0] === 'ListNode' ? 'list' : definitions[0] === 'TreeNode' ? 'tree' : 'none';
  if (new TextEncoder().encode(config.arguments).length > 65536) throw new Error('测试参数不能超过 64 KB');
  let args;
  try { args = JSON.parse(config.arguments); }
  catch { throw new Error('测试参数必须是 JSON 数组，例如 [[1,2,3,4]]'); }
  if (!Array.isArray(args) || args.length > 16) throw new Error('测试参数最外层必须是数组，最多 16 个参数；无参方法填写 []');
  let count = 0;
  function check(item, depth) {
    if (++count > 40000 || depth > 32) throw new Error('测试参数过大或嵌套超过 32 层');
    if (Array.isArray(item)) { item.forEach(value => check(value, depth + 1)); return; }
    if (typeof item === 'number') {
      if (!Number.isFinite(item) || (Number.isInteger(item) && !Number.isSafeInteger(item))) throw new Error('测试参数中的整数需在 JavaScript 安全整数范围内，且数值必须有限');
      return;
    }
    if (item === null || typeof item === 'boolean' || typeof item === 'string') return;
    throw new Error('测试参数支持数字、字符串、布尔值、null 和数组，不支持 JSON 对象');
  }
  args.forEach(item => check(item, 0));
  return config;
}
