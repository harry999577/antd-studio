import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  Alert, App, Button, Card, ConfigProvider, Divider, Drawer, Empty, Flex, Input, InputNumber, Select,
  Space, Switch, Tabs, Tag, Tooltip, Typography,
} from 'antd';
import {
  CodeOutlined, EyeOutlined, FileAddOutlined, FileTextOutlined, PlayCircleOutlined,
  PlusOutlined, RedoOutlined, UndoOutlined, DownloadOutlined, CheckCircleOutlined,
  BugOutlined, AppstoreOutlined,
} from '@ant-design/icons';
import Editor from '@monaco-editor/react';
import { DndContext, useDroppable } from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import PaletteItem from './components/PaletteItem';
import CanvasNode from './components/CanvasNode';
import ComponentTree from './components/ComponentTree';
import { componentGroups, componentRegistry, createNode } from './engine/registry';
import { generateTsx } from './engine/codegen';
import { parseTsxToDocument } from './engine/tsx-parser';
import { initialDocument } from './engine/sample-document';
import { findNode, findParent, patchNode, removeNode, appendChild, moveNode, moveSibling, nodeText, setNodeText, getNodePath } from './engine/tree-ops';
import { patchByPath, insertInto, removeFrom, patchTheme, moveInSource, type InsertableNode } from './engine/source-patch';
import type { ComponentType, DesignDocument, DesignNode } from './engine/types';

const { Text } = Typography;

function CanvasDropzone({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: 'canvas-dropzone' });
  return (
    <div ref={setNodeRef} className={`canvas-dropzone ${isOver ? 'canvas-dropzone--over' : ''}`} onClick={onClick}>
      {children}
    </div>
  );
}

