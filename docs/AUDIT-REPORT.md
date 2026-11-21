# Ant Design Studio 工程审计报告（第一轮）

日期：2026-11-21 · 基线 Commit：`7287b2b`（初始导入）→ 本报告随本轮验证提交
审计方式：逐文件源码审查 + 真实运行验证（非 README 推断）。所有结论均有下方"证据索引"支撑。

---

## 1. 结论摘要

**技术路线判定：正确且已验证可运行。** 现有工程不是推倒重做的对象，而是可靠的 MVP 基线：

| 验收项 | 结论 | 证据 |
|---|---|---|
| React + TypeScript + Ant Design 路线 | ✅ 符合 | 全部画布渲染来自 `antd@6.7.1` / `@ant-design/pro-components@3.1.15-9` 真实 npm 组件，DOM 中存在 `button.ant-btn`(19)、`.ant-pro-table`(1)、`input.ant-input`(4) |
| 工程可安装 | ✅ | `npm install` 成功（218 包），生成 `package-lock.json`（126 KB） |
| 类型检查 | ✅ 零错误 | `tsc --noEmit`（npm run typecheck）通过 |
| 生产构建 | ✅ | `npm run build` 退出码 0，3710 模块，产物见 `evidence/build.log` |
| 设计器真实运行 | ✅ | Vite dev `http://127.0.0.1:5173` 渲染成功，`evidence/evidence-01-designer.png` |
| 拖拽/选中/属性联动 | ✅ | 属性修改 → 画布与 TSX 同步（`e2e-results.json` C_*），`evidence-02/03` |
| TSX 输出可独立编译 | ✅ | 生成源码经独立 Vite 构建成功（F_*，`evidence-06-preview-drawer.png`） |
| 反向解析 | ✅ | 静态 JSX 解析回画布成功（E_*，`evidence-05-roundtrip.png`） |
| 代码保护 | ✅ | 语法错误/动态表达式/spread/未知组件均抛错且不覆盖源码（D_* + 引擎 15 项断言） |
| 独立构建预览 | ✅ | 真实 Vite 构建 + iframe 隔离渲染，构建 ID 回显，失败返回 422 + 真实错误（F2） |

## 2. 目录与源码审查

```
src/
  main.tsx              React 入口，ConfigProvider + zhCN + App —— 正常
  Studio.tsx            设计器主体（431 行）：画布/代码双 Tab、属性面板、撤销重做、构建预览调用
  components/
    CanvasNode.tsx      递归渲染节点 → 真实 antd/pro 组件（renderers 映射表，非自绘）
    PaletteItem.tsx     dnd-kit useDraggable 面板项
  engine/
    types.ts            Design IR：DesignNode/DesignDocument/ComponentDefinition/PropDefinition
    registry.ts         9 组件注册表（Flex/Card/Button/Input/Select/Divider/Typography.Title/ProCard/ProTable）
    codegen.ts          IR → TSX（AST 无关，纯模板但输出标准 TSX）
    tsx-parser.ts       TSX → IR：@babel/parser 真实 AST 解析，非字符串替换 ✅
    sample-document.ts  初始用户管理页示例
server/index.mjs        独立构建服务（express + vite.build API，端口 4175）
```

### 2.1 名实相符性核查（重点：有无模拟实现）

- ✅ **无自绘组件冒充**：`CanvasNode.renderers` 直接引用 `antd` 与 `@ant-design/pro-components` 的导出组件；DOM 类名（`ant-btn`、`ant-pro-table`、`ant-input`）证实为官方实现。
- ✅ **无截图/静态 HTML 冒充预览**：`server/index.mjs` 调用真实 `vite build` API 产出 hash 资源（491 KB JS bundle），iframe 加载的是构建产物。
- ✅ **无字符串替换冒充 AST**：`tsx-parser.ts` 使用 `@babel/parser` AST；动态表达式、spread、未知组件、多 return、async 均显式抛错。
- ✅ **JSON 不作为交付物**：导出物为 `.tsx` 源码文件；Design IR 仅内部状态。
- ⚠️ **codegen 是模板拼接而非 AST/Recast 增量 patch**：符合"IR→TSX"单向生成要求，但**尚不满足目标技术约束中的 `Babel Parser + Recast` 双向源码 patch**。当前反向解析是"全量重建 IR"，节点 ID 会重新生成（`code-node-N-uuid`），丢失选中态与 sourceMap。→ 列入遗留问题 R-3。
- ⚠️ **无空实现**，但存在**功能子集**：属性面板只暴露注册表声明的 API 子集（代码内注释已如实声明，非虚假宣传）。

### 2.2 依赖兼容性（实测）

