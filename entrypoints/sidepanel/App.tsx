import { useChat } from '@ai-sdk/react';
import { createPageAgent } from '@/lib/page-agent';
import { userScriptsAvailable } from '@/lib/page-bridge';
import {
  browserPromptLanguage,
  createPromptModel,
  getPromptLanguage,
  isPromptLanguage,
  promptLanguageStorageKey,
  promptModelSettingsFor,
  type PromptLanguage,
} from '@/lib/prompt-model';
import { DirectChatTransport } from 'ai';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type MouseEvent,
} from 'react';

const PROMPT_API_SETUP_URL = 'https://kaibadash.github.io/prompt-api-example/';

type Phase =
  | { status: 'unsupported' }
  | { status: 'unavailable' }
  | { status: 'preparing' }
  | { status: 'needs-download' }
  | { status: 'downloading'; progress: number }
  | { status: 'ready' }
  | { status: 'error'; message: string };

function openPromptApiSetup(event: MouseEvent<HTMLAnchorElement>) {
  event.preventDefault();
  void browser.tabs.create({ url: event.currentTarget.href });
}

function PromptApiSetup() {
  return (
    <p className="setup">
      {browser.i18n.getMessage('promptApiSetupHint')}{' '}
      <a
        href={PROMPT_API_SETUP_URL}
        target="_blank"
        rel="noopener noreferrer"
        onClick={openPromptApiSetup}
      >
        {browser.i18n.getMessage('promptApiSetupAction')}
      </a>
    </p>
  );
}

function toolStatusLabel(type: string): string | null {
  const name = type.startsWith('tool-') ? type.slice('tool-'.length) : '';
  if (name === 'getPageInfo') {
    return browser.i18n.getMessage('toolGetPageInfo');
  }
  if (name === 'inspectSelector') {
    return browser.i18n.getMessage('toolInspectSelector');
  }
  if (name === 'executePageScript') {
    return browser.i18n.getMessage('toolExecutePageScript');
  }
  return null;
}

