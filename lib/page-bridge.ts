import {
  pageCommandType,
  type PageCommand,
  type PageCommandResult,
} from '@/lib/page-command';

const contentScriptFile = '/content-scripts/content.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function errorText(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

function isMissingReceiver(cause: unknown): boolean {
  return /Receiving end does not exist|Could not establish connection/i.test(errorText(cause));
}

function isPortClosed(cause: unknown): boolean {
  return /message port closed/i.test(errorText(cause));
}

function asPageCommandResult(value: unknown): PageCommandResult {
  if (!isRecord(value)) {
    return { ok: false, error: 'The page returned an unexpected result.' };
  }
  if (value.ok === false && typeof value.error === 'string') {
    return { ok: false, error: value.error };
  }
  if (
    value.ok === true &&
    typeof value.url === 'string' &&
    typeof value.title === 'string' &&
    typeof value.page === 'string'
  ) {
    return { ok: true, url: value.url, title: value.title, page: value.page };
  }
  if (value.ok === true && typeof value.message === 'string') {
    return { ok: true, message: value.message };
  }
  return { ok: false, error: 'The page returned an unexpected result.' };
}

async function activeWebTab(): Promise<{ ok: true; tabId: number } | PageCommandResult> {
  const [tab] = await browser.tabs.query({
    active: true,
    currentWindow: true,
  });
  if (tab?.id == null || !tab.url || !/^https?:/i.test(tab.url)) {
    return {
      ok: false,
      error: 'The active tab is not an http(s) page.',
    };
  }
  return { ok: true, tabId: tab.id };
}

async function deliver(tabId: number, command: PageCommand): Promise<PageCommandResult> {
  try {
    return asPageCommandResult(await browser.tabs.sendMessage(tabId, command));
  } catch (cause) {
    if (isPortClosed(cause)) {
      return { ok: true, message: 'The page navigated. Call getBrowserState again.' };
    }
    if (!isMissingReceiver(cause)) {
      return { ok: false, error: errorText(cause) };
    }
  }

  try {
    await browser.scripting.executeScript({
      target: { tabId },
      files: [contentScriptFile],
    });
  } catch (cause) {
    return {
      ok: false,
      error: `The page controller is not running in this tab. Reload the page and try again. ${errorText(cause)}`,
    };
  }

  try {
    return asPageCommandResult(await browser.tabs.sendMessage(tabId, command));
  } catch (cause) {
    if (isPortClosed(cause)) {
      return { ok: true, message: 'The page navigated. Call getBrowserState again.' };
    }
    return { ok: false, error: errorText(cause) };
  }
}

export async function sendPageCommand(command: PageCommand): Promise<PageCommandResult> {
  const tab = await activeWebTab();
  if (!('tabId' in tab)) {
    return tab;
  }
  return deliver(tab.tabId, command);
}

export function getBrowserState(): Promise<PageCommandResult> {
  return sendPageCommand({ type: pageCommandType, action: 'getBrowserState' });
}

export function clickElement(index: number): Promise<PageCommandResult> {
  return sendPageCommand({ type: pageCommandType, action: 'clickElement', index });
}

export function inputText(index: number, text: string): Promise<PageCommandResult> {
  return sendPageCommand({ type: pageCommandType, action: 'inputText', index, text });
}

export function selectOption(index: number, optionText: string): Promise<PageCommandResult> {
  return sendPageCommand({
    type: pageCommandType,
    action: 'selectOption',
    index,
    optionText,
  });
}

export function scrollPage(options: {
  down: boolean;
  numPages: number;
  index?: number;
}): Promise<PageCommandResult> {
  return sendPageCommand({
    type: pageCommandType,
    action: 'scroll',
    down: options.down,
    numPages: options.numPages,
    ...(options.index === undefined ? {} : { index: options.index }),
  });
}
