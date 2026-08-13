import { setRequestLocale } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { HistoryClient } from '@/components/dashboard/history-client';

type Props = { params: Promise<{ locale: string }> };

export default async function HistoryPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await getSession();
  if (!session) redirect(`/${locale}/login`);

  return <HistoryClient userId={session.userId} />;
}
