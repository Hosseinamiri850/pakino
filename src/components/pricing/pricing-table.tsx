import { getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/routing';
import { cn } from '@/lib/utils';
import { PLANS } from '@/lib/plans';

export async function PricingTable() {
  const t = await getTranslations('pricing');

  return (
    <div>
      <div className="mx-auto max-w-2xl text-center">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{t('title')}</h1>
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
              <h2 className="text-lg font-semibold">{t(`plans.${plan.id}`)}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{t(`plans.${plan.id}Desc`)}</p>
              <div className="mt-5 flex items-baseline gap-1.5">
                <span className="text-3xl font-semibold">{plan.priceLabel}</span>
                <span className="text-sm text-muted-foreground">{t('perMonth')}</span>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                {plan.credits.toLocaleString()} {t('credits')}
              </p>
              <Button asChild className="mt-6" variant={popular ? 'default' : 'outline'}>
                <Link href="/register">{t('choose')}</Link>
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
