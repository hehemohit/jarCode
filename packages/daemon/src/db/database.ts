import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';

export interface DbEvent {
  id: string;
  session_id: string;
  seq: number;
  ts: number;
  source: string;
  type: string;
  payload: string;
}

export interface DbApproval {
  id: string;
  session_id: string;
  step_idx: number;
  tool_name: string;
  risk_tier: number;
  summary: string;
  payload: string;
  status: 'pending' | 'approved' | 'rejected' | 'timed_out';
  feedback: string | null;
  created_at: number;
  expires_at: number;
}

export class BridgeDatabase {
  private db: Database.Database;

  // Cached prepared statements
  private stmtInsertSession: Database.Statement;
  private stmtTouchSession: Database.Statement;
  private stmtInsertEvent: Database.Statement;
  private stmtGetMaxSeq: Database.Statement;
  private stmtGetEventsSince: Database.Statement;
  private stmtInsertApproval: Database.Statement;
  private stmtUpdateApprovalStatus: Database.Statement;
  private stmtGetPendingApprovals: Database.Statement;
  private stmtGetApprovalById: Database.Statement;

  constructor(dbPath?: string) {
    const finalPath = dbPath || path.resolve(process.cwd(), 'bridge-data.db');
    const dir = path.dirname(finalPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(finalPath);

    // Apply high-performance SQLite pragmas
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');
    this.db.pragma('busy_timeout = 5000');

    this.initTables();

    // Prepare statements
    this.stmtInsertSession = this.db.prepare(`
      INSERT OR IGNORE INTO sessions (id, workspace_path, status, created_at, updated_at)
      VALUES (?, ?, 'active', ?, ?)
    `);

    this.stmtTouchSession = this.db.prepare(`
      UPDATE sessions SET updated_at = ?, status = ? WHERE id = ?
    `);

    this.stmtInsertEvent = this.db.prepare(`
      INSERT INTO events (id, session_id, seq, ts, source, type, payload)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    this.stmtGetMaxSeq = this.db.prepare(`
      SELECT COALESCE(MAX(seq), 0) AS maxSeq FROM events WHERE session_id = ?
    `);

    this.stmtGetEventsSince = this.db.prepare(`
      SELECT * FROM events WHERE session_id = ? AND seq > ? ORDER BY seq ASC
    `);

    this.stmtInsertApproval = this.db.prepare(`
      INSERT INTO pending_approvals (
        id, session_id, step_idx, tool_name, risk_tier, summary, payload, status, feedback, created_at, expires_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', NULL, ?, ?)
    `);

    this.stmtUpdateApprovalStatus = this.db.prepare(`
      UPDATE pending_approvals
      SET status = ?, feedback = ?
      WHERE id = ?
    `);

    this.stmtGetPendingApprovals = this.db.prepare(`
      SELECT * FROM pending_approvals WHERE status = 'pending' ORDER BY created_at ASC
    `);

    this.stmtGetApprovalById = this.db.prepare(`
      SELECT * FROM pending_approvals WHERE id = ?
    `);

    // Periodic WAL checkpoint to prevent checkpoint starvation
    setInterval(() => {
      try {
        this.db.pragma('wal_checkpoint(PASSIVE)');
      } catch {
        // Ignored
      }
    }, 60_000).unref();
  }

  private initTables() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        workspace_path TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS events (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        seq INTEGER NOT NULL,
        ts INTEGER NOT NULL,
        source TEXT NOT NULL,
        type TEXT NOT NULL,
        payload TEXT NOT NULL,
        FOREIGN KEY (session_id) REFERENCES sessions(id)
      );

      CREATE INDEX IF NOT EXISTS idx_events_session_seq ON events (session_id, seq);

      CREATE TABLE IF NOT EXISTS pending_approvals (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        step_idx INTEGER NOT NULL,
        tool_name TEXT NOT NULL,
        risk_tier INTEGER NOT NULL,
        summary TEXT NOT NULL,
        payload TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        feedback TEXT,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_pending_status ON pending_approvals (status);
    `);
  }

  public ensureSession(sessionId: string, workspacePath = process.cwd()) {
    const now = Date.now();
    this.stmtInsertSession.run(sessionId, workspacePath, now, now);
  }

  public touchSession(sessionId: string, status: string) {
    this.stmtTouchSession.run(Date.now(), status, sessionId);
  }

  public getNextSeq(sessionId: string): number {
    const row = this.stmtGetMaxSeq.get(sessionId) as { maxSeq: number } | undefined;
    return (row?.maxSeq ?? 0) + 1;
  }

  public appendEvent(
    id: string,
    sessionId: string,
    source: string,
    type: string,
    payload: Record<string, any>
  ): { seq: number; ts: number } {
    this.ensureSession(sessionId);
    const seq = this.getNextSeq(sessionId);
    const ts = Date.now();

    this.stmtInsertEvent.run(id, sessionId, seq, ts, source, type, JSON.stringify(payload));
    return { seq, ts };
  }

  public getEventsSince(sessionId: string, lastSeq: number): DbEvent[] {
    return this.stmtGetEventsSince.all(sessionId, lastSeq) as DbEvent[];
  }

  public createApproval(approval: {
    id: string;
    sessionId: string;
    stepIdx: number;
    toolName: string;
    riskTier: number;
    summary: string;
    payload: Record<string, any>;
    expiresAt: number;
  }) {
    const now = Date.now();
    this.stmtInsertApproval.run(
      approval.id,
      approval.sessionId,
      approval.stepIdx,
      approval.toolName,
      approval.riskTier,
      approval.summary,
      JSON.stringify(approval.payload),
      now,
      approval.expiresAt
    );
  }

  public resolveApproval(id: string, status: 'approved' | 'rejected' | 'timed_out', feedback: string | null = null) {
    this.stmtUpdateApprovalStatus.run(status, feedback, id);
  }

  public getPendingApprovals(): DbApproval[] {
    return this.stmtGetPendingApprovals.all() as DbApproval[];
  }

  public getApprovalById(id: string): DbApproval | undefined {
    return this.stmtGetApprovalById.get(id) as DbApproval | undefined;
  }

  public close() {
    this.db.close();
  }
}
