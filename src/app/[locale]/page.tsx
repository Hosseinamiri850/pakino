import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Hero } from '@/components/landing/hero';
import { Features } from '@/components/landing/features';
import { HowItWorks } from '@/components/landing/how-it-works';
import { Providers } from '@/components/landing/providers';
import { BeforeAfter } from '@/components/landing/before-after';
import { PricingPreview } from '@/components/landing/pricing-preview';
import { Faq } from '@/components/landing/faq';
import { PrivacyBanner } from '@/components/landing/privacy-banner';
import { FinalCta } from '@/components/landing/final-cta';

type Props = { params: Promise<{ locale: string }> };

export default async function HomePage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'SoftwareApplication',
            name: 'Pakino',
            applicationCategory: 'MultimediaApplication',
            operatingSystem: 'Web',
            inLanguage: ['fa', 'en'],
            offers: { '@type': 'Offer', price: '0', priceCurrency: 'IRR' },
          }),
        }}
      />
      <Hero />
      <Features />
      <HowItWorks />
      <Providers />
      <BeforeAfter />
      <PricingPreview />
      <PrivacyBanner />
      <Faq />
      <FinalCta />
    </>
  );
}

export async function generateMetadata({ params }: Props) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'meta' });
  return {
    title: t('title'),
    description: t('description'),
    alternates: { canonical: `/${locale}` },
    openGraph: { title: t('ogTitle'), description: t('ogDescription'), locale: locale === 'fa' ? 'fa_IR' : 'en_US' },
  };
}
