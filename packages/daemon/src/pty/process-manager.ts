import pty from 'node-pty';
import treeKill from 'tree-kill';
import { randomUUID } from 'node:crypto';
import { BridgeEvent } from '@antigravity-bridge/shared';
import { BridgeDatabase } from '../db/database.js';

export interface ActiveProcess {
  processId: string;
  sessionId: string;
  command: string;
  ptyProcess: pty.IPty;
  startTime: number;
}

export class ProcessManager {
  private db: BridgeDatabase;
  private processes = new Map<string, ActiveProcess>();
  private onBroadcast?: (event: BridgeEvent) => void;

  constructor(db: BridgeDatabase) {
    this.db = db;
  }

  public setBroadcastHandler(handler: (event: BridgeEvent) => void) {
    this.onBroadcast = handler;
  }

  public spawn(sessionId: string, command: string, cwd = process.cwd(), cols = 80, rows = 24): string {
    const processId = randomUUID();
    const isWindows = process.platform === 'win32';
    const shell = isWindows ? 'powershell.exe' : 'bash';

    const ptyProcess = pty.spawn(shell, isWindows ? ['-NoLogo', '-Command', command] : ['-c', command], {
      name: 'xterm-256color',
      cols,
      rows,
      cwd,
      env: process.env as Record<string, string>,
    });

    const activeProc: ActiveProcess = {
      processId,
      sessionId,
      command,
      ptyProcess,
      startTime: Date.now(),
    };

    this.processes.set(processId, activeProc);

    ptyProcess.onData((data: string) => {
      // 1. Emit raw terminal stream chunk
      const eventPayload = { processId, data };
      const { seq, ts } = this.db.appendEvent(randomUUID(), sessionId, 'daemon', 'terminal.stream', eventPayload);

      if (this.onBroadcast) {
        this.onBroadcast({
          id: randomUUID(),
          sessionId,
          seq,
          ts,
          source: 'daemon',
          type: 'terminal.stream',
          payload: eventPayload,
        });
      }

      // 2. Parse lightweight milestones (build/test/install progress)
      this.detectMilestone(sessionId, processId, data);
    });

    ptyProcess.onExit(({ exitCode }) => {
      this.processes.delete(processId);
      const exitPayload = { processId, exitCode };
      const { seq, ts } = this.db.appendEvent(randomUUID(), sessionId, 'daemon', 'terminal.exit', exitPayload);

      if (this.onBroadcast) {
        this.onBroadcast({
          id: randomUUID(),
          sessionId,
          seq,
          ts,
          source: 'daemon',
          type: 'terminal.exit',
          payload: exitPayload,
        });
      }
    });

    return processId;
  }

  public resize(processId: string, cols: number, rows: number) {
    const proc = this.processes.get(processId);
    if (proc) {
      proc.ptyProcess.resize(cols, rows);
    }
  }

  public kill(processId: string): Promise<boolean> {
    const proc = this.processes.get(processId);
    if (!proc) return Promise.resolve(false);

    return new Promise((resolve) => {
      treeKill(proc.ptyProcess.pid, 'SIGKILL', (err) => {
        this.processes.delete(processId);
        resolve(!err);
      });
    });
  }

  private detectMilestone(sessionId: string, processId: string, data: string) {
    let category: 'build' | 'test' | 'install' | 'error' | 'success' | null = null;
    let message = '';

    if (/compiled in \d+|built in \d+|ready in \d+/i.test(data)) {
      category = 'build';
      message = data.trim();
    } else if (/(\d+) passed|(\d+) failed/i.test(data)) {
      category = 'test';
      message = data.trim();
    } else if (/added \d+ packages/i.test(data)) {
      category = 'install';
      message = data.trim();
    } else if (/error:|fatal:/i.test(data)) {
      category = 'error';
      message = data.trim();
    }

    if (category) {
      const milestonePayload = { processId, category, message };
      const { seq, ts } = this.db.appendEvent(randomUUID(), sessionId, 'daemon', 'terminal.milestone', milestonePayload);
      if (this.onBroadcast) {
        this.onBroadcast({
          id: randomUUID(),
          sessionId,
          seq,
          ts,
          source: 'daemon',
          type: 'terminal.milestone',
          payload: milestonePayload,
        });
      }
    }
  }
}
