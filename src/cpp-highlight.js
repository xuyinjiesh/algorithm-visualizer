// A lightweight lexical highlighter. Tokens preserve the source exactly, including
// unfinished literals/comments while typing; this does not parse C++ semantics.
const keywords = new Set(('alignas alignof asm auto break case catch class concept const consteval constexpr constinit const_cast continue co_await co_return co_yield decltype default delete do dynamic_cast else enum explicit export extern for friend goto if inline mutable namespace new noexcept operator private protected public register reinterpret_cast requires return sizeof static static_assert static_cast struct switch template this thread_local throw try typedef typeid typename union using virtual volatile while and and_eq bitand bitor compl not not_eq or or_eq xor xor_eq').split(' '));
const types = new Set(('bool char char8_t char16_t char32_t double float int long short signed unsigned void wchar_t size_t ptrdiff_t string string_view vector array deque list forward_list queue priority_queue stack set multiset unordered_set unordered_multiset map multimap unordered_map unordered_multimap pair tuple optional variant unique_ptr shared_ptr weak_ptr span istream ostream').split(' '));
const constants = new Set(['true', 'false', 'nullptr', 'NULL']);
const number = /(?:0[xX](?:[\da-fA-F](?:[\da-fA-F']*\.?[\da-fA-F']*)?|\.[\da-fA-F][\da-fA-F']*)(?:[pP][+-]?[\d'][\d']*)?|0[bB][01][01']*|(?:\d[\d']*(?:\.[\d']*)?|\.\d[\d']*)(?:[eE][+-]?\d[\d']*)?)(?:[uUlLfFzZ]|_[a-zA-Z_]\w*)*/y;
const quoted = /(?:u8|u|U|L)?(?:"(?:\\[\s\S]|[^"\\\r\n])*(?:"|(?=\r?\n|$))|'(?:\\[\s\S]|[^'\\\r\n])*(?:'|(?=\r?\n|$)))/y;
const identifier = /[a-zA-Z_]\w*/y;
const whitespace = /\s+/y;
const operators = /(?:->\*|<=>|<<=|>>=|::|->|\.\*|\+\+|--|&&|\|\||<<|>>|[+\-*/%=!<>^&|~?:]=?|[{}()[\],;.])/y;
function matchAt(pattern, source, offset) {
  pattern.lastIndex = offset;
  return pattern.exec(source)?.[0];
}
export function tokenizeCpp(source) {
  const tokens = [];
  let offset = 0;
  while (offset < source.length) {
    const start = offset, rest = source.slice(offset);
    let text, kind = '';
    if (rest.startsWith('//')) {
      text = /^\/\/(?:\\\r?\n|[^\r\n])*/.exec(rest)[0]; kind = 'comment';
    } else if (rest.startsWith('/*')) {
      const end = source.indexOf('*/', offset + 2);
      text = source.slice(offset, end < 0 ? source.length : end + 2); kind = 'comment';
    } else {
      const raw = /^(?:u8|u|U|L)?R"([^\s()\\]{0,16})\(/.exec(rest);
      if (raw) {
        const ending = `)${raw[1]}"`, end = source.indexOf(ending, offset + raw[0].length);
        text = source.slice(offset, end < 0 ? source.length : end + ending.length); kind = 'string';
      } else if ((text = matchAt(quoted, source, offset))) kind = 'string';
      else if (source[offset] === '#' && /^\s*$/.test(source.slice(source.lastIndexOf('\n', offset - 1) + 1, offset))) {
        text = /^#[ \t]*[a-zA-Z_]\w*/.exec(rest)?.[0] || '#'; kind = 'preprocessor';
      } else if (source[offset] === '<' && /^\s*#\s*include(?:_next)?\s*$/.test(source.slice(source.lastIndexOf('\n', offset - 1) + 1, offset))) {
        text = /^<[^>\r\n]*(?:>|(?=\r?\n|$))/.exec(rest)[0]; kind = 'string';
      } else if ((text = matchAt(number, source, offset))) kind = 'number';
      else if ((text = matchAt(identifier, source, offset))) {
        kind = keywords.has(text) ? 'keyword' : types.has(text) || /^[A-Z][a-zA-Z\d_]*$/.test(text) && !/^[A-Z\d_]+$/.test(text) ? 'type'
          : constants.has(text) ? 'constant' : /^\s*\(/.test(source.slice(offset + text.length)) ? 'function' : 'identifier';
      } else text = matchAt(whitespace, source, offset) || matchAt(operators, source, offset) || source[offset];
    }
    offset += text.length;
    tokens.push({ text, kind, start, end:offset });
  }
  return tokens;
}
