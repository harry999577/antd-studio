# MVP 实施状态

| 能力 | 状态 | 当前边界 |
|---|---|---|
| 三栏式设计器 | 已实现 | 基础工作台交互，未做多标签项目管理 |
| 官方组件实时渲染 | 已实现 | 9 种组件，运行时使用锁定的官方 npm 包 |
| 组件库拖拽添加 | 已实现 | 可添加到根画布或 Flex / Card / ProCard 容器 |
| 属性面板 | 部分实现 | 每个已接入组件只覆盖常用 API 子集 |
| 页面主题 Token | 部分实现 | 当前提供主色和圆角两个编辑入口 |
| Design IR | 已升级 v2 | 单文本通道（children 内 string）、meta 内部元数据、schemaVersion 迁移闸门（v1→v2 自动）、纯函数树操作 API（含 moveNode/moveSibling）、反向解析稳定节点 ID |
| TSX 正向生成 | 已实现 | 标准静态组件 TSX，带 ConfigProvider Token；文本输出为 JSX 子内容；ProTable 布尔配置属性输出归一（true→{}） |
| TSX 反向同步 | 已实现增量 | 静态 JSX 子集解析回 IR；**可视化编辑经 Recast 增量 patch 只改目标节点**，注释/格式/非视觉代码字节保留；动态节点拒绝保护（docs/RECAST-TECHNICAL-PLAN.md） |
| 组件树面板 | 已实现 | 第四栏缩进树，点击联动画布选中；文本子节点可见 |
| 画布内移动/排序 | 已实现 MVP | 拖拽手柄移动节点（容器=inside/叶子=同级）；上移/下移按钮；拒绝移入自身后代 |
| 代码编辑 | 已实现 MVP | Monaco 编辑器，需手动触发解析同步 |
| 单 TSX 导出 | 已实现 | 尚未生成完整业务项目 ZIP |
| 独立构建预览 | 已实现 MVP | 本机 Vite build + **TypeScript 类型检查** + 静态服务 + iframe；固定依赖 |
| 全量 API 元数据采集 | 未实现 | 下一阶段第一优先级 |
| 任意 React 双向编辑 | 部分实现 | 静态 JSX 走增量 patch + 动态节点只读保护；Code Node 混合编辑未做 |
| 后端 API 设计与联调 | 未实现 | 需要 API 契约、Mock 和服务层 |
| 生产级隔离构建 Worker | 未实现 | 当前服务只限单机本地开发 |

## 第一轮工程审计验证（2026-11-21，Windows 实测）

- `npm install`：218 包安装成功，生成 `package-lock.json`（可重复安装）。
- `npm run typecheck`（tsc 6.0.2 --noEmit）：**零错误**。
- `npm run build`（tsc + vite 8.3.8）：退出码 0，3710 模块，日志 `evidence/build.log`。
- 设计器真实运行：`http://127.0.0.1:5173` 渲染官方组件 DOM（`button.ant-btn`×19、`.ant-pro-table`×1、`input.ant-input`×4），截图 `evidence/evidence-01..06`。
- E2E（Playwright）：属性→画布→代码同步、坏代码保护、静态 JSX 反向解析、点击构建预览后 iframe 内真实渲染，全部通过（`evidence/e2e-results.json`）。
- 引擎确定性测试（当时 15 项，现扩展至 35 项）全过（codegen 结构 / 解析回环 / 代码保护 / 编辑同步）。
- 本轮修复：独立构建流程补上真实 TypeScript 类型检查（验收项 F 要求），非法 prop 返回 422 + TS2322 诊断。
- 详细审计结论、名实核查与遗留问题见 `docs/AUDIT-REPORT.md`；Windows 环境步骤见 `docs/WINDOWS-SETUP.md`。

## 第三轮双向同步与链路验收（2026-11-21，TASK-001，Windows 实测）

- **Recast 增量源码 patch**（`src/engine/source-patch.ts`）：属性/文本/主题/同级交换编辑只改目标 JSX 节点行；用户注释、格式、模块变量、自定义 import、动态事件函数字节保留；动态节点拒绝 patch 并上报原因。
- **双向同步演示**：`npm run test:demo` → `evidence/sync-demo.md`（6 场景真实前后 diff，全部断言通过）。
- **引擎/patch 测试**：`npm run test:engine` → `ENGINE_ALL_PASS (35)` + `PATCH_ALL_PASS (28)`。
- **ProTable 端到端**：`py tests/protable.e2e.py` → `evidence/protable-e2e.json` 全项通过（列 JSON 编辑+邮箱列渲染、search 表单、options 工具栏、pagination pageSize=2、代码同步、真实独立构建 iframe 翻页），截图 `protable-01..05`。
- **安全治理**：`concurrently→9.2.5` 修 shell-quote critical、`overrides.dompurify→3.4.18` 修 DOMPurify low → `npm audit` **found 0 vulnerabilities**。报告 `docs/SECURITY-AUDIT.md`，原始数据 `evidence/audit.json`（修复前 4 漏洞）。
- **Monaco 离线化**：本地 worker 打包，0 外部 CDN 请求（修复代码 Tab 卡 Loading）。
- **档案**：`docs/TASK-001.md`、`docs/KNOWN-ISSUES.md`（KI-001..014）、`docs/RECAST-TECHNICAL-PLAN.md`。
- 回归：`npm run build` 退出码 0；`py tests/smoke.e2e.py` 全绿。

> 早期"本轮静态验证"段落（npm 安装超时、未完成真实构建）记录的是上一环境的状态，已被实测取代并移除。
