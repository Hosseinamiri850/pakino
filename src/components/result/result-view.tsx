'use client';

import * as React from 'react';
import { useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { Link } from '@/i18n/routing';
import { Download, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { formatBytes, formatDate, formatDuration } from '@/lib/utils';
import type { JobDto } from '@/lib/types';

export function ResultView({ job }: { job: JobDto }) {
  const t = useTranslations('result');
  const tcommon = useTranslations('common');
  const locale = useLocale() as 'fa' | 'en';
  const [slider, setSlider] = useState(50);
  const isImage = job.type === 'image';

  return (
    <div className="mt-6 space-y-4">
      {isImage && job.outputUrl ? (
        <BeforeAfterSlider
          beforeUrl={job.inputUrl ?? ''}
          afterUrl={job.outputUrl}
          value={slider}
          onChange={setSlider}
        />
      ) : job.outputUrl ? (
        <div className="overflow-hidden rounded-xl border border-border bg-black">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <video src={job.outputUrl} controls className="w-full" />
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button asChild>
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a href={job.outputUrl ?? '#'} download>
            <Download className="h-4 w-4" />
            {isImage ? t('downloadImage') : t('downloadVideo')}
          </a>
        </Button>
        <Button asChild variant="outline">
          <Link href="/remove">
            <RefreshCw className="h-4 w-4" />
            {tcommon('processNew')}
          </Link>
        </Button>
      </div>

      <Card className="p-4">
        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <Field label={t('originalSize')} value={formatBytes(job.inputSize ?? 0, locale)} />
          <Field label={t('outputSize')} value={formatBytes(job.outputSize ?? 0, locale)} />
          {job.durationSeconds != null && (
            <Field label={t('duration')} value={formatDuration(job.durationSeconds, locale)} />
          )}
          {job.completedAt && <Field label={t('processingTime')} value={formatDate(job.completedAt, locale)} />}
          {job.provider && <Field label={t('provider')} value={job.provider} />}
          {job.confidence != null && (
            <Field label={t('confidence')} value={`${Math.round(job.confidence * 100)}%`} />
          )}
        </dl>
      </Card>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 font-medium">{value}</dd>
    </div>
  );
}

function BeforeAfterSlider({
  beforeUrl,
  afterUrl,
  value,
  onChange,
}: {
  beforeUrl: string;
  afterUrl: string;
  value: number;
  onChange: (v: number) => void;
}) {
  const t = useTranslations('beforeAfter');
  return (
    <div className="relative aspect-video select-none overflow-hidden rounded-xl border border-border bg-secondary">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={afterUrl} alt={t('after')} className="absolute inset-0 h-full w-full object-cover" draggable={false} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={beforeUrl}
        alt={t('before')}
        className="absolute inset-0 h-full w-full object-cover"
        draggable={false}
        style={{ clipPath: `inset(0 ${100 - value}% 0 0)` }}
      />
      <div className="absolute inset-y-0 w-0.5 bg-white shadow" style={{ insetInlineStart: `${value}%` }} aria-hidden />
      <input
        type="range"
        min={0}
        max={100}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={t('title')}
        className="absolute inset-0 h-full w-full cursor-ew-resize opacity-0"
      />
    </div>
  );
}
