import Link from 'next/link';
import { defaultLocale } from '@/i18n/config';

export default function NotFound() {
  return (
    <div className="container flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
      <p className="text-6xl font-semibold">404</p>
      <p className="text-muted-foreground">Not found</p>
      <Link href={`/${defaultLocale}`} className="text-primary underline">
        Home
      </Link>
    </div>
  );
}
