import { z } from 'zod';
export const settingsSchema = z
  .object({
    preset: z.enum(['classic', 'blitz', 'all-finish']),
    inventory: z.enum(['constrained', 'creative']),
    rounds: z.number().int().min(3).max(10),
    seconds: z.number().int().min(15).max(180),
    difficulty: z.enum(['progressive', 'easy', 'expert']),
    distractors: z.number().int().min(0).max(24),
    scoring: z.enum(['winner', 'all-finish']),
    hints: z.boolean(),
  })
  .strict();
export const joinSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1)
      .max(20)
      .regex(/^[\p{L}\p{N} _.-]+$/u, 'Use letters, numbers, spaces, dashes or underscores'),
    avatar: z.string().regex(/^[a-z0-9_-]{1,40}$/),
  })
  .strict();
export const createSchema = joinSchema.extend({
  practice: z.boolean().optional(),
  settings: settingsSchema.optional(),
});
export const clientMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('ready'), ready: z.boolean() }).strict(),
  z.object({ type: z.literal('settings'), settings: settingsSchema }).strict(),
  z.object({ type: z.literal('start') }).strict(),
  z.object({ type: z.literal('engage'), roundId: z.string().min(1).max(80) }).strict(),
  z.object({ type: z.literal('overclock'), roundId: z.string().min(1).max(80) }).strict(),
  z
    .object({
      type: z.literal('grid'),
      roundId: z.string().min(1).max(80),
      grid: z
        .array(
          z
            .string()
            .regex(/^[a-z0-9_]{1,80}$/)
            .nullable(),
        )
        .length(9),
    })
    .strict(),
  z
    .object({
      type: z.literal('collect'),
      roundId: z.string().min(1).max(80),
      grid: z
        .array(
          z
            .string()
            .regex(/^[a-z0-9_]{1,80}$/)
            .nullable(),
        )
        .length(9),
    })
    .strict(),
  z.object({ type: z.literal('rematch') }).strict(),
  z.object({ type: z.literal('ping'), sentAt: z.number().finite() }).strict(),
  z.object({ type: z.literal('leave') }).strict(),
]);
