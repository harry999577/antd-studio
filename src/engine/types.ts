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

export interface DesignNode {
  id: string;
  type: ComponentType;
  props: Record<string, unknown>;
  children: ChildNode[];
}

export interface DesignDocument {
  schemaVersion: 1;
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
  editor: 'input' | 'switch' | 'select' | 'number' | 'json';
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
}
