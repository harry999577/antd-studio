import React from 'react';
import {
  Button, Card, Divider, Flex, Input, Select, Typography,
} from 'antd';
import { useDroppable } from '@dnd-kit/core';
import { ProCard, ProTable } from '@ant-design/pro-components';
import type { ChildNode, DesignNode } from '../engine/types';
import { componentRegistry } from '../engine/registry';

const renderers: Record<string, React.ComponentType<any>> = {
  Flex, Card, Button, Input, Select, Divider,
  'Typography.Title': Typography.Title,
  ProCard,
  ProTable,
};

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
    disabled: !componentRegistry[node.type]?.canHaveChildren,
    data: { targetNodeId: node.id },
  });
  const props = { ...node.props };
  delete props.children;

  const children = node.children.map((child: ChildNode, index) =>
    typeof child === 'string'
      ? <React.Fragment key={`${node.id}-text-${index}`}>{child}</React.Fragment>
      : <CanvasNode key={child.id} node={child} selectedId={selectedId} onSelect={onSelect} />,
  );

  return (
    <div
      ref={setNodeRef}
      className={`canvas-node ${selected ? 'canvas-node--selected' : ''} ${isOver ? 'canvas-node--drop-over' : ''}`}
      onClick={(event) => { event.stopPropagation(); onSelect(node); }}
      data-node-id={node.id}
    >
      {Component ? <Component {...props}>{children.length ? children : node.props.children as React.ReactNode}</Component> : <div className="unknown-node">未注册组件：{node.type}</div>}
      {selected && <span className="canvas-node__tag">{node.type}</span>}
    </div>
  );
}
