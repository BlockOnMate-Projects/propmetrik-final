'use client';

import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import en from '@/messages/en.json';
import fr from '@/messages/fr.json';

type Messages = typeof en;
type Locale = 'en' | 'fr';

const messages: Record<Locale, Messages> = { en, fr };

interface I18nContextType {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string) => string;
  availableLocales: { code: Locale; name: string }[];
}

const I18nContext = createContext<I18nContextType | null>(null);

function getNestedValue(obj: any, path: string): string {
  const keys = path.split('.');
  let current = obj;
  for (const key of keys) {
    if (current === undefined || current === null) return path;
    current = current[key];
  }
  return typeof current === 'string' ? current : path;
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('propmetrik-locale') as Locale;
      if (saved && messages[saved]) return saved;
    }
    return 'en';
  });

  const setLocale = useCallback((newLocale: Locale) => {
    setLocaleState(newLocale);
    if (typeof window !== 'undefined') {
      localStorage.setItem('propmetrik-locale', newLocale);
    }
  }, []);

  const t = useCallback((key: string): string => {
    return getNestedValue(messages[locale], key);
  }, [locale]);

  const availableLocales = [
    { code: 'en' as Locale, name: 'English' },
    { code: 'fr' as Locale, name: 'Français' },
  ];

  return (
    <I18nContext.Provider value={{ locale, setLocale, t, availableLocales }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) {
    // Return a fallback that uses English when provider is not mounted
    return {
      locale: 'en' as Locale,
      setLocale: () => {},
      t: (key: string) => getNestedValue(en, key),
      availableLocales: [{ code: 'en' as Locale, name: 'English' }],
    };
  }
  return context;
}
