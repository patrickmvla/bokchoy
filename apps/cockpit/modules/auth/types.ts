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
