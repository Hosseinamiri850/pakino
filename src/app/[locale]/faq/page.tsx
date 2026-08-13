import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';

type Props = { params: Promise<{ locale: string }> };

export default async function FaqPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'faq' });

  return (
    <div className="container max-w-3xl py-16 md:py-24">
      <h1 className="text-center text-3xl font-semibold tracking-tight sm:text-4xl">{t('title')}</h1>
      <Accordion type="single" collapsible className="mt-10">
        {[1, 2, 3, 4, 5].map((n) => (
          <AccordionItem key={n} value={`q${n}`}>
            <AccordionTrigger>{t(`items.q${n}`)}</AccordionTrigger>
            <AccordionContent>{t(`items.a${n}`)}</AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );
}

export async function generateMetadata({ params }: Props) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'faq' });
  return { title: t('title'), alternates: { canonical: `/${locale}/faq` } };
}