export default function Studio() {
  const { message, modal } = App.useApp();
  const [document, setDocument] = useState<DesignDocument>(initialDocument);
  const [selectedId, setSelectedId] = useState<string | null>('search-submit');
  const [activeTab, setActiveTab] = useState<'design' | 'code'>('design');
  const [code, setCode] = useState(() => generateTsx(initialDocument));
  const [codeError, setCodeError] = useState<string | null>(null);
  const [codeDirty, setCodeDirty] = useState(false);
  const [building, setBuilding] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [buildLog, setBuildLog] = useState<string>('等待构建');
  const [componentQuery, setComponentQuery] = useState('');
  const [jsonDrafts, setJsonDrafts] = useState<Record<string, string>>({});
  const [history, setHistory] = useState<{ document: DesignDocument; code: string }[]>([]);
  const [future, setFuture] = useState<{ document: DesignDocument; code: string }[]>([]);

  const selectedNode = useMemo(
    () => selectedId ? findNode(document.root, selectedId) ?? null : null,
    [document, selectedId],
  );
  const generatedCode = useMemo(() => generateTsx(document), [document]);

  const ensureDesignEditable = () => {
    if (!codeDirty) return true;
    message.warning('代码存在未同步修改。请先解析并同步画布，或重置为设计器代码，再进行可视化编辑。');
    return false;
  };

  /**
   * Commit an IR change. When the editor has no unsynced user code we update the
   * TSX incrementally through the Recast source-patch engine, so only the
   * affected lines change and comments / formatting / non-visual code survive.
   * Refusals (dynamic node, unlocatable) fall back to full regeneration with an
   * info toast — nothing is silently dropped.
   */
  type CodePatch =
    | { kind: 'prop'; path: number[]; attrs?: Record<string, unknown | undefined>; text?: string | null }
    | { kind: 'insert'; parentPath: number[]; node: InsertableNode }
    | { kind: 'remove'; path: number[] }
    | { kind: 'theme'; token: Record<string, string | number> }
    | { kind: 'move'; from: number[]; to: number[] };

  const commitDocument = (next: DesignDocument, patch?: CodePatch) => {
    setHistory((items) => [...items.slice(-39), { document, code }]);
    setFuture([]);
    setDocument(next);
    let nextCode = generateTsx(next);
    if (!codeDirty) {
      let res: { code: string; refused?: string; changed?: boolean } | null = null;
      if (patch?.kind === 'prop') res = patchByPath(code, patch.path, { attrs: patch.attrs, text: patch.text });
      else if (patch?.kind === 'insert') res = insertInto(code, patch.parentPath, patch.node);
      else if (patch?.kind === 'remove') res = removeFrom(code, patch.path);
      else if (patch?.kind === 'theme') res = patchTheme(code, patch.token);
      else if (patch?.kind === 'move') res = moveInSource(code, patch.from, patch.to);
      if (res) {
        if (res.refused) {
          if (res.refused === 'dynamic-node') message.info('该节点含动态代码（如事件函数），源码已原样保留，本次仅更新画布。');
          else message.info('源码增量更新不可用，已回退为全量重新生成。');
        } else {
          nextCode = res.code;
        }
      }
    }
    setCode(nextCode);
    setCodeDirty(false);
    setCodeError(null);
  };

  const updateProp = (name: string, value: unknown) => {
    if (!ensureDesignEditable() || !selectedId) return;
    const path = getNodePath(document.root, selectedId);
    const next = {
      ...document,
      root: patchNode(document.root, selectedId, (node) => ({ ...node, props: { ...node.props, [name]: value } })),
    };
    commitDocument(next, path ? { kind: 'prop', path, attrs: { [name]: value === undefined || value === '' ? undefined : value } } : undefined);
  };

  const addComponent = (type: ComponentType, targetId?: string) => {
    if (!ensureDesignEditable()) return;
    const node = createNode(type);
    const root = targetId
      ? appendChild(document.root, targetId, node)
      : { ...document.root, children: [...document.root.children, node] };
    const parentPath = targetId ? getNodePath(document.root, targetId) : [];
    commitDocument(
      { ...document, root },
      parentPath !== null && parentPath !== undefined
        ? { kind: 'insert', parentPath: parentPath ?? [], node: { type: node.type, props: node.props, children: node.children } }
        : undefined,
    );
    setSelectedId(node.id);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    if (!ensureDesignEditable()) return;
    const draggedNodeId = event.active.data.current?.nodeId as string | undefined;
    const type = event.active.data.current?.componentType as ComponentType | undefined;
    if (!event.over) return;
    const targetId = event.over.data.current?.targetNodeId as string | undefined;

    if (draggedNodeId && targetId) {
      const target = findNode(document.root, targetId);
      if (!target) return;
      const canReceive = componentRegistry[target.type].canHaveChildren;
      const root = moveNode(document.root, draggedNodeId, targetId, {
        position: canReceive ? 'inside' : 'before',
        canReceive: (t) => componentRegistry[t].canHaveChildren,
      });
      if (!root) { message.warning('不能把容器移动到它自己的子节点内部。'); return; }
      // Sibling reorder keeps source formatting via a swap patch; cross-container
      // moves fall back to regeneration (still lossless, just re-prints the tree).
      const fromPath = getNodePath(document.root, draggedNodeId);
      const toPath = findNode(root, draggedNodeId) ? getNodePath(root, draggedNodeId!) : null;
      const isSiblingSwap = fromPath && toPath
        && fromPath.length === toPath.length
        && fromPath.slice(0, -1).join(',') === toPath.slice(0, -1).join(',')
        && Math.abs(fromPath[fromPath.length - 1] - toPath[toPath.length - 1]) === 1;
      if (isSiblingSwap) commitDocument({ ...document, root }, { kind: 'move', from: fromPath!, to: toPath! });
      else commitDocument({ ...document, root });
      return;
    }
    if (!type) return;
    if (targetId) addComponent(type, targetId);
    else if (event.over.id === 'canvas-dropzone') addComponent(type);
  };

  const applyCode = () => {
    try {
      const next = parseTsxToDocument(code, document);
      setHistory((items) => [...items.slice(-39), { document, code }]);
      setFuture([]);
      setDocument(next);
      // The parsed source stays authoritative: keep the user's own formatting,
      // comments and non-visual code instead of regenerating over it.
      setCodeDirty(false);
      setCodeError(null);
      setSelectedId(next.root.id);
      message.success('TSX 已解析并同步到设计画布');
    } catch (error) {
      const detail = error instanceof Error ? error.message : '未知解析错误';
      setCodeError(detail);
      message.error('代码暂未同步：' + detail);
    }
  };

  const buildPreview = async () => {
    setBuilding(true);
    setBuildLog('正在生成 TSX 并执行独立构建…');
    setPreviewUrl(null);
    try {
      const response = await fetch('/api/build-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: code, theme: document.theme.token }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || '构建失败');
      const previewOrigin = import.meta.env.VITE_PREVIEW_ORIGIN
        || `${window.location.protocol}//${window.location.hostname}:4175`;
      setPreviewUrl(new URL(result.previewUrl, previewOrigin).toString());
      setBuildLog(`构建成功 · ${result.id}`);
      setPreviewOpen(true);
      message.success('独立构建完成');
    } catch (error) {
      const detail = error instanceof Error ? error.message : '构建服务暂不可用';
      setBuildLog(detail);
      modal.error({ title: '页面构建失败', content: detail, okText: '知道了' });
    } finally {
      setBuilding(false);
    }
  };

  const exportTsx = () => {
    const source = codeDirty ? code : generatedCode;
    const blob = new Blob([source], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = window.document.createElement('a');
    anchor.href = url;
    anchor.download = 'GeneratedPage.tsx';
    anchor.click();
    URL.revokeObjectURL(url);
    message.success('TSX 文件已导出');
  };

  const undo = () => {
    if (!history.length) return;
    const previous = history[history.length - 1];
    setHistory((items) => items.slice(0, -1));
    setFuture((items) => [{ document, code }, ...items]);
    setDocument(previous.document);
    setCode(previous.code);
    setCodeDirty(false);
  };
  const redo = () => {
    if (!future.length) return;
    const next = future[0];
    setFuture((items) => items.slice(1));
    setHistory((items) => [...items, { document, code }]);
    setDocument(next.document);
    setCode(next.code);
    setCodeDirty(false);
  };

  const deleteSelected = () => {
    if (!ensureDesignEditable() || !selectedId || selectedId === document.root.id) return;
    const path = getNodePath(document.root, selectedId);
    commitDocument({ ...document, root: removeNode(document.root, selectedId) }, path ? { kind: 'remove', path } : undefined);
    setSelectedId(null);
  };

  return (
    <div className="studio-shell">
      <header className="studio-topbar">
        <div className="brand-lockup">
          <div className="brand-mark">A</div>
          <div>
            <div className="brand-title">Ant Design Studio</div>
            <div className="brand-subtitle">Visual React Builder</div>
          </div>
          <Tag color="blue">MVP 0.1</Tag>
        </div>
        <div className="topbar-center">
          <span className="project-name">用户管理页面</span>
          <span className="save-state"><CheckCircleOutlined /> 本地编辑状态 · 尚未接入持久化保存</span>
        </div>
        <Space size={8}>
          <Tooltip title="撤销"><Button icon={<UndoOutlined />} disabled={!history.length || codeDirty} onClick={undo} /></Tooltip>
          <Tooltip title="重做"><Button icon={<RedoOutlined />} disabled={!future.length || codeDirty} onClick={redo} /></Tooltip>
          <Button icon={<EyeOutlined />} onClick={() => setActiveTab('design')}>设计画布</Button>
          <Button icon={<CodeOutlined />} onClick={() => setActiveTab('code')}>代码</Button>
          <Button icon={<DownloadOutlined />} onClick={exportTsx}>导出 TSX</Button>
          <Button type="primary" icon={<PlayCircleOutlined />} loading={building} onClick={buildPreview}>构建预览</Button>
        </Space>
      </header>

      <DndContext onDragEnd={handleDragEnd}>
        <main className="studio-workbench">
          <aside className="left-panel">
            <div className="panel-heading"><AppstoreOutlined /> 组件库 <span className="panel-count">{Object.keys(componentRegistry).length}</span></div>
            <Input.Search placeholder="搜索组件" allowClear size="small" value={componentQuery} onChange={(event) => setComponentQuery(event.target.value)} />
            <div className="component-groups">
              {componentGroups.map((group) => (
                <section key={group.label} className="component-group">
                  <div className="component-group__title">{group.label}</div>
                  <div className="component-list">
                    {group.types
                      .filter((type) => componentRegistry[type].label.toLowerCase().includes(componentQuery.trim().toLowerCase()) || type.toLowerCase().includes(componentQuery.trim().toLowerCase()))
                      .map((type) => <PaletteItem key={type} type={type} onAdd={addComponent} />)}
                  </div>
                </section>
              ))}
              {componentGroups.every((group) => group.types.every((type) => !componentRegistry[type].label.toLowerCase().includes(componentQuery.trim().toLowerCase()) && !type.toLowerCase().includes(componentQuery.trim().toLowerCase()))) && (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="没有找到匹配组件" />
              )}
            </div>
            <div className="left-panel-footer">
              <Text type="secondary" style={{ fontSize: 11 }}>组件以官方包为运行基础</Text>
              <div><Tag>antd 6.7.1</Tag><Tag>Pro 3.1.15-9</Tag></div>
            </div>
          </aside>

          <aside className="tree-panel">
            <ComponentTree document={document} selectedId={selectedId} onSelect={(id) => { setSelectedId(id); setActiveTab('design'); }} />
          </aside>

          <section className="center-panel">
            <div className="canvas-toolbar">
              <Tabs
                activeKey={activeTab}
                onChange={(key) => setActiveTab(key as 'design' | 'code')}
                items={[
                  { key: 'design', label: <span><EyeOutlined /> 设计画布</span> },
                  { key: 'code', label: <span><CodeOutlined /> TSX 源码</span> },
                ]}
              />
              <Space size={8}>
                <Tag color="processing">真实组件渲染</Tag>
                <Text type="secondary" style={{ fontSize: 12 }}>画布宽度 100%</Text>
              </Space>
            </div>
            {activeTab === 'design' ? (
              <div className="canvas-viewport">
                <div className="canvas-page-header">
                  <div><Text strong>页面设计</Text><div><Text type="secondary" style={{ fontSize: 12 }}>拖拽组件到画布，选中后在右侧编辑属性</Text></div></div>
                  <Tag color="success">Live</Tag>
                </div>
                <CanvasDropzone onClick={() => setSelectedId(null)}>
                  <ConfigProvider theme={{ token: document.theme.token as never }}>
                    <div className="page-renderer" onClick={(event) => event.stopPropagation()}>
                      <CanvasNode node={document.root} selectedId={selectedId} onSelect={(node) => setSelectedId(node.id)} />
                    </div>
                  </ConfigProvider>
                  <div className="drop-hint"><PlusOutlined /> 从左侧拖入组件；可拖入 Flex、Card、ProCard 等容器进行嵌套，或双击组件名称添加</div>
                </CanvasDropzone>
              </div>
            ) : (
              <div className="code-workspace">
                <div className="code-toolbar">
                  <Space><FileTextOutlined /><Text strong>GeneratedPage.tsx</Text>{codeDirty && <Tag color="warning">未同步</Tag>}</Space>
                  <Space>
                    <Button size="small" onClick={() => { setCode(generatedCode); setCodeDirty(false); setCodeError(null); }}>重置为设计器代码</Button>
                    <Button size="small" type="primary" onClick={applyCode}>解析并同步画布</Button>
                  </Space>
                </div>
                {codeError && <Alert type="warning" showIcon title="代码未同步到画布" description={codeError} closable onClose={() => setCodeError(null)} />}
                <Editor
                  height="100%"
                  language="typescript"
                  theme="vs-dark"
                  value={code}
                  onChange={(value) => { setCode(value ?? ''); setCodeDirty(true); }}
                  options={{ minimap: { enabled: false }, fontSize: 13, scrollBeyondLastLine: false, wordWrap: 'on', automaticLayout: true, tabSize: 2 }}
                />
              </div>
            )}
            <footer className="statusbar">
              <span><span className="status-dot" /> React + TypeScript</span>
              <span>Design IR v{document.schemaVersion}</span>
              <span>{codeDirty ? '代码有未同步修改' : '设计与代码已同步'}</span>
            </footer>
          </section>

          <aside className="right-panel">
            <div className="panel-heading">属性配置 <span className="panel-count">API</span></div>
            {selectedNode ? (
              <>
                <div className="selected-component">
                  <div className="selected-component__icon">{selectedNode.type.startsWith('Pro') ? 'P' : 'A'}</div>
                  <div><div className="selected-component__name">{componentRegistry[selectedNode.type].label}</div><Text type="secondary" style={{ fontSize: 11 }}>{componentRegistry[selectedNode.type].packageName}</Text></div>
                </div>
                <Divider style={{ margin: '12px 0' }} />
                <div className="props-form">
                  {componentRegistry[selectedNode.type].props.map((prop) => {
                    const value = selectedNode.props[prop.name];
                    return (
                      <div className="prop-field" key={prop.name}>
                        <div className="prop-label"><span>{prop.label}</span><Text type="secondary" code>{prop.name}</Text></div>
                        {prop.editor === 'input' && <Input size="small" value={value as string | undefined} onChange={(event) => updateProp(prop.name, event.target.value)} />}
                        {prop.editor === 'switch' && <Switch size="small" checked={Boolean(value)} onChange={(checked) => updateProp(prop.name, checked)} />}
                        {prop.editor === 'number' && <InputNumber size="small" style={{ width: '100%' }} value={value as number | undefined} onChange={(next) => updateProp(prop.name, next)} />}
                        {prop.editor === 'select' && <Select size="small" style={{ width: '100%' }} allowClear value={value as string | number | undefined} options={prop.options} onChange={(next) => updateProp(prop.name, next)} />}
                        {prop.editor === 'json' && (() => {
                          const draftKey = `${selectedNode.id}.${prop.name}`;
                          const draftValue = jsonDrafts[draftKey] ?? JSON.stringify(value ?? null, null, 2);
                          return (
                            <Input.TextArea
                              rows={5}
                              size="small"
                              spellCheck={false}
                              value={draftValue}
                              onChange={(event) => {
                                const nextText = event.target.value;
                                setJsonDrafts((drafts) => ({ ...drafts, [draftKey]: nextText }));
                                try { updateProp(prop.name, JSON.parse(nextText)); } catch { /* Keep incomplete JSON as a local draft until it becomes valid. */ }
                              }}
                              onBlur={() => setJsonDrafts((drafts) => { const next = { ...drafts }; delete next[draftKey]; return next; })}
                            />
                          );
                        })()}
                      </div>
                    );
                  })}
                  {componentRegistry[selectedNode.type].supportsText && (
                    <div className="prop-field">
                      <div className="prop-label"><span>显示文案</span><Text type="secondary" code>children</Text></div>
                      <Input size="small" value={nodeText(selectedNode)} onChange={(event) => {
                        if (!selectedId) return;
                        const path = getNodePath(document.root, selectedId);
                        const next = { ...document, root: patchNode(document.root, selectedId, (node) => setNodeText(node, event.target.value)) };
                        commitDocument(next, path ? { kind: 'prop', path, text: event.target.value || null } : undefined);
                      }} />
                    </div>
                  )}
                  <Divider style={{ margin: '12px 0' }} />
                  {selectedId !== document.root.id && (
                    <Space.Compact block style={{ marginBottom: 8 }}>
                      <Button size="small" block onClick={() => {
                        const root = moveSibling(document.root, selectedNode.id, -1);
                        if (!root) { message.info('已经是同级第一个'); return; }
                        const from = getNodePath(document.root, selectedNode.id)!;
                        const to = [...from.slice(0, -1), from[from.length - 1] - 1];
                        commitDocument({ ...document, root }, { kind: 'move', from, to });
                      }}>上移</Button>
                      <Button size="small" block onClick={() => {
                        const root = moveSibling(document.root, selectedNode.id, 1);
                        if (!root) { message.info('已经是同级最后一个'); return; }
                        const from = getNodePath(document.root, selectedNode.id)!;
                        const to = [...from.slice(0, -1), from[from.length - 1] + 1];
                        commitDocument({ ...document, root }, { kind: 'move', from, to });
                      }}>下移</Button>
                    </Space.Compact>
                  )}
                  <div className="node-meta"><Text type="secondary">节点 ID</Text><Text code copyable>{selectedNode.id}</Text></div>
                  <div className="node-meta"><Text type="secondary">父节点</Text><Text code>{findParent(document.root, selectedNode.id)?.id ?? '（根）'}</Text></div>
                  <Button danger block size="small" onClick={deleteSelected}>删除组件</Button>
                </div>
              </>
            ) : (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="选择画布中的组件以编辑属性" />
            )}
            <Divider style={{ margin: '8px 0' }} />
            <div className="theme-editor">
              <div className="panel-heading">页面主题 <span className="panel-count">Token</span></div>
              <div className="prop-field">
                <div className="prop-label"><span>品牌主色</span><Text type="secondary" code>colorPrimary</Text></div>
                <Input
                  type="color"
                  size="small"
                  value={String(document.theme.token.colorPrimary ?? '#1677ff')}
                  onChange={(event) => {
                    if (!ensureDesignEditable()) return;
                    const token = { ...document.theme.token, colorPrimary: event.target.value };
                    commitDocument({ ...document, theme: { token } }, { kind: 'theme', token });
                  }}
                />
              </div>
              <div className="prop-field">
                <div className="prop-label"><span>基础圆角</span><Text type="secondary" code>borderRadius</Text></div>
                <InputNumber
                  size="small"
                  min={0}
                  max={32}
                  style={{ width: '100%' }}
                  value={Number(document.theme.token.borderRadius ?? 8)}
                  onChange={(value) => {
                    if (!ensureDesignEditable() || value === null) return;
                    const token = { ...document.theme.token, borderRadius: value };
                    commitDocument({ ...document, theme: { token } }, { kind: 'theme', token });
                  }}
                />
              </div>
            </div>
            <div className="inspector-note">
              <BugOutlined />
              <span>此版本展示的是已接入的 API 子集。后续将从官方类型声明和文档自动生成完整属性元数据。</span>
            </div>
          </aside>
        </main>
      </DndContext>

      <Drawer
        title={<Space><PlayCircleOutlined /> 独立构建预览 <Tag color="success">Build</Tag></Space>}
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        size="min(1120px, 92vw)"
        destroyOnHidden
        extra={<Button icon={<DownloadOutlined />} onClick={exportTsx}>导出当前 TSX</Button>}
      >
        <div className="preview-toolbar">
          <Space><CheckCircleOutlined style={{ color: '#389e0d' }} /><Text>{buildLog}</Text></Space>
          <Button size="small" onClick={buildPreview} loading={building}>重新构建</Button>
        </div>
        {previewUrl ? (
          <iframe className="built-preview-frame" title="构建预览页面" src={previewUrl} sandbox="allow-scripts allow-forms allow-popups allow-same-origin" />
        ) : <Empty description="尚无构建产物" />}
        <Alert type="info" showIcon title="独立构建产物" description="此预览由真实 Vite 构建生成，与设计器画布分离。当前本地 MVP 禁止预览页面直接访问外部网络；生产部署必须使用独立 Worker / 容器隔离不可信构建任务。" style={{ marginTop: 12 }} />
      </Drawer>
    </div>
  );
}
