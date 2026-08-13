import { getTranslations } from 'next-intl/server';

const PROVIDERS = ['Hailuo', 'Veo', 'Kling', 'Sora', 'Seedance', 'Dola'] as const;

export async function Providers() {
  const t = await getTranslations('providers');

  return (
    <section className="border-t border-border/60 py-14">
      <div className="container">
        <h2 className="text-center text-xl font-medium text-muted-foreground">{t('title')}</h2>
        <p className="mt-1 text-center text-sm text-muted-foreground/70">{t('subtitle')}</p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          {PROVIDERS.map((p) => (
            <span
              key={p}
              className="rounded-lg border border-border bg-card px-5 py-2 text-sm font-medium tracking-tight"
            >
              {p}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
