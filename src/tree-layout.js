export const treeSide = edge => edge.weight === 'L' ? 'left' : edge.weight === 'R' ? 'right' : undefined;

// Pack subtree contours instead of allocating every slot in a complete binary tree.
// A sole child still has an offset, so missing siblings never erase left/right meaning.
export function layoutTree(structure) {
  const gap = 96, positions = new Map();
  const nodes = new Map(structure.nodes.map(node => [node.id, { id: node.id, children: [] }]));
  const outgoing = new Map([...nodes.keys()].map(id => [id, []])), incoming = new Set();
  for (const edge of structure.edges) {
    if (!nodes.has(edge.source) || !nodes.has(edge.target)) continue;
    outgoing.get(edge.source).push(edge); incoming.add(edge.target);
  }
  const rank = edge => treeSide(edge) === 'left' ? 0 : treeSide(edge) === 'right' ? 2 : 1;
  for (const edges of outgoing.values()) edges.sort((a, b) => rank(a) - rank(b));
  const roots = [structure.root, ...[...nodes.keys()].filter(id => !incoming.has(id)), ...nodes.keys()];
  const seen = new Set(), forest = [], order = [];
  for (const id of roots) {
    if (!nodes.has(id) || seen.has(id)) continue;
    const root = nodes.get(id), queue = [root];
    forest.push(root); seen.add(id);
    for (let i = 0; i < queue.length; i++) {
      const node = queue[i]; order.push(node);
      for (const edge of outgoing.get(node.id)) {
        if (seen.has(edge.target)) continue; // Also tolerate cyclic/shared-node imports.
        seen.add(edge.target);
        const child = nodes.get(edge.target);
        node.children.push({ node: child, side: treeSide(edge), offset: 0 }); queue.push(child);
      }
    }
  }
  for (const node of order.reverse()) {
    const children = node.children;
    if (children.length === 1) {
      children[0].offset = children[0].side === 'left' ? -gap / 2 : children[0].side === 'right' ? gap / 2 : 0;
    } else if (children.length > 1) {
      const rightContour = [];
      for (const child of children) {
        for (let d = 0; d < child.node.left.length; d++) {
          if (rightContour[d] !== undefined) child.offset = Math.max(child.offset, rightContour[d] + gap - child.node.left[d]);
        }
        child.node.right.forEach((x, d) => { rightContour[d] = Math.max(rightContour[d] ?? -Infinity, x + child.offset); });
      }
      const center = (children[0].offset + children.at(-1).offset) / 2;
      children.forEach(child => { child.offset -= center; });
    }
    node.left = [0]; node.right = [0];
    for (const child of children) {
      child.node.left.forEach((x, d) => { node.left[d + 1] = Math.min(node.left[d + 1] ?? Infinity, x + child.offset); });
      child.node.right.forEach((x, d) => { node.right[d + 1] = Math.max(node.right[d + 1] ?? -Infinity, x + child.offset); });
    }
  }
  let cursor = 60, maxDepth = 0;
  for (const root of forest) {
    const min = Math.min(...root.left), max = Math.max(...root.right);
    const stack = [{ node: root, x: cursor - min, depth: 0 }];
    while (stack.length) {
      const { node, x, depth } = stack.pop();
      positions.set(node.id, { x, y: 65 + depth * 100 }); maxDepth = Math.max(maxDepth, depth);
      for (const child of node.children) stack.push({ node: child.node, x: x + child.offset, depth: depth + 1 });
    }
    cursor += max - min + gap;
  }
  const contentWidth = forest.length ? cursor - gap + 60 : 120, width = Math.max(640, contentWidth);
  for (const position of positions.values()) position.x += (width - contentWidth) / 2;
  return { positions, width, height: Math.max(360, (maxDepth + 1) * 100 + 60) };
}
