/** Server Component: shiki build-time syntax highlighting. dangerouslySetInnerHTML safe — hardcoded TS strings, no user input. */

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
