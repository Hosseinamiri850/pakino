import type { ReactNode } from 'react';
import './globals.css';

export const metadata = {
  metadataBase: new URL('https://pakino.app'),
  title: {
    default: 'Pakino | AI Watermark Removal',
    template: '%s | Pakino',
  },
  description: 'Fast automatic AI watermark removal for images and videos.',
  applicationName: 'Pakino',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Pakino',
  },
  formatDetection: { telephone: false },
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    siteName: 'Pakino',
    title: 'Pakino | AI Watermark Removal',
    description: 'Fast automatic AI watermark removal for images and videos.',
  },
  twitter: { card: 'summary_large_image', title: 'Pakino', description: 'AI watermark removal' },
};

export const viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#0a0a0a' },
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
  ],
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return children;
}
