import React, { useEffect, useRef, useState } from 'react';
import { useBridgeStore, ToolCallEntry, ThoughtEntry, PendingApproval } from '../store/useBridgeStore.ts';
import { marked } from 'marked';
import {
  Brain,
  ChevronDown,
  ChevronRight,
  Folder,
  FileCode,
  Search,
  Terminal,
  Edit3,
  Globe,
  Sparkles,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Send,
} from 'lucide-react';

interface FormattedAction {
  id: string;
  type: string;
  icon: React.ReactNode;
  actionText: string;
  targetText: string;
}

function formatToolAction(tc: ToolCallEntry): FormattedAction {
  const name = tc.name;
  const args = tc.args || {};

  if (name === 'view_file') {
    const rawPath = String(args.AbsolutePath || '');
    const basename = rawPath.split(/[\\/]/).pop() || 'file';
    const lines =
      args.StartLine && args.EndLine ? ` #L${args.StartLine}-${args.EndLine}` : '';
    return {
      id: tc.id,
      type: 'view_file',
      icon: <FileCode size={14} className="text-sky-400" />,
      actionText: 'Analyzed',
      targetText: `${basename}${lines}`,
    };
  }

  if (name === 'list_dir') {
    const rawPath = String(args.DirectoryPath || '');
    return {
      id: tc.id,
      type: 'list_dir',
      icon: <Folder size={14} className="text-amber-400" />,
      actionText: 'Analyzed',
      targetText: rawPath,
    };
  }

  if (name === 'grep_search') {
    const query = String(args.Query || '');
    return {
      id: tc.id,
      type: 'grep_search',
      icon: <Search size={14} className="text-purple-400" />,
      actionText: 'Searched',
      targetText: `"${query}"`,
    };
  }

  if (name === 'run_command') {
    const cmd = String(args.CommandLine || '');
    const shortCmd = cmd.length > 50 ? `${cmd.slice(0, 50)}...` : cmd;
    return {
      id: tc.id,
      type: 'run_command',
      icon: <Terminal size={14} className="text-emerald-400" />,
      actionText: 'Ran command',
      targetText: shortCmd,
    };
  }

  if (
    name === 'replace_file_content' ||
    name === 'write_to_file' ||
    name === 'multi_replace_file_content'
  ) {
    const rawPath = String(args.TargetFile || '');
    const basename = rawPath.split(/[\\/]/).pop() || 'file';
    return {
      id: tc.id,
      type: 'edit',
      icon: <Edit3 size={14} className="text-rose-400" />,
      actionText: 'Edited',
      targetText: basename,
    };
  }

  if (name === 'browser_subagent') {
    const summary = String(args.TaskSummary || args.TaskName || 'Browser task');
    return {
      id: tc.id,
      type: 'browser',
      icon: <Globe size={14} className="text-indigo-400" />,
      actionText: 'Browser subagent',
      targetText: summary,
    };
  }

  const label = String(args.toolSummary || args.toolAction || `Executed ${name}`);
  return {
    id: tc.id,
    type: 'generic',
    icon: <Sparkles size={14} className="text-blue-400" />,
    actionText: 'Executed',
    targetText: label,
  };
}

function computeSummaryTitle(
  actions: FormattedAction[],
  thoughtsCount: number,
  isWorking: boolean,
  hasApprovals: boolean = false
): string {
  if (hasApprovals) {
    return 'Action Required: Permission Gate';
  }
  let fileCount = 0;
  let folderCount = 0;
  let searchCount = 0;
  let commandCount = 0;

  for (const a of actions) {
    if (a.type === 'view_file' || a.type === 'edit') fileCount++;
    else if (a.type === 'list_dir') folderCount++;
    else if (a.type === 'grep_search') searchCount++;
    else if (a.type === 'run_command') commandCount++;
  }

  const parts: string[] = [];
  if (fileCount > 0) parts.push(`${fileCount} ${fileCount === 1 ? 'file' : 'files'}`);
  if (folderCount > 0) parts.push(`${folderCount} ${folderCount === 1 ? 'folder' : 'folders'}`);
  if (searchCount > 0) parts.push(`${searchCount} ${searchCount === 1 ? 'search' : 'searches'}`);
  if (commandCount > 0) parts.push(`${commandCount} ${commandCount === 1 ? 'command' : 'commands'}`);

  if (parts.length > 0) {
    return `Exploring ${parts.join(', ')}`;
  }

  if (actions.length > 0) {
    return `Executing ${actions.length} ${actions.length === 1 ? 'action' : 'actions'}`;
  }

  if (thoughtsCount > 0) {
    return `Thinking (${thoughtsCount} ${thoughtsCount === 1 ? 'thought' : 'thoughts'})`;
  }

  if (isWorking) {
    return 'Thinking & Exploring...';
  }

  return 'Execution Steps';
}

