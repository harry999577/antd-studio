# MVP 实施状态

| 能力 | 状态 | 当前边界 |
|---|---|---|
| 三栏式设计器 | 已实现 | 基础工作台交互，未做多标签项目管理 |
| 官方组件实时渲染 | 已实现 | 9 种组件，运行时使用锁定的官方 npm 包 |
| 组件库拖拽添加 | 已实现 | 可添加到根画布或 Flex / Card / ProCard 容器 |
| 属性面板 | 部分实现 | 每个已接入组件只覆盖常用 API 子集 |
| 页面主题 Token | 部分实现 | 当前提供主色和圆角两个编辑入口 |
| Design IR | 已实现 MVP | 当前为树形结构 v1，尚无 slots / bindings / code nodes / source maps |
| TSX 正向生成 | 已实现 | 标准静态组件 TSX，带 ConfigProvider Token |
| TSX 反向同步 | 部分实现 | 只支持已注册组件静态 JSX 子集；动态表达式留在代码模式 |
| 代码编辑 | 已实现 MVP | Monaco 编辑器，需手动触发解析同步 |
| 单 TSX 导出 | 已实现 | 尚未生成完整业务项目 ZIP |
| 独立构建预览 | 已实现 MVP | 本机 Vite build + **TypeScript 类型检查** + 静态服务 + iframe；固定依赖 |
| 全量 API 元数据采集 | 未实现 | 下一阶段第一优先级 |
| 任意 React 双向编辑 | 未实现 | 需要 AST source mapping / Code Node / 冲突方案 |
| 后端 API 设计与联调 | 未实现 | 需要 API 契约、Mock 和服务层 |
| 生产级隔离构建 Worker | 未实现 | 当前服务只限单机本地开发 |

## 第一轮工程审计验证（2026-11-21，Windows 实测）

- `npm install`：218 包安装成功，生成 `package-lock.json`（可重复安装）。
- `npm run typecheck`（tsc 6.0.2 --noEmit）：**零错误**。
- `npm run build`（tsc + vite 8.3.8）：退出码 0，3710 模块，日志 `evidence/build.log`。
- 设计器真实运行：`http://127.0.0.1:5173` 渲染官方组件 DOM（`button.ant-btn`×19、`.ant-pro-table`×1、`input.ant-input`×4），截图 `evidence/evidence-01..06`。
- E2E（Playwright）：属性→画布→代码同步、坏代码保护、静态 JSX 反向解析、点击构建预览后 iframe 内真实渲染，全部通过（`evidence/e2e-results.json`）。
- 引擎确定性测试：`tests/engine-roundtrip.test.ts` 15 项断言全过（codegen 结构 / 解析回环 / 代码保护 / 编辑同步）。
- 本轮修复：独立构建流程补上真实 TypeScript 类型检查（验收项 F 要求），非法 prop 返回 422 + TS2322 诊断。
- 详细审计结论、名实核查与遗留问题见 `docs/AUDIT-REPORT.md`；Windows 环境步骤见 `docs/WINDOWS-SETUP.md`。

> 早期"本轮静态验证"段落（npm 安装超时、未完成真实构建）记录的是上一环境的状态，已被本轮实测取代并移除。
