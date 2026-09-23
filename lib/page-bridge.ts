import {
  pageCommandType,
  type PageCommand,
  type PageCommandResult,
} from '@/lib/page-command';

const contentScriptFile = '/content-scripts/content.js';

type PageElement = {
  tag: string;
  type: string;
  role: string;
  name: string;
  text: string;
  selector: string;
};

export type PageSnapshot = {
  ok: true;
  url: string;
  title: string;
  text: string;
  elements: PageElement[];
};

function readPageSnapshot(hint: string) {
  function cssPath(element: Element): string {
    const parts: string[] = [];
    let current: Element | null = element;
    while (current && current !== document.body && parts.length < 5) {
      if (current.id) {
        parts.unshift(`#${CSS.escape(current.id)}`);
        break;
      }
      const tagName = current.tagName;
      const tag = tagName.toLowerCase();
      const parent: Element | null = current.parentElement;
      const same = parent
        ? [...parent.children].filter((child) => child.tagName === tagName)
        : [];
      const nth = same.length > 1 ? `:nth-of-type(${same.indexOf(current) + 1})` : '';
      parts.unshift(`${tag}${nth}`);
      current = parent;
    }
    return parts.join(' > ');
  }

  function describe(element: Element) {
    const tag = element.tagName.toLowerCase();
    const type = element.getAttribute('type') ?? '';
    const role = element.getAttribute('role') ?? '';
    const name =
      element.getAttribute('name') ??
      element.getAttribute('aria-label') ??
      element.getAttribute('placeholder') ??
      '';
    const text = (element.textContent ?? '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 140);
    let selector = '';
    if (element.id) {
      selector = `#${CSS.escape(element.id)}`;
    } else if (element.getAttribute('name')) {
      selector = `${tag}[name="${CSS.escape(element.getAttribute('name') ?? '')}"]`;
    } else if (element.getAttribute('aria-label')) {
      selector = `${tag}[aria-label="${CSS.escape(element.getAttribute('aria-label') ?? '')}"]`;
    } else if (element.getAttribute('placeholder')) {
      selector = `${tag}[placeholder="${CSS.escape(element.getAttribute('placeholder') ?? '')}"]`;
    }
    if (!selector) {
      selector = cssPath(element);
    }
    return { tag, type, role, name, text, selector };
  }

  const described: PageElement[] = [];
  const nodes = document.querySelectorAll(
    'a, button, input, textarea, select, summary, [role="button"], [role="link"], [role="textbox"], [contenteditable="true"]',
  );
  for (const element of nodes) {
    if (!(element instanceof HTMLElement)) {
      continue;
    }
    if (element.getAttribute('type') === 'hidden') {
      continue;
    }
    const rect = element.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) {
      continue;
    }
    described.push(describe(element));
    if (described.length >= 80) {
      break;
    }
  }

  const needle = hint.trim().toLowerCase();
  const focused = needle
    ? described.filter((item) =>
        `${item.text} ${item.name} ${item.selector}`.toLowerCase().includes(needle),
      )
    : described;
  const elements = (focused.length > 0 ? focused : described).slice(0, 25);
  const text = (document.body?.innerText ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 2_500);

  return {
    url: location.href,
    title: document.title,
    text,
    elements,
  };
}

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

export async function getPageInfo(
  hint = '',
): Promise<PageSnapshot | { ok: false; error: string }> {
  const tab = await activeWebTab();
  if (!('tabId' in tab)) {
    return tab.ok === false
      ? tab
      : { ok: false, error: 'The active tab is not an http(s) page.' };
  }
  try {
    const [injected] = await browser.scripting.executeScript({
      target: { tabId: tab.tabId },
      func: readPageSnapshot,
      args: [hint],
    });
    if (!injected?.result) {
      return { ok: false, error: 'The page returned no snapshot.' };
    }
    return { ok: true, ...injected.result };
  } catch (cause) {
    return { ok: false, error: errorText(cause) };
  }
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
