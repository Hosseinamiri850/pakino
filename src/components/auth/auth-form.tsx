'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { loginSchema, registerSchema } from '@/lib/validation/auth';

type Props = { mode: 'login' | 'register' };

export function AuthForm({ mode }: Props) {
  const t = useTranslations('auth');
  const terr = useTranslations('errors');
  const router = useRouter();
  const [serverError, setServerError] = useState('');
  const isRegister = mode === 'register';

  const schema = isRegister ? registerSchema : loginSchema;

  const form = useForm({ resolver: zodResolver(schema), defaultValues: { email: '', password: '', confirmPassword: '' } });
  const {
    register: reg,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = form;

  const onSubmit = handleSubmit(async (values) => {
    setServerError('');
    const res = await fetch(`/api/auth/${mode}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(values),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      setServerError(terr(data.error ?? 'generic') ?? terr('generic'));
      return;
    }
    router.push('/dashboard');
    router.refresh();
  });

  return (
    <div className="w-full max-w-md">
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">
          {isRegister ? t('registerTitle') : t('loginTitle')}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {isRegister ? t('registerSubtitle') : t('loginSubtitle')}
        </p>
      </div>

      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <div className="space-y-1.5">
          <Label htmlFor="email">{t('email')}</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            aria-invalid={!!errors.email}
            {...reg('email')}
          />
          {errors.email && <p className="text-xs text-destructive">{String(errors.email.message)}</p>}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="password">{t('password')}</Label>
          <Input
            id="password"
            type="password"
            autoComplete={isRegister ? 'new-password' : 'current-password'}
            aria-invalid={!!errors.password}
            {...reg('password')}
          />
          {errors.password && <p className="text-xs text-destructive">{String(errors.password.message)}</p>}
        </div>

        {isRegister && (
          <div className="space-y-1.5">
            <Label htmlFor="confirmPassword">{t('confirmPassword')}</Label>
            <Input
              id="confirmPassword"
              type="password"
              autoComplete="new-password"
              aria-invalid={!!errors.confirmPassword}
              {...reg('confirmPassword')}
            />
            {errors.confirmPassword && (
              <p className="text-xs text-destructive">{String(errors.confirmPassword.message)}</p>
            )}
          </div>
        )}

        {serverError && <p className="text-sm text-destructive">{serverError}</p>}

        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
          {isRegister ? t('registerSubmit') : t('loginSubmit')}
        </Button>
      </form>
    </div>
  );
}
