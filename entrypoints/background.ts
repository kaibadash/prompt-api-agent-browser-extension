import { generateWithPromptApi, supportsPromptApi } from '@/lib/prompt-model';

type GenerateTextRequest = {
  type: 'generate-text';
  prompt: string;
};

function isGenerateTextRequest(message: unknown): message is GenerateTextRequest {
  return (
    typeof message === 'object' &&
    message !== null &&
    'type' in message &&
    message.type === 'generate-text' &&
    'prompt' in message &&
    typeof message.prompt === 'string'
  );
}

export default defineBackground(() => {
  console.log('Hello background!', {
    id: browser.runtime.id,
    promptApi: supportsPromptApi(),
  });

  if (import.meta.env.CHROME) {
    void browser.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  }

  browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!isGenerateTextRequest(message)) {
      return;
    }

    generateWithPromptApi(message.prompt)
      .then((text) => {
        sendResponse({ ok: true, text });
      })
      .catch((error: unknown) => {
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        });
      });

    return true;
  });
});
