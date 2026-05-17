// Pricing placeholder per [[marketing/v1-shape]] Cascade obligation #4.
// Copy verbatim from the vault:
//   "Usage-based pricing. Free during private beta. Contact for
//    production estimates."
//
// Lives behind the (marketing)/ route group → shares chrome (top-nav +
// footer) with the apex landing. Server Component.
//
// Revisit trigger per [[marketing/v1-shape]] *Revisit when* — when
// billing infrastructure ships AND there's a committed price sheet to
// publish. Until then, the placeholder is honest (we don't know our
// production pricing yet) and the mailto: hands the prospect to the
// human team.

export default function PricingPage() {
  return (
    <section className="mx-auto flex max-w-3xl flex-col items-center gap-5 px-4 py-24 text-center sm:py-32">
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
        Pricing
      </h1>
      <p className="text-base text-muted-foreground sm:text-lg">
        Usage-based pricing. Free during private beta.
      </p>
      <p className="max-w-xl text-sm text-muted-foreground">
        Production estimates are scoped to your transaction volume and retention
        window.{' '}
        <a
          href="mailto:hello@bokchoy.com"
          className="text-foreground underline-offset-4 hover:underline"
        >
          Contact us
        </a>{' '}
        with a rough volume estimate and we will get you a number.
      </p>
    </section>
  );
}
