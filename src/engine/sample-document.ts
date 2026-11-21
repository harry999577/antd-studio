import type { DesignDocument } from './types';

export const initialDocument: DesignDocument = {
  schemaVersion: 1,
  framework: { react: '19.3.x', antd: '6.7.1', proComponents: '3.1.15-9' },
  theme: { token: { colorPrimary: '#1677ff', borderRadius: 8 } },
  root: {
    id: 'page-root',
    type: 'Flex',
    props: { vertical: true, gap: 16, align: 'stretch' },
    children: [
      { id: 'page-title', type: 'Typography.Title', props: { level: 3, children: '用户管理' }, children: [] },
      {
        id: 'search-card', type: 'Card', props: { title: '筛选条件', variant: 'outlined' },
        children: [
          {
            id: 'search-row', type: 'Flex', props: { gap: 12, wrap: true, align: 'center' },
            children: [
              { id: 'search-input', type: 'Input', props: { placeholder: '请输入用户名称或手机号', allowClear: true, style: { width: 260 } }, children: [] },
              { id: 'search-status', type: 'Select', props: { placeholder: '用户状态', allowClear: true, style: { width: 160 }, options: [{ label: '全部', value: 'all' }, { label: '启用', value: 'active' }, { label: '禁用', value: 'disabled' }] }, children: [] },
              { id: 'search-submit', type: 'Button', props: { type: 'primary', children: '查询' }, children: [] },
              { id: 'search-reset', type: 'Button', props: { children: '重置' }, children: [] },
            ],
          },
        ],
      },
      {
        id: 'user-table-card', type: 'ProCard', props: { title: '用户列表', variant: 'outlined' },
        children: [
          {
            id: 'user-table', type: 'ProTable', props: {
              headerTitle: '用户数据', search: false, options: false, rowKey: 'id',
              columns: [
                { title: '用户名称', dataIndex: 'name' },
                { title: '手机号', dataIndex: 'phone' },
                { title: '状态', dataIndex: 'status' },
              ],
              dataSource: [
                { id: '1', name: '张三', phone: '13800000001', status: '启用' },
                { id: '2', name: '李四', phone: '13800000002', status: '待审核' },
                { id: '3', name: '王五', phone: '13800000003', status: '禁用' },
              ],
            }, children: [],
          },
        ],
      },
    ],
  },
};
