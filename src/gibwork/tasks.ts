import { z } from 'zod';
import type { TaskDetails } from '@gibwork/sdk';
import type { VerityGibworkClient, Environment } from './client.js';
import { mapGibworkError } from './errors.js';
import { invalidInput } from '../utils/errors.js';

/**
 * Read-side task operations and the normalized, local bounty snapshot.
 */

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/** Accept a raw task UUID or any gib.work URL that contains one. */
export function taskIdFromInput(input: string): string {
  const m = UUID_RE.exec(input.trim());
  if (m) return m[0].toLowerCase();
  throw invalidInput(`Not a valid Gibwork task id or URL: "${input}"`);
}

/** Public bounty page URL for a task. */
export function bountyUrl(taskId: string): string {
  return `https://gib.work/bounty/${taskId}`;
}

export const BountyRewardSchema = z.object({
  amount: z.number(),
  symbol: z.string(),
  mintAddress: z.string().nullable(),
  priceUsd: z.number().nullable(),
});

export const BountySnapshotSchema = z.object({
  schemaVersion: z.literal('1.0'),
  platform: z.literal('gibwork'),
  environment: z.string(),
  taskId: z.string(),
  slug: z.string().nullable(),
  title: z.string(),
  /** Plain-text description (HTML stripped). */
  description: z.string(),
  tags: z.array(z.string()),
  reward: BountyRewardSchema.nullable(),
  status: z.string(),
  isOpen: z.boolean(),
  deadline: z.string().nullable(),
  minSubmissionAmount: z.number().nullable(),
  maxSubmissions: z.number().nullable(),
  submissionCounts: z.object({
    pending: z.number().int(),
    approved: z.number().int(),
    rejected: z.number().int(),
  }),
  url: z.string(),
  fetchedAt: z.string(),
});
export type BountySnapshot = z.infer<typeof BountySnapshotSchema>;

/** Minimal, readable HTML → text conversion for a bounty's `content`. */
export function htmlToText(html: string): string {
  return html
    .replace(/\r\n/g, '\n')
    .replace(/<\s*(br|\/p|\/li|\/div|\/h[1-6]|\/tr)\s*\/?>/gi, '\n')
    .replace(/<\s*li\s*>/gi, '- ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Normalize SDK TaskDetails into Verity's local snapshot shape. */
export function toBountySnapshot(details: TaskDetails, environment: Environment): BountySnapshot {
  const asset = details.asset;
  const reward = asset
    ? {
        amount: asset.amount,
        symbol: asset.symbol,
        mintAddress: asset.mintAddress ?? null,
        priceUsd: typeof asset.price === 'number' ? Math.round(asset.amount * asset.price * 100) / 100 : null,
      }
    : null;

  return {
    schemaVersion: '1.0',
    platform: 'gibwork',
    environment,
    taskId: details.id,
    slug: details.slug ?? null,
    title: details.title,
    description: htmlToText(details.content ?? ''),
    tags: Array.isArray(details.tags) ? details.tags : [],
    reward,
    status: details.status,
    isOpen: Boolean(details.isOpen),
    deadline: details.deadline ?? null,
    minSubmissionAmount:
      typeof details.minSubmissionAmount === 'number' ? details.minSubmissionAmount : null,
    maxSubmissions: typeof details.maxSubmissions === 'number' ? details.maxSubmissions : null,
    submissionCounts: {
      pending: details.taskSubmissionsPendingCount ?? 0,
      approved: details.taskSubmissionsApprovedCount ?? 0,
      rejected: details.taskSubmissionsRejectedCount ?? 0,
    },
    url: bountyUrl(details.id),
    fetchedAt: new Date().toISOString(),
  };
}

/** Fetch one bounty's full details (read-only). */
export async function getTask(client: VerityGibworkClient, taskId: string): Promise<TaskDetails> {
  try {
    return await client.tasks.get(taskId);
  } catch (err) {
    throw mapGibworkError(err);
  }
}

/** Lightweight read-only reachability probe (used by `doctor`). */
export async function ping(client: VerityGibworkClient): Promise<{ reachable: boolean; total: number }> {
  try {
    const res = await client.tasks.listAvailable({ page: 1, limit: 1 });
    return { reachable: true, total: res.total };
  } catch (err) {
    throw mapGibworkError(err);
  }
}
