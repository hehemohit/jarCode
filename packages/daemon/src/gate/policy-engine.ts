import { randomUUID } from 'node:crypto';
import { RiskTier, classifyToolRisk, BridgeEvent } from '@antigravity-bridge/shared';
import { BridgeDatabase } from '../db/database.js';

export interface PendingRequest {
  id: string;
  sessionId: string;
  stepIdx: number;
  toolName: string;
  toolArgs: Record<string, any>;
  riskTier: RiskTier;
  summary: string;
  diff?: string;
  command?: string;
  expiresAt: number;
  resolve: (decision: { decision: 'allow' | 'deny'; reason?: string; overwrite?: Record<string, any> }) => void;
  timer: NodeJS.Timeout;
}

export class PolicyEngine {
  private db: BridgeDatabase;
  private pendingMap = new Map<string, PendingRequest>();
  private onBroadcast?: (event: BridgeEvent) => void;

  constructor(db: BridgeDatabase) {
    this.db = db;
  }

  public setBroadcastHandler(handler: (event: BridgeEvent) => void) {
    this.onBroadcast = handler;
  }

  /**
   * Evaluates an incoming tool call from hook-client.
   * Resolves immediately if auto-allowed (Tier 0), or suspends until approved/rejected.
   */
  public async handleToolCall(input: {
    conversationId: string;
    stepIdx: number;
    toolCall: { name: string; args: Record<string, any> };
  }): Promise<{ decision: 'allow' | 'deny'; reason?: string; overwrite?: Record<string, any> }> {
    const { conversationId, stepIdx, toolCall } = input;
    const toolName = toolCall.name;
    const toolArgs = toolCall.args || {};

    const riskTier = classifyToolRisk(toolName, toolArgs);

    // Auto-allow safe tools (Tier 0)
    if (riskTier === RiskTier.TIER_0_AUTO) {
      return { decision: 'allow' };
    }

    // Tier 1 & Tier 2 require user review
    const approvalId = randomUUID();
    const expiresAt = Date.now() + 300_000; // 5 minute timeout

    let summary = `Execute ${toolName}`;
    let diff: string | undefined;
    let command: string | undefined;

    if (toolName === 'write_to_file' || toolName === 'replace_file_content' || toolName === 'multi_replace_file_content') {
      const targetFile = toolArgs.TargetFile || 'Unknown file';
      summary = `Modify ${targetFile}`;
      diff = toolArgs.ReplacementContent || toolArgs.CodeContent || toolArgs.Instruction || '';
    } else if (toolName === 'run_command') {
      command = toolArgs.CommandLine || '';
      summary = `Run command: ${command}`;
    }

    // Persist pending approval to SQLite
    this.db.createApproval({
      id: approvalId,
      sessionId: conversationId,
      stepIdx,
      toolName,
      riskTier,
      summary,
      payload: { toolArgs, diff, command },
      expiresAt,
    });

    // Broadcast event to connected Web/Mobile clients
    const eventPayload = {
      approvalId,
      stepIdx,
      toolName,
      riskTier,
      summary,
      targetPath: toolArgs.TargetFile,
      diff,
      command,
      toolArgs,
      expiresAt,
    };

    const { seq, ts } = this.db.appendEvent(
      randomUUID(),
      conversationId,
      'daemon',
      'gate.approval_requested',
      eventPayload
    );

    if (this.onBroadcast) {
      this.onBroadcast({
        id: randomUUID(),
        sessionId: conversationId,
        seq,
        ts,
        source: 'daemon',
        type: 'gate.approval_requested',
        payload: eventPayload,
      });
    }

    // Suspend execution in a Promise
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pendingMap.delete(approvalId);
        this.db.resolveApproval(approvalId, 'timed_out');
        resolve({
          decision: 'deny',
          reason: 'Approval timed out after 5 minutes without response.',
        });
      }, 300_000);

      this.pendingMap.set(approvalId, {
        id: approvalId,
        sessionId: conversationId,
        stepIdx,
        toolName,
        toolArgs,
        riskTier,
        summary,
        diff,
        command,
        expiresAt,
        resolve,
        timer,
      });
    });
  }

  public approve(approvalId: string): boolean {
    const pending = this.pendingMap.get(approvalId);
    if (!pending) return false;

    clearTimeout(pending.timer);
    this.pendingMap.delete(approvalId);

    this.db.resolveApproval(approvalId, 'approved');

    const { seq, ts } = this.db.appendEvent(
      randomUUID(),
      pending.sessionId,
      'client',
      'gate.approved',
      { approvalId }
    );

    if (this.onBroadcast) {
      this.onBroadcast({
        id: randomUUID(),
        sessionId: pending.sessionId,
        seq,
        ts,
        source: 'daemon',
        type: 'gate.approved',
        payload: { approvalId },
      });
    }

    pending.resolve({ decision: 'allow' });
    return true;
  }

  public reject(approvalId: string, reason: string): boolean {
    const pending = this.pendingMap.get(approvalId);
    if (!pending) return false;

    clearTimeout(pending.timer);
    this.pendingMap.delete(approvalId);

    this.db.resolveApproval(approvalId, 'rejected', reason);

    const { seq, ts } = this.db.appendEvent(
      randomUUID(),
      pending.sessionId,
      'client',
      'gate.rejected',
      { approvalId, reason }
    );

    if (this.onBroadcast) {
      this.onBroadcast({
        id: randomUUID(),
        sessionId: pending.sessionId,
        seq,
        ts,
        source: 'daemon',
        type: 'gate.rejected',
        payload: { approvalId, reason },
      });
    }

    pending.resolve({ decision: 'deny', reason });
    return true;
  }

  public getPendingList() {
    return Array.from(this.pendingMap.values()).map((p) => ({
      id: p.id,
      sessionId: p.sessionId,
      stepIdx: p.stepIdx,
      toolName: p.toolName,
      riskTier: p.riskTier,
      summary: p.summary,
      diff: p.diff,
      command: p.command,
      toolArgs: p.toolArgs,
      expiresAt: p.expiresAt,
    }));
  }
}
