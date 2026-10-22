// A small declaration scanner for ordinary LeetCode snippets, not a C++ preprocessor.
// Keep comments/literals out of the token stream: LeetCode puts node examples in comments.
function tokenize(source) {
  const tokens = [];
  let i = 0;
  while (i < source.length) {
    const rest = source.slice(i);
    if (/\s/.test(source[i])) { i++; continue; }
    if (rest.startsWith('//')) { const end = source.indexOf('\n', i + 2); i = end < 0 ? source.length : end + 1; continue; }
    if (rest.startsWith('/*')) { const end = source.indexOf('*/', i + 2); i = end < 0 ? source.length : end + 2; continue; }
    if (source[i] === '#') {
      do {
        const end = source.indexOf('\n', i);
        if (end < 0) { i = source.length; break; }
        const continued = source.slice(i, end).trimEnd().endsWith('\\');
        i = end + 1;
        if (!continued) break;
      } while (i < source.length);
      continue;
    }
    const raw = rest.match(/^(?:u8|u|U|L)?R"([^ ()\\\t\r\n]{0,16})\(/);
    if (raw) {
      const close = `)${raw[1]}"`, end = source.indexOf(close, i + raw[0].length);
      i = end < 0 ? source.length : end + close.length;
      tokens.push('<literal>'); continue;
    }
    const quote = rest.match(/^(?:u8|u|U|L)?(["'])/);
    if (quote) {
      i += quote[0].length;
      while (i < source.length) {
        if (source[i] === '\\') { i += 2; continue; }
        if (source[i++] === quote[1]) break;
      }
      tokens.push('<literal>'); continue;
    }
    const token = rest.match(/^(?:[a-zA-Z_]\w*|\d[\w.']*|::|->|\.\.\.|.)/)[0];
    tokens.push(token); i += token.length;
  }
  return tokens;
}

function pairs(tokens) {
  const result = new Map(), stack = [], opening = { ')': '(', ']': '[', '}': '{' };
  tokens.forEach((token, i) => {
    if (['(', '[', '{'].includes(token)) stack.push(i);
    else if (opening[token] && tokens[stack.at(-1)] === opening[token]) {
      result.set(stack.pop(), i);
    }
  });
  return result;
}

function methodName(tokens, start, end, matching) {
  const header = tokens.slice(start, end);
  if (header.includes('template') || header.includes('friend') || header.includes('operator')) return;
  let angleDepth = 0;
  for (let i = start; i < end; i++) {
    const token = tokens[i];
    if (token === '[') { i = matching.get(i) ?? end; continue; }
    if (token === '<') angleDepth++;
    if (token === '>') angleDepth = Math.max(0, angleDepth - 1);
    if (!angleDepth && token === '=') return; // Data-member initializers are not methods.
    if (token !== '(') continue;
    const close = matching.get(i);
    if (close === undefined || close >= end) return;
    const name = tokens[i - 1];
    if (!angleDepth && name === 'Solution') return; // Constructors and destructors.
    if (!angleDepth && i - 1 > start && /^[a-zA-Z_]\w*$/.test(name)
      && !['Solution', 'decltype', 'noexcept', 'alignas', '__declspec'].includes(name)
      && !['~', '::'].includes(tokens[i - 2])) {
      if (tokens.slice(close + 1, end).some(t => t === 'delete' || t === 'default')) return;
      return name;
    }
    i = close;
  }
}

export function analyzeLeetCode(source) {
  const tokens = tokenize(source), matching = pairs(tokens);
  const methods = [], allMethods = [], definedNodes = [];
  for (const name of ['ListNode', 'TreeNode']) {
    const defined = tokens.some((token, i) => {
      if (token === 'using' && tokens[i + 1] === name && tokens[i + 2] === '=') return true;
      if (token === 'typedef') {
        let end = i + 1;
        for (; end < tokens.length && tokens[end] !== ';'; end++) {
          if (['{', '(', '['].includes(tokens[end])) end = matching.get(end) ?? tokens.length;
        }
        if (end > i && tokens[end - 1] === name) return true;
      }
      if (!['struct', 'class'].includes(token) || tokens[i + 1] !== name) return false;
      let next = i + 2;
      if (tokens[next] === 'final') next++;
      if (tokens[next] === ':') {
        while (next < tokens.length && !['{', ';'].includes(tokens[next])) next++;
      }
      return tokens[next] === '{';
    });
    if (defined) definedNodes.push(name);
  }
  for (let i = 0; i < tokens.length; i++) {
    if (!['class', 'struct'].includes(tokens[i]) || tokens[i + 1] !== 'Solution' || tokens[i - 1] === 'enum') continue;
    let open = i + 2;
    if (tokens[open] === 'final') open++;
    if (tokens[open] === ':') while (open < tokens.length && !['{', ';'].includes(tokens[open])) open++;
    if (tokens[open] !== '{' || !matching.has(open)) continue;
    const close = matching.get(open);
    let access = tokens[i] === 'struct' ? 'public' : 'private', start = open + 1;
    for (let j = start; j < close; j++) {
      if (['public', 'private', 'protected'].includes(tokens[j]) && tokens[j + 1] === ':') {
        access = tokens[j]; start = j + 2; j++; continue;
      }
      if (['(', '['].includes(tokens[j])) { j = matching.get(j) ?? close; continue; }
      if (tokens[j] !== ';' && tokens[j] !== '{') continue;
      const name = methodName(tokens, start, j, matching);
      if (name) { allMethods.push(name); if (access === 'public') methods.push(name); }
      if (tokens[j] === '{') j = matching.get(j) ?? close;
      start = j + 1;
    }
    i = close;
  }
  return {
    methods, allMethods, definedNodes,
    missingNodes: ['ListNode', 'TreeNode'].filter(name => tokens.includes(name) && !definedNodes.includes(name)),
  };
}

export function nodeDefinitionsFor(mode, analysis) {
  const requested = mode === 'auto' ? analysis.missingNodes
    : mode === 'both' ? ['ListNode', 'TreeNode'] : mode === 'list' ? ['ListNode'] : mode === 'tree' ? ['TreeNode'] : [];
  return requested.filter(name => !analysis.definedNodes.includes(name));
}
