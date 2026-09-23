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
      'Run a JavaScript function body in the active page. The Prompt API cannot execute JavaScript; this tool does. The body may use document.querySelector and DOM APIs, and must return a JSON-serializable value. Do not wrap it in a function declaration.',
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
