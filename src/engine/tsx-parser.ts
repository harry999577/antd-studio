import { parse } from '@babel/parser';
import type { ComponentType, DesignDocument, DesignNode, ChildNode } from './types';
import { initialDocument } from './sample-document';

const supported = new Set<ComponentType>([
  'Flex', 'Card', 'Button', 'Input', 'Select', 'Divider', 'Typography.Title', 'ProCard', 'ProTable',
]);

function componentName(node: any): string {
  if (node?.type === 'JSXIdentifier') return node.name;
  if (node?.type === 'JSXMemberExpression') return `${componentName(node.object)}.${componentName(node.property)}`;
  throw new Error('暂不支持该 JSX 组件名称');
}

function expressionValue(node: any): unknown {
  if (!node) return undefined;
  switch (node.type) {
    case 'StringLiteral': return node.value;
    case 'NumericLiteral': return node.value;
    case 'BooleanLiteral': return node.value;
    case 'NullLiteral': return null;
    case 'ArrayExpression': return node.elements.map((item: any) => expressionValue(item));
    case 'ObjectExpression': {
      const result: Record<string, unknown> = {};
      for (const property of node.properties) {
        if (property.type !== 'ObjectProperty' || property.computed) throw new Error('对象中包含暂不支持的动态属性');
        const key = property.key.name ?? property.key.value;
        result[String(key)] = expressionValue(property.value);
      }
      return result;
    }
    case 'UnaryExpression':
      if (node.operator === '-') return -Number(expressionValue(node.argument));
      break;
    case 'TemplateLiteral':
      if (node.expressions.length === 0) return node.quasis.map((part: any) => part.value.cooked).join('');
      break;
    default:
      break;
  }
  throw new Error(`发现动态表达式 ${node.type}。请保留在代码模式，或先改成静态配置再同步画布。`);
}

function parseElement(element: any, index: number): DesignNode {
  const type = componentName(element.openingElement.name) as ComponentType;
  if (!supported.has(type)) throw new Error(`组件 ${type} 尚未加入可视化组件注册表；为避免丢失代码，本次未更新画布。`);
  const props: Record<string, unknown> = {};
  for (const attribute of element.openingElement.attributes) {
    if (attribute.type === 'JSXSpreadAttribute') throw new Error('发现 JSX spread 属性（...props），暂不自动转换；原代码不会被覆盖。');
    const key = attribute.name.name;
    if (!attribute.value) props[key] = true;
    else if (attribute.value.type === 'StringLiteral') props[key] = attribute.value.value;
    else if (attribute.value.type === 'JSXExpressionContainer') props[key] = expressionValue(attribute.value.expression);
    else throw new Error(`属性 ${key} 暂不支持此写法`);
  }
  const children: ChildNode[] = [];
  for (const child of element.children) {
    if (child.type === 'JSXElement') children.push(parseElement(child, children.length));
    else if (child.type === 'JSXText') {
      const text = child.value.replace(/\s+/g, ' ').trim();
      if (text) children.push(text);
    } else if (child.type === 'JSXExpressionContainer' && child.expression.type !== 'JSXEmptyExpression') {
      const value = expressionValue(child.expression);
      if (typeof value === 'string' || typeof value === 'number') children.push(String(value));
      else throw new Error('目前仅支持静态字符串/数字作为 JSX 文本内容');
    }
  }
  return { id: `code-node-${index}-${crypto.randomUUID()}`, type, props, children };
}

