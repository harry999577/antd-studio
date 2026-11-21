import { Button, Card, ConfigProvider, Flex, Input, Select, Typography } from 'antd';
import { ProCard, ProTable } from '@ant-design/pro-components';

export default function GeneratedPage() {
  return (
    <ConfigProvider theme={{ token: {"colorPrimary":"#1677ff","borderRadius":8} }}>
      <Flex
        vertical={true}
        gap={16}
        align={"stretch"}>
        <Typography.Title
          level={3}>
          用户管理
        </Typography.Title>
        <Card
          title={"筛选条件"}
          variant={"outlined"}>
          <Flex
            gap={12}
            wrap={true}
            align={"center"}>
            <Input
              placeholder={"请输入用户名称或手机号"}
              allowClear={true}
              style={{"width":260}} />
            <Select
              placeholder={"用户状态"}
              allowClear={true}
              style={{"width":160}}
              options={[{"label":"全部","value":"all"},{"label":"启用","value":"active"},{"label":"禁用","value":"disabled"}]} />
            <Button
              type={"primary"}>
              查询
            </Button>
            <Button>
              重置
            </Button>
          </Flex>
        </Card>
        <ProCard
          title={"用户列表"}
          variant={"outlined"}>
          <ProTable
            headerTitle={"用户数据"}
            search={false}
            options={false}
            rowKey={"id"}
            columns={[{"title":"用户名称","dataIndex":"name"},{"title":"手机号","dataIndex":"phone"},{"title":"状态","dataIndex":"status"}]}
            dataSource={[{"id":"1","name":"张三","phone":"13800000001","status":"启用"},{"id":"2","name":"李四","phone":"13800000002","status":"待审核"},{"id":"3","name":"王五","phone":"13800000003","status":"禁用"}]} />
        </ProCard>
      </Flex>
    </ConfigProvider>
  );
}
