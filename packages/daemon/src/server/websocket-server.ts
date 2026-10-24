import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'node:http';
import { randomUUID } from 'node:crypto';
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
          const raw = message.toString();
          console.log(`[Bridge Daemon] Incoming WS message (len: ${raw.length}):`, raw.length > 200 ? raw.slice(0, 200) + '...' : raw);
          const parsed = JSON.parse(raw);
          this.handleClientMessage(ws, parsed);
        } catch (err: any) {
          console.error('[Bridge Daemon ERROR] Failed to parse client message:', err?.message || err);
        }
      });

      ws.on('error', (err: any) => {
        console.error('[Bridge Daemon ERROR] WebSocket client error:', err?.message || err);
      });

      ws.on('close', (code, reason) => {
        this.clients.delete(ws);
        console.log(`[Bridge Daemon] Client disconnected (code: ${code}, reason: ${reason?.toString() || 'none'}). Total active clients: ${this.clients.size}`);
      });

      // Send initial pending approvals
      const pending = this.policyEngine.getPendingList();
      console.log(`[Bridge Daemon] Sending initial pending approvals (${pending.length}) to new client.`);
      ws.send(JSON.stringify({ type: 'init.pending_approvals', payload: pending }));

      // Send initial chat messages, thoughts, tool calls, and execution status
      const history = this.db.getRecentChatHistory(300);
      const messages: any[] = [];
      const thoughts: any[] = [];
      const toolCalls: any[] = [];
      let isExecuting = false;

      for (const ev of history) {
        try {
          const parsed = JSON.parse(ev.payload);
          if (ev.type === 'agent.message') {
            messages.push({
              id: ev.id,
              role: parsed.role,
              content: parsed.content,
              stepIdx: parsed.stepIdx,
              ts: ev.ts,
            });
          } else if (ev.type === 'agent.thought') {
            thoughts.push({
              id: ev.id,
              text: parsed.text,
              stepIdx: parsed.stepIdx,
              ts: ev.ts,
            });
          } else if (ev.type === 'agent.tool_call') {
            toolCalls.push({
              id: ev.id,
              name: parsed.name,
              args: parsed.args,
              stepIdx: parsed.stepIdx,
              ts: ev.ts,
            });
          } else if (ev.type === 'session.status_changed') {
            isExecuting = parsed.status === 'executing';
          }
        } catch (err: any) {
          console.error('[Bridge Daemon ERROR] Failed to parse history payload:', err?.message);
        }
      }

      console.log(`[Bridge Daemon] Sending initial chat history (${messages.length} messages, ${thoughts.length} thoughts, ${toolCalls.length} tool calls, isExecuting: ${isExecuting}) to new client.`);
      ws.send(JSON.stringify({ type: 'init.chat_history', payload: { messages, thoughts, toolCalls, isExecuting } }));
    });
  }

  public broadcast(event: BridgeEvent) {
    const raw = JSON.stringify(event);
    let sentCount = 0;
    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(raw);
        sentCount++;
      }
    }
    console.log(`[Bridge Daemon] Broadcasted event '${event.type}' to ${sentCount}/${this.clients.size} clients.`);
  }

  private handleClientMessage(ws: WebSocket, msg: any) {
    const { type, payload } = msg;
    console.log(`[Bridge Daemon] Handling client message type: '${type}'`);

    // 1. Sync / Reconnect replay
    if (type === 'client.sync_requested') {
      const { sessionId, lastSeq } = payload || {};
      if (sessionId && typeof lastSeq === 'number') {
        const events = this.db.getEventsSince(sessionId, lastSeq);
        console.log(`[Bridge Daemon] Sync requested for session ${sessionId} since seq ${lastSeq}. Found ${events.length} events.`);
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
      } else {
        console.error('[Bridge Daemon ERROR] Invalid client.sync_requested payload:', payload);
      }
    }

    // 2. Approve gate item
    else if (type === 'gate.approve') {
      const { approvalId } = payload || {};
      console.log(`[Bridge Daemon] gate.approve received for approvalId: ${approvalId}`);
      if (approvalId) {
        this.policyEngine.approve(approvalId);
      } else {
        console.error('[Bridge Daemon ERROR] gate.approve missing approvalId:', payload);
      }
    }

    // 3. Reject gate item
    else if (type === 'gate.reject') {
      const { approvalId, reason } = payload || {};
      console.log(`[Bridge Daemon] gate.reject received for approvalId: ${approvalId}, reason: ${reason}`);
      if (approvalId) {
        this.policyEngine.reject(approvalId, reason || 'Rejected by user.');
      } else {
        console.error('[Bridge Daemon ERROR] gate.reject missing approvalId:', payload);
      }
    }

    // 4. Kill process
    else if (type === 'process.kill_requested') {
      const { processId } = payload || {};
      console.log(`[Bridge Daemon] process.kill_requested for processId: ${processId}`);
      if (processId) {
        this.processManager.kill(processId);
      } else {
        console.error('[Bridge Daemon ERROR] process.kill_requested missing processId:', payload);
      }
    }

    // 5. PTY resize
    else if (type === 'pty.resize') {
      const { processId, cols, rows } = payload || {};
      if (processId && cols && rows) {
        this.processManager.resize(processId, cols, rows);
      } else {
        console.error('[Bridge Daemon ERROR] pty.resize missing parameters:', payload);
      }
    }

    // 6. User Prompt from Web/Mobile
    else if (type === 'client.prompt_submitted') {
      const { content, sessionId } = payload || {};
      console.log(`[Bridge Daemon] >>> Processing client.prompt_submitted: "${content}" (sessionId: ${sessionId})`);
      if (content && content.trim()) {
        const sid = sessionId || '8d6b177b-9da6-415d-a5a5-cd16fc0daf85';
        const trimmed = content.trim();
        const msgPayload = { role: 'user', content: trimmed };
        const { seq, ts } = this.db.appendEvent(randomUUID(), sid, 'client', 'agent.message', msgPayload);

        // Broadcast agent.message (for Web/Mobile chat log UI)
        this.broadcast({
          id: randomUUID(),
          sessionId: sid,
          seq,
          ts,
          source: 'client',
          type: 'agent.message',
          payload: msgPayload,
        });

        // Broadcast client.prompt_submitted directly to other clients (like VS Code / Antigravity IDE Companion Extension)
        this.broadcast({
          id: randomUUID(),
          sessionId: sid,
          seq: seq + 1,
          ts,
          source: 'client',
          type: 'client.prompt_submitted',
          payload: { content: trimmed, sessionId: sid },
        });

        console.log(`[Bridge Daemon SUCCESS] Dispatched prompt event for session ${sid} (seq: ${seq}) to all connected clients.`);
      } else {
        console.error('[Bridge Daemon ERROR] client.prompt_submitted received empty or invalid content:', payload);
      }
    } else {
      console.warn(`[Bridge Daemon WARN] Unrecognized client message type: '${type}'`, payload);
    }
  }

  public close() {
    this.wss.close();
  }
}
