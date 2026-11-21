# TASK-001 — 核心双向同步与关键链路验收补齐

- **状态**：已完成（本轮），等待验收
- **负责人**：lead（root agent）
- **创建**：2026-11-21 · **完成**：2026-11-21
- **依赖任务**：TASK-000（第一轮：工程审计、依赖验证、架构固化、真实运行验证，commit `9f16fff`）
- **Git 分支**：master（GitHub harry999577/antd-studio）

## 1. 任务目标

不推倒现有工程，在当前架构基础上补齐双向源码同步、ProTable 完整验收和工程质量治理。

## 2. 整改项与完成状态

| # | 整改项 | 状态 | 交付物 / 证据 |
|---|---|---|---|
| 1 | Babel Parser + Recast 源码增量 Patch 方案与最小实现 | ✅ | `src/engine/source-patch.ts`；方案 `docs/RECAST-TECHNICAL-PLAN.md` |
| 2 | Design IR 节点 ↔ AST source mapping | ✅ | `SourceNode.loc` + `getNodePath`/`findSourceNodeByPath`；id 位置+类型复用 |
| 3 | 验证局部修改不破坏无关源码 | ✅ | `tests/source-patch.test.ts`（28 断言）+ `tests/sync-demo.ts`（6 场景真实 diff）→ `evidence/sync-demo.md` |
| 4 | ProTable 列/搜索/分页/工具栏端到端测试 | ✅ | `tests/protable.e2e.py` → `evidence/protable-e2e.json` + 5 张截图 |
| 5 | npm audit 漏洞分析及修复评估 | ✅ | `docs/SECURITY-AUDIT.md` + `evidence/audit.json`；修复后 `found 0 vulnerabilities` |
| 6 | 修正审计报告/实施状态/开发日志历史矛盾 | ✅ | `docs/AUDIT-REPORT.md`、`docs/IMPLEMENTATION-STATUS.md`、`docs/DEVELOPMENT-LOG.md` 修订 |
| 7 | 补齐 TASK-001 与 KNOWN-ISSUES 档案 | ✅ | 本文件 + `docs/KNOWN-ISSUES.md` |

## 3. 验收标准对照

| 验收标准 | 结果 | 证据 |
|---|---|---|
| 可视化修改只改变对应 TSX 节点 | ✅ | sync-demo A/B/C/D/F 每步 diff 仅目标行；patch 测试 `only_one_line_changed` |
| 代码修改保留非目标代码、注释和格式 | ✅ | patch 测试 comment/block-comment/variable/multiline 保留断言；demo E |
| 无法解析的代码节点不会丢失 | ✅ | demo E：动态节点拒绝 patch，源码字节一致；拒绝原因上报 UI |
| ProTable 完整配置链路通过测试 | ✅ | protable-e2e 1-7 全 true（列/搜索/工具栏/分页/代码同步/iframe 真实渲染/翻页） |
| 所有测试有可复现命令和真实结果 | ✅ | `npm run test:engine` / `test:demo` / `test:e2e` / `py tests/protable.e2e.py` |
| 文档与代码状态一致 | ✅ | 第 2 节修订项；KNOWN-ISSUES 登记未修项 |

## 4. 测试命令与结果（Windows 实测）

```powershell
npm run typecheck            # 零错误
npm run test:engine          # ENGINE_ALL_PASS (35) + PATCH_ALL_PASS (28)
npm run test:demo            # DEMO_OK evidence/sync-demo.md
py tests/protable.e2e.py     # 全项通过，构建 ID 回显
py tests/smoke.e2e.py        # 全项通过（回归）
npm run build                # 退出码 0
npm audit                    # found 0 vulnerabilities
```

## 5. 本轮新增/修改文件清单

**新增源码**：`src/engine/source-patch.ts`
**修改源码**：`src/engine/codegen.ts`（ProTable true→{} 规范化）、`src/engine/registry.ts`（normalizeProTableProp）、`src/engine/tree-ops.ts`（getNodePath）、`src/Studio.tsx`（接入 patch：prop/text/theme/move/insert/remove/undo-redo 快照）、`src/main.tsx`（Monaco 离线 worker）
**新增测试**：`tests/source-patch.test.ts`、`tests/sync-demo.ts`、`tests/protable.e2e.py`、`tests/fixtures/protable-build.json`
**新增文档**：`docs/RECAST-TECHNICAL-PLAN.md`、`docs/SECURITY-AUDIT.md`、`docs/KNOWN-ISSUES.md`、本文件
**修改文档**：`docs/AUDIT-REPORT.md`、`docs/IMPLEMENTATION-STATUS.md`、`docs/DEVELOPMENT-LOG.md`、`docs/WINDOWS-SETUP.md`、`README.md`
**依赖**：新增 `recast@0.24.3`；`concurrently→9.2.5`；`overrides.dompurify→3.4.18`；`package-lock.json` 更新
**证据**：`evidence/sync-demo.md`、`evidence/protable-e2e.json`、`evidence/audit.json`、ProTable 截图 5 张

## 6. 遗留（转 KNOWN-ISSUES）

KI-002（插入走全量重生成）、KI-003（跨容器移动回退重生成）、KI-005（无持久化）等见 `docs/KNOWN-ISSUES.md`。
