'use client';

import { FormEvent, Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';

export default function SignInPage() {
    return (
        <Suspense fallback={null}>
            <SignInInner />
        </Suspense>
    );
}

function SignInInner() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { t } = useTranslation();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const callbackUrl = searchParams.get('callbackUrl') || '/dashboard';
    const passwordChanged = searchParams.get('changed') === '1';

    async function handleSubmit(e: FormEvent<HTMLFormElement>) {
        e.preventDefault();
        setError('');
        setIsLoading(true);

        try {
            const result = await signIn('credentials', {
                email,
                password,
                redirect: false,
            });

            if (result?.error) {
                setError(t('auth.invalid_credentials'));
            } else if (result?.ok) {
                router.push(callbackUrl);
            }
        } catch (err) {
            setError(t('auth.invalid_credentials'));
        } finally {
            setIsLoading(false);
        }
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
            <div className="w-full max-w-md">
                <div className="bg-white rounded-lg shadow-xl p-8">
                    <div className="text-center mb-8">
                        <h1 className="text-3xl font-bold text-gray-900">{t('auth.signin')}</h1>
                        <p className="text-gray-600 mt-2">A-Sisyphus</p>
                    </div>

                    {passwordChanged && !error && (
                        <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg mb-6 text-sm">
                            Ο κωδικός σου άλλαξε επιτυχώς. Συνδέσου με τον νέο σου κωδικό.
                        </div>
                    )}

                    {error && (
                        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
                            {error}
                        </div>
                    )}

                    <button
                        type="button"
                        onClick={() => signIn('azure-ad', { callbackUrl })}
                        className="w-full flex items-center justify-center gap-3 h-11 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 transition text-sm font-semibold text-gray-800 mb-4"
                    >
                        <svg viewBox="0 0 23 23" className="h-5 w-5" aria-hidden>
                            <rect x="1" y="1" width="10" height="10" fill="#F25022" />
                            <rect x="12" y="1" width="10" height="10" fill="#7FBA00" />
                            <rect x="1" y="12" width="10" height="10" fill="#00A4EF" />
                            <rect x="12" y="12" width="10" height="10" fill="#FFB900" />
                        </svg>
                        Σύνδεση με Microsoft
                    </button>

                    <div className="flex items-center gap-3 my-4">
                        <div className="flex-1 h-px bg-gray-200" />
                        <span className="text-[11px] uppercase tracking-wider text-gray-500">{t('auth.or') ?? 'ή'}</span>
                        <div className="flex-1 h-px bg-gray-200" />
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                {t('auth.email')}
                            </label>
                            <input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                {t('auth.password')}
                            </label>
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                placeholder="••••••••"
                            />
                        </div>

                        <Button
                            type="submit"
                            disabled={isLoading}
                            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 rounded-lg transition"
                        >
                            {isLoading ? t('common.loading') : t('auth.signin')}
                        </Button>
                    </form>

                    <div className="mt-6 text-center">
                        <p className="text-sm text-gray-600">
                            {t('auth.no_account')}{' '}
                            <a href="/auth/signup" className="text-blue-600 hover:text-blue-700 font-medium">
                                {t('auth.signup')}
                            </a>
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
