import { getTranslations, setRequestLocale } from 'next-intl/server';

type Props = { params: Promise<{ locale: string }> };

export default async function TermsPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const legal = await getTranslations({ locale, namespace: 'legal' });

  return (
    <div className="container max-w-3xl py-16 md:py-24">
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{legal('terms')}</h1>
      <div className="mt-8 space-y-4">
        <p className="text-sm leading-7 text-muted-foreground">{legal('responsibleUse')}</p>
        <p className="text-sm leading-7 text-muted-foreground">{legal('responsibleUseNotice')}</p>
      </div>
    </div>
  );
}

export async function generateMetadata({ params }: Props) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'legal' });
  return { title: t('terms'), alternates: { canonical: `/${locale}/terms` } };
}
