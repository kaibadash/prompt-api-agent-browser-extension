export const pageCommandType = 'page-command';

const maxScrollPages = 5;

export type BrowserStateSnapshot = {
  url: string;
  title: string;
  header: string;
  content: string;
  footer: string;
};

export type PageActionOutcome = {
  success: boolean;
  message: string;
};

export type PageActions = {
  getBrowserState(): Promise<BrowserStateSnapshot>;
  clickElement(index: number): Promise<PageActionOutcome>;
  inputText(index: number, text: string): Promise<PageActionOutcome>;
  selectOption(index: number, optionText: string): Promise<PageActionOutcome>;
  scroll(options: {
    down: boolean;
    numPages: number;
    index?: number;
  }): Promise<PageActionOutcome>;
};

export type PageCommand =
  | { type: typeof pageCommandType; action: 'getBrowserState' }
  | { type: typeof pageCommandType; action: 'clickElement'; index: number }
  | { type: typeof pageCommandType; action: 'inputText'; index: number; text: string }
  | {
      type: typeof pageCommandType;
      action: 'selectOption';
      index: number;
      optionText: string;
    }
  | {
      type: typeof pageCommandType;
      action: 'scroll';
      down: boolean;
      numPages: number;
      index?: number;
    };

export type PageCommandResult =
  | { ok: true; url: string; title: string; page: string }
  | { ok: true; message: string }
  | { ok: false; error: string };

function isIndex(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function isPageCommand(value: unknown): value is PageCommand {
  if (!isRecord(value) || value.type !== pageCommandType || typeof value.action !== 'string') {
    return false;
  }

  switch (value.action) {
    case 'getBrowserState':
      return true;
    case 'clickElement':
      return isIndex(value.index);
    case 'inputText':
      return isIndex(value.index) && typeof value.text === 'string';
    case 'selectOption':
      return isIndex(value.index) && typeof value.optionText === 'string';
    case 'scroll':
      return (
        typeof value.down === 'boolean' &&
        typeof value.numPages === 'number' &&
        Number.isFinite(value.numPages) &&
        value.numPages > 0 &&
        (value.index === undefined || isIndex(value.index))
      );
    default:
      return false;
  }
}

function withActionHint(error: string): string {
  return `${error} Countermeasure: call getBrowserState again and use an index from that result.`;
}

function formatPage(snapshot: BrowserStateSnapshot, maxContentChars: number): string {
  const content =
    snapshot.content.length > maxContentChars
      ? `${snapshot.content.slice(0, maxContentChars)}\n[truncated: call scroll, then getBrowserState again]`
      : snapshot.content;
  return `${snapshot.header}\n${content}\n${snapshot.footer}`;
}

function actionResult(result: PageActionOutcome): PageCommandResult {
  if (!result.success) {
    return { ok: false, error: withActionHint(result.message) };
  }
  return { ok: true, message: result.message };
}

export async function dispatchPageCommand(
  page: PageActions,
  command: PageCommand,
  maxContentChars = 8_000,
): Promise<PageCommandResult> {
  try {
    switch (command.action) {
      case 'getBrowserState': {
        const snapshot = await page.getBrowserState();
        return {
          ok: true,
          url: snapshot.url,
          title: snapshot.title,
          page: formatPage(snapshot, maxContentChars),
        };
      }
      case 'clickElement':
        return actionResult(await page.clickElement(command.index));
      case 'inputText':
        return actionResult(await page.inputText(command.index, command.text));
      case 'selectOption':
        return actionResult(await page.selectOption(command.index, command.optionText));
      case 'scroll':
        return actionResult(
          await page.scroll({
            down: command.down,
            numPages: Math.min(command.numPages, maxScrollPages),
            ...(command.index === undefined ? {} : { index: command.index }),
          }),
        );
    }
  } catch (cause) {
    return {
      ok: false,
      error: withActionHint(cause instanceof Error ? cause.message : String(cause)),
    };
  }
}
