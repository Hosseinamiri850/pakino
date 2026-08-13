import { setRequestLocale } from 'next-intl/server';
import { AuthForm } from '@/components/auth/auth-form';

type Props = { params: Promise<{ locale: string }> };

export default async function RegisterPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <div className="container flex min-h-[70vh] items-center justify-center py-10">
      <AuthForm mode="register" />
    </div>
  );
}
