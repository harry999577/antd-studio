# KNOWN-ISSUES — antd-studio-mvp

> 本文件登记当前工程**已知的、尚未修复的**限制与缺陷。每条含：影响、复现、状态、处置建议。
> 与 `docs/AUDIT-REPORT.md` 的 R-清单互补：R-清单是审计风险视角，本文件是运行期缺陷视角。
> 维护规则：修复后把状态改为 `已修复(轮次/commit)` 并保留条目至少一轮，不直接删除。

| ID | 标题 | 严重度 | 状态 | 影响 / 复现 | 处置 |
|---|---|---|---|---|---|
| KI-001 | 反向解析为全量重建，非增量 AST patch | 中 | **已修复（轮次3，Recast source-patch 引擎）** | 曾导致代码注释/格式在可视化编辑后丢失 | 现由 `src/engine/source-patch.ts` 走增量 patch；见 `docs/RECAST-TECHNICAL-PLAN.md` |
| KI-002 | 结构性插入（addComponent）仍走全量重生成 | 低 | 已知未修 | 向画布新增组件时，代码 Tab 整页重排，用户手写注释会丢失；属性/文本/主题/同级交换编辑不受影响 | 下轮实现 `insertInto` 精确锚点（引擎已具备 `designNodeToAst`，缺插入位置与用户自定义子节点共存策略） |
| KI-003 | 跨容器移动（drag 到不同父节点）回退全量重生成 | 低 | 已知未修 | 拖拽跨容器时源码整页重排；同级交换已走源码 swap patch | 扩展 `moveInSource` 支持 remove+insert 组合，保留两端上下文 |
| KI-004 | 撤销/重做快照含代码字符串，历史栈内存占用随编辑增长 | 低 | 已知未修 | 长会话（>40 步大文档）内存上升；上限 40 已缓解 | 改存 IR diff + 惰性代码重建 |
| KI-005 | 无持久化保存 | 中 | 已知未修 | 刷新页面丢失全部设计；顶栏已标注"尚未接入持久化保存" | localStorage 起步 → 后端保存 API |
| KI-006 | ProComponents 锁定预发布版 3.1.15-9 | 中 | 已知风险 | 上游 API 可能变动；未经回归禁止升级 | 建 React/antd/Pro 版本兼容矩阵（审计 R-7） |
| KI-007 | 属性面板仅覆盖官方 API 子集 | 中 | 已知限制 | 未列出的 prop 无法可视化编辑（可留在代码模式） | `.d.ts` 自动采集器（审计 R-2） |
| KI-008 | slot/event/code 编辑器未实现 | 低 | 接口预留 | `PropDefinition.editor` 已含 `slot/event/code` 枚举，控件未落地 | 下轮实现结构化字段树 + 事件代码编辑器 |
| KI-009 | 构建服务无超时/资源限额 | 中 | 已知风险（本地 MVP） | 恶意/超大源码可长时间占用构建进程；仅绑定 127.0.0.1 缓解 | 生产必须 Worker/容器隔离 + 配额（审计 §4） |
| KI-010 | Monaco worker 依赖本地打包 | 低 | 已修复（轮次3） | 曾依赖 jsdelivr CDN，离线/CDN 抖动导致代码 Tab 卡 Loading | `main.tsx` 用 `loader.config({monaco})` + Vite `?worker` 本地 worker，0 外部请求 |
| KI-011 | dompurify 传递依赖漏洞（经 monaco-editor） | 中 | 已修复（轮次3） | `npm audit` 曾报 critical×2 + low×2 | `concurrently→9.2.5` 修 shell-quote；`overrides.dompurify→3.4.18` 修 DOMPurify，现 `found 0 vulnerabilities` |
| KI-012 | 拖拽排序无精确插入位置指示 | 低 | 已知限制 | 只能"放入容器/同级前"，无插入缝隙高亮 | 画布加 drop indicator（dnd-kit sortable） |
| KI-013 | 组件树无折叠/展开与多选 | 低 | 已知限制 | 深层级页面树过长 | 加折叠态 + 框选批量操作 |
| KI-014 | 无键盘快捷键（Ctrl+Z/Ctrl+D/Delete） | 低 | 已知限制 | 只能点按钮撤销/重做/删除 | 绑定全局快捷键 |

## 已修复归档

- **KI-001**（轮次3）：Recast 增量 patch 引擎落地，双向同步不再破坏无关源码。
- **KI-010**（轮次3）：Monaco 离线化，去除 CDN 依赖。
- **KI-011**（轮次3）：npm audit 清零。
- 审计 R-4/R-5/R-6/R-10 已修复，详见 `docs/AUDIT-REPORT.md` §5。

## 安全说明

- 预览服务绑定 `127.0.0.1`，构建产物 CSP 禁外联；本地 MVP **不可**直接作为多用户生产服务（KI-009）。
- 依赖通过 `overrides` 强制 `dompurify@3.4.18`（monaco 声明 3.4.15 落在漏洞区间 `<=3.4.16`；降级 monaco 无效，因其 0.55.1 亦锁漏洞版）。
