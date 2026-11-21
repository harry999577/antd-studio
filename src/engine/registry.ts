import type { ComponentDefinition, ComponentType, DesignNode } from './types';

const buttonTypes = [
  { label: '主按钮', value: 'primary' },
  { label: '默认按钮', value: 'default' },
  { label: '虚线按钮', value: 'dashed' },
  { label: '文本按钮', value: 'text' },
  { label: '链接按钮', value: 'link' },
];

const sizes = [
  { label: '小', value: 'small' },
  { label: '中', value: 'middle' },
  { label: '大', value: 'large' },
];

export const componentRegistry: Record<ComponentType, ComponentDefinition> = {
  Flex: {
    type: 'Flex', label: 'Flex 布局', packageName: 'antd', category: '布局',
    props: [
      { name: 'vertical', label: '垂直排列', editor: 'switch' },
      { name: 'wrap', label: '自动换行', editor: 'switch' },
      { name: 'gap', label: '间距', editor: 'number', description: 'CSS gap 数值（px）或预设字符串' },
      { name: 'justify', label: '主轴对齐', editor: 'select', options: ['start', 'end', 'center', 'space-between', 'space-around', 'space-evenly'].map((v) => ({ label: v, value: v })) },
      { name: 'align', label: '交叉轴对齐', editor: 'select', options: ['start', 'end', 'center', 'baseline', 'stretch'].map((v) => ({ label: v, value: v })) },
      { name: 'flex', label: '弹性伸缩 (CSS flex)', editor: 'input', description: '作为容器在父 Flex 中的 flex 简写' },
    ],
    defaultProps: { vertical: true, gap: 16, align: 'stretch' },
    canHaveChildren: true,
  },
  Card: {
    type: 'Card', label: 'Card 卡片', packageName: 'antd', category: '通用',
    props: [
      { name: 'title', label: '标题', editor: 'input' },
      { name: 'variant', label: '卡片形态', editor: 'select', options: [{ label: '带边框', value: 'outlined' }, { label: '无边框', value: 'borderless' }] },
      { name: 'size', label: '尺寸', editor: 'select', options: [{ label: '中', value: 'default' }, { label: '小', value: 'small' }] },
      { name: 'loading', label: '加载中', editor: 'switch' },
    ],
    defaultProps: { title: '内容卡片', variant: 'outlined' },
    canHaveChildren: true,
  },
  Button: {
    type: 'Button', label: 'Button 按钮', packageName: 'antd', category: '通用',
    props: [
      { name: 'type', label: '按钮类型', editor: 'select', options: buttonTypes },
      { name: 'size', label: '按钮尺寸', editor: 'select', options: sizes },
      { name: 'disabled', label: '禁用', editor: 'switch' },
      { name: 'block', label: '通栏', editor: 'switch' },
      { name: 'danger', label: '危险按钮', editor: 'switch' },
      { name: 'ghost', label: '幽灵按钮', editor: 'switch' },
      { name: 'href', label: '链接地址', editor: 'input', description: '设置后渲染为 <a> 链接按钮' },
    ],
    defaultProps: { type: 'primary' },
    canHaveChildren: false,
    supportsText: true,
    defaultText: '按钮',
  },
  Input: {
    type: 'Input', label: 'Input 输入框', packageName: 'antd', category: '数据录入',
    props: [
      { name: 'placeholder', label: '占位提示', editor: 'input' },
      { name: 'allowClear', label: '允许清空', editor: 'switch' },
      { name: 'disabled', label: '禁用', editor: 'switch' },
      { name: 'size', label: '尺寸', editor: 'select', options: sizes },
      { name: 'maxLength', label: '最大长度', editor: 'number' },
      { name: 'showCount', label: '显示字数', editor: 'switch' },
    ],
    defaultProps: { placeholder: '请输入', allowClear: true },
    canHaveChildren: false,
  },
  Select: {
    type: 'Select', label: 'Select 选择器', packageName: 'antd', category: '数据录入',
    props: [
      { name: 'placeholder', label: '占位提示', editor: 'input' },
      { name: 'allowClear', label: '允许清空', editor: 'switch' },
      { name: 'disabled', label: '禁用', editor: 'switch' },
      { name: 'options', label: '选项数据', editor: 'json', description: '结构化编辑器接口预留：editor=json 为最低实现' },
      { name: 'style', label: '样式对象', editor: 'json' },
    ],
    defaultProps: { placeholder: '请选择', allowClear: true, style: { width: 180 }, options: [{ label: '全部', value: 'all' }, { label: '启用', value: 'active' }, { label: '禁用', value: 'disabled' }] },
    canHaveChildren: false,
  },
  Divider: {
    type: 'Divider', label: 'Divider 分割线', packageName: 'antd', category: '布局',
    props: [
      { name: 'orientation', label: '文字位置', editor: 'select', options: [{ label: '左', value: 'left' }, { label: '中', value: 'center' }, { label: '右', value: 'right' }] },
      { name: 'dashed', label: '虚线', editor: 'switch' },
    ],
    defaultProps: {},
    canHaveChildren: false,
    defaultText: undefined,
  },
  'Typography.Title': {
    type: 'Typography.Title', label: 'Typography.Title 标题', packageName: 'antd', category: '通用',
    props: [
      { name: 'level', label: '标题级别', editor: 'select', options: [1, 2, 3, 4, 5].map((v) => ({ label: `H${v}`, value: v })) },
      { name: 'type', label: '文本类型', editor: 'select', options: [{ label: '默认', value: undefined as never }, { label: '次要', value: 'secondary' }, { label: '成功', value: 'success' }, { label: '警告', value: 'warning' }, { label: '危险', value: 'danger' }] },
      { name: 'ellipsis', label: '省略号', editor: 'switch' },
      { name: 'copyable', label: '可复制', editor: 'switch' },
    ],
    defaultProps: { level: 3 },
    canHaveChildren: false,
    supportsText: true,
    defaultText: '页面标题',
  },
  ProCard: {
    type: 'ProCard', label: 'ProCard', packageName: '@ant-design/pro-components', category: '企业组件',
    props: [
      { name: 'title', label: '标题', editor: 'input' },
      { name: 'variant', label: '卡片形态', editor: 'select', options: [{ label: '带边框', value: 'outlined' }, { label: '无边框', value: 'borderless' }] },
      { name: 'split', label: '分割方向', editor: 'select', options: [{ label: '水平', value: 'horizontal' }, { label: '垂直', value: 'vertical' }] },
      { name: 'loading', label: '加载中', editor: 'switch' },
    ],
    defaultProps: { title: 'ProCard 企业卡片', variant: 'outlined' },
    canHaveChildren: true,
  },
  ProTable: {
    type: 'ProTable', label: 'ProTable', packageName: '@ant-design/pro-components', category: '企业组件',
    props: [
      { name: 'headerTitle', label: '表格标题', editor: 'input' },
      { name: 'search', label: '显示搜索', editor: 'switch' },
      { name: 'options', label: '显示工具栏选项', editor: 'switch' },
      { name: 'columns', label: '列定义', editor: 'json', description: '结构化编辑器接口预留' },
      { name: 'dataSource', label: '静态数据', editor: 'json', description: '结构化编辑器接口预留' },
      { name: 'rowKey', label: '行主键', editor: 'input' },
      { name: 'pagination', label: '分页配置', editor: 'json' },
    ],
    defaultProps: {
      headerTitle: '用户列表',
      search: false,
      options: false,
      rowKey: 'id',
      columns: [
        { title: '用户名称', dataIndex: 'name' },
        { title: '手机号', dataIndex: 'phone' },
        { title: '状态', dataIndex: 'status', valueType: 'text' },
      ],
      dataSource: [
        { id: '1', name: '张三', phone: '13800000001', status: '启用' },
        { id: '2', name: '李四', phone: '13800000002', status: '待审核' },
        { id: '3', name: '王五', phone: '13800000003', status: '禁用' },
      ],
    },
    canHaveChildren: false,
  },
};

export const componentGroups = [
  { label: '布局', types: ['Flex', 'Divider'] as ComponentType[] },
  { label: '通用', types: ['Button', 'Card', 'Typography.Title'] as ComponentType[] },
  { label: '数据录入', types: ['Input', 'Select'] as ComponentType[] },
  { label: '企业组件', types: ['ProCard', 'ProTable'] as ComponentType[] },
];

export function createNode(type: ComponentType): DesignNode {
  const definition = componentRegistry[type];
  const node: DesignNode = {
    id: `node-${crypto.randomUUID()}`,
    type,
    props: structuredClone(definition.defaultProps),
    children: [],
  };
  if (definition.defaultText) node.children.push(definition.defaultText);
  return node;
}
