import * as vscode from 'vscode';
import WebSocket from 'ws';

let socket: WebSocket | null = null;
let statusBarItem: vscode.StatusBarItem;
let reconnectTimer: NodeJS.Timeout | null = null;

const DAEMON_WS_URL = 'ws://127.0.0.1:3188/ws';

export function activate(context: vscode.ExtensionContext) {
  console.log('[Antigravity Bridge Companion] Activating...');

  // 1. Status Bar Item
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.command = 'antigravityBridge.openPortal';
  updateStatusBar(false, 0);
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  // 2. Commands
  context.subscriptions.push(
    vscode.commands.registerCommand('antigravityBridge.openPortal', () => {
      vscode.env.openExternal(vscode.Uri.parse('http://localhost:3188'));
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('antigravityBridge.reconnectDaemon', () => {
      connectToDaemon();
    })
  );

  // 3. Connect to the Bridge Daemon WebSocket
  connectToDaemon();
}

function updateStatusBar(connected: boolean, pendingCount: number) {
  if (!connected) {
    statusBarItem.text = `$(circle-slash) Bridge: Offline`;
    statusBarItem.tooltip = 'Click to open Bridge Portal (Daemon offline)';
    statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
  } else if (pendingCount > 0) {
    statusBarItem.text = `$(bell-dot) Bridge: ${pendingCount} Pending`;
    statusBarItem.tooltip = `${pendingCount} tool approval(s) waiting for review. Click to open portal.`;
    statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
  } else {
    statusBarItem.text = `$(radio-tower) Bridge: Live`;
    statusBarItem.tooltip = 'Connected to Antigravity Bridge Daemon. Click to open Web/Mobile Portal.';
    statusBarItem.backgroundColor = undefined;
  }
}

function connectToDaemon() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  try {
    socket = new WebSocket(DAEMON_WS_URL);

    socket.on('open', () => {
      console.log('[Antigravity Bridge Companion] Connected to Daemon.');
      updateStatusBar(true, 0);
    });

    socket.on('message', async (data: WebSocket.Data) => {
      try {
        const msg = JSON.parse(data.toString());
        await handleDaemonMessage(msg);
      } catch (err: any) {
        console.error('[Antigravity Bridge Companion] Error parsing message:', err.message);
      }
    });

    socket.on('close', () => {
      console.log('[Antigravity Bridge Companion] Disconnected from Daemon. Retrying in 3s...');
      updateStatusBar(false, 0);
      reconnectTimer = setTimeout(connectToDaemon, 3000);
    });

    socket.on('error', (err: any) => {
      console.warn('[Antigravity Bridge Companion] Socket error:', err.message);
      socket?.close();
    });
  } catch (err: any) {
    console.error('[Antigravity Bridge Companion] Connection failed:', err.message);
    reconnectTimer = setTimeout(connectToDaemon, 3000);
  }
}

async function handleDaemonMessage(msg: any) {
  const { type, payload } = msg;

  // A. Prompt Submitted from Web App / Mobile Phone
  if (type === 'client.prompt_submitted') {
    const content = payload?.content;
    if (content) {
      console.log('[Antigravity Bridge Companion] Received prompt from client:', content);
      
      // Dispatch prompt into Antigravity IDE / VS Code chat
      // Antigravity IDE registers interactive chat and agent commands
      try {
        const allCommands = await vscode.commands.getCommands(true);

        // Check for Antigravity-specific chat submission commands
        const promptCommands = [
          'antigravity.chat.submitPrompt',
          'workbench.action.chat.open',
          'interactiveEditor.start'
        ];

        let executed = false;
        for (const cmd of promptCommands) {
          if (allCommands.includes(cmd)) {
            try {
              await vscode.commands.executeCommand(cmd, content);
              executed = true;
              break;
            } catch {
              // Try next command
            }
          }
        }

        if (!executed) {
          // If direct command isn't present, show high-visibility notification with prompt
          vscode.window.showInformationMessage(`📱 Phone Prompt: "${content}"`, 'Paste to Chat').then((selection) => {
            if (selection === 'Paste to Chat') {
              vscode.env.clipboard.writeText(content);
              vscode.commands.executeCommand('workbench.action.chat.open');
            }
          });
        }
      } catch (err: any) {
        console.error('[Antigravity Bridge Companion] Failed to dispatch prompt:', err.message);
      }
    }
  }

  // B. Approval Requested Gate Alert
  else if (type === 'gate.approval_requested') {
    updateStatusBar(true, 1);
    const summary = payload?.summary || 'Tool Execution Requested';
    const approvalId = payload?.approvalId;

    // Show native IDE modal / toast
    vscode.window.showWarningMessage(
      `🔒 [Mobile Gate] ${summary}`,
      'Approve',
      'Reject',
      'Open Web Portal'
    ).then((action) => {
      if (action === 'Approve' && approvalId) {
        socket?.send(JSON.stringify({ type: 'gate.approve', payload: { approvalId } }));
      } else if (action === 'Reject' && approvalId) {
        socket?.send(JSON.stringify({ type: 'gate.reject', payload: { approvalId, reason: 'Rejected from IDE' } }));
      } else if (action === 'Open Web Portal') {
        vscode.commands.executeCommand('antigravityBridge.openPortal');
      }
    });
  }

  // C. Gate Item Resolved
  else if (type === 'gate.approved' || type === 'gate.rejected' || type === 'gate.timed_out') {
    updateStatusBar(true, 0);
  }
}

export function deactivate() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
  }
  if (socket) {
    socket.close();
    socket = null;
  }
  if (statusBarItem) {
    statusBarItem.dispose();
  }
}
