import { validateWatches } from '../src/watch-config.js';
import { captureLines } from '../src/watch-strategy.js';

const quote = value => JSON.stringify(value);
const expr = value => `(${value.trim()})`;

export function captureCode(w) {
  const source = expr(w.expression);
  const lines = [];
  const add = text => lines.push(text);
  let kind = w.kind;
  if (w.kind === 'scalar') {
    kind = 'array';
    add(`__sl_view.values(std::vector<std::vector<std::string>>{{viz::str(${source})}});`);
  } else if (w.kind === 'matrix') {
    add(`const auto& __sl_data = ${source};`);
    add(`int __sl_rows = structure_lab_editor::size(${w.rows.trim() ? expr(w.rows) : 'structure_lab_editor::extent(__sl_data)'});`);
    add(`int __sl_cols = structure_lab_editor::size(${w.cols.trim() ? expr(w.cols) : '__sl_rows == 0 ? 0 : structure_lab_editor::extent(__sl_data[0])'});`);
    add('if (static_cast<long long>(__sl_rows) * __sl_cols > 40000) throw std::length_error("Matrix exceeds 40000 cells");');
    add('structure_lab_editor::range(__sl_data, 0, __sl_rows);');
    add('for (int __sl_r = 0; __sl_r < __sl_rows; ++__sl_r) structure_lab_editor::range(__sl_data[__sl_r], 0, __sl_cols);');
    add('__sl_view.values(__sl_data, __sl_rows, __sl_cols);');
    if (w.activeRow && w.activeCol) {
      add(`int __sl_r = static_cast<int>(${expr(w.activeRow)}), __sl_c = static_cast<int>(${expr(w.activeCol)});`);
      add('if (__sl_r >= 0 && __sl_r < __sl_rows && __sl_c >= 0 && __sl_c < __sl_cols) __sl_view.mark(__sl_r, __sl_c);');
    }
  } else if (w.kind === 'array') {
    add(`const auto& __sl_data = ${source}; int __sl_count = structure_lab_editor::size(${w.count.trim() ? expr(w.count) : 'structure_lab_editor::extent(__sl_data)'});`);
    add('structure_lab_editor::range(__sl_data, 0, __sl_count);');
    add('std::vector<std::vector<std::string>> __sl_values(1);');
    add('for (int __sl_i = 0; __sl_i < __sl_count; ++__sl_i) __sl_values[0].push_back(viz::str(__sl_data[__sl_i]));');
    add('__sl_view.values(__sl_values);');
    if (w.active) add(`int __sl_active = static_cast<int>(${expr(w.active)}); if (__sl_active >= 0 && __sl_active < __sl_count) __sl_view.mark(0, __sl_active);`);
  } else if (w.kind === 'stack') {
    add(`structure_lab_editor::stack(__sl_view, ${source}, [](auto* p) { return p->${w.valueField}; });`);
  } else if (w.kind === 'tree') {
    add(`structure_lab_editor::tree(__sl_view, ${source}, [](auto* p) { return p->${w.valueField}; }, [](auto* p) { return p->${w.left}; }, [](auto* p) { return p->${w.right}; });`);
  } else if (w.kind === 'list') {
    add(`structure_lab_editor::list(__sl_view, ${source}, [](auto* p) { return p->${w.valueField}; }, [](auto* p) { return p->${w.nextField}; });`);
  } else {
    kind = 'graph';
    const count = w.count.trim() ? expr(w.count) : `static_cast<long long>(structure_lab_editor::extent(${source})) - __sl_first`;
    add(`int __sl_first = structure_lab_editor::size(${expr(w.first)}), __sl_count = structure_lab_editor::size(${count}, 1000);`);
    if (w.kind === 'adjacency') {
      add(`const auto& __sl_data = ${source}; structure_lab_editor::range(__sl_data, __sl_first, __sl_count);`);
      add(`__sl_view.directed(${w.directed});`);
      add('for (int __sl_u = __sl_first; __sl_u < __sl_first + __sl_count; ++__sl_u) __sl_view.node(__sl_u);');
      add('for (int __sl_u = __sl_first; __sl_u < __sl_first + __sl_count; ++__sl_u) { int __sl_index = 0; for (const auto& __sl_entry : __sl_data[__sl_u]) {');
      const destination = w.entry === 'scalar' ? '__sl_entry' : w.entry === 'pair' ? '__sl_entry.first' : `__sl_entry.${w.toField}`;
      const weight = w.entry === 'scalar' || (w.entry === 'fields' && !w.weightField) ? '""' : w.entry === 'pair' ? '__sl_entry.second' : `__sl_entry.${w.weightField}`;
      add(`int __sl_v = static_cast<int>(${destination});`);
      add('if (__sl_v < __sl_first || __sl_v >= __sl_first + __sl_count) throw std::out_of_range("Adjacency endpoint outside node range");');
      add(`if (${w.directed} || __sl_u <= __sl_v) __sl_view.edge(viz::str(__sl_u) + ":" + viz::str(__sl_index), __sl_u, __sl_v, ${weight});`);
      add('++__sl_index; }}');
    } else if (w.kind === 'graph_matrix') {
      add(`const auto& __sl_data = ${source}; structure_lab_editor::range(__sl_data, __sl_first, __sl_count);`);
      add('for (int __sl_u = __sl_first; __sl_u < __sl_first + __sl_count; ++__sl_u) structure_lab_editor::range(__sl_data[__sl_u], __sl_first, __sl_count);');
      add(`viz::adjacency_matrix(__sl_view, __sl_data, __sl_first, __sl_count, [&](int, int, const auto& __sl_weight) { return __sl_weight != ${expr(w.absent)}; }, ${w.directed});`);
    } else {
      add(`const auto& __sl_heads = ${source}; const auto& __sl_tos = ${expr(w.to)}; const auto& __sl_nexts = ${expr(w.next)};`);
      add(`int __sl_edge_count = structure_lab_editor::size(${expr(w.edgeCount)}, 5000);`);
      add('structure_lab_editor::range(__sl_heads, __sl_first, __sl_count); structure_lab_editor::range(__sl_tos, 0, __sl_edge_count); structure_lab_editor::range(__sl_nexts, 0, __sl_edge_count);');
      if (w.weight) add(`const auto& __sl_weights = ${expr(w.weight)}; structure_lab_editor::range(__sl_weights, 0, __sl_edge_count);`);
      else add('std::vector<std::string> __sl_weights(__sl_edge_count, "");');
      add(`viz::forward_star(__sl_view, __sl_heads, __sl_tos, __sl_nexts, __sl_weights, __sl_first, __sl_count, static_cast<int>(${expr(w.end)}), __sl_edge_count);`);
    }
    if (w.active) add(`int __sl_active = static_cast<int>(${expr(w.active)}); if (__sl_active >= __sl_first && __sl_active < __sl_first + __sl_count) __sl_view.node_state(__sl_active, "active");`);
  }
  const builder = kind === 'stack' ? 'structure_lab_editor::StackBuilder' : ['matrix', 'array'].includes(kind) ? 'viz::MatrixBuilder' : 'viz::GraphBuilder';
  return `structure_lab_editor::session().capture<${builder}>(${quote(w.id)}, ${quote(w.expression)}, ${quote(kind)}, ${w.line}, [&](auto& __sl_view) {\n${lines.map(line => `    ${line}`).join('\n')}\n});`;
}

