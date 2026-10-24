import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'node:http';
import { BridgeEvent } from '@antigravity-bridge/shared';
import { BridgeDatabase } from '../db/database.js';
import { PolicyEngine } from '../gate/policy-engine.js';
import { ProcessManager } from '../pty/process-manager.js';

export class BridgeWebSocketServer {
  private wss: WebSocketServer;
  private db: BridgeDatabase;
  private policyEngine: PolicyEngine;
  private processManager: ProcessManager;
  private clients = new Set<WebSocket>();

  constructor(
    server: Server,
    db: BridgeDatabase,
    policyEngine: PolicyEngine,
    processManager: ProcessManager
  ) {
    this.db = db;
    this.policyEngine = policyEngine;
    this.processManager = processManager;

    this.wss = new WebSocketServer({ server, path: '/ws' });

    this.wss.on('connection', (ws: WebSocket, req) => {
      this.clients.add(ws);

      ws.on('message', (message: string) => {
        try {
          const parsed = JSON.parse(message.toString());
          this.handleClientMessage(ws, parsed);
        } catch {
          // Ignore invalid messages
        }
      });

      ws.on('close', () => {
        this.clients.delete(ws);
      });

      // Send initial pending approvals
      const pending = this.policyEngine.getPendingList();
      ws.send(JSON.stringify({ type: 'init.pending_approvals', payload: pending }));
    });
  }

  public broadcast(event: BridgeEvent) {
    const raw = JSON.stringify(event);
    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(raw);
      }
    }
  }

  private handleClientMessage(ws: WebSocket, msg: any) {
    const { type, payload } = msg;

    // 1. Sync / Reconnect replay
    if (type === 'client.sync_requested') {
      const { sessionId, lastSeq } = payload || {};
      if (sessionId && typeof lastSeq === 'number') {
        const events = this.db.getEventsSince(sessionId, lastSeq);
        for (const ev of events) {
          ws.send(
            JSON.stringify({
              id: ev.id,
              sessionId: ev.session_id,
              seq: ev.seq,
              ts: ev.ts,
              source: ev.source,
              type: ev.type,
              payload: JSON.parse(ev.payload),
            })
          );
        }
      }
    }

    // 2. Approve gate item
    else if (type === 'gate.approve') {
      const { approvalId } = payload || {};
      if (approvalId) {
        this.policyEngine.approve(approvalId);
      }
    }

    // 3. Reject gate item
    else if (type === 'gate.reject') {
      const { approvalId, reason } = payload || {};
      if (approvalId) {
        this.policyEngine.reject(approvalId, reason || 'Rejected by user.');
      }
    }

    // 4. Kill process
    else if (type === 'process.kill_requested') {
      const { processId } = payload || {};
      if (processId) {
        this.processManager.kill(processId);
      }
    }

    // 5. PTY resize
    else if (type === 'pty.resize') {
      const { processId, cols, rows } = payload || {};
      if (processId && cols && rows) {
        this.processManager.resize(processId, cols, rows);
      }
    }
  }

  public close() {
    this.wss.close();
  }
}
