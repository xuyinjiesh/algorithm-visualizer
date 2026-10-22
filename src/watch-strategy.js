// Mask comments and literals while preserving offsets and source line numbers.
export function codeOnly(source) {
  return source.replace(/R"([^ ()\\\t\r\n]{0,16})\([\s\S]*?\)\1"|\/\*[\s\S]*?\*\/|\/\/[^\n]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g,
    text => text.replace(/[^\n]/g, ' '));
}

const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export const WATCH_COLORS = ['#bcf566', '#70cfff', '#ffb86b', '#c4a0ff', '#ff87b2', '#65dfc5', '#ffe178', '#a5b9ff', '#ecadff', '#94df95', '#ff9c91', '#8de1e8'];
export function watchColor(watch, watches) {
  if (WATCH_COLORS.includes(watch.color)) return watch.color;
  return WATCH_COLORS[Math.max(0, watches.findIndex(w => w.expression === watch.expression)) % WATCH_COLORS.length];
}

export function mutationLines(source, expression) {
  if (!/^[a-zA-Z_]\w*(?:(?:\.|->)[a-zA-Z_]\w*)*$/.test(expression)) return [];
  const target = `\\b${escape(expression)}(?!\\w)(?:\\s*\\[[^\\]\\n]*\\]|\\s*\\.\\s*top\\s*\\(\\s*\\)|\\s*(?:\\.|->)\\s*[a-zA-Z_]\\w*)*`;
  const mutation = new RegExp(`${target}\\s*(?:=(?!=)|(?:[+*/%&|^~-]|<<|>>)=|\\+\\+|--)|(?:\\+\\+|--)\\s*${target}|${target}\\s*\\.\\s*(?:push_back|emplace_back|pop_back|push_front|emplace_front|pop_front|push|pop|insert|emplace|erase|clear|resize|assign|swap|reverse|sort|remove|remove_if|merge|splice)\\s*\\(|\\b(?:swap|sort|reverse|fill|iota)\\s*\\([^;]*\\b${escape(expression)}\\b`);
  const clean = codeOnly(source), scopes = [], executable = [];
  let prefix = '';
  for (const character of clean) {
    if (character === '{') {
      scopes.push(scopes.at(-1) === true || /\)\s*(?:const\s*)?(?:noexcept\s*)?$/.test(prefix.trim()));
      prefix = '';
    } else if (character === '}') { scopes.pop(); prefix = ''; }
    else if (character === ';') prefix = '';
    else prefix += character;
    if (character === '\n') executable.push(scopes.at(-1) === true);
  }
  executable.push(scopes.at(-1) === true);
  return clean.split('\n').flatMap((line, index, lines) => {
    // Captures are inserted after complete statements. Control headers and closing
    // scopes need a C++ parser to insert safely; leave those to explicit watches.
    if (!executable[index] || !/;\s*$/.test(line) || /^\s*(?:for|if|while|else|return)\b/.test(line) || /^\s*#/.test(line)) return [];
    const previous = lines.slice(0, index).findLast(text => text.trim());
    if (previous && /^\s*(?:(?:if|for|while)\b.*\)|else)\s*$/.test(previous)) return [];
    const initialized = new RegExp(`\\b${escape(expression)}\\s*(?:\\[[^\\]]*\\]\\s*)*(?:\\{|\\([^;]*\\))`);
    return mutation.test(line) || initialized.test(line) ? [index + 1] : [];
  });
}

export function captureLines(source, watch) {
  return watch.strategy === 'changes' ? mutationLines(source, watch.expression) : [watch.line];
}

export function identifierAt(source, offset) {
  const code = codeOnly(source);
  if (!/[a-zA-Z0-9_]/.test(code[offset] || '')) return '';
  let start = offset, end = offset + 1;
  while (start && /\w/.test(code[start - 1])) start--;
  while (end < code.length && /\w/.test(code[end])) end++;
  const name = code.slice(start, end);
  return /^[a-zA-Z_]\w*$/.test(name) ? name : '';
}
