'use client';

import { useEffect, useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { Link } from '@/i18n/routing';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Download, Eye } from 'lucide-react';
import { formatBytes, formatDate } from '@/lib/utils';
import type { JobDto } from '@/lib/types';

export function HistoryClient({ userId }: { userId: string }) {
  const t = useTranslations('dashboard');
  const locale = useLocale() as 'fa' | 'en';
  const [jobs, setJobs] = useState<JobDto[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/jobs?limit=50')
      .then((r) => r.json())
      .then((d) => setJobs(d.items ?? []))
      .finally(() => setLoading(false));
  }, [userId]);

  if (loading) {
    return (
      <div className="container py-10">
        <Skeleton className="mb-6 h-8 w-32" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="container py-10">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">{t('history')}</h1>

      {/* Desktop table */}
      <div className="hidden overflow-hidden rounded-xl border border-border md:block">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-3 text-start font-medium">{t('colFile')}</th>
              <th className="px-4 py-3 text-start font-medium">{t('colType')}</th>
              <th className="px-4 py-3 text-start font-medium">{t('colWatermark')}</th>
              <th className="px-4 py-3 text-start font-medium">{t('colStatus')}</th>
              <th className="px-4 py-3 text-start font-medium">{t('colDate')}</th>
              <th className="px-4 py-3 text-start font-medium">{t('colCredits')}</th>
              <th className="px-4 py-3 text-end font-medium">{t('colActions')}</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((job) => (
              <tr key={job.id} className="border-t border-border">
                <td className="max-w-40 truncate px-4 py-3">{job.originalFilename ?? '—'}</td>
                <td className="px-4 py-3">{job.type === 'image' ? t('typeImage') : t('typeVideo')}</td>
                <td className="px-4 py-3">{job.provider ?? '—'}</td>
                <td className="px-4 py-3">
                  <StatusBadge status={job.status} />
                </td>
                <td className="px-4 py-3 text-muted-foreground">{formatDate(job.createdAt, locale)}</td>
                <td className="px-4 py-3">{job.creditsUsed ?? '—'}</td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-1">
                    <Button asChild size="icon" variant="ghost">
                      <Link href={`/dashboard?job=${job.id}`} aria-label="view">
                        <Eye className="h-4 w-4" />
                      </Link>
                    </Button>
                    {job.outputUrl && (
                      <a href={job.outputUrl} download className="inline-flex h-9 w-9 items-center justify-center rounded-md hover:bg-accent" aria-label="download">
                        <Download className="h-4 w-4" />
                      </a>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="space-y-3 md:hidden">
        {jobs.map((job) => (
          <Card key={job.id} className="p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{job.originalFilename ?? '—'}</p>
                <p className="text-xs text-muted-foreground">
                  {job.type === 'image' ? t('typeImage') : t('typeVideo')} · {formatDate(job.createdAt, locale)}
                </p>
              </div>
              <StatusBadge status={job.status} />
            </div>
            <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
              <span>{job.provider ?? '—'}</span>
              <span>{formatBytes(job.inputSize ?? 0, locale)}</span>
            </div>
            <div className="mt-3 flex gap-2">
              <Button asChild size="sm" variant="outline" className="flex-1">
                <Link href={`/dashboard?job=${job.id}`}>{t('view')}</Link>
              </Button>
              {job.outputUrl && (
                <Button asChild size="sm" className="flex-1">
                  <a href={job.outputUrl} download>
                    {t('colActions')}
                  </a>
                </Button>
              )}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: JobDto['status'] }) {
  const variant: 'default' | 'destructive' | 'success' | 'secondary' =
    status === 'COMPLETED' ? 'success' : status === 'FAILED' ? 'destructive' : status === 'CANCELLED' ? 'secondary' : 'default';
  return <Badge variant={variant}>{status}</Badge>;
}
