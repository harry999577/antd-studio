import React from 'react';
import {
  Button, Card, Divider, Flex, Input, Select, Typography,
} from 'antd';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { ProCard, ProTable } from '@ant-design/pro-components';
import type { ChildNode, DesignNode } from '../engine/types';
import { componentRegistry } from '../engine/registry';

const renderers: Record<string, React.ComponentType<any>> = {
  Flex, Card, Button, Input, Select, Divider,
  'Typography.Title': Typography.Title,
  ProCard,
  ProTable,
};

function NodeDraggable({ node }: { node: DesignNode }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `canvas-node-${node.id}`,
    data: { nodeId: node.id },
  });
  return (
    <div
      ref={setNodeRef}
      className={`canvas-node__drag ${isDragging ? 'is-dragging' : ''}`}
      style={{ transform: CSS.Translate.toString(transform) }}
      {...listeners}
      {...attributes}
      title="拖拽移动组件"
      onClick={(event) => event.stopPropagation()}
    >
      ⠿
    </div>
  );
}

export default function CanvasNode({
  node,
  selectedId,
  onSelect,
}: {
  node: DesignNode;
  selectedId: string | null;
  onSelect: (node: DesignNode) => void;
}) {
  const Component = renderers[node.type];
  const selected = selectedId === node.id;
  const { setNodeRef, isOver } = useDroppable({
    id: `node-drop-${node.id}`,
    data: { targetNodeId: node.id },
  });
  const props = { ...node.props };
  delete props.children;

  // IR v2: visible text is a string entry of children (single text channel).
  const children = node.children.map((child: ChildNode, index) =>
    typeof child === 'string'
      ? <React.Fragment key={`${node.id}-text-${index}`}>{child}</React.Fragment>
      : <CanvasNode key={child.id} node={child} selectedId={selectedId} onSelect={onSelect} />,
  );

  return (
    <div
      ref={setNodeRef}
      className={`canvas-node ${selected ? 'canvas-node--selected' : ''} ${isOver ? 'canvas-node--drop-over' : ''} ${node.meta?.hidden ? 'canvas-node--hidden' : ''}`}
      onClick={(event) => { event.stopPropagation(); onSelect(node); }}
      data-node-id={node.id}
    >
      {node.id !== 'page-root' && <NodeDraggable node={node} />}
      {Component ? <Component {...props}>{children.length ? children : null}</Component> : <div className="unknown-node">未注册组件：{node.type}</div>}
      {selected && <span className="canvas-node__tag">{node.type}</span>}
    </div>
  );
}
