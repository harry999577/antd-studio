import express from 'express';
import react from '@vitejs/plugin-react';
import { build } from 'vite';
import { randomUUID } from 'node:crypto';
import { mkdir, rm, writeFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const app = express();
const port = Number(process.env.PREVIEW_PORT || 4175);
const projectRoot = process.cwd();
const previewRoot = path.join(projectRoot, '.studio-previews');
const workspacesRoot = path.join(previewRoot, 'workspaces');
const distRoot = path.join(previewRoot, 'dist');
const MAX_SOURCE_BYTES = 300 * 1024;

app.use(express.json({ limit: '400kb' }));

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'antd-studio-preview-builder', previewPort: port });
});

app.post('/api/build-preview', async (req, res) => {
  const source = req.body?.source;
  const incomingTheme = req.body?.theme;
  if (typeof source !== 'string' || !source.trim()) {
    return res.status(400).json({ error: '缺少待构建的 TSX 源码。' });
  }
  if (Buffer.byteLength(source, 'utf8') > MAX_SOURCE_BYTES) {
    return res.status(413).json({ error: '当前 MVP 的单页源码上限为 300KB。' });
  }
  if (!/\bexport\s+default\b/.test(source)) {
    return res.status(400).json({ error: '页面源码需要包含 export default 默认导出。' });
  }

  const themeToken = incomingTheme && typeof incomingTheme === 'object' && !Array.isArray(incomingTheme)
    ? Object.fromEntries(Object.entries(incomingTheme).filter(([key, value]) => /^[a-zA-Z][a-zA-Z0-9]*$/.test(key) && (typeof value === 'string' || typeof value === 'number')))
    : { colorPrimary: '#1677ff', borderRadius: 8 };
  const themeJson = JSON.stringify(themeToken);
  const id = randomUUID().replaceAll('-', '').slice(0, 16);
  const workspace = path.join(workspacesRoot, id);
  const output = path.join(distRoot, id);
  try {
    await mkdir(path.join(workspace, 'src'), { recursive: true });
    await mkdir(output, { recursive: true });

    await writeFile(path.join(workspace, 'index.html'), `<!doctype html>
<html lang="zh-CN"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width, initial-scale=1.0"/><title>构建预览</title></head>
<body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>`, 'utf8');

    await writeFile(path.join(workspace, 'src', 'Page.tsx'), source, 'utf8');
    await writeFile(path.join(workspace, 'src', 'main.tsx'), `import React from 'react';
import { createRoot } from 'react-dom/client';
import { ConfigProvider, App as AntApp } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import 'antd/dist/reset.css';
import Page from './Page';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ConfigProvider locale={zhCN} theme={{ token: ${themeJson} }}>
      <AntApp><div style={{ padding: 24, minHeight: '100vh', background: '#f5f7fa' }}><Page /></div></AntApp>
    </ConfigProvider>
  </React.StrictMode>,
);`, 'utf8');

    await build({
      configFile: false,
      root: workspace,
      base: `/previews/${id}/`,
      plugins: [react()],
      resolve: { dedupe: ['react', 'react-dom'] },
      build: {
        outDir: output,
        emptyOutDir: true,
        sourcemap: false,
        minify: true,
      },
      logLevel: 'error',
    });

    // Keep the local MVP from accumulating unlimited build artifacts.
    const entries = await readdir(distRoot, { withFileTypes: true });
    const dirs = await Promise.all(entries.filter((entry) => entry.isDirectory()).map(async (entry) => {
      const fullPath = path.join(distRoot, entry.name);
      return { name: entry.name, fullPath, modified: (await stat(fullPath)).mtimeMs };
    }));
    dirs.sort((a, b) => b.modified - a.modified);
    for (const old of dirs.slice(20)) {
      await rm(old.fullPath, { recursive: true, force: true });
      await rm(path.join(workspacesRoot, old.name), { recursive: true, force: true });
    }

    return res.json({ id, previewUrl: `/previews/${id}/index.html`, status: 'built' });
  } catch (error) {
    await rm(workspace, { recursive: true, force: true }).catch(() => undefined);
    await rm(output, { recursive: true, force: true }).catch(() => undefined);
    const detail = error instanceof Error ? error.message : String(error);
    return res.status(422).json({ error: `Vite 构建失败：${detail}` });
  }
});

app.use('/previews', express.static(distRoot, {
  index: 'index.html',
  setHeaders(res) {
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'none'; form-action 'none'; object-src 'none'; base-uri 'none'; frame-ancestors *");
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Referrer-Policy', 'no-referrer');
  },
}));

await mkdir(workspacesRoot, { recursive: true });
await mkdir(distRoot, { recursive: true });
app.listen(port, '127.0.0.1', () => {
  console.log(`[Ant Design Studio] Preview build service listening on http://127.0.0.1:${port}`);
});
