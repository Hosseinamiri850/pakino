'use client';

import { useEffect, useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { Link } from '@/i18n/routing';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { JobTracker } from '@/components/processing/job-tracker';
import { formatNumber } from '@/lib/utils';
import type { JobStatus, WatermarkInfo } from '@/lib/types';

type Account = { credits: number; plan: string; totalProcessed: number };
type RecentJob = {
  id: string;
  type: 'image' | 'video';
  status: JobStatus;
  progress: number;
  provider: string | null;
  watermarkType: string | null;
  createdAt: string;
  creditsUsed: number;
};

export function DashboardClient({ userId: _userId, focusJobId }: { userId: string; focusJobId?: string }) {
  void _userId;
  const t = useTranslations('dashboard');
  const locale = useLocale() as 'fa' | 'en';
  const [account, setAccount] = useState<Account | null>(null);
  const [recent, setRecent] = useState<RecentJob[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([fetch('/api/account').then((r) => r.json()), fetch('/api/jobs?limit=5').then((r) => r.json())])
      .then(([a, j]) => {
        setAccount(a as Account);
        setRecent(j.items ?? []);
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="container py-10">
      {focusJobId && <JobTracker jobId={focusJobId} />}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">{t('remainingCredits')}</CardTitle>
          </CardHeader>
          <CardContent>
            {loading || !account ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <>
                <div className="text-3xl font-semibold">{formatNumber(account.credits, locale)}</div>
                <div className="mt-2">
                  <Progress value={Math.min(100, (account.credits / 1000) * 100)} />
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t('of')} {formatNumber(1000, locale)} {t('currentPlan').includes('طرح') ? '' : ''}
                  </p>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">{t('currentPlan')}</CardTitle>
          </CardHeader>
          <CardContent>
            {loading || !account ? <Skeleton className="h-8 w-20" /> : <div className="text-2xl font-semibold">{account.plan}</div>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">{t('totalProcessed')}</CardTitle>
          </CardHeader>
          <CardContent>
            {loading || !account ? <Skeleton className="h-8 w-20" /> : <div className="text-2xl font-semibold">{formatNumber(account.totalProcessed, locale)}</div>}
          </CardContent>
        </Card>
      </div>

      <div className="mt-8 flex items-center justify-between">
        <h2 className="text-lg font-semibold">{t('recentJobs')}</h2>
        <Button asChild variant="outline" size="sm">
          <Link href="/dashboard/history">{t('viewAll')}</Link>
        </Button>
      </div>

      <div className="mt-4">
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : recent.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
              <p className="text-sm text-muted-foreground">{t('noJobs')}</p>
              <Button asChild>
                <Link href="/remove">{t('startProcessing')}</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {recent.map((job) => (
              <RecentJobRow key={job.id} job={job} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function RecentJobRow({ job }: { job: RecentJob }) {
  const t = useTranslations('dashboard');
  const tstage = useTranslations('stages');
  return (
    <div className="flex items-center justify-between rounded-lg border border-border bg-card p-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">
          {job.type === 'image' ? t('typeImage') : t('typeVideo')}
        </p>
        <p className="text-xs text-muted-foreground">{tstage(job.status)}</p>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-xs text-muted-foreground">{job.createdAt}</span>
        <Button asChild size="sm" variant="ghost">
          <Link href={`/dashboard?job=${job.id}`}>{t('view')}</Link>
        </Button>
      </div>
    </div>
  );
}

export type { Account, RecentJob };
export type { WatermarkInfo };
