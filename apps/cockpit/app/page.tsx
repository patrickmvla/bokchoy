// Placeholder root page for slice 8.3.1 scaffold boot.
// Slice 8.3.2 replaces this with the marketing route group at `(marketing)/page.tsx`
// composing modules/marketing components per [[first-run-journey]] step 0.

export default function HomePage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <div className="text-center">
        <h1 className="text-3xl font-bold">BokChoy</h1>
        <p className="mt-2 text-sm text-gray-600">
          Cockpit scaffold (slice 8.3.1)
        </p>
      </div>
    </main>
  );
}
