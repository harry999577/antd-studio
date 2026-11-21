import type { ChildNode, DesignDocument, DesignNode } from './types';

/** Pure, immutable Design IR tree operations. Single source of truth for edits. */

export function findNode(node: DesignNode, id: string): DesignNode | undefined {
  if (node.id === id) return node;
  for (const child of node.children) {
    if (typeof child !== 'string') {
      const found = findNode(child, id);
      if (found) return found;
    }
  }
  return undefined;
}

export function findParent(node: DesignNode, id: string): DesignNode | undefined {
  for (const child of node.children) {
    if (typeof child !== 'string') {
      if (child.id === id) return node;
      const found = findParent(child, id);
      if (found) return found;
    }
  }
  return undefined;
}

export function patchNode(node: DesignNode, id: string, patch: (current: DesignNode) => DesignNode): DesignNode {
  if (node.id === id) return patch(node);
  return {
    ...node,
    children: node.children.map((child) => (typeof child === 'string' ? child : patchNode(child, id, patch))),
  };
}

export function removeNode(node: DesignNode, id: string): DesignNode {
  return {
    ...node,
    children: node.children
      .filter((child) => typeof child === 'string' || child.id !== id)
      .map((child) => (typeof child === 'string' ? child : removeNode(child, id))),
  };
}

export function appendChild(node: DesignNode, targetId: string, child: DesignNode): DesignNode {
  if (node.id === targetId) return { ...node, children: [...node.children, child] };
  return {
    ...node,
    children: node.children.map((item) => (typeof item === 'string' ? item : appendChild(item, targetId, child))),
  };
}

export function isDescendant(ancestor: DesignNode, maybeChildId: string): boolean {
  return findNode(ancestor, maybeChildId) !== undefined;
}

/** Insert `moved` as a sibling before/after `targetId` inside its parent. */
function insertSibling(node: DesignNode, targetId: string, moved: DesignNode, position: 'before' | 'after'): DesignNode {
  const idx = node.children.findIndex((child) => typeof child !== 'string' && child.id === targetId);
  if (idx >= 0) {
    const children = [...node.children];
    children.splice(position === 'before' ? idx : idx + 1, 0, moved);
    return { ...node, children };
  }
  return {
    ...node,
    children: node.children.map((child) => (typeof child === 'string' ? child : insertSibling(child, targetId, moved, position))),
  };
}

/**
 * Move an existing node to a new location.
 *  - target is a container (canHaveChildren) -> append inside it.
 *  - target is a leaf -> insert as its sibling (before by default).
 * Returns null when the move is invalid (root, self, into own descendant, unknown ids).
 */
export function moveNode(
  root: DesignNode,
  sourceId: string,
  targetId: string,
  options: { position?: 'before' | 'after' | 'inside'; canReceive: (type: DesignNode['type']) => boolean },
): DesignNode | null {
  if (sourceId === root.id || sourceId === targetId) return null;
  const source = findNode(root, sourceId);
  const target = findNode(root, targetId);
  if (!source || !target) return null;
  if (isDescendant(source, targetId)) return null; // cannot move a node into itself

  const position = options.position ?? (options.canReceive(target.type) ? 'inside' : 'before');
  if (position === 'inside' && !options.canReceive(target.type)) return null;

  const detached = removeNode(root, sourceId);
  // removeNode may have removed the target too if target was inside source — already guarded.
  if (position === 'inside') return appendChild(detached, targetId, source);
  return insertSibling(detached, targetId, source, position);
}

/** Reorder among siblings; delta -1 up / +1 down. Returns null at the edges. */
export function moveSibling(root: DesignNode, id: string, delta: number): DesignDocument['root'] | null {
  const parent = findParent(root, id);
  if (!parent) return null;
  const nodeIds = parent.children.filter((c) => typeof c !== 'string').map((c) => (c as DesignNode).id);
  const index = nodeIds.indexOf(id);
  const swapWith = nodeIds[index + delta];
  if (index < 0 || swapWith === undefined) return null;
  const aIdx = parent.children.findIndex((c) => typeof c !== 'string' && c.id === id);
  const bIdx = parent.children.findIndex((c) => typeof c !== 'string' && c.id === swapWith);
  const children = [...parent.children];
  [children[aIdx], children[bIdx]] = [children[bIdx], children[aIdx]];
  return patchNode(root, parent.id, (n) => ({ ...n, children }));
}

/** Text of a leaf node = its first string child (IR v2 single text channel). */
export function nodeText(node: DesignNode): string {
  const first = node.children.find((child) => typeof child === 'string');
  return typeof first === 'string' ? first : '';
}

export function setNodeText(node: DesignNode, text: string): DesignNode {
  const nonText = node.children.filter((child) => typeof child !== 'string');
  const next: ChildNode[] = text.length > 0 ? [text, ...nonText] : nonText;
  return { ...node, children: next };
}
