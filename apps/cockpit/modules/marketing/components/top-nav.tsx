/** Marketing top-nav. Per [[marketing/v1-shape]] (i). Chrome dimensions match (app)/ app-header for viewport continuity. */

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
