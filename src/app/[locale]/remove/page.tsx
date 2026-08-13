import { getTranslations, setRequestLocale } from 'next-intl/server';
import { RemoveClient } from '@/components/uploader/remove-client';
import { getEnv } from '@/lib/env';

type Props = { params: Promise<{ locale: string }> };

export default async function RemovePage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <RemoveClient maxImage={getEnv().MAX_IMAGE_SIZE} maxVideo={getEnv().MAX_VIDEO_SIZE} />;
}

export async function generateMetadata({ params }: Props) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'meta' });
  const nav = await getTranslations({ locale, namespace: 'nav' });
  return { title: nav('remove'), description: t('description'), alternates: { canonical: `/${locale}/remove` } };
}
