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
| 独立构建预览 | 已实现 MVP | 本机 Vite build + 静态服务 + iframe；固定依赖 |
| 全量 API 元数据采集 | 未实现 | 下一阶段第一优先级 |
| 任意 React 双向编辑 | 未实现 | 需要 AST source mapping / Code Node / 冲突方案 |
| 后端 API 设计与联调 | 未实现 | 需要 API 契约、Mock 和服务层 |
| 生产级隔离构建 Worker | 未实现 | 当前服务只限单机本地开发 |

## 本轮静态验证

- Node.js `--check`：预览服务 JS 语法检查通过。
- TypeScript `transpileModule`：10 个 `.ts/.tsx` 源文件语法转译检查通过（不等同于类型检查）。
- 完整 `npm install` / `npm run build`：本次执行环境中 npm 安装多次超时，尚未完成依赖安装，因此未能完成真实 Vite 构建与完整类型检查。
