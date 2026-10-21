import { validateExecution } from '../src/execution-config.js';

// Byte escapes preserve UTF-8, quotes, NULs and control characters in C++17 strings.
function cppString(value) {
  const bytes = Buffer.from(value, 'utf8');
  return `std::string("${[...bytes].map(byte => `\\x${byte.toString(16).padStart(2, '0')}`).join('')}", ${bytes.length})`;
}

function cppValue(value) {
  const type = 'structure_lab_leetcode::Value';
  if (value === null) return `${type}{}`;
  if (Array.isArray(value)) return `${type}::array({${value.map(cppValue).join(',')}})`;
  if (typeof value === 'boolean') return `${type}::boolean(${value})`;
  if (typeof value === 'number') return `${type}::number(${cppString(String(value))})`;
  return `${type}::string(${cppString(value)})`;
}

export function wrapLeetCode(instrumentedSource, execution) {
  const config = validateExecution(execution);
  if (config.mode === 'program') return instrumentedSource;
  const prefix = ['#line 1 "leetcode-support.cpp"'];
  if (['list', 'both'].includes(config.nodes)) prefix.push('#define STRUCTURE_LAB_DEFINE_LIST_NODE');
  if (['tree', 'both'].includes(config.nodes)) prefix.push('#define STRUCTURE_LAB_DEFINE_TREE_NODE');
  prefix.push('#include "leetcode_runner.hpp"', 'using namespace std;');
  const entry = [
    '#line 1 "leetcode-entry.cpp"',
    'int main() {',
    '    try {',
    '        Solution solution;',
    `        auto arguments = ${cppValue(JSON.parse(config.arguments))};`,
    `        structure_lab_leetcode::run(solution, &Solution::${config.method}, arguments);`,
    '        return 0;',
    '    } catch (const std::exception& error) {',
    '        std::cerr << "LeetCode: " << error.what() << std::endl;',
    '        return 2;',
    '    }',
    '}',
  ];
  return [...prefix, instrumentedSource, ...entry].join('\n');
}
