import type { ChildNode, ComponentType, DesignDocument, DesignNode } from './types';

const importNames: Record<ComponentType, string> = {
  Flex: 'Flex', Card: 'Card', Button: 'Button', Input: 'Input', Select: 'Select', Divider: 'Divider',
  'Typography.Title': 'Typography', ProCard: 'ProCard', ProTable: 'ProTable',
};

function escapeText(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('{', '&#123;').replaceAll('}', '&#125;');
}

function jsxAttribute(value: unknown): string {
  // Use a JavaScript expression literal so quotes, line breaks and unicode remain valid TSX.
  return `{${JSON.stringify(value)}}`;
}

function jsxName(type: ComponentType): string {
  return type === 'Typography.Title' ? 'Typography.Title' : type;
}

function renderChild(child: ChildNode, depth: number): string {
  if (typeof child === 'string') return `${'  '.repeat(depth)}${escapeText(child)}`;
  return renderNode(child, depth);
}

function renderNode(node: DesignNode, depth: number): string {
  const indent = '  '.repeat(depth);
  const name = jsxName(node.type);
  // IR v2: props never contain `children`; visible text is a string entry of node.children.
  const props = Object.entries(node.props)
    .filter(([key, value]) => key !== 'children' && value !== undefined)
    .map(([key, value]) => `${key}=${jsxAttribute(value)}`);
  const opening = props.length ? `<${name}\n${'  '.repeat(depth + 1)}${props.join(`\n${'  '.repeat(depth + 1)}`)}` : `<${name}`;
  const children = node.children;
  if (!children.length) return `${indent}${opening} />`;
  return `${indent}${opening}>\n${children.map((child) => renderChild(child, depth + 1)).join('\n')}\n${indent}</${name}>`;
}

export function generateTsx(document: DesignDocument): string {
  const used = new Set<ComponentType>();
  const walk = (node: DesignNode) => {
    used.add(node.type);
    node.children.forEach((child) => { if (typeof child !== 'string') walk(child); });
  };
  walk(document.root);

  const antd = ['ConfigProvider', ...[...used].filter((type) => type !== 'ProCard' && type !== 'ProTable').map((type) => importNames[type])];
  const pro = [...used].filter((type) => type === 'ProCard' || type === 'ProTable');
  const imports = [
    `import { ${[...new Set(antd)].sort().join(', ')} } from 'antd';`,
    pro.length ? `import { ${pro.map((type) => importNames[type]).sort().join(', ')} } from '@ant-design/pro-components';` : '',
  ].filter(Boolean).join('\n');

  const themeToken = JSON.stringify(document.theme.token);
  return `${imports}\n\nexport default function GeneratedPage() {\n  return (\n    <ConfigProvider theme={{ token: ${themeToken} }}>\n${renderNode(document.root, 3)}\n    </ConfigProvider>\n  );\n}\n`;
}
