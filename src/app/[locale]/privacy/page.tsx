import { getTranslations, setRequestLocale } from 'next-intl/server';

type Props = { params: Promise<{ locale: string }> };

export default async function PrivacyPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'privacy' });

  const items = ['statement', 'filesUsed', 'autoDelete', 'manualDelete', 'payment', 'retention'] as const;

  return (
    <div className="container max-w-3xl py-16 md:py-24">
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{t('title')}</h1>
      <div className="mt-8 space-y-4">
        {items.map((k) => (
          <p key={k} className="text-sm leading-7 text-muted-foreground">
            {t(k)}
          </p>
        ))}
      </div>
    </div>
  );
}

export async function generateMetadata({ params }: Props) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'privacy' });
  return { title: t('title'), alternates: { canonical: `/${locale}/privacy` } };
}
