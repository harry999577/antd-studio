# 开发过程记录

## 轮次 1 — 工程审计与真实运行验证（2026-11-21 上午，commit `247433a`）

**做了什么**
1. 仓库 Git 化：`git init` → 初始提交 `7287b2b` → 推送 GitHub（harry999577/antd-studio）。
2. 环境攻坚：定位 Git（D:\Git）与 Node（D:\nodejs）不在 PATH；PowerShell 执行策略拦截 npm.ps1 → 统一 `cmd /c "set PATH=... && npm ..."` 包装。
3. `npm install` 成功（218 包），提交 `package-lock.json`。
4. `npm run typecheck` 零错误；`npm run build` 退出码 0（3710 模块，日志存档 `evidence/build.log`）。
5. 启动 5173 设计器 + 4175 构建服务；Playwright E2E 首次打通（踩坑：GBK 控制台→结果写 UTF-8 JSON；Monaco 懒加载→`wait_for_function` 就绪门；`.inputarea` 不可点→model API 注入）。
6. 引擎确定性测试 15 项断言（rolldown 打包 → node 运行）。
7. **修复 R-4**：独立构建流程补真实 TypeScript 类型检查（`ts.createProgram` + `createCompilerHost`；踩 TS 6.0 三个坑：ESM sys 形状、formatHost 缺 getCurrentDirectory、CSS 副作用导入需 `declare module '*.css'`）。实测：合法代码 200 built；非法 prop 422 + `TS2322` 真实诊断。
8. 产出 `docs/AUDIT-REPORT.md`（含 R-1..R-10 遗留清单）、`docs/WINDOWS-SETUP.md`；更新 IMPLEMENTATION-STATUS / README 至实测口径。

**结论**：技术路线正确、可运行、无冒充实现；关键验收项 F（独立构建预览）实测通过。

## 轮次 2 — 核心架构固化（2026-11-21 中午）

**做了什么**
1. **Design IR v2**（R-5 修复）：
   - `types.ts`：`schemaVersion: 2`，节点新增 `meta {locked, hidden}`，`ComponentDefinition` 拆分 `supportsText` / `defaultText`。
   - `migrate.ts`（新）：迁移链 v1→v2——`props.children` 文本通道并入 `children[]`；`deserializeDocument` 强制版本闸门，未来版本拒绝载入。
   - `sample-document.ts` / `registry.ts` / `codegen.ts` / `tsx-parser.ts` 全部切到单文本通道；解析器把 JSX `children={...}` 属性列为保留名报错。
2. **树操作固化**（R-6 部分）：`tree-ops.ts`（新）纯不可变 API：find/patch/remove/append/**moveNode**（容器=inside、叶子=同级 before，拒绝根移动/移入自身后代）/**moveSibling**/nodeText/setNodeText/isDescendant/findParent。Studio.tsx 删除本地实现改用 tree-ops。
3. **稳定节点 ID**（R-1 第一步）：`parseTsxToDocument(code, prevDoc)` 按"位置+类型"复用旧 id，回环后 `search-submit`/`user-table` 等 id 不漂移，选中态可保留。
4. **组件树面板**（R-6）：`ComponentTree.tsx`（新）第四栏，缩进树 + 文本子节点行 + 点击联动画布选中；状态栏显示 `Design IR v{schemaVersion}`。
5. **画布内移动**：`CanvasNode.tsx` 加 dnd-kit `useDraggable` 拖拽手柄（⠿），`handleDragEnd` 区分"面板拖入"与"画布移动"两种 drag source。
6. **属性面板增强**：上移/下移按钮（moveSibling + 撤销恢复验证）、父节点 ID 显示、新增属性覆盖（Button danger/ghost/href、Input maxLength/showCount、Select disabled、Card loading、Divider dashed、Typography ellipsis/copyable、ProCard loading、ProTable pagination、Flex flex）。
7. **测试升级**：引擎断言 15 → **32 项全过**（新增 v2 迁移 5 项、树操作 8 项、稳定 ID 3 项、保留名保护 1 项）；E2E 新增 B2（组件树联动）、B3（同级排序+撤销恢复）、B_text_channel_v2 断言，全部通过（`evidence/e2e-results.json`）。
8. 踩坑修正：antd Button 两汉字自动加空格（"下 移"）→ 测试用正则 `\u4e0b\s*\u79fb`；`:scope > .canvas-node` 因包装层失配 → 按 `closest('.canvas-node')` 过滤。

**验证**：typecheck 零错误；`npm run build` 退出码 0；引擎 32/32；E2E 全绿（含构建预览 iframe 真实渲染）。

## 遗留与下一步（按优先级）

1. **R-1/R-3 Recast 增量源码 patch**：稳定 ID 已就位，下一步把"全量重建 IR"升级为保留格式与 sourceMap 的源码 patch（目标约束 Babel Parser + Recast 的完整落实）。
2. **R-2 元数据自动采集**：从 antd `.d.ts` 生成 ComponentMeta，先覆盖 Form/Table/Modal。
3. **slot/event/code 编辑器实现**（接口已预留）。
4. **R-9 持久化**：文档保存（localStorage → 后端）+ 撤销栈覆盖代码编辑。
5. 测试工程化：`npm test` 聚合（vitest 跑引擎断言 + playwright 跑 E2E）。
6. R-7 ProComponents RC 版本回归矩阵；R-8 npm audit 评估。
