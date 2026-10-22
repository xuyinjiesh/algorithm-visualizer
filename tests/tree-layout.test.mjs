import test from 'node:test';
import assert from 'node:assert/strict';
import { layoutStructure } from '../src/render.js';

const tree = (ids, links, root = ids[0]) => ({
  id: 'tree', kind: 'tree', root,
  nodes: ids.map(id => ({ id, label: id })),
  edges: links.map(([source, target, weight]) => ({ id: `${source}.${weight}`, source, target, weight })),
});
const layout = structure => layoutStructure(structure, [{ structures: [structure] }]);
function checkDirections(structure, result) {
  for (const edge of structure.edges) {
    const parent = result.positions.get(edge.source), child = result.positions.get(edge.target);
    assert.ok(child.y > parent.y);
    assert.ok(edge.weight === 'L' ? child.x < parent.x : child.x > parent.x, `${edge.source} -> ${edge.target} must point ${edge.weight}`);
  }
}

test('LeetCode [1,null,2,3] bends right then left, including absent siblings', () => {
  const structure = tree(['1', '2', '3'], [['1', '2', 'R'], ['2', '3', 'L']]);
  const result = layout(structure);
  checkDirections(structure, result);
  assert.equal(result.positions.get('1').x, result.positions.get('3').x);
  const mirrored = { ...structure, edges: structure.edges.map(e => ({ ...e, weight: e.weight === 'L' ? 'R' : 'L' })) };
  checkDirections(mirrored, layout(mirrored));
});

test('uneven subtrees keep left/right order and do not overlap at any level', () => {
  const structure = tree(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'], [
    ['a', 'b', 'L'], ['a', 'c', 'R'], ['b', 'd', 'R'], ['d', 'e', 'R'],
    ['c', 'f', 'L'], ['f', 'g', 'L'], ['f', 'h', 'R'],
  ]);
  const result = layout(structure);
  checkDirections(structure, result);
  const levels = new Map();
  for (const position of result.positions.values()) {
    if (!levels.has(position.y)) levels.set(position.y, []);
    levels.get(position.y).push(position.x);
    assert.ok(position.x >= 26 && position.x <= result.width - 26);
  }
  for (const xs of levels.values()) {
    xs.sort((a, b) => a - b);
    xs.slice(1).forEach((x, i) => assert.ok(x - xs[i] >= 96));
  }
  assert.deepEqual(layout({ ...structure, edges: [...structure.edges].reverse() }), result);
});

test('tree layout uses the current snapshot after inversion and node removal', () => {
  const before = tree(['1', '2', '3'], [['1', '2', 'R'], ['2', '3', 'L']]);
  const after = tree(['1', '2', '3'], [['1', '2', 'L'], ['2', '3', 'R']]);
  const removed = tree(['1'], []);
  const frames = [before, after, removed].map(s => ({ structures: [s] }));
  for (const structure of [before, after]) checkDirections(structure, layoutStructure(structure, frames));
  assert.deepEqual([...layoutStructure(removed, frames).positions.keys()], ['1']);
  assert.deepEqual(layoutStructure(before, frames), layout(before), 'replaying an earlier frame restores its shape');
});

test('a 1000-node skewed tree uses finite linear width and no recursive traversal', () => {
  const ids = Array.from({ length: 1000 }, (_, i) => String(i));
  const structure = tree(ids, ids.slice(1).map((id, i) => [ids[i], id, 'R']));
  const result = layout(structure);
  assert.equal(result.positions.size, 1000);
  assert.ok(result.width <= 1000 * 96 + 120);
  checkDirections(structure, result);
  for (const p of result.positions.values()) assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y));
  assert.equal(layout(tree([], [])).positions.size, 0);
});