| 依赖 | 版本 | 状态 |
|---|---|---|
| react / react-dom | 19.3.1 | ✅ 与 antd 6 兼容 |
| antd | 6.7.1 | ✅ 渲染、ConfigProvider Token 正常 |
| @ant-design/pro-components | 3.1.15-9 | ✅ ProTable/ProCard 真实渲染（注意：此为 RC 版本） |
| @babel/parser | 7.29.14 | ✅ AST 解析正常 |
| @dnd-kit/core + utilities | 6.3.1 / 3.2.2 | ✅ 拖入/嵌套可用 |
| monaco-editor + @monaco-editor/react | 0.57.0 / 4.7.0 | ✅ 代码 Tab 正常（见 4.4 测试注意事项） |
| typescript | 6.0.2 | ✅ tsc 6 已弃用 `moduleResolution: node10`，工程使用 `Bundler` 无碍 |
| vite | 8.3.8（rolldown 内核） | ✅ dev/build/独立构建 API 均正常 |
| express | 5.2.1 | ✅ 构建服务正常 |

`npm audit`：4 漏洞（2 low, 2 critical）——未修，列入遗留问题 R-8。

### 2.3 运行时观察

- 控制台仅 1 条 antd deprecation 警告：`Drawer width 已废弃，请用 size`（Studio.tsx:416）。
- 无 pageerror（e2e 全程 0 条）。

## 3. 核心架构现状评估（对照目标）

### B. Design IR —— 基本达标，有缺口
- ✅ 数据结构统一（id/type/props/children + schemaVersion:1 + framework 版本 + theme token）。
- ✅ 增删改移（Studio.tsx: findNode/patchNode/removeNode/appendChild，不可变更新）。
- ✅ 序列化（generateTsx）/反序列化（parseTsxToDocument）/版本标识（schemaVersion）。
- ✅ 撤销/重做基础机制（history/future 栈，上限 40 步，代码脏时禁用）。
- ⚠️ **缺口**：无 `slots`、无节点级 `meta/locked/hidden`、无 sourceMap；`props.children` 与 `children[]` 双通道语义重叠（Button 用前者、容器用后者），易混淆；撤销栈不含代码 Tab 的编辑。

### C. 组件注册体系 —— 骨架达标，覆盖面小
- ✅ Registry + 元数据（label/package/category/props/defaultProps/canHaveChildren）+ 编辑器控件类型（input/switch/select/number/json）。
- ⚠️ **缺口**：仅 9 组件；属性为手工子集而非从官方 `.d.ts` 自动采集；复杂属性（columns/dataSource/options）目前只有 JSON 文本框（已预留 `editor: 'json'` 接口但未做结构化编辑器）。

### D. 可视化编辑器 —— 达标（MVP 口径）
- ✅ 左侧面板（搜索/分组/计数）、中央画布（真实渲染+选中高亮+类型标签）、右侧属性面板（联动+节点 ID+删除）、容器嵌套投放（Flex/Card/ProCard droppable）、拖拽添加、主题 Token 编辑。
- ⚠️ **缺口**：无独立组件树视图；画布内节点间拖拽排序未实现（只能拖入，不能重排）；无插槽。

### E. 代码生成与双向联动 —— 达标（受限静态子集）
- ✅ IR→TSX、Monaco 展示、画布改动即时同步代码、静态 JSX 解析回画布、失败保护原始代码、不支持的动态代码显式报错不静默丢失。
- ⚠️ **缺口**：见 2.1 codegen 模板化问题；解析后节点 ID 重建导致选中态丢失。

### F. 独立构建预览 —— **关键验收项，实测通过**
- ✅ 生成独立 React 项目（workspace 隔离于 `.studio-previews/workspaces/<id>`）。
- ✅ 真实 Vite 构建 + **TypeScript 类型检查（本轮已补，见 6.1 修复记录）** + 独立端口 4175 + iframe sandbox 展示 + 构建 ID/日志回显 + 重新构建。
- ✅ 构建失败返回 422 与真实 Vite 错误（实测语法错误输出 `Expected \`(\` but found \`{\``）；类型错误返回 422 + `stage:"typecheck"` + 真实 TS 诊断（实测 `TS2322 ... notARealProp ... ButtonProps`）。
- ✅ 设计器(5173)与预览(4175)运行环境隔离（不同 origin/进程）。
- ⚠️ 缺口：产物 TTL 清理有（保留 20 份）但无审计日志；构建无超时/资源限额（本地 MVP 可接受，生产必须 Worker 隔离）。

## 4. 测试证据与复现

### 4.1 环境（Windows）
```powershell
# 要求 Node >= 22.12（实测 v24.18.0）；Git 2.56.1（D:\Git）
cd E:\ai\antd-studio
npm install          # 218 packages
npm run typecheck    # tsc --noEmit，零错误
npm run build        # 退出码 0，见 evidence/build.log
npm run dev          # 同时启动 5173 设计器 + 4175 构建服务
```

