import { getTranslations } from 'next-intl/server';
import { Eraser } from 'lucide-react';

export async function BeforeAfter() {
  const t = await getTranslations('beforeAfter');

  return (
    <section className="py-16 md:py-24">
      <div className="container">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">{t('title')}</h2>
          <p className="mt-2 text-muted-foreground">{t('subtitle')}</p>
        </div>
        <div className="mx-auto mt-10 grid max-w-4xl grid-cols-1 gap-4 sm:grid-cols-2">
          <figure className="relative aspect-video overflow-hidden rounded-xl border border-border bg-secondary">
            <div className="absolute inset-0 flex items-center justify-center">
              <Eraser className="h-10 w-10 text-muted-foreground" />
            </div>
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-background/90 to-transparent p-4">
              <span className="text-sm font-medium">{t('before')}</span>
            </div>
            <div className="absolute inset-0 bg-grid opacity-20" />
          </figure>
          <figure className="relative aspect-video overflow-hidden rounded-xl border border-primary/30 bg-card">
            <div className="absolute inset-0 flex items-center justify-center">
              <Eraser className="h-10 w-10 text-primary" />
            </div>
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-background/90 to-transparent p-4">
              <span className="text-sm font-medium">{t('after')}</span>
            </div>
          </figure>
        </div>
      </div>
    </section>
  );
}
