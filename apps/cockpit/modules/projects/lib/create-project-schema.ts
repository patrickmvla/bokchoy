// Project creation Zod schema per [[cockpit/first-run-journey]] step 5 +
// [[cockpit/admin-list-endpoints-contract]] POST /v1/projects payload shape.
//
// Constraints:
//   - name: required, 1-64 chars (human-readable display name)
//   - slug: required, 1-64 chars, kebab-case (URL-friendly identifier;
//     unique per organization per backend (organization_id, slug) constraint)
//
// Zod v4 via monorepo workspace catalog (catalog: zod ^4.4.3). Standard
// Schema compliant — `FieldError errors={[...]} ` from @/components/ui/field
// can consume the issues directly.

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

// Auto-derive a kebab-case slug from a human-readable name. Used by the
// create-project form to pre-fill the slug field until the user manually
// edits it. Deterministic (idempotent) — `deriveSlug(deriveSlug(x))` ===
// `deriveSlug(x)`.
export function deriveSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}
