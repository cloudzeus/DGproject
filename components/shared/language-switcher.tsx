'use client';

import { useTranslation } from 'react-i18next';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';

export function LanguageSwitcher() {
    const { i18n } = useTranslation();
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    const languages = [
        { code: 'en', name: '🇺🇸 English' },
        { code: 'es', name: '🇪🇸 Español' },
        { code: 'fr', name: '🇫🇷 Français' },
        { code: 'de', name: '🇩🇪 Deutsch' },
        { code: 'pt', name: '🇵🇹 Português' },
        { code: 'ja', name: '🇯🇵 日本語' },
        { code: 'zh', name: '🇨🇳 中文' },
    ];

    if (!mounted) {
        return null;
    }

    return (
        <div className="flex gap-2">
            {languages.map((lang) => (
                <Button
                    key={lang.code}
                    onClick={() => i18n.changeLanguage(lang.code)}
                    variant={i18n.language === lang.code ? 'primary' : 'secondary'}
                    size="sm"
                    className="text-xs"
                >
                    {lang.name}
                </Button>
            ))}
        </div>
    );
}
