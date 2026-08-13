import { getTranslations } from 'next-intl/server';
import { Upload, ScanEye, Eraser, Download } from 'lucide-react';

export async function HowItWorks() {
  const t = await getTranslations('howItWorks');
  const steps = [
    { key: 'step1', icon: Upload },
    { key: 'step2', icon: ScanEye },
    { key: 'step3', icon: Eraser },
    { key: 'step4', icon: Download },
  ];

  return (
    <section id="how-it-works" className="py-16 md:py-24">
      <div className="container">
        <h2 className="text-center text-3xl font-semibold tracking-tight sm:text-4xl">{t('title')}</h2>
        <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map(({ key, icon: Icon }, i) => (
            <div key={key} className="relative flex flex-col items-center text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full border border-border bg-card text-primary">
                <Icon className="h-6 w-6" />
              </div>
              <span className="mt-4 text-xs font-medium text-muted-foreground">{String(i + 1).padStart(2, '0')}</span>
              <h3 className="mt-1 text-base font-semibold">{t(key)}</h3>
              <p className="mt-1.5 text-sm text-muted-foreground">{t(`${key}Desc`)}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
