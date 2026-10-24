import { z } from 'zod';

export const DiffHunkLineSchema = z.object({
  type: z.enum(['add', 'delete', 'context']),
  content: z.string(),
  oldLineNumber: z.number().optional(),
  newLineNumber: z.number().optional(),
});
export type DiffHunkLine = z.infer<typeof DiffHunkLineSchema>;

export const DiffHunkSchema = z.object({
  header: z.string(),
  lines: z.array(DiffHunkLineSchema),
});
export type DiffHunk = z.infer<typeof DiffHunkSchema>;

export const FileDiffSchema = z.object({
  filePath: z.string(),
  isNew: z.boolean(),
  isDeleted: z.boolean(),
  hunks: z.array(DiffHunkSchema),
  rawUnifiedDiff: z.string(),
});
export type FileDiff = z.infer<typeof FileDiffSchema>;
