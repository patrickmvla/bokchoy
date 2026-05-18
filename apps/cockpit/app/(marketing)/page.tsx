/** Apex marketing landing. S-walkthrough composition per [[marketing/v1-shape]] (v). */

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
