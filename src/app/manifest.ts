import type { MetadataRoute } from 'next';
import { getEnv } from '@/lib/env';

export default function manifest(): MetadataRoute.Manifest {
  const base = getEnv().APP_URL;
  return {
    name: 'پاکینو | حذف واترمارک',
    short_name: 'پاکینو',
    description: 'حذف سریع و خودکار واترمارک تصاویر و ویدیوهای تولیدشده با هوش مصنوعی.',
    start_url: `${base}/fa`,
    scope: `${base}/`,
    display: 'standalone',
    background_color: '#0a0a0a',
    theme_color: '#0a0a0a',
    dir: 'rtl',
    lang: 'fa-IR',
    icons: [{ src: `${base}/icon.svg`, sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
  };
}