function findReturnJsx(declaration: any): any | undefined {
  const fn = declaration?.type === 'FunctionDeclaration' || declaration?.type === 'ArrowFunctionExpression' || declaration?.type === 'FunctionExpression'
    ? declaration
    : undefined;
  if (!fn) throw new Error('目前仅支持默认导出函数或箭头函数组件；原始源码不会被覆盖。');
  if (fn.async || fn.generator || (fn.params?.length ?? 0) > 0) {
    throw new Error('静态可视化同步暂不支持 async/generator 或带参数的页面组件；原始源码不会被覆盖。');
  }
  if (fn.body?.type === 'JSXElement') return fn.body;
  if (fn.body?.type !== 'BlockStatement') throw new Error('未找到直接返回的 JSX 页面结构。');
  const statements = fn.body.body;
  if (statements.length !== 1 || statements[0].type !== 'ReturnStatement' || statements[0].argument?.type !== 'JSXElement') {
    throw new Error('目前只支持函数体中唯一一条直接 return JSXElement 的静态页面；变量、Hooks、条件渲染、多个 return 或 Fragment 请保留在代码模式。');
  }
  return statements[0].argument;
}

export function parseTsxToDocument(source: string): DesignDocument {
  const ast = parse(source, { sourceType: 'module', plugins: ['typescript', 'jsx'] });
  const program = ast.program as any;
  const topLevel = program.body as any[];
  const unsupportedStatements = topLevel.filter((statement) => statement.type !== 'ImportDeclaration' && statement.type !== 'ExportDefaultDeclaration');
  if (unsupportedStatements.length || topLevel.filter((statement) => statement.type === 'ExportDefaultDeclaration').length !== 1) {
    throw new Error('反向可视化仅支持官方组件 import + 一个 default export；其他顶层逻辑请留在代码模式，避免同步时丢失源码。');
  }
  const unsupportedImports = topLevel
    .filter((statement) => statement.type === 'ImportDeclaration')
    .filter((statement) => !['antd', '@ant-design/pro-components'].includes(statement.source.value));
  if (unsupportedImports.length) {
    throw new Error('反向可视化当前仅保留 antd 和 @ant-design/pro-components 官方组件导入；其他模块导入请留在代码模式。');
  }
  const exportDefault = topLevel.find((statement) => statement.type === 'ExportDefaultDeclaration');
  if (!exportDefault) throw new Error('未找到 export default 页面组件');
  const jsx = findReturnJsx(exportDefault.declaration);
  if (!jsx) throw new Error('未找到页面 JSX 返回内容');

  let pageElement = jsx;
  let theme = initialDocument.theme;
  if (componentName(jsx.openingElement.name) === 'ConfigProvider') {
    const providerAttributes = jsx.openingElement.attributes.filter((attribute: any) => attribute.type === 'JSXAttribute');
    if (providerAttributes.some((attribute: any) => attribute.name?.name !== 'theme') || jsx.openingElement.attributes.some((attribute: any) => attribute.type !== 'JSXAttribute')) {
      throw new Error('ConfigProvider 除 theme 外的属性暂不支持反向可视化；原始源码不会被覆盖。');
    }
    const themeAttribute = providerAttributes.find((attribute: any) => attribute.name?.name === 'theme');
    if (themeAttribute?.value?.type !== 'JSXExpressionContainer') {
      throw new Error('ConfigProvider.theme 必须是静态对象表达式；原始源码不会被覆盖。');
    }
    const themeValue = expressionValue(themeAttribute.value.expression) as { token?: Record<string, unknown> };
    const token = themeValue?.token;
    if (!token || typeof token !== 'object' || Array.isArray(token)) {
      throw new Error('ConfigProvider.theme.token 必须是静态对象；原始源码不会被覆盖。');
    }
    if (Object.values(token).some((value) => typeof value !== 'string' && typeof value !== 'number')) {
      throw new Error('主题 Token 目前仅支持字符串或数字值；原始源码不会被覆盖。');
    }
    const elements = jsx.children.filter((child: any) => child.type === 'JSXElement');
    if (elements.length !== 1 || jsx.children.some((child: any) => child.type !== 'JSXElement' && !(child.type === 'JSXText' && !child.value.trim()))) {
      throw new Error('ConfigProvider 中必须包含唯一一个页面根组件；原始源码不会被覆盖。');
    }
    pageElement = elements[0];
    theme = { token: token as Record<string, string | number> };
  }

  const root = parseElement(pageElement, 0);
  return { ...initialDocument, theme, root };
}
