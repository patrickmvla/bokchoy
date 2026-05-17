// Static syntax-highlighted code block for marketing surfaces per
// [[marketing/v1-shape]] (iii) + (v) production-grade gate: shiki at build
// time, no client-side highlighter. Marketing pages are heavy-traffic + SEO-
// adjacent; keeping the route bundle thin matters.
//
// Server Component — async render via shiki's codeToHtml. shiki internally
// memoises highlighters per (theme, lang) combo so repeated <CodeBlock />
// renders on the same page don't re-initialise. dangerouslySetInnerHTML is
// safe here because the input is hardcoded TS strings authored in this repo,
// NOT user-supplied content; XSS surface is zero.
//
// Theme choice: single dark theme ('github-dark') even when next-themes
// flips the cockpit chrome to light. Production-cited: Stripe, Resend, and
// shadcn's own marketing site render dark code blocks regardless of page
// theme. Reads as a code-editor convention rather than a chrome-theme
// inconsistency. Dual-theme support is a CSS-variable polish, deferrable.

import { codeToHtml } from 'shiki';
import { cn } from '@/lib/utils';

export interface CodeBlockProps {
  code: string;
  /** Shiki lang token. Defaults to 'ts' since the marketing surface is TS-focused. */
  lang?: string;
  /** Tailwind classes appended to the outer container. */
  className?: string;
  /** Visual treatment for snippets that show planned-but-unshipped API. */
  muted?: boolean;
}

export async function CodeBlock({
  code,
  lang = 'ts',
  className,
  muted = false,
}: CodeBlockProps) {
  const html = await codeToHtml(code, {
    lang,
    theme: 'github-dark',
  });

  return (
    <div
      className={cn(
        'overflow-x-auto rounded-lg border border-border bg-[#24292e] p-4 text-sm leading-relaxed [&_pre]:bg-transparent!',
        muted && 'opacity-60',
        className,
      )}
      // shiki output is hardcoded TS string → HTML; no user input
      // biome-ignore lint/security/noDangerouslySetInnerHtml: trusted authored content
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
