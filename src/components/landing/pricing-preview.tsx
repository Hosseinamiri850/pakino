import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { PLANS } from '@/lib/plans';

export async function PricingPreview() {
  const t = await getTranslations('pricing');

  return (
    <section className="border-t border-border/60 py-16 md:py-24">
      <div className="container">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">{t('title')}</h2>
          <p className="mt-2 text-muted-foreground">{t('subtitle')}</p>
        </div>
        <div className="mx-auto mt-12 grid max-w-4xl grid-cols-1 gap-4 md:grid-cols-3">
          {PLANS.map((plan) => {
            const popular = plan.id === 'mvp';
            return (
              <div
                key={plan.id}
                className={cn(
                  'relative flex flex-col rounded-xl border bg-card p-6',
                  popular ? 'border-primary/50 shadow-md' : 'border-border',
                )}
              >
                {popular && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground">
                    {t('mostPopular')}
                  </span>
                )}
                <h3 className="text-lg font-semibold">{t(`plans.${plan.id}`)}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{t(`plans.${plan.id}Desc`)}</p>
                <div className="mt-5 flex items-baseline gap-1">
                  <span className="text-3xl font-semibold">{plan.priceLabel}</span>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {plan.credits.toLocaleString()} {t('credits')}
                </p>
                <Button asChild className="mt-6" variant={popular ? 'default' : 'outline'}>
                  <Link href="/pricing">{t('choose')}</Link>
                </Button>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
