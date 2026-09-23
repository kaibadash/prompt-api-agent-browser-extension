import { browserAI, doesBrowserSupportBrowserAI } from '@browser-ai/core';
import { generateText } from 'ai';

export const supportedPromptLanguages = ['de', 'en', 'es', 'fr', 'ja'] as const;

export type PromptLanguage = (typeof supportedPromptLanguages)[number];

export const promptLanguageStorageKey = 'promptLanguage';

export function isPromptLanguage(value: unknown): value is PromptLanguage {
  return (
    typeof value === 'string' &&
    (supportedPromptLanguages as readonly string[]).includes(value)
  );
}

export function browserPromptLanguage(): PromptLanguage {
  const uiLanguage = browser.i18n.getUILanguage().toLowerCase();
  return (
    supportedPromptLanguages.find(
      (language) => uiLanguage === language || uiLanguage.startsWith(`${language}-`),
    ) ?? 'en'
  );
}

export async function getPromptLanguage(): Promise<PromptLanguage> {
  const stored = await browser.storage.local.get(promptLanguageStorageKey);
  const value = stored[promptLanguageStorageKey];
  return isPromptLanguage(value) ? value : browserPromptLanguage();
}

export async function setPromptLanguage(language: PromptLanguage): Promise<void> {
  await browser.storage.local.set({ [promptLanguageStorageKey]: language });
}

export function promptModelSettingsFor(language: PromptLanguage) {
  return {
    expectedInputs: [{ type: 'text' as const, languages: [language] }],
    expectedOutputs: [{ type: 'text' as const, languages: [language] }],
  };
}

export function supportsPromptApi(): boolean {
  return doesBrowserSupportBrowserAI();
}

export function createPromptModel(language: PromptLanguage) {
  return browserAI('text', promptModelSettingsFor(language));
}

export async function preparePromptModel(
  model?: ReturnType<typeof createPromptModel>,
  onDownloadProgress?: (progress: number) => void,
) {
  const resolved = model ?? createPromptModel(await getPromptLanguage());
  const availability = await resolved.availability();

  if (availability === 'unavailable') {
    throw new Error(browser.i18n.getMessage('modelUnavailable'));
  }

  if (availability === 'downloadable' || availability === 'downloading') {
    await resolved.createSessionWithProgress(onDownloadProgress);
  }

  return resolved;
}

export async function generateWithPromptApi(prompt: string): Promise<string> {
  const model = await preparePromptModel();
  const { text } = await generateText({ model, prompt });
  return text;
}
