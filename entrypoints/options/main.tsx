import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
import './style.css';

document.documentElement.lang = browser.i18n.getUILanguage();
document.title = browser.i18n.getMessage('optionsTitle');

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
