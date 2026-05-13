// Root layout per [[cockpit/file-structure]] + Next.js 16 App Router.
//
// Mounts:
//   - Geist + Geist_Mono via next/font/google per [[cockpit/nextjs-scaffold-research]]
//     F5 / item #9 — matches canonical create-next-app@canary template. CSS variables
//     `--font-geist-sans` / `--font-geist-mono` applied on <html>; resolved into
//     Tailwind's `font-sans` / `font-mono` utilities via the `@theme inline` block
//     in globals.css.
//   - ThemeProvider (next-themes class-based dark mode) per [[cockpit/shadcn-setup]]
//     decision 2026-05-12. Outermost wrapper so the `.dark` class flip affects all
//     descendants including TanStack Query state surfaces. `suppressHydrationWarning`
//     on <html> is REQUIRED — next-themes flips the class client-side; SSR-rendered
//     HTML may not match until hydration.
//   - TanStack QueryClient per-request via React.cache factory at
//     `lib/query-client.ts` (Vercel `server-no-shared-module-state` rule from
//     [[cockpit-stack-integration-research]] F8.13 + F5.6).
//   - <Toaster /> (sonner — replaces deprecated shadcn `toast` per upstream
//     2025 deprecation note). Mounted inside ThemeProvider so it reads theme
//     via useTheme() to sync light/dark toast appearance. Portaled overlay;
//     `toast()` calls from any descendant render here.
//   - Better Auth React client provider — DEFERRED to slice 8.3.2 when the
//     auth-client.ts module ships under modules/auth/api/.
//
// Anti-patterns enforced per [[cockpit-stack-integration-research]] F6 +
// Vercel skill rules:
//   - Outer layout MUST be a Server Component (F6.11). Client-side state via
//     <ReactQueryProviders> and <ThemeProvider> (Client Components) wrappers, not
//     'use client' here.
//   - No barrels (F6.15). Direct file imports throughout the cockpit tree.

import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import type { ReactNode } from 'react';
import { ThemeProvider } from '@/components/theme-provider';
import { Toaster } from '@/components/ui/sonner';
import { ReactQueryProviders } from '../lib/react-query-providers';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'BokChoy',
  description: 'Game economy backend for indie/SMB studios.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <ThemeProvider>
          <ReactQueryProviders>{children}</ReactQueryProviders>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
