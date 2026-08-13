import { getTranslations } from 'next-intl/server';
import { Zap, Image as ImageIcon, ScanEye, ShieldCheck, Sparkles, Gauge } from 'lucide-react';

export async function Features() {
  const t = await getTranslations('features');
  const items = [
    { key: 'auto', icon: Zap },
    { key: 'imageVideo', icon: ImageIcon },
    { key: 'detect', icon: ScanEye },
    { key: 'private', icon: ShieldCheck },
    { key: 'quality', icon: Sparkles },
    { key: 'fast', icon: Gauge },
  ];

  return (
    <section className="border-t border-border/60 py-16 md:py-24">
      <div className="container">
        <h2 className="text-center text-3xl font-semibold tracking-tight sm:text-4xl">{t('title')}</h2>
        <div className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map(({ key, icon: Icon }) => (
            <div
              key={key}
              className="rounded-xl border border-border bg-card p-6 transition-colors hover:border-primary/40"
            >
              <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Icon className="h-5 w-5" />
              </div>
              <h3 className="mt-4 text-base font-semibold">{t(key)}</h3>
              <p className="mt-1.5 text-sm text-muted-foreground">{t(`${key}Desc`)}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
