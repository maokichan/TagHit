-- TagHit 数据库 Schema — V1
-- 沿用自 Tauri 版已验证的设计：item 全局实体 + workspace_id 隔离关联；固定核心表 + EAV 长尾。

CREATE TABLE IF NOT EXISTS workspace (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    title       TEXT NOT NULL,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS workspace_path (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    workspace_id  INTEGER NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
    path          TEXT NOT NULL,
    recursive     INTEGER NOT NULL DEFAULT 1,
    UNIQUE(workspace_id, path)
);

CREATE TABLE IF NOT EXISTS item (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    title             TEXT NOT NULL,
    extension         TEXT,
    item_type         TEXT NOT NULL,
    source_uri        TEXT,
    preview_uri       TEXT,
    content_hash      TEXT,
    size              INTEGER,
    captured_at       TEXT,
    file_modified_at  TEXT,
    status            TEXT NOT NULL DEFAULT 'active',
    created_at        TEXT NOT NULL,
    updated_at        TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_item_hash ON item(content_hash);
CREATE INDEX IF NOT EXISTS idx_item_type ON item(item_type, status);

CREATE TABLE IF NOT EXISTS tag (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL UNIQUE,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tag_hierarchy (
    parent_tag_id INTEGER NOT NULL REFERENCES tag(id) ON DELETE CASCADE,
    child_tag_id  INTEGER NOT NULL REFERENCES tag(id) ON DELETE CASCADE,
    PRIMARY KEY (parent_tag_id, child_tag_id)
);

CREATE TABLE IF NOT EXISTS workspace_item (
    workspace_id INTEGER NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
    item_id      INTEGER NOT NULL REFERENCES item(id) ON DELETE CASCADE,
    added_at     TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (workspace_id, item_id)
);

-- 条目-标签关联表：正排索引由主键 (workspace_id, item_id, tag_id) 提供，倒排由独立索引提供。
CREATE TABLE IF NOT EXISTS item_tag (
    workspace_id INTEGER NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
    item_id      INTEGER NOT NULL REFERENCES item(id) ON DELETE CASCADE,
    tag_id       INTEGER NOT NULL REFERENCES tag(id) ON DELETE CASCADE,
    attached_at  TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (workspace_id, item_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_item_tag_tag
    ON item_tag(workspace_id, tag_id, item_id);

CREATE TABLE IF NOT EXISTS saved_search (
    id            TEXT PRIMARY KEY,
    name          TEXT NOT NULL,
    criteria_json TEXT NOT NULL,
    created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS scan_history (
    id                 TEXT PRIMARY KEY,
    workspace_id       INTEGER NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
    scan_type          TEXT NOT NULL,
    files_added        INTEGER NOT NULL DEFAULT 0,
    files_updated      INTEGER NOT NULL DEFAULT 0,
    files_marked_missing INTEGER NOT NULL DEFAULT 0,
    errors             INTEGER NOT NULL DEFAULT 0,
    started_at         TEXT NOT NULL,
    completed_at       TEXT NOT NULL
);

-- 元数据通用 KV 表（值统一为 String），由 metadata-schema.json 驱动字段结构。
CREATE TABLE IF NOT EXISTS item_metadata (
    item_id  INTEGER NOT NULL REFERENCES item(id) ON DELETE CASCADE,
    key      TEXT NOT NULL,
    value    TEXT NOT NULL,
    PRIMARY KEY (item_id, key)
);

CREATE INDEX IF NOT EXISTS idx_item_metadata_key ON item_metadata(key);

-- 工作区-标签声明：某工作区"声明"某全局标签后，该标签才在此工作区可见/可搜索/可挂载。
-- 声明只改变可见性，不创建新标签（标签定义始终是全局的）。
CREATE TABLE IF NOT EXISTS workspace_tag (
    workspace_id INTEGER NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
    tag_id       INTEGER NOT NULL REFERENCES tag(id) ON DELETE CASCADE,
    declared_at  TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (workspace_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_workspace_tag_tag ON workspace_tag(tag_id, workspace_id);