function downloadPercent(progress: number): number {
  const value = progress <= 1 ? progress * 100 : progress;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function SidePanelChat({ language }: { language: PromptLanguage }) {
  const model = useMemo(() => createPromptModel(language), [language]);
  const transport = useMemo(
    () => new DirectChatTransport({ agent: createPageAgent(model) }),
    [model],
  );
  const { messages, sendMessage, status, error, stop } = useChat({ transport });
  const [phase, setPhase] = useState<Phase>(
    typeof LanguageModel === 'undefined'
      ? { status: 'unsupported' }
      : { status: 'preparing' },
  );
  const [scriptsReady, setScriptsReady] = useState(true);
  const [input, setInput] = useState('');
  const transcriptEnd = useRef<HTMLDivElement>(null);
  const ignoreImeEnterUntil = useRef(0);
  const busy = status === 'submitted' || status === 'streaming';
  const canSend = phase.status === 'ready' && input.trim().length > 0 && !busy;

  useEffect(() => {
    let cancelled = false;
    void userScriptsAvailable().then((available) => {
      if (!cancelled) {
        setScriptsReady(available);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (typeof LanguageModel === 'undefined') {
      return;
    }

    let cancelled = false;

    model
      .availability()
      .then((availability) => {
        if (cancelled) {
          return;
        }
        if (availability === 'unavailable') {
          setPhase({ status: 'unavailable' });
          return;
        }
        if (availability === 'available') {
          setPhase({ status: 'ready' });
          return;
        }
        setPhase({ status: 'needs-download' });
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setPhase({
            status: 'error',
            message: cause instanceof Error ? cause.message : String(cause),
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [model]);

  useEffect(() => {
    transcriptEnd.current?.scrollIntoView({ block: 'end' });
  }, [messages, status]);

  function onDownload() {
    setPhase({ status: 'downloading', progress: 0 });
    void LanguageModel.create({
      ...promptModelSettingsFor(language),
      monitor(monitor) {
        monitor.addEventListener('downloadprogress', (event) => {
          if (event.lengthComputable && event.total > 0) {
            setPhase({ status: 'downloading', progress: event.loaded / event.total });
          }
        });
      },
    })
      .then((session) => {
        session.destroy();
        setPhase({ status: 'ready' });
      })
      .catch((cause: unknown) => {
        setPhase({
          status: 'error',
          message: cause instanceof Error ? cause.message : String(cause),
        });
      });
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = input.trim();
    if (!text || !canSend) {
      return;
    }

    setInput('');
    void sendMessage({ text });
  }

  function onCompositionEnd() {
    // Chrome emits a plain Enter keydown immediately after IME confirmation.
    ignoreImeEnterUntil.current = performance.now() + 100;
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (
      event.nativeEvent.isComposing ||
      event.key === 'Process' ||
      event.keyCode === 229 ||
      performance.now() < ignoreImeEnterUntil.current
    ) {
      return;
    }
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  }

  const needsSetup =
    phase.status === 'unsupported' ||
    phase.status === 'unavailable' ||
    phase.status === 'error';
  const statusMessage =
    phase.status === 'unsupported'
      ? browser.i18n.getMessage('promptApiUnavailable')
      : phase.status === 'unavailable'
        ? browser.i18n.getMessage('modelUnavailable')
        : phase.status === 'preparing'
        ? browser.i18n.getMessage('modelPreparing')
        : phase.status === 'needs-download'
          ? browser.i18n.getMessage('modelDownloadNeeded')
          : phase.status === 'downloading'
          ? browser.i18n.getMessage(
              'modelDownloading',
              String(downloadPercent(phase.progress)),
            )
          : phase.status === 'error'
            ? phase.message
            : null;

  return (
    <main>
      <header>
        <button
          type="button"
          className="options"
          onClick={() => void browser.runtime.openOptionsPage()}
        >
          {browser.i18n.getMessage('openOptions')}
        </button>
        {statusMessage ? <p>{statusMessage}</p> : null}
        {scriptsReady ? null : (
          <p>{browser.i18n.getMessage('userScriptsUnavailable')}</p>
        )}
      </header>
      <div className="transcript" aria-live="polite">
        {needsSetup ? <PromptApiSetup /> : null}
        {messages.length === 0 && phase.status === 'ready' ? (
          <p className="empty">{browser.i18n.getMessage('chatEmpty')}</p>
        ) : null}
        {messages.map((message) => (
          <article key={message.id} className={`message ${message.role}`}>
            <span>
              {browser.i18n.getMessage(
                message.role === 'user' ? 'chatRoleUser' : 'chatRoleAssistant',
              )}
            </span>
            {message.parts.map((part, index) => {
              if (part.type === 'text') {
                return <p key={index}>{part.text}</p>;
              }
              const label = toolStatusLabel(part.type);
              return label ? (
                <p key={index} className="tool">
                  {label}
                </p>
              ) : null;
            })}
          </article>
        ))}
        {status === 'submitted' ? (
          <p className="pending">{browser.i18n.getMessage('chatPending')}</p>
        ) : null}
        {error ? <p className="error">{error.message}</p> : null}
        <div ref={transcriptEnd} />
      </div>
      {phase.status !== 'unsupported' && phase.status !== 'unavailable' ? (
        <form className="composer" onSubmit={onSubmit}>
          <label className="sr-only" htmlFor="message">
            {browser.i18n.getMessage('chatInputLabel')}
          </label>
          <textarea
            id="message"
            rows={2}
            value={input}
            placeholder={browser.i18n.getMessage('chatPlaceholder')}
            disabled={phase.status !== 'ready' || busy}
            onChange={(event) => setInput(event.target.value)}
            onCompositionEnd={onCompositionEnd}
            onKeyDown={onKeyDown}
          />
          {phase.status === 'needs-download' ? (
            <button type="button" onClick={onDownload}>
              {browser.i18n.getMessage('modelDownloadAction')}
            </button>
          ) : busy ? (
            <button type="button" onClick={() => stop()}>
              {browser.i18n.getMessage('chatStop')}
            </button>
          ) : (
            <button type="submit" disabled={!canSend}>
              {browser.i18n.getMessage('chatSend')}
            </button>
          )}
        </form>
      ) : null}
    </main>
  );
}

export default function App() {
  const [language, setLanguage] = useState<PromptLanguage | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getPromptLanguage().then((value) => {
      if (!cancelled) {
        setLanguage(value);
      }
    });

    const onChanged: Parameters<typeof browser.storage.onChanged.addListener>[0] = (
      changes,
      areaName,
    ) => {
      if (areaName !== 'local' || !changes[promptLanguageStorageKey]) {
        return;
      }
      const next = changes[promptLanguageStorageKey].newValue;
      if (!cancelled) {
        setLanguage(isPromptLanguage(next) ? next : browserPromptLanguage());
      }
    };
    browser.storage.onChanged.addListener(onChanged);
    return () => {
      cancelled = true;
      browser.storage.onChanged.removeListener(onChanged);
    };
  }, []);

  if (!language) {
    return (
      <main>
        <header>
          <p>{browser.i18n.getMessage('modelPreparing')}</p>
        </header>
      </main>
    );
  }

  return <SidePanelChat key={language} language={language} />;
}
