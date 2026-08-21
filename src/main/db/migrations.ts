import type Database from 'better-sqlite3'
import schemaV1 from './schema.sql?raw'

/**
 * 版本化迁移：按版本号顺序执行未应用的迁移。
 * V1 = schema.sql。后续版本在此追加（只追加，不改写历史）。
 */
const MIGRATIONS: { version: number; sql: string }[] = [
  { version: 1, sql: schemaV1 },
  {
    version: 2,
    // 工作区-标签声明表；回填：现有标签默认在所有现有工作区声明（保住当前"处处可搜"行为）
    sql: `
      CREATE TABLE IF NOT EXISTS workspace_tag (
        workspace_id INTEGER NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
        tag_id       INTEGER NOT NULL REFERENCES tag(id) ON DELETE CASCADE,
        declared_at  TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (workspace_id, tag_id)
      );
      CREATE INDEX IF NOT EXISTS idx_workspace_tag_tag ON workspace_tag(tag_id, workspace_id);
      INSERT OR IGNORE INTO workspace_tag (workspace_id, tag_id)
        SELECT w.id, t.id FROM workspace w CROSS JOIN tag t;
    `
  },
  {
    version: 3,
    // 工作区封面：用户指定图片路径（null = 自动取工作区内第一张图）
    sql: `ALTER TABLE workspace ADD COLUMN cover_path TEXT;`
  }
]

export function runMigrations(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version    INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)

  const row = db.prepare('SELECT COALESCE(MAX(version), 0) AS v FROM schema_version').get() as {
    v: number
  }
  const applied = row.v

  const apply = db.transaction((m: { version: number; sql: string }) => {
    db.exec(m.sql)
    db.prepare('INSERT INTO schema_version (version) VALUES (?)').run(m.version)
  })

  for (const migration of MIGRATIONS) {
    if (migration.version > applied) {
      apply(migration)
    }
  }
}
