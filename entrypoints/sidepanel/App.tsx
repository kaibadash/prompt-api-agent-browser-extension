import { useChat } from '@ai-sdk/react';
import {
  createPageAgent,
  defaultInstructionsStorageKey,
  getDefaultInstructions,
} from '@/lib/page-agent';
import { executePageScript, userScriptsAvailable } from '@/lib/page-bridge';
import {
  browserPromptLanguage,
  createPromptModel,
  getPromptLanguage,
  isPromptLanguage,
  promptLanguageStorageKey,
  promptModelSettingsFor,
  resetPromptSession,
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

function messageText(message: {
  parts: ReadonlyArray<{ type: string; text?: string }>;
}): string {
  return message.parts
    .flatMap((part) => (part.type === 'text' && part.text ? [part.text] : []))
    .join('\n');
}

function pageScriptFromText(text: string): string | null {
  const labeled = text.match(/```(?:javascript|js)\s*([\s\S]*?)```/i)?.[1]?.trim();
  if (labeled) {
    return labeled;
  }
  const plain = text.match(/```\s*([\s\S]*?)```/)?.[1]?.trim() ?? '';
  if (/\b(document|querySelector|window)\b/.test(plain)) {
    return plain;
  }
  return null;
}

function scriptToRecover(
  messages: ReadonlyArray<{
    role: string;
    parts: ReadonlyArray<{ type: string; text?: string }>;
  }>,
): string | null {
  const last = messages.at(-1);
  if (!last || last.role !== 'assistant') {
    return null;
  }
  if (last.parts.some((part) => part.type === 'tool-executePageScript')) {
    return null;
  }

  const own = pageScriptFromText(messageText(last));
  const withoutFence = messageText(last).replace(/```[\s\S]*?```/g, '').trim();
  if (own && withoutFence.length < 80) {
    return own;
  }

  const user = [...messages].reverse().find((message) => message.role === 'user');
  if (!user || !/(実行|走らせ|動かして|\brun\b|\bexecute\b)/i.test(messageText(user))) {
    return null;
  }
  for (let index = messages.length - 2; index >= 0; index -= 1) {
    const message = messages[index];
    if (!message || message.role !== 'assistant') {
      continue;
    }
    const code = pageScriptFromText(messageText(message));
    if (code) {
      return code;
    }
  }
  return null;
}

function SidePanelChat({
  language,
  instructions,
}: {
  language: PromptLanguage;
  instructions: string;
}) {
  const model = useMemo(() => createPromptModel(language), [language]);
  const transport = useMemo(
    () => new DirectChatTransport({ agent: createPageAgent(model, instructions) }),
    [model, instructions],
  );
  const { messages, sendMessage, status, error, stop, setMessages, clearError } = useChat({
    transport,
  });
  const [phase, setPhase] = useState<Phase>(
    typeof LanguageModel === 'undefined'
      ? { status: 'unsupported' }
      : { status: 'preparing' },
  );
  const [scriptsReady, setScriptsReady] = useState(true);
  const [input, setInput] = useState('');
  const transcriptEnd = useRef<HTMLDivElement>(null);
  const ignoreImeEnterUntil = useRef(0);
  const recoveredFor = useRef(new Set<string>());
  const [recoveredRun, setRecoveredRun] = useState<
    | { status: 'running' }
    | { status: 'done'; result: string }
    | { status: 'error'; message: string }
    | null
  >(null);
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
  }, [messages, status, recoveredRun]);

  useEffect(() => {
    if (busy) {
      return;
    }
    const last = messages.at(-1);
    if (!last || last.role !== 'assistant' || recoveredFor.current.has(last.id)) {
      return;
    }
    const code = scriptToRecover(messages);
    if (!code) {
      return;
    }

    let cancelled = false;
    const timer = setTimeout(() => {
      if (cancelled || recoveredFor.current.has(last.id)) {
        return;
      }
      recoveredFor.current.add(last.id);
      setRecoveredRun({ status: 'running' });
      void executePageScript(code).then((outcome) => {
        if (cancelled) {
          return;
        }
        if (outcome.ok) {
          setRecoveredRun({ status: 'done', result: JSON.stringify(outcome.result) });
          return;
        }
        setRecoveredRun({ status: 'error', message: outcome.error });
      });
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [busy, messages]);

  function onClear() {
    if (busy) {
      void stop();
    }
    resetPromptSession(model);
    setMessages([]);
    clearError();
    recoveredFor.current.clear();
    setRecoveredRun(null);
    setTimeout(() => clearError(), 0);
  }

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
        <div className="header-actions">
          <button
            type="button"
            className="options"
            onClick={onClear}
            disabled={messages.length === 0 && !busy}
          >
            {browser.i18n.getMessage('chatClear')}
          </button>
          <button
            type="button"
            className="options"
            onClick={() => void browser.runtime.openOptionsPage()}
          >
            {browser.i18n.getMessage('openOptions')}
          </button>
        </div>
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
        {recoveredRun?.status === 'running' ? (
          <p className="pending">{browser.i18n.getMessage('toolExecutePageScript')}</p>
        ) : null}
        {recoveredRun?.status === 'done' ? (
          <p className="pending">
            {browser.i18n.getMessage('toolScriptResult', recoveredRun.result)}
          </p>
        ) : null}
        {recoveredRun?.status === 'error' ? (
          <p className="error">{recoveredRun.message}</p>
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
  const [instructions, setInstructions] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([getPromptLanguage(), getDefaultInstructions()]).then(
      ([nextLanguage, nextInstructions]) => {
        if (!cancelled) {
          setLanguage(nextLanguage);
          setInstructions(nextInstructions);
        }
      },
    );

    const onChanged: Parameters<typeof browser.storage.onChanged.addListener>[0] = (
      changes,
      areaName,
    ) => {
      if (areaName !== 'local' || cancelled) {
        return;
      }
      if (changes[promptLanguageStorageKey]) {
        const next = changes[promptLanguageStorageKey].newValue;
        setLanguage(isPromptLanguage(next) ? next : browserPromptLanguage());
      }
      if (changes[defaultInstructionsStorageKey]) {
        const next = changes[defaultInstructionsStorageKey].newValue;
        setInstructions(typeof next === 'string' ? next : '');
      }
    };
    browser.storage.onChanged.addListener(onChanged);
    return () => {
      cancelled = true;
      browser.storage.onChanged.removeListener(onChanged);
    };
  }, []);

  if (!language || instructions === null) {
    return (
      <main>
        <header>
          <p>{browser.i18n.getMessage('modelPreparing')}</p>
        </header>
      </main>
    );
  }

  return (
    <SidePanelChat
      key={`${language}\n${instructions}`}
      language={language}
      instructions={instructions}
    />
  );
}
