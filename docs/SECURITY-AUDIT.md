# 安全审计报告 — npm audit 漏洞分析与修复

日期：2026-11-21 · 命令：`npm audit`（npm 11.16.0）· 原始 JSON：[`evidence/audit.json`](../evidence/audit.json)

## 1. 修复前状态

`added 218 packages` 后审计报 **4 个漏洞（2 critical, 2 low）**：

| 包 | 严重度 | 引入链 | 漏洞 |
|---|---|---|---|
| shell-quote | **critical** (CVSS 8.1) | concurrently 9.2.1 → shell-quote ≤1.8.4 | GHSA-w7jw-789q-3m8p：`quote()` 不转义 `.op` 值中的换行 → 命令注入（CWE-77/78）；GHSA-395f-4hp3-45gv：`parse()` 二次复杂度 DoS（CWE-407, 7.5） |
| concurrently | critical（同上链） | devDependency 直接 | fixAvailable: 9.2.5（非 semver-major） |
| dompurify | low ×5 条 advisory | monaco-editor 0.57.0 → dompurify 3.4.15（范围 ≤3.4.16） | GHSA-p98j-92pf-mc4p、GHSA-6688-9rhm-gjv2、GHSA-c6gr-qvv4-5v3f、GHSA-cg2g-xh64-v4q7、GHSA-mrv2-3pqr-j5jr：均为 DOMPurify 净化绕过/DOM XSS（CWE-79/693），CVSS 未评（0.0 占位） |
| monaco-editor | low（同上链） | 直接依赖 | fixAvailable: 降级 0.55.1（semver-major） |

## 2. 可利用性分析（本项目上下文）

**shell-quote / concurrently（critical）**
- concurrently 仅在 `npm run dev` 本地开发脚本中使用，负责拼命令串启动 vite + 预览服务。
- 攻击面：若把不可信输入拼进 concurrently 命令行则可注入。本工程**从不**把用户/画布输入拼入 shell 命令——构建服务用 Vite JS API（`build({...})`），非 shell。
- 结论：本地开发场景实际可利用性低，但属 dev 供应链卫生问题，**应修且可无破坏修**（补丁版本升级）。

**dompurify（low）**
- monaco-editor 内部用 DOMPurify 净化 hover/tooltip 的 HTML。本工程编辑器内容为用户自产 TSX，非多租户不可信输入。
- 但预览 iframe 加载构建产物时，编辑器渲染路径仍会执行 dompurify；且 5 条均为净化绕过类，长期看应修。
- **降级 monaco 到 0.55.1 无效**：其 pin 的 dompurify 3.2.7 同样落在漏洞范围，且 0.55.1 是 semver-major 降级，会破坏已验证的离线 worker 集成（`monaco-editor/<sub>.js` exports 映射为 0.57 特性）。
- 结论：用 `overrides` 强制同主版本补丁（3.4.15 → 3.4.18）是最小正确修复。

## 3. 修复动作与验证

```powershell
npm install concurrently@9.2.5 --save-exact   # 修 shell-quote 链（非 major，无 API 变化）
# package.json 新增：
#   "overrides": { "dompurify": "3.4.18" }
npm install                                    # 应用 override
npm audit                                      # => found 0 vulnerabilities
npm ls dompurify                               # monaco-editor@0.57.0 -> dompurify@3.4.18 overridden
```

修复后回归（全部实测）：

| 项 | 结果 |
|---|---|
| `npm run build` | 退出码 0 |
| `npm run typecheck` | 零错误 |
| `npm run test:engine` | ENGINE_ALL_PASS (35) + PATCH_ALL_PASS (28) |
| Monaco 加载（diag） | monaco_dom=1, models=1, **failed_requests=0** |
| `py tests/smoke.e2e.py` | 全项通过（含构建预览 iframe） |
| `py tests/protable.e2e.py` | 全项通过（列/搜索/工具栏/分页/翻页） |

dompurify 3.4.18 与 3.4.15 同主版本（3.x），API 兼容，Monaco 功能回归无异常。

## 4. 残余风险与缓解（非 npm 依赖面）

| 风险 | 现有缓解 | 建议 |
|---|---|---|
| 构建服务执行任意用户 TSX（本质是代码执行） | 仅绑定 127.0.0.1；源码 ≤300KB；产物 CSP `connect-src 'none'`；iframe sandbox | 生产必须一次性容器/microVM + CPU/内存/时间配额 + 依赖白名单（KNOWN-ISSUES KI-009） |
| 预览产物 XSS | CSP + `X-Content-Type-Options: nosniff` + `frame-ancestors` | 保持；多租户时加独立域名 |
| ProComponents 预发布版供应链 | 精确锁定 + lockfile | 升级前跑回归矩阵（KI-006） |
| 传递依赖未来漏洞 | `overrides` 已用于 dompurify | CI 加 `npm audit --audit-level=high` 门禁 |

## 5. 结论

- 2 critical（shell-quote 注入链）经 concurrently 补丁升级**已消除**；
- 2 low（DOMPurify 净化绕过）经 `overrides.dompurify@3.4.18` **已消除**；
- 当前 `npm audit` = **found 0 vulnerabilities**，全部功能回归通过，未引入破坏性升级。
