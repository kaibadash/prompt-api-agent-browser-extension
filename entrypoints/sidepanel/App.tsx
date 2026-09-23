export default function App() {
  const supported = typeof LanguageModel !== 'undefined';

  return (
    <main>
      <h1>Prompt API Agent</h1>
      <p>
        {supported
          ? 'このブラウザでは Prompt API を使えます。'
          : 'このブラウザでは Prompt API を使えません。'}
      </p>
    </main>
  );
}
