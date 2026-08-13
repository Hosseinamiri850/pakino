import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { Logo } from './logo';

export function Footer() {
  const t = useTranslations('footer');
  const nav = useTranslations('nav');
  const legal = useTranslations('legal');
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-border/60 bg-background">
      <div className="container py-12">
        <div className="flex flex-col gap-8 md:flex-row md:items-start md:justify-between">
          <div className="max-w-xs">
            <Logo />
            <p className="mt-3 text-sm text-muted-foreground">{t('madeFor')}</p>
          </div>
          <div className="grid grid-cols-2 gap-8 sm:grid-cols-3">
            <div className="flex flex-col gap-2">
              <span className="text-sm font-semibold">{t('product')}</span>
              <Link href="/remove" className="text-sm text-muted-foreground hover:text-foreground">
                {nav('remove')}
              </Link>
              <Link href="/pricing" className="text-sm text-muted-foreground hover:text-foreground">
                {nav('pricing')}
              </Link>
            </div>
            <div className="flex flex-col gap-2">
              <span className="text-sm font-semibold">{t('resources')}</span>
              <Link href="/faq" className="text-sm text-muted-foreground hover:text-foreground">
                {nav('faq')}
              </Link>
            </div>
            <div className="flex flex-col gap-2">
              <span className="text-sm font-semibold">{t('legal')}</span>
              <Link href="/privacy" className="text-sm text-muted-foreground hover:text-foreground">
                {legal('privacy')}
              </Link>
              <Link href="/terms" className="text-sm text-muted-foreground hover:text-foreground">
                {legal('terms')}
              </Link>
            </div>
          </div>
        </div>
        <div className="mt-10 flex flex-col items-center justify-between gap-3 border-t border-border pt-6 text-xs text-muted-foreground sm:flex-row">
          <span>© {year} پاکینو</span>
          <span>{t('rights')}</span>
        </div>
      </div>
    </footer>
  );
}
