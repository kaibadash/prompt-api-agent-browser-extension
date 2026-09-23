import { executePageScript, getPageInfo, inspectSelector } from '@/lib/page-bridge';
import { tool } from 'ai';
import { z } from 'zod';

export const pageTools = {
  getPageInfo: tool({
    description:
      'Read the active http(s) tab. Returns the title, URL, visible text, and interactive elements with CSS selectors. Call this before generating selectors or page scripts.',
    inputSchema: z.object({
      hint: z
        .string()
        .describe(
          'What the user wants to find or change. Used to focus the elements that are returned.',
        )
        .optional(),
    }),
    execute: async ({ hint }) => getPageInfo(hint ?? ''),
  }),
  inspectSelector: tool({
    description:
      'Check a CSS selector you generated against the active page. Returns how many elements match and a short description of the first matches.',
    inputSchema: z.object({
      selector: z
        .string()
        .describe('CSS selector generated for the element to operate on.'),
    }),
    execute: async ({ selector }) => inspectSelector(selector),
  }),
  executePageScript: tool({
    description:
      'Runs the code argument in the active tab and returns the result. Calling this tool performs the action. It is not a code generator. Use it for every page change, including when the user asks to run a script you already wrote. The code is a function body: it may use document.querySelector and DOM APIs, must return a JSON-serializable value, and must not be wrapped in a function declaration.',
    inputSchema: z.object({
      code: z
        .string()
        .describe(
          'JavaScript function body that performs the requested page operation and returns a JSON-serializable result.',
        ),
    }),
    execute: async ({ code }) => executePageScript(code),
  }),
};