// Inline Permission Gate Box
const InlinePermissionGate: React.FC<{ approval: PendingApproval }> = ({ approval }) => {
  const { approve, reject } = useBridgeStore();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);

  const handleApprove = async () => {
    setLoading(true);
    await approve(approval.id);
  };

  const handleReject = async () => {
    setLoading(true);
    await reject(approval.id, reason.trim() || 'Rejected by user');
  };

  return (
    <div className="inline-gate-card">
      <div className="inline-gate-header">
        <div className="inline-gate-title-row">
          <AlertTriangle size={16} className="text-amber-400 animate-pulse" />
          <span className="inline-gate-title">Permission Requested: {approval.summary}</span>
        </div>
        <span className={`gate-risk-pill ${approval.riskTier === 2 ? 'risk-high' : 'risk-std'}`}>
          {approval.riskTier === 2 ? 'High Risk Tier 2' : 'Review Required'}
        </span>
      </div>

      {approval.command && (
        <div className="inline-gate-preview">
          <code>$ {approval.command}</code>
        </div>
      )}

      {approval.diff && (
        <div className="inline-gate-preview">
          <pre>{approval.diff.slice(0, 300)}</pre>
        </div>
      )}

      {!rejecting ? (
        <div className="inline-gate-actions">
          <button
            disabled={loading}
            onClick={() => setRejecting(true)}
            className="gate-deny-btn"
          >
            <XCircle size={14} />
            <span>Deny / Reject</span>
          </button>
          <button
            disabled={loading}
            onClick={handleApprove}
            className="gate-approve-btn"
          >
            <CheckCircle2 size={14} />
            <span>Accept / Approve</span>
          </button>
        </div>
      ) : (
        <div className="inline-gate-reject-box">
          <input
            type="text"
            autoFocus
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason for rejection (optional)..."
            className="reject-reason-input"
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleReject();
            }}
          />
          <button disabled={loading} onClick={handleReject} className="gate-deny-confirm-btn">
            <Send size={13} />
            <span>Deny</span>
          </button>
          <button onClick={() => setRejecting(false)} className="gate-cancel-btn">
            Cancel
          </button>
        </div>
      )}
    </div>
  );
};

