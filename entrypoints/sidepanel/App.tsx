export default function App() {
  const supported = typeof LanguageModel !== 'undefined';

  return (
    <main>
      <h1>{browser.i18n.getMessage('extName')}</h1>
      <p>
        {browser.i18n.getMessage(
          supported ? 'promptApiAvailable' : 'promptApiUnavailable',
        )}
      </p>
    </main>
  );
}
