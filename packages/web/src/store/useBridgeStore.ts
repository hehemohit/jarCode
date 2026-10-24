import { create } from 'zustand';

export interface PendingApproval {
  id: string;
  sessionId: string;
  stepIdx: number;
  toolName: string;
  riskTier: number;
  summary: string;
  diff?: string;
  command?: string;
  toolArgs: Record<string, any>;
  expiresAt: number;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  stepIdx?: number;
  ts: number;
}

export interface ThoughtEntry {
  id: string;
  text: string;
  stepIdx?: number;
  ts: number;
}

interface BridgeState {
  connected: boolean;
  sessionId: string | null;
  lastSeq: number;
  pendingApprovals: PendingApproval[];
  messages: ChatMessage[];
  thoughts: ThoughtEntry[];
  terminalData: string;
  activeProcessId: string | null;

  // Actions
  connect: () => void;
  approve: (id: string) => Promise<void>;
  reject: (id: string, reason: string) => Promise<void>;
  killProcess: (id: string) => void;
  sendMessage: (content: string) => void;
}

let socket: WebSocket | null = null;

export const useBridgeStore = create<BridgeState>((set, get) => ({
  connected: false,
  sessionId: null,
  lastSeq: 0,
  pendingApprovals: [],
  messages: [],
  thoughts: [],
  terminalData: '',
  activeProcessId: null,

  connect: () => {
    if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
      return;
    }

    // Determine WebSocket host based on current browser location (works over Tailscale or localhost)
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    // If running in Vite dev (port 5173), connect to daemon on port 3188; else connect to same port
    const port = window.location.port === '5173' ? '3188' : window.location.port;
    const wsUrl = `${protocol}//${window.location.hostname}:${port}/ws`;

    socket = new WebSocket(wsUrl);

    socket.onopen = () => {
      set({ connected: true });
      const currentSessionId = get().sessionId;
      const lastSeq = get().lastSeq;
      if (currentSessionId && lastSeq > 0) {
        socket?.send(
          JSON.stringify({
            type: 'client.sync_requested',
            payload: { sessionId: currentSessionId, lastSeq },
          })
        );
      }
    };

    socket.onclose = () => {
      set({ connected: false });
      // Auto-reconnect after 2 seconds
      setTimeout(() => get().connect(), 2000);
    };

    socket.onerror = () => {
      socket?.close();
    };

    socket.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        const { type, payload, seq, sessionId, id, ts } = msg;

        if (seq && seq > get().lastSeq) {
          set({ lastSeq: seq });
        }
        if (sessionId && !get().sessionId) {
          set({ sessionId });
        }

        // Initial pending approvals on connect
        if (type === 'init.pending_approvals') {
          set({ pendingApprovals: payload || [] });
          return;
        }

        // Initial chat history on connect
        if (type === 'init.chat_history') {
          const { messages, thoughts } = payload || {};
          set({
            messages: messages || [],
            thoughts: thoughts || [],
          });
          return;
        }

        // Approval requested
        if (type === 'gate.approval_requested') {
          const newApproval: PendingApproval = {
            id: payload.approvalId,
            sessionId: sessionId || get().sessionId || 'active',
            stepIdx: payload.stepIdx,
            toolName: payload.toolName,
            riskTier: payload.riskTier,
            summary: payload.summary,
            diff: payload.diff,
            command: payload.command,
            toolArgs: payload.toolArgs,
            expiresAt: payload.expiresAt,
          };
          set((s) => ({
            pendingApprovals: [
              ...s.pendingApprovals.filter((p) => p.id !== newApproval.id),
              newApproval,
            ],
          }));
        }

        // Approval approved or rejected -> remove from pending list
        if (type === 'gate.approved' || type === 'gate.rejected' || type === 'gate.timed_out') {
          set((s) => ({
            pendingApprovals: s.pendingApprovals.filter((p) => p.id !== payload.approvalId),
          }));
        }

        // Chat message
        if (type === 'agent.message') {
          const messageId = id || (payload.content + '_' + (payload.stepIdx || ts || Date.now()));
          set((s) => {
            if (s.messages.some((m) => m.id === messageId)) {
              return s;
            }
            return {
              messages: [
                ...s.messages,
                {
                  id: messageId,
                  role: payload.role,
                  content: payload.content,
                  stepIdx: payload.stepIdx,
                  ts: ts || Date.now(),
                },
              ],
            };
          });
        }

        // Agent thought
        if (type === 'agent.thought') {
          set((s) => ({
            thoughts: [
              ...s.thoughts,
              {
                id: id || Math.random().toString(),
                text: payload.text,
                stepIdx: payload.stepIdx,
                ts: ts || Date.now(),
              },
            ],
          }));
        }

        // Terminal stream
        if (type === 'terminal.stream') {
          set((s) => ({
            activeProcessId: payload.processId,
            terminalData: s.terminalData + payload.data,
          }));
        }

        // Terminal exit
        if (type === 'terminal.exit') {
          set((s) => ({
            terminalData: s.terminalData + `\r\n[Process exited with code ${payload.exitCode}]\r\n`,
          }));
        }
      } catch {
        // Ignored
      }
    };
  },

  approve: async (id: string) => {
    // Send over WebSocket if available
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: 'gate.approve', payload: { approvalId: id } }));
    } else {
      // Fallback to HTTP POST
      const port = window.location.port === '5173' ? '3188' : window.location.port;
      await fetch(`http://${window.location.hostname}:${port}/api/gate/approve/${id}`, {
        method: 'POST',
      });
    }
    set((s) => ({
      pendingApprovals: s.pendingApprovals.filter((p) => p.id !== id),
    }));
  },

  reject: async (id: string, reason: string) => {
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: 'gate.reject', payload: { approvalId: id, reason } }));
    } else {
      const port = window.location.port === '5173' ? '3188' : window.location.port;
      await fetch(`http://${window.location.hostname}:${port}/api/gate/reject/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      });
    }
    set((s) => ({
      pendingApprovals: s.pendingApprovals.filter((p) => p.id !== id),
    }));
  },

  killProcess: (id: string) => {
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: 'process.kill_requested', payload: { processId: id } }));
    }
  },

  sendMessage: (content: string) => {
    const text = content.trim();
    if (!text) return;
    const sessionId = get().sessionId || 'abf018be-2f73-4f42-b54c-c8b493daa487';

    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(
        JSON.stringify({
          type: 'client.prompt_submitted',
          payload: { content: text, sessionId },
        })
      );
    }
  },
}));
