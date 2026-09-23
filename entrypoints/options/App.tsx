import { getDefaultInstructions, setDefaultInstructions } from '@/lib/page-agent';
import {
  getPromptLanguage,
  isPromptLanguage,
  setPromptLanguage,
  supportedPromptLanguages,
  type PromptLanguage,
} from '@/lib/prompt-model';
import { useEffect, useRef, useState, type ChangeEvent } from 'react';

const languageMessageName = {
  de: 'languageDe',
  en: 'languageEn',
  es: 'languageEs',
  fr: 'languageFr',
  ja: 'languageJa',
} as const satisfies Record<PromptLanguage, string>;

export default function App() {
  const [language, setLanguage] = useState<PromptLanguage | null>(null);
  const [instructions, setInstructions] = useState<string | null>(null);
  const savedInstructions = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([getPromptLanguage(), getDefaultInstructions()]).then(
      ([nextLanguage, nextInstructions]) => {
        if (!cancelled) {
          savedInstructions.current = nextInstructions;
          setLanguage(nextLanguage);
          setInstructions(nextInstructions);
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (instructions === null || instructions === savedInstructions.current) {
      return;
    }
    const timer = setTimeout(() => {
      savedInstructions.current = instructions;
      void setDefaultInstructions(instructions);
    }, 400);
    return () => {
      clearTimeout(timer);
    };
  }, [instructions]);

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
      <div className="field">
        <label htmlFor="default-instructions">
          {browser.i18n.getMessage('optionsInstructionsLabel')}
        </label>
        <textarea
          id="default-instructions"
          rows={6}
          value={instructions ?? ''}
          disabled={instructions === null}
          onChange={(event) => setInstructions(event.target.value)}
        />
        <p>{browser.i18n.getMessage('optionsInstructionsHint')}</p>
      </div>
    </main>
  );
}
