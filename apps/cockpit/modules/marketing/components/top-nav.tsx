// Marketing top-nav per [[marketing/v1-shape]] (i) — 4 items at v1:
// Product (anchor on `/`), Pricing, Docs, Sign in. Dropped at v1 with
// content-availability revisit triggers: /changelog, /blog, /customers,
// /security, /build-vs-buy (see [[marketing/v1-shape]] *Revisit when*).
//
// Server Component per [[cockpit-stack-integration-research]] F6 row 11:
// no client-side state, no event handlers. Plain anchors via next/link
// for client-side navigation between marketing routes.
//
// Visual coherence: matches `modules/auth/components/app-header.tsx` chrome
// shape — `border-b bg-background` outer, `mx-auto flex h-14 max-w-6xl
// items-center justify-between px-4` inner. The (marketing)/ chrome and
// the (app)/ chrome share dimensions so a signed-out → signed-in
// transition doesn't jolt the viewport.
//
// Docs route: linked but unbuilt at M-3. Route lands when
// [[marketing/v1-shape]] (i)'s docs tech-stack sub-decision resolves
// (in-repo MDX vs subdomain vs external). Link returns 404 until then —
// acceptable for a placeholder marketing surface.

import Link from 'next/link';

const NAV_ITEMS = [
  { label: 'Product', href: '/#features' },
  { label: 'Pricing', href: '/pricing' },
  { label: 'Docs', href: '/docs' },
] as const;

export function MarketingTopNav() {
  return (
    <header className="border-b bg-background">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <Link href="/" className="text-base font-semibold tracking-tight">
          BokChoy
        </Link>
        <nav className="flex items-center gap-6">
          <ul className="flex items-center gap-5 text-sm text-muted-foreground">
            {NAV_ITEMS.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="transition-colors hover:text-foreground"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
          <Link
            href="/sign-in"
            className="text-sm font-medium transition-colors hover:text-foreground"
          >
            Sign in
          </Link>
        </nav>
      </div>
    </header>
  );
}
