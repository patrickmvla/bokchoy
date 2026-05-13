// Class-based dark mode via next-themes per [[cockpit/shadcn-setup]] +
// [[cockpit/shadcn-setup-research]] F5. Structure verbatim from
// shadcn-ui/ui templates/next-app/components/theme-provider.tsx HEAD 2026-05-12
// (suppressHydrationWarning on <html> in app/layout.tsx is required — next-themes
// flips the .dark class client-side; SSR-rendered HTML may not match until hydration).
//
// Bundled ThemeHotkey ("d" key toggles dark/light) ships canonical with typing-target
// guards (contentEditable / INPUT / TEXTAREA / SELECT). Harmless for B2B cockpit
// operators; remove if it ever collides with operator browser-extension shortcuts.

'use client';

import { ThemeProvider as NextThemesProvider, useTheme } from 'next-themes';
import * as React from 'react';

function ThemeProvider({
  children,
  ...props
}: React.ComponentProps<typeof NextThemesProvider>) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
      {...props}
    >
      <ThemeHotkey />
      {children}
    </NextThemesProvider>
  );
}

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return (
    target.isContentEditable ||
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT'
  );
}

function ThemeHotkey() {
  const { resolvedTheme, setTheme } = useTheme();

  React.useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.repeat) {
        return;
      }

      if (event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }

      // event.key can be undefined for synthetic keydown events fired by
      // password managers / autofill / IME composition. Optional chain
      // short-circuits to undefined which !== 'd', so we exit early.
      if (event.key?.toLowerCase() !== 'd') {
        return;
      }

      if (isTypingTarget(event.target)) {
        return;
      }

      setTheme(resolvedTheme === 'dark' ? 'light' : 'dark');
    }

    window.addEventListener('keydown', onKeyDown);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [resolvedTheme, setTheme]);

  return null;
}

export { ThemeProvider };
