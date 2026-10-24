import { z } from 'zod';

// ==========================================
// Event Types
// ==========================================
export const BridgeEventTypeSchema = z.enum([
  // Agent & Transcript
  'agent.thought',
  'agent.message',
  'agent.tool_call',
  'agent.tool_result',

  // Approval Gate
  'gate.approval_requested',
  'gate.approved',
  'gate.rejected',
  'gate.timed_out',

  // Terminal & Execution
  'terminal.stream',
  'terminal.milestone',
  'terminal.exit',
  'process.kill_requested',

  // Client & Session
  'client.prompt_submitted',
  'client.sync_requested',
  'client.presence_ping',
  'session.status_changed',
]);

export type BridgeEventType = z.infer<typeof BridgeEventTypeSchema>;

// ==========================================
// Base Envelope Schema
// ==========================================
export const BridgeEventSchema = z.object({
  id: z.string().uuid(),
  sessionId: z.string(),
  seq: z.number().int().nonnegative(),
  ts: z.number().int().positive(),
  source: z.enum(['agent', 'daemon', 'client', 'hook']),
  type: BridgeEventTypeSchema,
  payload: z.record(z.any()),
});

export type BridgeEvent<T = Record<string, any>> = {
  id: string;
  sessionId: string;
  seq: number;
  ts: number;
  source: 'agent' | 'daemon' | 'client' | 'hook';
  type: BridgeEventType;
  payload: T;
};

// ==========================================
// Payload Schemas
// ==========================================

// Agent Thought
export const AgentThoughtPayloadSchema = z.object({
  text: z.string(),
  stepIdx: z.number().optional(),
});
export type AgentThoughtPayload = z.infer<typeof AgentThoughtPayloadSchema>;

// Agent Message
export const AgentMessagePayloadSchema = z.object({
  role: z.enum(['user', 'assistant', 'system']),
  content: z.string(),
  stepIdx: z.number().optional(),
});
export type AgentMessagePayload = z.infer<typeof AgentMessagePayloadSchema>;

// Approval Request
export const ApprovalRequestPayloadSchema = z.object({
  approvalId: z.string().uuid(),
  stepIdx: z.number(),
  toolName: z.string(),
  riskTier: z.union([z.literal(0), z.literal(1), z.literal(2)]),
  summary: z.string(),
  targetPath: z.string().optional(),
  diff: z.string().optional(),
  command: z.string().optional(),
  toolArgs: z.record(z.any()),
  expiresAt: z.number(),
});
export type ApprovalRequestPayload = z.infer<typeof ApprovalRequestPayloadSchema>;

// Approval Decision (Approved)
export const ApprovalDecisionPayloadSchema = z.object({
  approvalId: z.string().uuid(),
  decision: z.literal('allow'),
  overwrites: z.record(z.any()).optional(),
});
export type ApprovalDecisionPayload = z.infer<typeof ApprovalDecisionPayloadSchema>;

// Approval Rejection
export const ApprovalRejectionPayloadSchema = z.object({
  approvalId: z.string().uuid(),
  decision: z.literal('deny'),
  reason: z.string(),
});
export type ApprovalRejectionPayload = z.infer<typeof ApprovalRejectionPayloadSchema>;

// Terminal Stream
export const TerminalStreamPayloadSchema = z.object({
  processId: z.string(),
  data: z.string(), // ANSI formatted string
});
export type TerminalStreamPayload = z.infer<typeof TerminalStreamPayloadSchema>;

// Terminal Milestone
export const TerminalMilestonePayloadSchema = z.object({
  processId: z.string(),
  category: z.enum(['build', 'test', 'install', 'error', 'success']),
  message: z.string(),
});
export type TerminalMilestonePayload = z.infer<typeof TerminalMilestonePayloadSchema>;

// Client Sync Request
export const ClientSyncRequestPayloadSchema = z.object({
  lastSeq: z.number().int().nonnegative(),
});
export type ClientSyncRequestPayload = z.infer<typeof ClientSyncRequestPayloadSchema>;
