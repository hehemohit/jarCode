import { z } from 'zod';

export const PtyResizeSchema = z.object({
  processId: z.string(),
  cols: z.number().int().positive(),
  rows: z.number().int().positive(),
});
export type PtyResize = z.infer<typeof PtyResizeSchema>;

export const PtyKillRequestSchema = z.object({
  processId: z.string(),
  signal: z.enum(['SIGINT', 'SIGTERM', 'SIGKILL']).default('SIGKILL'),
});
export type PtyKillRequest = z.infer<typeof PtyKillRequestSchema>;
