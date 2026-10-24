import * as vscode from 'vscode';
import WebSocket from 'ws';

let socket: WebSocket | null = null;
let statusBarItem: vscode.StatusBarItem;
let reconnectTimer: NodeJS.Timeout | null = null;
let outputChannel: vscode.OutputChannel;

const DAEMON_WS_URL = 'ws://127.0.0.1:3188/ws';

function logInfo(message: string, ...args: any[]) {
  const formatted = `[Antigravity Bridge Companion] [INFO] ${message}`;
  console.log(formatted, ...args);
  try {
    outputChannel?.appendLine(`${new Date().toISOString()} [INFO] ${message} ${args.length ? JSON.stringify(args) : ''}`);
  } catch {
    // Ignore logging errors
  }
}

function logWarn(message: string, ...args: any[]) {
  const formatted = `[Antigravity Bridge Companion] [WARN] ${message}`;
  console.warn(formatted, ...args);
  try {
    outputChannel?.appendLine(`${new Date().toISOString()} [WARN] ${message} ${args.length ? JSON.stringify(args) : ''}`);
  } catch {
    // Ignore logging errors
  }
}

function logError(message: string, ...args: any[]) {
  const formatted = `[Antigravity Bridge Companion] [ERROR] ${message}`;
  console.error(formatted, ...args);
  try {
    outputChannel?.appendLine(`${new Date().toISOString()} [ERROR] ${message} ${args.length ? JSON.stringify(args) : ''}`);
  } catch {
    // Ignore logging errors
  }
}

