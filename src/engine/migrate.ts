import type { ChildNode, DesignDocument, DesignNode } from './types';

/**
 * IR version migration. schemaVersion is the single compatibility gate:
 * anything older than CURRENT is run through the chained migrations below.
 *
 * v1 -> v2: remove the duplicated `props.children` text channel. v1 stored
 * leaf text either as `props.children` or as a string entry of `children`;
 * v2 keeps ONLY string entries in `children`, so the IR has one text model.
 */

const CURRENT = 2;

type Migration = (doc: unknown) => DesignDocument;

function migrateV1ToV2(raw: any): DesignDocument {
  const walk = (node: any): DesignNode => {
    const props: Record<string, unknown> = { ...(node.props ?? {}) };
    const children: ChildNode[] = (node.children ?? []).map((child: any) =>
      typeof child === 'string' ? child : walk(child),
    );
    if (Object.prototype.hasOwnProperty.call(props, 'children')) {
      const text = props.children;
      delete props.children;
      if (typeof text === 'string' && text.length > 0 && children.length === 0) {
        children.push(text);
      }
    }
    return { id: node.id, type: node.type, props, children, ...(node.meta ? { meta: node.meta } : {}) };
  };
  return {
    schemaVersion: 2,
    framework: raw.framework,
    theme: raw.theme,
    root: walk(raw.root),
  };
}

const migrations: Record<number, Migration> = {
  1: migrateV1ToV2 as Migration,
};

export function migrateDocument(input: unknown): DesignDocument {
  const raw = input as { schemaVersion?: number };
  if (!raw || typeof raw !== 'object' || typeof raw.schemaVersion !== 'number') {
    throw new Error('Design IR 文档缺少 schemaVersion，无法载入。');
  }
  let doc = input as DesignDocument;
  let version = raw.schemaVersion;
  while (version < CURRENT) {
    const migrate = migrations[version];
    if (!migrate) throw new Error(`没有从 IR v${version} 升级到 v${CURRENT} 的迁移器。`);
    doc = migrate(doc);
    version = doc.schemaVersion;
  }
  if (version > CURRENT) {
    throw new Error(`文档 IR 版本 v${version} 高于当前设计器支持的 v${CURRENT}，请升级设计器。`);
  }
  return doc;
}

export const IR_SCHEMA_VERSION = CURRENT;

/** Serialize / deserialize with version gate (accepts v1 documents via migration). */
export function serializeDocument(doc: DesignDocument): string {
  return JSON.stringify(doc, null, 2);
}

export function deserializeDocument(json: string): DesignDocument {
  return migrateDocument(JSON.parse(json));
}
