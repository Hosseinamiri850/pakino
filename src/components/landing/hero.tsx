import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { ArrowLeft, ArrowRight, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { HeroUploader } from '@/components/uploader/hero-uploader';

export async function Hero() {
  const t = await getTranslations('hero');
  const locale = await getLocaleSafe();
  const Arrow = locale === 'fa' ? ArrowLeft : ArrowRight;

  return (
    <section className="relative overflow-hidden">
      <div className="absolute inset-0 -z-10 bg-grid opacity-30 [mask-image:radial-gradient(60%_50%_at_50%_0%,black,transparent)]" />
      <div className="absolute inset-0 -z-10 gradient-radial" />
      <div className="container flex flex-col items-center gap-10 py-16 text-center md:py-24">
        <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card/50 px-3 py-1 text-xs text-muted-foreground backdrop-blur">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          AI watermark removal
        </div>
        <div className="max-w-3xl">
          <h1 className="text-balance text-4xl font-semibold leading-tight tracking-tight sm:text-5xl md:text-6xl">
            {t('title')}
          </h1>
          <p className="mt-5 text-balance text-base text-muted-foreground sm:text-lg md:text-xl">
            {t('subtitle')}
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Button asChild size="lg">
            <Link href="/remove">
              {t('ctaPrimary')}
              <Arrow className="h-4 w-4" />
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="#how-it-works">{t('ctaSecondary')}</Link>
          </Button>
        </div>
        <div className="mt-4 w-full max-w-2xl">
          <HeroUploader />
        </div>
      </div>
    </section>
  );
}

async function getLocaleSafe() {
  const { getLocale } = await import('next-intl/server');
  return getLocale();
}
