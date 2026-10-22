import test from 'node:test';
import assert from 'node:assert/strict';
import { tokenizeCpp } from '../src/cpp-highlight.js';

function lex(source) {
  const tokens = tokenizeCpp(source);
  assert.equal(tokens.map(token => token.text).join(''), source);
  let offset = 0;
  for (const token of tokens) {
    assert.equal(token.start, offset);
    assert.equal(token.text, source.slice(token.start, token.end));
    assert.ok(token.end > token.start); offset = token.end;
  }
  return tokens;
}
test('C++ directives, types, calls, numbers and constants receive distinct tokens', () => {
  const tokens = lex('#include <vector>\nclass Solution { public: vector<int> run() { return {0xFF, 0b101, 1\'000, .5e+2, 3.0f}; } };\nbool ok = true; auto p = nullptr;');
  for (const [text, kind] of [['#include','preprocessor'],['<vector>','string'],['class','keyword'],['Solution','type'],['vector','type'],['int','type'],['run','function'],['0xFF','number'],['0b101','number'],["1'000",'number'],['.5e+2','number'],['3.0f','number'],['true','constant'],['nullptr','constant']]) {
    assert.ok(tokens.some(token => token.text === text && token.kind === kind), `${text}: ${kind}`);
  }
});
test('comments and escaped or raw strings keep keywords and watched identifiers opaque', () => {
  const tokens = lex('/* int nums;\nreturn true; */\n// nums "text"\nauto s = u8R"tag(nums ") not end\nreturn 2;)tag";\nchar c = \'\\\'\'; auto q = "say \\"hello\\"";');
  assert.equal(tokens.filter(token => token.kind === 'comment').length, 2);
  const raw = tokens.find(token => token.text.startsWith('u8R'));
  assert.equal(raw.kind, 'string');
  assert.match(raw.text, /\nreturn 2;/);
  assert.ok(!tokens.some(token => token.text === 'nums'));
});
test('unfinished editing states remain lossless without coloring the next line as a quoted literal', () => {
  for (const source of ['', '/* unfinished\nint x', 'R"tag(unfinished\n', '"unfinished', '\'x', '#\nint x;', '  \tint x = 3;\n\n']) lex(source);
  const tokens = lex('"unfinished\nint value;');
  assert.ok(tokens.some(token => token.text === 'int' && token.kind === 'type'));
  assert.ok(lex('#\nint x;').some(token => token.text === 'int' && token.kind === 'type'));
});
test('source text containing markup stays plain token text and continued comments stay comments', () => {
  const source = '// comment \\\nint ignored;\ncout << "<script>alert(1)</script>";\n';
  const tokens = lex(source);
  assert.ok(tokens[0].text.includes('int ignored;'));
  assert.equal(tokens[0].kind, 'comment');
  assert.ok(tokens.some(token => token.text === '"<script>alert(1)</script>"' && token.kind === 'string'));
});
