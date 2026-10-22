import test from 'node:test';
import assert from 'node:assert/strict';
import { explainWatchErrors } from '../scripts/watch-diagnostics.mjs';
import { defaultWatch } from '../src/watch-config.js';

const watches = [{ ...defaultWatch('array'), id: 'ans', expression: 'ans', count: 'n', line: 28 },
  { ...defaultWatch('matrix'), id: 'grid', expression: 'grid', rows: 'rows', cols: 'cols', line: 9 }];

test('watch diagnostics identify the variable and field for MSVC, GCC and Clang', () => {
  for (const diagnostic of [
    'watch_ans(2): error C2065: “n”: 未声明的标识符',
    'watch_ans:2:91: error: ‘n’ was not declared in this scope',
    "watch_ans:2:91: error: use of undeclared identifier 'n'",
  ]) {
    const result = explainWatchErrors(diagnostic, watches);
    assert.equal(result.length, 1);
    assert.match(result[0], /观察“ans”.*一维数组.*第 28 行.*元素数量.*n 在采集位置未声明/);
  }
});

test('source errors and instantiation notes are not mistaken for watch errors', () => {
  assert.deepEqual(explainWatchErrors('main.cpp(28): error C2065: “n”: 未声明的标识符\nwatch_ans(1): note: 模板实例化上下文', watches), []);
  const result = explainWatchErrors('watch_grid(3): error C2065: “cols”: 未声明的标识符\nwatch_grid(1): note: 模板实例化上下文', watches);
  assert.equal(result.length, 1);
  assert.match(result[0], /观察“grid”.*列数.*cols/);
  assert.doesNotMatch(result[0], /行数/);
});
