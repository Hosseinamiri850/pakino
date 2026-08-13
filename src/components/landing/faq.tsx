import { getTranslations } from 'next-intl/server';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';

export async function Faq() {
  const t = await getTranslations('faq');

  return (
    <section className="border-t border-border/60 py-16 md:py-24">
      <div className="container max-w-3xl">
        <h2 className="text-center text-3xl font-semibold tracking-tight sm:text-4xl">{t('title')}</h2>
        <Accordion type="single" collapsible className="mt-10">
          {[1, 2, 3, 4, 5].map((n) => (
            <AccordionItem key={n} value={`q${n}`}>
              <AccordionTrigger>{t(`items.q${n}`)}</AccordionTrigger>
              <AccordionContent>{t(`items.a${n}`)}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}
