export type ComponentType =
  | 'Flex'
  | 'Card'
  | 'Button'
  | 'Input'
  | 'Select'
  | 'Divider'
  | 'Typography.Title'
  | 'ProCard'
  | 'ProTable';

export type ChildNode = DesignNode | string;

/**
 * Design IR v2 node.
 * Text content lives ONLY in `children` as string entries (v1's `props.children`
 * channel was removed by the migration in ./migrate.ts). `meta` holds designer
 * metadata and is never emitted into generated TSX.
 */
export interface DesignNode {
  id: string;
  type: ComponentType;
  props: Record<string, unknown>;
  children: ChildNode[];
  meta?: {
    locked?: boolean;
    hidden?: boolean;
  };
}

export interface DesignDocument {
  schemaVersion: 2;
  framework: {
    react: string;
    antd: string;
    proComponents: string;
  };
  theme: {
    token: Record<string, string | number>;
  };
  root: DesignNode;
}

export interface PropDefinition {
  name: string;
  label: string;
  editor: 'input' | 'switch' | 'select' | 'number' | 'json' | 'slot' | 'event' | 'code';
  options?: { label: string; value: string | number | boolean }[];
  description?: string;
}

export interface ComponentDefinition {
  type: ComponentType;
  label: string;
  packageName: 'antd' | '@ant-design/pro-components';
  category: '布局' | '通用' | '数据录入' | '企业组件';
  props: PropDefinition[];
  defaultProps: Record<string, unknown>;
  canHaveChildren: boolean;
  /** Leaf component whose visible content is a single editable text child. */
  supportsText?: boolean;
  /** Initial text placed into children[] on creation (IR v2: text lives in children). */
  defaultText?: string;
}
