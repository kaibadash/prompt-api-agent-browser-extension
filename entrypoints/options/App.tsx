import {
  getPromptLanguage,
  isPromptLanguage,
  setPromptLanguage,
  supportedPromptLanguages,
  type PromptLanguage,
} from '@/lib/prompt-model';
import { useEffect, useState, type ChangeEvent } from 'react';

const languageMessageName = {
  de: 'languageDe',
  en: 'languageEn',
  es: 'languageEs',
  fr: 'languageFr',
  ja: 'languageJa',
} as const satisfies Record<PromptLanguage, string>;

export default function App() {
  const [language, setLanguage] = useState<PromptLanguage | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getPromptLanguage().then((value) => {
      if (!cancelled) {
        setLanguage(value);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  function onLanguageChange(event: ChangeEvent<HTMLSelectElement>) {
    const next = event.target.value;
    if (!isPromptLanguage(next)) {
      return;
    }
    setLanguage(next);
    void setPromptLanguage(next);
  }

  return (
    <main>
      <h1>{browser.i18n.getMessage('optionsTitle')}</h1>
      <label htmlFor="prompt-language">
        {browser.i18n.getMessage('optionsLanguageLabel')}
      </label>
      <select
        id="prompt-language"
        value={language ?? ''}
        disabled={language === null}
        onChange={onLanguageChange}
      >
        {supportedPromptLanguages.map((code) => (
          <option key={code} value={code}>
            {browser.i18n.getMessage(languageMessageName[code])}
          </option>
        ))}
      </select>
      <p>{browser.i18n.getMessage('optionsLanguageHint')}</p>
    </main>
  );
}