export function activate(context: vscode.ExtensionContext) {
  outputChannel = vscode.window.createOutputChannel('Antigravity Bridge Companion');
  outputChannel.show(true);
  context.subscriptions.push(outputChannel);

  logInfo('Activating Antigravity Bridge Companion Extension...');

  // 1. Status Bar Item
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.command = 'antigravityBridge.openPortal';
  updateStatusBar(false, 0);
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  // 2. Commands
  context.subscriptions.push(
    vscode.commands.registerCommand('antigravityBridge.openPortal', () => {
      logInfo('User triggered command: antigravityBridge.openPortal');
      vscode.env.openExternal(vscode.Uri.parse('http://localhost:3188'));
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('antigravityBridge.reconnectDaemon', () => {
      logInfo('User triggered command: antigravityBridge.reconnectDaemon');
      connectToDaemon();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('antigravityBridge.testPrompt', async () => {
      logInfo('User triggered command: antigravityBridge.testPrompt');
      const testContent = 'Hello from Antigravity Bridge Companion test command!';
      await dispatchPromptToChat(testContent);
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

  logInfo(`Connecting to Daemon WebSocket at ${DAEMON_WS_URL}...`);

  try {
    socket = new WebSocket(DAEMON_WS_URL);

    socket.on('open', () => {
      logInfo('Successfully connected to Daemon WebSocket.');
      updateStatusBar(true, 0);
    });

    socket.on('message', async (data: WebSocket.Data) => {
      const raw = data.toString();
      logInfo(`Received message from Daemon (len: ${raw.length}):`, raw.length > 250 ? raw.slice(0, 250) + '...' : raw);
      try {
        const msg = JSON.parse(raw);
        await handleDaemonMessage(msg);
      } catch (err: any) {
        logError('Error parsing incoming daemon message JSON:', err?.message || err);
      }
    });

    socket.on('close', (code, reason) => {
      logWarn(`Disconnected from Daemon (code: ${code}, reason: ${reason?.toString() || 'none'}). Retrying in 3s...`);
      updateStatusBar(false, 0);
      reconnectTimer = setTimeout(connectToDaemon, 3000);
    });

    socket.on('error', (err: any) => {
      logError('Socket error occurred:', err?.message || err);
      socket?.close();
    });
  } catch (err: any) {
    logError('Connection initiation failed:', err?.message || err);
    reconnectTimer = setTimeout(connectToDaemon, 3000);
  }
}

let lastDispatchedPrompt = '';
let lastDispatchedAt = 0;

async function dispatchPromptToChat(content: string) {
  const now = Date.now();
  if (lastDispatchedPrompt === content && now - lastDispatchedAt < 2000) {
    logInfo(`Ignoring duplicate prompt dispatch within 2s: "${content}"`);
    return;
  }
  lastDispatchedPrompt = content;
  lastDispatchedAt = now;

  logInfo(`Dispatching prompt into IDE Chat: "${content}"`);

  let executed = false;
  try {
    const allCommands = await vscode.commands.getCommands(true);

    // Strategy 1: Native Antigravity Agent Command
    if (allCommands.includes('antigravity.sendPromptToAgentPanel')) {
      try {
        logInfo('Attempting Strategy 1: antigravity.sendPromptToAgentPanel...');
        await vscode.commands.executeCommand('antigravity.sendPromptToAgentPanel', content);
        logInfo('Strategy 1 succeeded: antigravity.sendPromptToAgentPanel executed!');
        executed = true;
      } catch (err: any) {
        logWarn('Strategy 1 (antigravity.sendPromptToAgentPanel) failed:', err?.message || err);
      }
    }

    // Strategy 2: If panel wasn't opened, ensure openAgent is called
    if (!executed && allCommands.includes('antigravity.openAgent')) {
      try {
        logInfo('Attempting to open agent panel via antigravity.openAgent...');
        await vscode.commands.executeCommand('antigravity.openAgent');
        if (allCommands.includes('antigravity.sendPromptToAgentPanel')) {
          await vscode.commands.executeCommand('antigravity.sendPromptToAgentPanel', content);
          executed = true;
        }
      } catch (err: any) {
        logWarn('openAgent attempt failed:', err?.message || err);
      }
    }

    // Strategy 3: Standard VS Code Chat API (fallback)
    if (!executed && allCommands.includes('workbench.action.chat.open')) {
      try {
        logInfo('Attempting Strategy 3: workbench.action.chat.open with query...');
        await vscode.commands.executeCommand('workbench.action.chat.open', {
          query: content,
          isPartialQuery: false,
        });
        executed = true;
      } catch (err: any) {
        logWarn('Strategy 3 failed:', err?.message || err);
      }
    }

    // Strategy 4: workbench.action.chat.submit fallback
    if (!executed && allCommands.includes('workbench.action.chat.submit')) {
      try {
        logInfo('Attempting Strategy 4: workbench.action.chat.submit...');
        await vscode.commands.executeCommand('workbench.action.chat.submit', { query: content });
        executed = true;
      } catch (err: any) {
        logWarn('Strategy 4 failed:', err?.message || err);
      }
    }
  } catch (err: any) {
    logError('Error while evaluating commands for prompt dispatch:', err?.message || err);
  }

  // Always copy to clipboard as a fail-safe
  await vscode.env.clipboard.writeText(content);
  logInfo('Prompt text has been copied to system clipboard as safety fallback.');

  if (!executed) {
    logWarn('None of the direct programmatic chat commands succeeded. Showing fallback action toast.');
    vscode.window
      .showInformationMessage(`📱 Phone Prompt: "${content}"`, 'Paste to Chat')
      .then((selection) => {
        if (selection === 'Paste to Chat') {
          vscode.commands.executeCommand('antigravity.openAgent').then(() => {
            vscode.commands.executeCommand('antigravity.sendPromptToAgentPanel', content);
          });
        }
      });
  } else {
    vscode.window.setStatusBarMessage(`📱 Prompt dispatched: "${content.slice(0, 30)}..."`, 4000);
  }
}

async function handleDaemonMessage(msg: any) {
  const { type, payload } = msg;

  // A. Prompt Submitted from Web App / Mobile Phone
  // Only trigger on explicit 'client.prompt_submitted' to avoid duplicate dispatch
  if (type === 'client.prompt_submitted') {
    const content = payload?.content;
    if (content && typeof content === 'string') {
      logInfo(`>>> Recognized incoming user prompt from client! Content: "${content}"`);
      await dispatchPromptToChat(content);
    } else {
      logError('Received prompt event but payload.content is empty or invalid:', payload);
    }
    return;
  }

  // B. Approval Requested Gate Alert
  if (type === 'gate.approval_requested') {
    updateStatusBar(true, 1);
    const summary = payload?.summary || 'Tool Execution Requested';
    const approvalId = payload?.approvalId;
    logWarn(`[Mobile Gate] Tool Approval Requested! ID: ${approvalId}, Summary: ${summary}`);

    // Show native IDE modal / toast
    vscode.window
      .showWarningMessage(`🔒 [Mobile Gate] ${summary}`, 'Approve', 'Reject', 'Open Web Portal')
      .then((action) => {
        logInfo(`User selected action in IDE modal: '${action}' for approval: ${approvalId}`);
        if (action === 'Approve' && approvalId) {
          socket?.send(JSON.stringify({ type: 'gate.approve', payload: { approvalId } }));
          logInfo(`Dispatched gate.approve to daemon for ID: ${approvalId}`);
        } else if (action === 'Reject' && approvalId) {
          socket?.send(JSON.stringify({ type: 'gate.reject', payload: { approvalId, reason: 'Rejected from IDE' } }));
          logInfo(`Dispatched gate.reject to daemon for ID: ${approvalId}`);
        } else if (action === 'Open Web Portal') {
          vscode.commands.executeCommand('antigravityBridge.openPortal');
        }
      });
    return;
  }

  // C. Gate Item Resolved
  if (type === 'gate.approved' || type === 'gate.rejected' || type === 'gate.timed_out') {
    logInfo(`Gate item resolved (${type}) for approvalId: ${payload?.approvalId}`);
    updateStatusBar(true, 0);
    return;
  }

  // Other events
  logInfo(`Handled daemon event: '${type}'`);
}

export function deactivate() {
  logInfo('Deactivating Antigravity Bridge Companion...');
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
  if (outputChannel) {
    outputChannel.dispose();
  }
}
