import Link from 'next/link';

const FOOTER_LINKS = [
  { label: 'Product', href: '/#features' },
  { label: 'Pricing', href: '/pricing' },
  { label: 'Docs', href: '/docs' },
  { label: 'Sign in', href: '/sign-in' },
] as const;

export function MarketingFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="border-t bg-background">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1">
          <span className="font-medium text-foreground">BokChoy</span>
          <span>
            © {year} BokChoy. Wallet infrastructure for game economies.
          </span>
        </div>
        <nav>
          <ul className="flex flex-wrap items-center gap-5">
            {FOOTER_LINKS.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="transition-colors hover:text-foreground"
                >
                  {item.label}
                </Link>
              </li>
            ))}
            <li>
              <a
                href="mailto:security@bokchoy.com"
                className="transition-colors hover:text-foreground"
              >
                Security
              </a>
            </li>
          </ul>
        </nav>
      </div>
    </footer>
  );
}
