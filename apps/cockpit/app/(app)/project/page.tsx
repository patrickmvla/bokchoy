import { redirect } from 'next/navigation';

/** Bare /project with no id → the picker. Active project is always a path segment per [[cockpit/active-project-scope]]. */
export default function ProjectIndexPage() {
  redirect('/projects');
}
