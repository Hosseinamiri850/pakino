import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { Button } from '@/components/ui/button';

export async function FinalCta() {
  const t = await getTranslations('finalCta');

  return (
    <section className="border-t border-border/60 py-20 md:py-28">
      <div className="container">
        <div className="relative overflow-hidden rounded-2xl border border-border bg-card px-6 py-16 text-center md:py-20">
          <div className="absolute inset-0 -z-10 gradient-radial" />
          <h2 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl md:text-5xl">
            {t('title')}
          </h2>
          <p className="mt-3 text-muted-foreground">{t('subtitle')}</p>
          <Button asChild size="lg" className="mt-8">
            <Link href="/remove">{t('button')}</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