### 4.2 引擎确定性测试（15 项断言全过）
`tests/engine-roundtrip.test.ts`（rolldown 打包后 node 运行）：codegen 结构 6 项、解析回环 4 项、代码保护 4 项（未知组件/动态表达式/spread/额外 import 均抛错）、编辑同步 1 项。

### 4.3 E2E（Playwright + Chromium，UI 全流程）
`tests/smoke.e2e.py` → `evidence/e2e-results.json`：A(真实组件计数) B(选中联动) C(属性→画布+代码同步) D(坏代码报错+源码保留+画布不动) E(静态 JSX 解析回画布+旧文档替换) F(点击构建预览→iframe 内真实 antd 按钮渲染 ROUNDTRIP-OK，日志"构建成功 · e721052b9cec4082")。截图 6 张存于 `evidence/`。

### 4.4 测试环境注意事项（踩坑记录）
- PowerShell `npm.ps1` 被执行策略拦截 → 用 `cmd /c "set PATH=D:\nodejs;%PATH% && npm ..."`。
- Python stdout 为 GBK，打印中文断言结果会崩 → 结果写 UTF-8 JSON 文件。
- `@monaco-editor/react` 默认 `window.monaco` 未初始化，需先渲染编辑器（切到 TSX Tab）后才能经 model API 操作；`.inputarea` 元素不可点击，键盘注入不可靠 → 用 `monaco.editor.getModels()[0].setValue()` 程序化注入（与用户输入等价触发 onChange→React state）。

## 5. 本轮修复记录（R-4）

**独立构建补 TypeScript 类型检查**（`server/index.mjs`）：
- 新增 `typeCheckProject()`：在 Vite 打包前用 `ts.createProgram` 对 workspace 的 `main.tsx / Page.tsx / vite-env.d.ts` 做真实类型检查，复用主工程 `tsconfig.json` 选项（strict、react-jsx、Bundler 解析）。
- 失败返回 `422 {stage:"typecheck", error:"TS2322 …"}`，画布/预览侧展示真实诊断；通过才进入 `vite build`。
- 实测：合法代码 200 built；非法 prop `notARealProp` 被 TS2322 拦截。
- 踩坑（TS 6.0）：ESM 导入的 `ts.sys` 形状与 `createProgram` host 不兼容（`useCaseSensitiveFileNames` 变 boolean、缺 `getDefaultLibFileName` 等）→ 改用 `createRequire` 加载 CJS 版 typescript + `ts.createCompilerHost`；`formatDiagnosticsWithColorAndContext` 的 host 必须含 `getCurrentDirectory` → 改为自研纯文本诊断格式化；CSS 副作用导入需 `declare module '*.css'` 环境文件。

## 6. 遗留问题清单（按风险排序）

| # | 问题 | 影响 | 建议 |
|---|---|---|---|
| R-1 | 反向解析为全量重建，节点 ID 不稳定 | 选中态丢失、无法增量 patch | 引入 Recast 保留格式 + sourceMap 映射 |
| R-2 | 属性元数据手工维护（9 组件子集） | 覆盖不了官方 API，维护成本线性增长 | 建 `.d.ts` 自动采集管线（目标第 C 节） |
| R-3 | codegen 模板拼接，非 AST/Recast 双向 | 与目标约束"Babel Parser + Recast"有差距 | 下轮实现 source patch |
| R-4 | ~~独立构建未含 tsc 类型检查~~ **已修复**（见第 5 节） | — | 后续可加构建超时与资源限额 |
| R-5 | `props.children` 与 `children[]` 双通道 | IR 语义含糊 | 统一文本子节点建模 |
| R-6 | 画布内排序/组件树/插槽缺失 | 编辑效率受限 | 下轮实现同级排序 + 树面板 |
| R-7 | ProComponents 使用 RC 版 `3.1.15-9` | 上游 API 可能变动 | 锁定并建版本矩阵测试 |
| R-8 | npm audit 4 漏洞（2 critical） | 供应链风险 | `npm audit` 定位后评估修复 |
| R-9 | 撤销栈不含代码编辑、无持久化保存 | 误操作可丢代码改动 | 统一命令栈 + localStorage/服务端保存 |
| R-10 | antd Drawer `width` deprecation | 未来破坏性 | 改 `size` |

## 6. 下一阶段建议（优先级）

1. **构建管线补类型检查**（R-4，验收项 F 直接要求，工作量小）。
2. **Recast 源码 patch 双向同步**（R-1/R-3，核心架构固化点）。
3. **元数据采集器 MVP**：从 antd `.d.ts` 抽取 props→编辑器映射，先覆盖 Form/Table/Modal（R-2）。
4. 组件树面板 + 同级排序（R-6）。
5. IR v2：slots/meta/sourceMap + migration（R-5）。
6. 测试工程化：把 `tests/` 纳入 `npm test`（vitest + playwright 双轨）。

---
*本报告由逐文件审查与真实运行日志生成；证据文件均在仓库 `evidence/` 目录。*