export const ChatStream: React.FC = () => {
  const { messages, thoughts, toolCalls, isExecuting, pendingApprovals } = useBridgeStore();
  const [collapsedTurns, setCollapsedTurns] = useState<Record<string, boolean>>({});
  const [showThoughtDetails, setShowThoughtDetails] = useState<Record<string, boolean>>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, thoughts, toolCalls, isExecuting, pendingApprovals]);

  // Group messages into turns starting at each user prompt
  const turns: Array<{
    id: string;
    userMsg?: typeof messages[0];
    assistantMsg?: typeof messages[0];
    turnToolCalls: ToolCallEntry[];
    turnThoughts: ThoughtEntry[];
    turnApprovals: PendingApproval[];
    isCurrentWorking: boolean;
  }> = [];

  const userIndices: number[] = [];
  messages.forEach((m, idx) => {
    if (m.role === 'user') userIndices.push(idx);
  });

  if (userIndices.length === 0) {
    // Only assistant messages or initial state
    turns.push({
      id: 'initial',
      assistantMsg: messages.find((m) => m.role === 'assistant'),
      turnToolCalls: toolCalls,
      turnThoughts: thoughts,
      turnApprovals: pendingApprovals,
      isCurrentWorking: isExecuting,
    });
  } else {
    for (let i = 0; i < userIndices.length; i++) {
      const uIdx = userIndices[i];
      const userMsg = messages[uIdx];
      const nextUIdx = i + 1 < userIndices.length ? userIndices[i + 1] : messages.length;

      // Assistant message within this turn
      const assistantMsg = messages.slice(uIdx + 1, nextUIdx).find((m) => m.role === 'assistant');

      const startTime = userMsg.ts || 0;
      const endTime = i + 1 < userIndices.length ? messages[userIndices[i + 1]].ts : Infinity;

      const turnToolCalls = toolCalls.filter((tc) => tc.ts >= startTime && tc.ts < endTime);
      const turnThoughts = thoughts.filter((th) => th.ts >= startTime && th.ts < endTime);

      const isLastTurn = i === userIndices.length - 1;
      const turnApprovals = isLastTurn ? pendingApprovals : [];
      const isCurrentWorking = isLastTurn && isExecuting;

      turns.push({
        id: userMsg.id,
        userMsg,
        assistantMsg,
        turnToolCalls,
        turnThoughts,
        turnApprovals,
        isCurrentWorking,
      });
    }
  }

  const toggleTurnCollapse = (turnId: string) => {
    setCollapsedTurns((prev) => ({
      ...prev,
      [turnId]: !prev[turnId],
    }));
  };

  const toggleThoughtDetails = (turnId: string) => {
    setShowThoughtDetails((prev) => ({
      ...prev,
      [turnId]: !prev[turnId],
    }));
  };

  return (
    <div className="chat-content-width">
      {turns.map((turn, tIdx) => {
        const formattedActions = turn.turnToolCalls.map(formatToolAction);
        const hasApprovals = turn.turnApprovals.length > 0;
        const hasExecutionSteps =
          formattedActions.length > 0 || turn.turnThoughts.length > 0 || turn.isCurrentWorking || hasApprovals;
        const isCollapsed = hasApprovals ? false : (collapsedTurns[turn.id] ?? false);
        const thoughtsExpanded = showThoughtDetails[turn.id] ?? false;
        const summaryTitle = computeSummaryTitle(
          formattedActions,
          turn.turnThoughts.length,
          turn.isCurrentWorking,
          hasApprovals
        );

        return (
          <div key={turn.id || tIdx} className="turn-container">
            {/* 1. User Message */}
            {turn.userMsg && (
              <div className="user-message-row">
                <div className="user-bubble">{turn.userMsg.content}</div>
              </div>
            )}

            {/* 2. Execution Accordion (Antigravity Style) */}
            {hasExecutionSteps && (
              <div className="antigravity-execution-card">
                {/* Accordion Header */}
                <button
                  type="button"
                  onClick={() => toggleTurnCollapse(turn.id)}
                  className="antigravity-execution-header"
                >
                  <div className="execution-header-left">
                    <span className="summary-title">{summaryTitle}</span>
                  </div>
                  <div className="execution-header-right">
                    {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                  </div>
                </button>

                {/* Accordion Body */}
                {!isCollapsed && (
                  <div className="antigravity-execution-body">
                    {/* Tool Actions List */}
                    {formattedActions.map((action) => (
                      <div key={action.id} className="action-step-row">
                        <div className="action-icon-wrapper">{action.icon}</div>
                        <span className="action-verb">{action.actionText}</span>
                        <span className="action-target">{action.targetText}</span>
                      </div>
                    ))}

                    {/* Thought Toggle & Content */}
                    {turn.turnThoughts.length > 0 && (
                      <div className="thoughts-sub-block">
                        <button
                          type="button"
                          onClick={() => toggleThoughtDetails(turn.id)}
                          className="thought-toggle-btn"
                        >
                          <Brain size={13} className="text-indigo-400" />
                          <span>
                            {thoughtsExpanded ? 'Hide Thoughts' : `View Thoughts (${turn.turnThoughts.length})`}
                          </span>
                        </button>
                        {thoughtsExpanded && (
                          <div className="thought-stream-text">
                            {turn.turnThoughts.map((th, thIdx) => (
                              <div key={th.id || thIdx} className="thought-item">
                                💭 {th.text}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Working Indicator */}
                    {turn.isCurrentWorking && (
                      <div className="agent-working-row">
                        <div className="pulsing-circle" />
                        <span className="agent-working-label">Working..</span>
                      </div>
                    )}

                    {/* Inline Approvals (Accept / Deny) */}
                    {turn.turnApprovals.length > 0 && (
                      <div className="inline-approvals-group">
                        {turn.turnApprovals.map((approval) => (
                          <InlinePermissionGate key={approval.id} approval={approval} />
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* 3. Assistant Final Message */}
            {turn.assistantMsg && (
              <div className="assistant-message-row">
                <div
                  className="assistant-body markdown-body"
                  dangerouslySetInnerHTML={{
                    __html: marked.parse(turn.assistantMsg.content) as string,
                  }}
                />
              </div>
            )}
          </div>
        );
      })}

      {/* Auto-scroll anchor */}
      <div ref={messagesEndRef} />
    </div>
  );
};
