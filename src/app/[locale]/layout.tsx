import type { ReactNode } from 'react';
import { NextIntlClientProvider } from 'next-intl';
import { notFound } from 'next/navigation';
import { setRequestLocale, getMessages } from 'next-intl/server';
import { Inter } from 'next/font/google';
import localFont from 'next/font/local';
import { dir, locales, defaultLocale, type Locale } from '@/i18n/config';
import { Navbar } from '@/components/layout/navbar';
import { Footer } from '@/components/layout/footer';
import '../globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
});

// IRANYekanX variable font (wght 100–1000, dots 0–4) — only mounted on fa pages.
const iranYekanX = localFont({
  src: '../fonts/IRANYekanXVF.woff',
  variable: '--font-yekan',
  weight: '100 1000',
  display: 'swap',
});

type Props = {
  children: ReactNode;
  params: Promise<{ locale: string }>;
};

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({ children, params }: Props) {
  const { locale } = await params;
  if (!locales.includes(locale as Locale)) notFound();
  setRequestLocale(locale);
  const direction = dir(locale as Locale) ?? dir(defaultLocale);
  const messages = await getMessages();

  return (
    <html
      lang={locale}
      dir={direction}
      className={locale === 'fa' ? `${inter.variable} ${iranYekanX.variable}` : inter.variable}
      suppressHydrationWarning
    >
      <body className="min-h-dvh bg-background font-sans text-foreground antialiased">
        <NextIntlClientProvider messages={messages}>
          <div className="flex min-h-dvh flex-col">
            <Navbar />
            <main className="flex-1">{children}</main>
            <Footer />
          </div>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