export function instrument(source, watches) {
  if (typeof source !== 'string' || !source.trim() || Buffer.byteLength(source) > 200000) throw new Error('C++ 源码不能为空，且不能超过 200 KB');
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  validateWatches(watches, lines.length);
  const grouped = new Map();
  for (const watch of watches) {
    const locations = captureLines(source, watch);
    if (!locations.length) throw new Error(`“${watch.expression}”没有可安全采集的修改行，请指定采集行或将语句拆行并补上大括号`);
    for (const line of locations) {
      if (!grouped.has(line)) grouped.set(line, []);
      grouped.get(line).push({ ...watch, line });
    }
  }
  const result = ['#include "viz_editor.hpp"', '#line 1 "main.cpp"'];
  lines.forEach((line, index) => {
    result.push(line);
    const group = grouped.get(index + 1);
    if (!group) return;
    result.push('{ try {');
    for (const watch of group) {
      result.push(`#line 1 ${quote(`watch_${watch.id}`)}`);
      result.push(captureCode(watch));
    }
    result.push(`structure_lab_editor::session().step(${quote(`第 ${index + 1} 行 · ${group.map(w => w.expression).join('、')}`)}, ${index + 1});`,
      `} catch (const std::exception& __sl_error) { std::cerr << "Capture line ${index + 1}: " << __sl_error.what() << std::endl; std::exit(2); } }`);
    result.push(`#line ${index + 2} "main.cpp"`);
  });
  return result.join('\n');
}
