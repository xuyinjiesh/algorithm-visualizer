import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseTrace, serializeTrace, validateTrace, changedItems } from '../src/trace.js';
import { layoutStructure } from '../src/render.js';

const read = name => parseTrace(readFileSync(new URL(`../traces/${name}.jsonl`,import.meta.url),'utf8'));
const fixtures = ['bfs','bfs-matrix','bfs-star','tree','list','dp'];
for (const name of fixtures) test(`actual C++ trace: ${name} validates and round-trips`,()=>{
  const trace=read(name);assert.ok(trace.frames.length>1);assert.match(trace.header.source.code,/#include "viz.hpp"/);
  assert.deepEqual(parseTrace(serializeTrace(trace)),trace);
  for (const frame of trace.frames) assert.ok(frame.source.line<=trace.header.source.code.split('\n').length);
});
test('all graph representations produce the same topology and every BFS state',()=>{
  const normalize = trace=>trace.frames.map(frame=>({
    label:frame.label, variables:frame.variables,
    nodes:frame.structures.find(s=>s.id==='graph').nodes,
    edges:frame.structures.find(s=>s.id==='graph').edges.map(({source,target,weight})=>[source,target,weight]).sort(),
    distances:frame.structures.find(s=>s.id==='dist').values
  }));
  assert.deepEqual(normalize(read('bfs')),normalize(read('bfs-matrix')));
  assert.deepEqual(normalize(read('bfs')),normalize(read('bfs-star')));
  assert.deepEqual(read('bfs').frames.at(-1).structures.find(s=>s.id==='dist').values[0],['0','1','1','2','2','2','3','-1']);
});
test('list reversal preserves IDs and finishes with reversed links',()=>{
  const trace=read('list');const start=trace.frames[0].structures[0],end=trace.frames.at(-1).structures[0];
  assert.deepEqual(start.nodes.map(n=>n.id),end.nodes.map(n=>n.id));
  assert.equal(end.head,'4');assert.deepEqual(end.edges.map(e=>[e.source,e.target]),[['1','0'],['2','1'],['3','2'],['4','3']]);
});
test('DP transitions match recorded dependencies and final answer',()=>{
  const trace=read('dp');assert.equal(trace.frames.at(-1).structures[0].values[4][5],'126');
  for(const frame of trace.frames.slice(1,-1)){
    const s=frame.structures[0],active=s.marks.find(m=>m.state==='active');
    if(active.row&&active.col)assert.equal(Number(s.values[active.row][active.col]),s.dependencies.reduce((sum,d)=>sum+Number(s.values[d.from[0]][d.from[1]]),0));
  }
});
test('inorder traversal yields sorted values',()=>assert.equal(read('tree').frames.at(-1).variables.inorder,'[2, 4, 6, 8, 10, 12, 14]'));
test('matrix diff highlights only changed cells',()=>assert.deepEqual([...changedItems({kind:'matrix',values:[[1,2],[3,5]]},{kind:'matrix',values:[[1,2],[3,4]]})],['1:1']));
test('graph diff detects a changed next pointer',()=>{
  const trace=read('list');assert.ok(changedItems(trace.frames[3].structures[0],trace.frames[2].structures[0]).has('edge:1.next'));
});
test('tree layout terminates on cycles and disconnected nodes',()=>{
  const s={id:'g',kind:'tree',root:'a',nodes:[{id:'a'},{id:'b'},{id:'c'}],edges:[{id:'a',source:'a',target:'b'},{id:'b',source:'b',target:'a'}]};
  const layout=layoutStructure(s,[{structures:[s]}]);assert.equal(layout.positions.size,3);for(const p of layout.positions.values())assert.ok(Number.isFinite(p.x)&&Number.isFinite(p.y));
});
test('layout preserves positions across linked list rewiring',()=>{
  const trace=read('list');assert.deepEqual(layoutStructure(trace.frames[0].structures[0],trace.frames),layoutStructure(trace.frames.at(-1).structures[0],trace.frames));
});
const minimal=()=>[{type:'header',version:1,title:'test'},{type:'frame',seq:0,label:'test',structures:[{id:'g',name:'g',kind:'graph',directed:true,nodes:[{id:'0',label:'0'}],edges:[]}]}];
test('rejects malformed JSON and unsupported protocol versions',()=>{
  assert.throws(()=>parseTrace('{oops'),/第 1 行/);const records=minimal();records[0].version=2;assert.throws(()=>validateTrace(records),/version/);
});
test('rejects missing edge endpoints and duplicate IDs',()=>{
  const records=minimal();records[1].structures[0].edges.push({id:'e',source:'0',target:'missing'});assert.throws(()=>validateTrace(records),/端点/);
  const duplicate=minimal();duplicate[1].structures[0].nodes.push({id:'0',label:'another'});assert.throws(()=>validateTrace(duplicate),/重复/);
});
test('rejects inconsistent frame numbers, matrix shapes and dependencies',()=>{
  const records=minimal();records[1].seq=1;assert.throws(()=>validateTrace(records),/seq/);
  const matrix=minimal();matrix[1].structures=[{id:'m',name:'m',kind:'matrix',values:[[1],[2,3]]}];assert.throws(()=>validateTrace(matrix),/矩形/);
  matrix[1].structures[0].values=[[1]];matrix[1].structures[0].dependencies=[{from:[2,0],to:[0,0]}];assert.throws(()=>validateTrace(matrix),/依赖/);
});
test('accepts a BOM, blank lines, escaped labels, self-loops and parallel edges',()=>{
  const records=minimal();records[0].title='<img src=x onerror=alert(1)>';records[1].structures[0].edges=[{id:'a',source:'0',target:'0',weight:0},{id:'b',source:'0',target:'0',weight:3}];
  const text=records.map(JSON.stringify).join('\r\n');assert.equal(parseTrace('\uFEFF\n'+text+'\n\n').frames[0].structures[0].edges.length,2);
});
