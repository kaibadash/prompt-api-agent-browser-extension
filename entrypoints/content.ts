import { dispatchPageCommand, isPageCommand, type PageActions } from '@/lib/page-command';
import { PageController } from '@page-agent/page-controller';

declare global {
  var __promptApiPageController: boolean | undefined;
}

export default defineContentScript({
  matches: ['http://*/*', 'https://*/*'],
  runAt: 'document_idle',
  main() {
    if (globalThis.__promptApiPageController) {
      return;
    }
    globalThis.__promptApiPageController = true;

    const controller = new PageController({
      enableMask: false,
      viewportExpansion: 0,
      highlightOpacity: 0,
      highlightLabelOpacity: 0,
    });
    const page: PageActions = {
      getBrowserState: () => controller.getBrowserState(),
      clickElement: (index) => controller.clickElement(index),
      inputText: (index, text) => controller.inputText(index, text),
      selectOption: (index, optionText) => controller.selectOption(index, optionText),
      scroll: (options) => controller.scroll(options),
    };

    browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (!isPageCommand(message)) {
        return;
      }
      void dispatchPageCommand(page, message).then(sendResponse);
      return true;
    });
  },
});
