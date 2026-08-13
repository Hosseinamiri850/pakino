import { setRequestLocale } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { DashboardClient } from '@/components/dashboard/dashboard-client';

type Props = { params: Promise<{ locale: string }> };

export default async function DashboardPage({ params, searchParams }: Props & { searchParams: Promise<{ job?: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await getSession();
  if (!session) redirect(`/${locale}/login`);
  const { job } = await searchParams;

  return <DashboardClient userId={session.userId} focusJobId={job} />;
}
