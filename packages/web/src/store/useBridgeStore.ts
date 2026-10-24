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

export interface ToolCallEntry {
  id: string;
  name: string;
  args: Record<string, any>;
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
  isExecuting: boolean;
  sessionId: string | null;
  lastSeq: number;
  pendingApprovals: PendingApproval[];
  messages: ChatMessage[];
  thoughts: ThoughtEntry[];
  toolCalls: ToolCallEntry[];
  terminalData: string;
  activeProcessId: string | null;

  // Actions
  connect: () => void;
  approve: (id: string) => Promise<void>;
  reject: (id: string, reason: string) => Promise<void>;
  killProcess: (id: string) => void;
  sendMessage: (content: string) => void;
  stopExecution: () => void;
}

let socket: WebSocket | null = null;

export const useBridgeStore = create<BridgeState>((set, get) => ({
  connected: false,
  isExecuting: false,
  sessionId: null,
  lastSeq: 0,
  pendingApprovals: [],
  messages: [],
  thoughts: [],
  toolCalls: [],
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

    console.log(`[Bridge Web] Initializing WebSocket connection to ${wsUrl}...`);
    socket = new WebSocket(wsUrl);

    socket.onopen = () => {
      console.log(`[Bridge Web SUCCESS] WebSocket connected to ${wsUrl}`);
      set({ connected: true });
      const currentSessionId = get().sessionId;
      const lastSeq = get().lastSeq;
      if (currentSessionId && lastSeq > 0) {
        console.log(`[Bridge Web] Requesting event replay sync for session ${currentSessionId} from seq ${lastSeq}`);
        socket?.send(
          JSON.stringify({
            type: 'client.sync_requested',
            payload: { sessionId: currentSessionId, lastSeq },
          })
        );
      }
    };

    socket.onclose = (event) => {
      console.warn(`[Bridge Web WARN] WebSocket closed (code: ${event.code}, reason: ${event.reason || 'none'}). Reconnecting in 2s...`);
      set({ connected: false });
      // Auto-reconnect after 2 seconds
      setTimeout(() => get().connect(), 2000);
    };

    socket.onerror = (err) => {
      console.error('[Bridge Web ERROR] WebSocket encountered an error:', err);
      socket?.close();
    };

    socket.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        const { type, payload, seq, sessionId, id, ts } = msg;
        console.log(`[Bridge Web] Received WS event: '${type}'`, { seq, sessionId, payload });

        if (seq && seq > get().lastSeq) {
          set({ lastSeq: seq });
        }
        if (sessionId && !get().sessionId) {
          set({ sessionId });
        }

        // Initial pending approvals on connect
        if (type === 'init.pending_approvals') {
          console.log(`[Bridge Web] Received initial pending approvals (${(payload || []).length})`);
          set({ pendingApprovals: payload || [] });
          return;
        }

        // Initial chat history on connect
        if (type === 'init.chat_history') {
          const { messages, thoughts, toolCalls, isExecuting } = payload || {};
          console.log(`[Bridge Web] Received initial chat history: ${(messages || []).length} messages, ${(thoughts || []).length} thoughts, ${(toolCalls || []).length} tool calls, isExecuting: ${!!isExecuting}`);
          set({
            messages: messages || [],
            thoughts: thoughts || [],
            toolCalls: toolCalls || [],
            isExecuting: !!isExecuting,
          });
          return;
        }

        // Session status changed
        if (type === 'session.status_changed') {
          const isExec = payload.status === 'executing';
          set({ isExecuting: isExec });
        }

        // Tool call
        if (type === 'agent.tool_call') {
          const toolCallId = id || (payload.name + '_' + (payload.stepIdx || Date.now()));
          set((s) => ({
            isExecuting: true,
            toolCalls: [
              ...s.toolCalls.filter((tc) => tc.id !== toolCallId),
              {
                id: toolCallId,
                name: payload.name,
                args: payload.args || {},
                stepIdx: payload.stepIdx,
                ts: ts || Date.now(),
              },
            ],
          }));
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
              isExecuting: payload.role === 'user' ? true : s.isExecuting,
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
            isExecuting: true,
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
    if (!text) {
      console.warn('[Bridge Web WARN] sendMessage called with empty content');
      return;
    }
    const sessionId = get().sessionId || '8d6b177b-9da6-415d-a5a5-cd16fc0daf85';

    console.log(`[Bridge Web] sendMessage called: "${text}" for session: ${sessionId}`);

    if (!socket) {
      console.error('[Bridge Web ERROR] Cannot send message: WebSocket socket instance is null!');
      return;
    }

    if (socket.readyState !== WebSocket.OPEN) {
      console.error(
        `[Bridge Web ERROR] Cannot send message: WebSocket is not open! Current state: ${socket.readyState} (0=CONNECTING, 1=OPEN, 2=CLOSING, 3=CLOSED). Connection status: ${
          get().connected ? 'connected' : 'disconnected'
        }`
      );
      return;
    }

    const payload = {
      type: 'client.prompt_submitted',
      payload: { content: text, sessionId },
    };

    try {
      set({ isExecuting: true });
      socket.send(JSON.stringify(payload));
      console.log('[Bridge Web SUCCESS] Dispatched client.prompt_submitted to daemon over WebSocket:', payload);
    } catch (err: any) {
      console.error('[Bridge Web ERROR] socket.send failed:', err?.message || err);
      set({ isExecuting: false });
    }
  },

  stopExecution: () => {
    console.log('[Bridge Web] stopExecution requested');
    set({ isExecuting: false });
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: 'client.stop_requested', payload: {} }));
    }
  },
}));
