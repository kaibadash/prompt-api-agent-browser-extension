import {
  clickElement,
  getBrowserState,
  getPageInfo,
  inputText,
  scrollPage,
  selectOption,
} from '@/lib/page-bridge';
import { tool } from 'ai';
import { z } from 'zod';

const indexSchema = z
  .number()
  .int()
  .nonnegative()
  .describe('Index copied from the latest getBrowserState result, written there as [index].');

export const pageTools = {
  getPageInfo: tool({
    description:
      'Read the active http(s) tab to answer a question. Returns the title, URL, visible text, and interactive elements. This does not choose an element to click or type into.',
    inputSchema: z.object({
      hint: z
        .string()
        .describe('What the user wants to find. Used to focus the elements that are returned.')
        .optional(),
    }),
    execute: async ({ hint }) => getPageInfo(hint ?? ''),
  }),
  getBrowserState: tool({
    description:
      'List interactive elements on the active http(s) tab as [index], for clickElement, inputText, selectOption, and scroll. Call this before choosing an index and again after the page changes. Indexes from an older result are stale. To read the page, call getPageInfo instead.',
    inputSchema: z.object({}),
    execute: async () => getBrowserState(),
  }),
  clickElement: tool({
    description:
      'Click the element whose [index] comes from the latest getBrowserState result. Does not take a CSS selector or JavaScript.',
    inputSchema: z.object({
      index: indexSchema,
    }),
    execute: async ({ index }) => clickElement(index),
  }),
  inputText: tool({
    description:
      'Replace the value of the input, textarea, or contenteditable element at this index. The index comes from the latest getBrowserState result.',
    inputSchema: z.object({
      index: indexSchema,
      text: z.string().describe('The full text to put in the field.'),
    }),
    execute: async ({ index, text }) => inputText(index, text),
  }),
  selectOption: tool({
    description:
      'Select the option with this visible text in the select element at this index. The index comes from the latest getBrowserState result.',
    inputSchema: z.object({
      index: indexSchema,
      optionText: z.string().describe('Visible text of the option to select.'),
    }),
    execute: async ({ index, optionText }) => selectOption(index, optionText),
  }),
  scroll: tool({
    description:
      'Scroll vertically to reveal elements outside the viewport, then call getBrowserState again. Pass index to scroll that element\'s container.',
    inputSchema: z.object({
      down: z.boolean().describe('True scrolls down. False scrolls up.'),
      numPages: z
        .number()
        .positive()
        .describe('How many viewport heights to scroll. Values above 5 are clamped.'),
      index: indexSchema
        .optional()
        .describe('Scroll the container of this element instead of the page.'),
    }),
    execute: async ({ down, numPages, index }) => scrollPage({ down, numPages, index }),
  }),
};
