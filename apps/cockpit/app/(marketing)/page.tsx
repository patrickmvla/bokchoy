// Apex marketing landing per [[marketing/v1-shape]] (v) S-walkthrough page
// structure. Lands the four-section sequence committed by Cascade #9:
//
//   1. Hero            — α-shape copy + V2 code-as-hero snippet
//   2. Features grid   — 3-pillar (audit-log primary, Postgres-native
//                        secondary, defense-in-depth tertiary)
//   3. Code walkthrough — credit + debit (shipped) + balance + history
//                        (Coming soon, visually muted)
//   4. CTA strip       — Start free → /sign-up + Read the docs
//
// Footer is provided by the (marketing)/ layout (slice M-3) so this page
// composition is the four sections above.
//
// All sections are Server Components. The code blocks are async-rendered
// at build time via shiki per [[marketing/v1-shape]] production-grade gate.
// Page-level bundle weight stays near-zero (no client-side highlighter).
//
// Copy is PLACEHOLDER QUALITY per M-5 contract — the actual marketing copy
// authoring session is a separate work item. Structure ships at M-5; copy
// polishes after.

import { MarketingCodeWalkthrough } from '@/modules/marketing/components/code-walkthrough';
import { MarketingCtaStrip } from '@/modules/marketing/components/cta-strip';
import { MarketingFeaturesGrid } from '@/modules/marketing/components/features-grid';
import { MarketingHero } from '@/modules/marketing/components/hero';

export default function MarketingHomePage() {
  return (
    <>
      <MarketingHero />
      <MarketingFeaturesGrid />
      <MarketingCodeWalkthrough />
      <MarketingCtaStrip />
    </>
  );
}
