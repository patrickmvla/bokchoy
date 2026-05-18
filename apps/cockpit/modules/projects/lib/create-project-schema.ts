import { z } from 'zod';

const KEBAB_CASE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const createProjectSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Project name is required.')
    .max(64, 'Project name must be 64 characters or fewer.'),
  slug: z
    .string()
    .trim()
    .min(1, 'Slug is required.')
    .max(64, 'Slug must be 64 characters or fewer.')
    .regex(
      KEBAB_CASE,
      'Use lowercase letters, numbers, and single hyphens (e.g. my-game). No spaces or special characters.',
    ),
});

export type CreateProjectInput = z.infer<typeof createProjectSchema>;

/** Idempotent kebab-case derivation from a human-readable name. */
export function deriveSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}
