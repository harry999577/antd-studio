# Windows 安装与运行说明（实测通过）

> 本文所有命令均在 Windows 11 + PowerShell 实测。若 `git`/`npm` 不在 PATH，见第 1 节。

## 0. 前置要求

| 软件 | 要求 | 本机实测 |
|---|---|---|
| Node.js | ≥ 22.12（package.json engines） | v24.18.0（D:\nodejs） |
| Git | 任意近期版本 | 2.56.1.windows.1（D:\Git） |
| 浏览器 | Chromium 系 | Playwright 自带 Chromium 159 |

## 1. PATH 配置（一次性）

若 `git -v` 或 `npm -v` 报"无法识别"：

```powershell
# PowerShell 会话内临时生效
$env:PATH = "D:\Git\bin;D:\nodejs;$env:PATH"

# 永久生效（用户级）
[Environment]::SetEnvironmentVariable("Path", "D:\Git\bin;D:\nodejs;" + [Environment]::GetEnvironmentVariable("Path","User"), "User")
```

**PowerShell 执行策略坑**：`npm.ps1` 可能被拦截（UnauthorizedAccess）。两种绕法：
```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned   # 推荐，一次
# 或始终用 cmd 包装：
cmd /c "set PATH=D:\nodejs;%PATH% && npm <script>"
```

## 2. 安装依赖

```powershell
cd E:\ai\antd-studio
npm install        # 218 packages，生成/复用 package-lock.json（可重复安装）
```

## 3. 启动

```powershell
npm run dev
```
同时启动两个进程（concurrently）：
- 设计器：http://127.0.0.1:5173 （Vite dev）
- 构建预览服务：http://127.0.0.1:4175 （server/index.mjs，含 /api/build-preview 与静态产物）

分开启动（调试用）：
```powershell
npm run dev:web              # 仅设计器
npm run dev:preview-server   # 仅构建服务
```

## 4. 验证命令与预期结果（实测）

```powershell
npm run typecheck    # tsc --noEmit → 零错误退出
npm run build        # tsc + vite build → 退出码 0，3710 模块（见 evidence/build.log）
```

冒烟测试（需先 `npm run dev` 保持运行）：
```powershell
npm test                    # typecheck + 引擎确定性测试（期望 ENGINE_ALL_PASS (35) + PATCH_ALL_PASS (28)）
npm run test:e2e            # Playwright 全流程 E2E；期望 evidence\e2e-results.json 全部为真值，F_pass=true
npm run test:demo           # 双向同步演示 -> evidence\sync-demo.md（期望 DEMO_OK）
py tests\protable.e2e.py    # ProTable 列/搜索/工具栏/分页端到端 -> evidence\protable-e2e.json 全项通过
npm audit                   # 期望 found 0 vulnerabilities（修复过程见 docs/SECURITY-AUDIT.md）
```

## 5. 构建预览使用说明

1. 设计器顶栏点 **构建预览**。
2. 服务端流程：校验源码 → 写入隔离 workspace → **TypeScript 类型检查** → Vite 构建 → 产物静态服务。
3. 成功后 Drawer 内 iframe 加载 `http://127.0.0.1:4175/previews/<id>/index.html`，日志显示"构建成功 · <id>"。
4. 失败时：语法/构建错误（422，Vite 原始诊断）或类型错误（422，`stage:"typecheck"`，TS 诊断列表）。原始代码不会被覆盖。

## 6. 已知环境坑（本项目实测）

- **GBK 控制台**：Python 测试脚本打印中文会 `UnicodeEncodeError` → 结果一律写 UTF-8 JSON 文件。
- **Monaco 懒加载**：`window.monaco` 仅在代码 Tab 挂载后可用；`.inputarea` 不可点击，自动化请用 `monaco.editor.getModels()[0].setValue()`。
- **TS 6.0 API 变化**：ESM `ts.sys` 与 `createProgram` host 不兼容；`useCaseSensitiveFileNames` 由函数变 boolean。服务端已用 `createRequire` + `createCompilerHost` 适配。
- **文件锁**：`server/index.mjs` 运行时被 node 进程锁定，编辑前需先停止 4175 服务。
- **npm audit**：存在 4 个漏洞（2 low / 2 critical，dev 依赖链），未自动 `audit fix --force`（会破坏版本锁定），评估见审计报告 R-8。
- **GitHub 推送需代理**：本机直连 github.com:443 失败，系统代理为 `127.0.0.1:10808`；已配置 `git config --global http.proxy http://127.0.0.1:10808`（https.proxy 同）。代理关闭时推送会失败。
