'use client';

import { useEffect, useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { Loader2, CheckCircle2, XCircle, Info } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { ResultView } from '@/components/result/result-view';
import { formatNumber } from '@/lib/utils';
import type { JobDto } from '@/lib/types';

export function JobTracker({ jobId }: { jobId: string }) {
  const t = useTranslations('stages');
  const terr = useTranslations('errors');
  const locale = useLocale() as 'fa' | 'en';
  const [job, setJob] = useState<JobDto | null>(null);

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;

    async function poll() {
      const res = await fetch(`/api/jobs/${jobId}`);
      const data = (await res.json()) as JobDto;
      if (!active) return;
      setJob(data);
      const done = data.status === 'COMPLETED' || data.status === 'FAILED' || data.status === 'CANCELLED';
      if (!done) timer = setTimeout(poll, 1500);
    }

    poll();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [jobId]);

  if (!job) {
    return <div className="flex items-center justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }

  const done = job.status === 'COMPLETED';
  const failed = job.status === 'FAILED';

  return (
    <div className="mb-8 rounded-xl border border-border bg-card p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {job.status === 'COMPLETED' ? (
            <CheckCircle2 className="h-5 w-5 text-emerald-400" />
          ) : failed ? (
            <XCircle className="h-5 w-5 text-destructive" />
          ) : (
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          )}
          <span className="text-sm font-medium">{t(job.status)}</span>
        </div>
        <Badge variant="secondary">
          {locale === 'fa' ? formatNumber(job.progress, locale) : job.progress}%
        </Badge>
      </div>

      <div className="mt-3">
        <Progress value={job.progress} />
      </div>

      {job.provider && (
        <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Info className="h-3.5 w-3.5" />
          {job.provider}
        </p>
      )}

      {failed && (
        <p className="mt-3 text-sm text-destructive">{terr(job.errorCode ?? 'generic') ?? terr('generic')}</p>
      )}

      {done && !job.outputUrl && job.errorCode === 'NO_WATERMARK_DETECTED' && (
        <p className="mt-3 text-sm text-muted-foreground">{terr('NO_WATERMARK_DETECTED')}</p>
      )}

      {done && job.outputUrl && <ResultView job={job} />}
    </div>
  );
}
