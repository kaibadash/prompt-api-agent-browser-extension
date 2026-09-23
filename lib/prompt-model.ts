import { browserAI, doesBrowserSupportBrowserAI } from '@browser-ai/core';
import { generateText } from 'ai';

export function supportsPromptApi(): boolean {
  return doesBrowserSupportBrowserAI();
}

export function createPromptModel() {
  return browserAI();
}

export async function preparePromptModel(
  model = createPromptModel(),
  onDownloadProgress?: (progress: number) => void,
) {
  const availability = await model.availability();

  if (availability === 'unavailable') {
    throw new Error(browser.i18n.getMessage('modelUnavailable'));
  }

  if (availability === 'downloadable' || availability === 'downloading') {
    await model.createSessionWithProgress(onDownloadProgress);
  }

  return model;
}

export async function generateWithPromptApi(prompt: string): Promise<string> {
  const model = await preparePromptModel();
  const { text } = await generateText({ model, prompt });
  return text;
}
