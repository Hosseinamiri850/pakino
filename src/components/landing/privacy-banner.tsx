import { getTranslations } from 'next-intl/server';
import { ShieldCheck } from 'lucide-react';

export async function PrivacyBanner() {
  const t = await getTranslations('privacy');

  return (
    <section className="py-12 md:py-16">
      <div className="container">
        <div className="flex flex-col items-center gap-4 rounded-xl border border-border bg-card p-8 text-center sm:p-10">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <p className="max-w-xl text-balance text-sm text-muted-foreground">{t('autoDelete')}</p>
        </div>
      </div>
    </section>
  );
}
