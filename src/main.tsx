import React from 'react';
import ReactDOM from 'react-dom/client';
import { ConfigProvider, App as AntApp } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import * as monaco from 'monaco-editor';
import { loader } from '@monaco-editor/react';
import 'antd/dist/reset.css';
import './studio.css';
import Studio from './Studio';

// Offline Monaco: bundle the npm copy instead of the default jsdelivr CDN loader.
// Without this the editor (and every code-tab test) depends on CDN reachability.
import editorWorker from 'monaco-editor/editor/editor.worker.js?worker';
import tsWorker from 'monaco-editor/language/typescript/ts.worker.js?worker';
import jsonWorker from 'monaco-editor/language/json/json.worker.js?worker';

self.MonacoEnvironment = {
  getWorker(_workerId: string, label: string) {
    if (label === 'typescript' || label === 'javascript') return new tsWorker();
    if (label === 'json') return new jsonWorker();
    return new editorWorker();
  },
};
loader.config({ monaco });
// Expose the bundled instance for tooling/tests (CDN mode used to set this).
(window as any).monaco = monaco;

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ConfigProvider
      locale={zhCN}
      theme={{
        token: {
          colorPrimary: '#1677ff',
          borderRadius: 8,
          colorBgLayout: '#f5f7fa',
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
        },
      }}
    >
      <AntApp>
        <Studio />
      </AntApp>
    </ConfigProvider>
  </React.StrictMode>,
);
