import { Typography } from 'antd';
import type { DesignDocument } from '../engine/types';
import { componentRegistry } from '../engine/registry';

const { Text } = Typography;

function labelOf(node: DesignDocument['root']): string {
  const def = componentRegistry[node.type];
  const text = node.children.find((c) => typeof c === 'string') as string | undefined;
  const title = (node.props.title ?? node.props.headerTitle) as string | undefined;
  return text ?? title ?? def?.label ?? node.type;
}

function TreeNode({ node, depth, selectedId, onSelect }: {
  node: DesignDocument['root'];
  depth: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const hidden = node.meta?.hidden;
  return (
    <>
      <div
        className={`tree-row ${selectedId === node.id ? 'tree-row--selected' : ''} ${hidden ? 'tree-row--hidden' : ''}`}
        style={{ paddingLeft: 8 + depth * 14 }}
        onClick={() => onSelect(node.id)}
        data-tree-id={node.id}
      >
        <span className="tree-row__type">{node.type}</span>
        <span className="tree-row__label">{labelOf(node)}</span>
      </div>
      {node.children.map((child) => typeof child === 'string'
        ? <div key={`${node.id}-t`} className="tree-row tree-row--text" style={{ paddingLeft: 8 + (depth + 1) * 14 }}>“{child}”</div>
        : <TreeNode key={child.id} node={child} depth={depth + 1} selectedId={selectedId} onSelect={onSelect} />)}
    </>
  );
}

export default function ComponentTree({ document, selectedId, onSelect }: {
  document: DesignDocument;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="component-tree">
      <div className="panel-heading">组件树 <Text type="secondary" style={{ fontSize: 11 }}>IR v{document.schemaVersion}</Text></div>
      <TreeNode node={document.root} depth={0} selectedId={selectedId} onSelect={onSelect} />
    </div>
  );
}
