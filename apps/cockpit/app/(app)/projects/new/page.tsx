import { CreateProjectForm } from '@/modules/projects/components/create-project-form';

export default function CreateProjectPage() {
  return (
    <main className="mx-auto max-w-xl px-4 py-12">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">
          Create a project
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Set up a new BokChoy project. You can change these details later.
        </p>
      </header>
      <CreateProjectForm />
    </main>
  );
}
