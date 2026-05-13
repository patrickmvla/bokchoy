// Cockpit-side types for auth-chrome backend endpoints.
//
// Mirrors apps/backend/src/orgs/index.ts response shape. Inline duplication
// for now — promote to @bokchoy/shared-types if drift bites the
// cockpit↔backend boundary.

export type MemberRole = 'admin' | 'owner' | 'member';

export interface OrgMember {
  id: string;
  userId: string;
  role: MemberRole;
  createdAt: string;
}

export interface OrgMe {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  member: OrgMember;
}
