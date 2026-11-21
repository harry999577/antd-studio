import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { Button } from 'antd';
import { componentRegistry } from '../engine/registry';
import type { ComponentType } from '../engine/types';

export default function PaletteItem({ type, onAdd }: { type: ComponentType; onAdd: (type: ComponentType) => void }) {
  const definition = componentRegistry[type];
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `palette-${type}`,
    data: { componentType: type },
  });

  return (
    <div
      ref={setNodeRef}
      className={`palette-item ${isDragging ? 'is-dragging' : ''}`}
      style={{ transform: CSS.Translate.toString(transform) }}
      {...listeners}
      {...attributes}
      onDoubleClick={() => onAdd(type)}
    >
      <span className="palette-item__label">{definition.label}</span>
      <Button size="small" type="text" tabIndex={-1} onClick={(event) => { event.stopPropagation(); onAdd(type); }}>＋</Button>
    </div>
  );
}
