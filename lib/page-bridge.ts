const MAX_SCRIPT_CHARS = 6_000;

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

export type PageFailure = {
  ok: false;
  error: string;
};

type SelectorInspection = {
  ok: true;
  selector: string;
  count: number;
  matches: Array<{ tag: string; text: string }>;
};

type ScriptExecution = {
  ok: true;
  result: unknown;
};

function readPageSnapshot(hint: string) {
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

function inspectSelectorInPage(selector: string) {
  let nodes: NodeListOf<Element>;
  try {
    nodes = document.querySelectorAll(selector);
  } catch (cause) {
    return {
      error: cause instanceof Error ? cause.message : String(cause),
    };
  }
  return {
    count: nodes.length,
    matches: [...nodes].slice(0, 5).map((element) => ({
      tag: element.tagName.toLowerCase(),
      text: (element.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 160),
    })),
  };
}

async function activeWebTab(): Promise<
  { ok: true; tabId: number } | PageFailure
> {
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

export async function getPageInfo(
  hint = '',
): Promise<PageSnapshot | PageFailure> {
  const tab = await activeWebTab();
  if (!tab.ok) {
    return tab;
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
    return {
      ok: false,
      error: cause instanceof Error ? cause.message : String(cause),
    };
  }
}

export async function inspectSelector(
  selector: string,
): Promise<SelectorInspection | PageFailure> {
  const tab = await activeWebTab();
  if (!tab.ok) {
    return tab;
  }
  try {
    const [injected] = await browser.scripting.executeScript({
      target: { tabId: tab.tabId },
      func: inspectSelectorInPage,
      args: [selector],
    });
    const result = injected?.result;
    if (result && typeof result.count === 'number' && result.matches) {
      return {
        ok: true,
        selector,
        count: result.count,
        matches: result.matches,
      };
    }
    return {
      ok: false,
      error:
        result && 'error' in result && result.error
          ? result.error
          : 'The selector could not be checked.',
    };
  } catch (cause) {
    return {
      ok: false,
      error: cause instanceof Error ? cause.message : String(cause),
    };
  }
}

export async function userScriptsAvailable(): Promise<boolean> {
  try {
    await browser.userScripts.getScripts();
    return true;
  } catch {
    return false;
  }
}

export async function executePageScript(
  code: string,
): Promise<ScriptExecution | PageFailure> {
  const source = code.trim();
  if (!source) {
    return { ok: false, error: 'The page script is empty.' };
  }
  if (source.length > MAX_SCRIPT_CHARS) {
    return {
      ok: false,
      error: `The page script exceeds ${MAX_SCRIPT_CHARS} characters.`,
    };
  }
    if (!await userScriptsAvailable()) {
    return {
      ok: false,
      error:
        'User Scripts are disabled. Ask the user to open chrome://extensions, open this extension\'s details, and turn on Allow User Scripts.',
    };
  }

  const tab = await activeWebTab();
  if (!tab.ok) {
    return tab;
  }

  const wrapped = `(() => {
    const value = (() => {
      ${source}
    })();
    return JSON.parse(JSON.stringify(value ?? null));
  })()`;

  try {
    const [injected] = await browser.userScripts.execute({
      target: { tabId: tab.tabId },
      injectImmediately: true,
      world: 'USER_SCRIPT',
      js: [{ code: wrapped }],
    });
    if (!injected) {
      return { ok: false, error: 'The page script returned no result.' };
    }
    if (injected.error) {
      return { ok: false, error: injected.error };
    }
    return { ok: true, result: injected.result };
  } catch (cause) {
    return {
      ok: false,
      error: cause instanceof Error ? cause.message : String(cause),
    };
  }
}
