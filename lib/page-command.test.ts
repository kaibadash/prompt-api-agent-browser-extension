import assert from 'node:assert/strict';
import test from 'node:test';
import {
  dispatchPageCommand,
  isPageCommand,
  type PageActions,
} from './page-command.ts';

const state = {
  url: 'https://example.test/',
  title: 'Example',
  header: 'header',
  content: 'x'.repeat(20),
  footer: 'footer',
};

function fakePage(overrides: Partial<PageActions> = {}): PageActions {
  return {
    getBrowserState: async () => state,
    clickElement: async () => ({ success: true, message: 'clicked' }),
    inputText: async () => ({ success: true, message: 'typed' }),
    selectOption: async () => ({ success: true, message: 'selected' }),
    scroll: async () => ({ success: true, message: 'scrolled' }),
    ...overrides,
  };
}

test('accepts indexed page commands and rejects scripts', () => {
  assert.equal(isPageCommand({ type: 'page-command', action: 'getBrowserState' }), true);
  assert.equal(
    isPageCommand({ type: 'page-command', action: 'clickElement', index: 3 }),
    true,
  );
  assert.equal(
    isPageCommand({
      type: 'page-command',
      action: 'inputText',
      index: 1,
      text: 'hello',
    }),
    true,
  );
  assert.equal(
    isPageCommand({
      type: 'page-command',
      action: 'scroll',
      down: true,
      numPages: 1,
    }),
    true,
  );
  assert.equal(isPageCommand({ type: 'page-command', action: 'executePageScript' }), false);
  assert.equal(isPageCommand({ type: 'page-command', action: 'clickElement', index: -1 }), false);
  assert.equal(isPageCommand({ type: 'page-command', action: 'clickElement' }), false);
});

test('returns a truncated page snapshot', async () => {
  const result = await dispatchPageCommand(fakePage(), {
    type: 'page-command',
    action: 'getBrowserState',
  }, 10);

  assert.equal(result.ok, true);
  if (!result.ok || !('page' in result)) {
    assert.fail('expected a page snapshot');
  }
  assert.equal(result.url, state.url);
  assert.match(result.page, /header/);
  assert.match(result.page, /footer/);
  assert.match(result.page, /\[truncated/);
  assert.match(result.page, /x{10}/);
  assert.doesNotMatch(result.page, /x{11}/);
});

test('asks for a fresh index when an action fails', async () => {
  const result = await dispatchPageCommand(
    fakePage({
      clickElement: async () => ({ success: false, message: 'missing element' }),
    }),
    { type: 'page-command', action: 'clickElement', index: 4 },
  );

  assert.equal(result.ok, false);
  if (result.ok) {
    assert.fail('expected a failure');
  }
  assert.match(result.error, /missing element/);
  assert.match(result.error, /getBrowserState/);
});

test('clamps a large scroll and keeps the element index', async () => {
  let received: { down: boolean; numPages: number; index?: number } | undefined;
  const result = await dispatchPageCommand(
    fakePage({
      scroll: async (options) => {
        received = options;
        return { success: true, message: 'scrolled' };
      },
    }),
    { type: 'page-command', action: 'scroll', down: false, numPages: 9, index: 2 },
  );

  assert.deepEqual(received, { down: false, numPages: 5, index: 2 });
  assert.equal(result.ok, true);
  if (!result.ok || !('message' in result)) {
    assert.fail('expected an action result');
  }
  assert.equal(result.message, 'scrolled');
});
