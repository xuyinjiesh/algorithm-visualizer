import { WATCH_FIELDS, WATCH_TYPES } from '../src/watch-config.js';

const escapeRegExp = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Use error locations, not template-instantiation notes, to identify the failing watch.
export function explainWatchErrors(diagnostics, watches) {
  const explanations = [];
  for (const watch of watches) {
    const location = new RegExp(`(?:^|[/\\\\])watch_${escapeRegExp(watch.id)}(?:\\(\\d+(?:,\\d+)?\\)|:\\d+(?::\\d+)?)\\s*:\\s*(?:fatal )?error\\b[^\\r\\n]*`, 'gm');
    const errors = [...diagnostics.matchAll(location)];
    if (!errors.length) continue;
    const fields = [['expression', '变量 / 表达式'], ...WATCH_FIELDS[watch.kind]];
    const invalid = new Set();
    for (const [line] of errors) {
      // MSVC's diagnostic code is stable across display languages; GCC/Clang use English.
      const undeclared = /\bC2065\b|not declared|undeclared identifier/.test(line);
      if (!undeclared) continue;
      const name = line.match(/[“‘'`]([a-zA-Z_]\w*)[”’'`]/)?.[1];
      if (!name) continue;
      for (const [key, title] of fields) {
        if (typeof watch[key] === 'string' && new RegExp(`\\b${escapeRegExp(name)}\\b`).test(watch[key])) {
          invalid.add(`${title} = ${watch[key]}（${name} 在采集位置未声明）`);
        }
      }
    }
    explanations.push(`观察“${watch.expression}”（${WATCH_TYPES[watch.kind]}，第 ${watch.line} 行）：${invalid.size ? [...invalid].join('；') : '采集代码编译失败，请检查结构类型、尺寸 / 字段及变量作用域'}。`);
  }
  return explanations;
}
