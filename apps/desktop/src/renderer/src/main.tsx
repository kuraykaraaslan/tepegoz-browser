import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { coreDict, pick, resolveLocale } from '@tepegoz/i18n';
import { App } from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { PopupApp } from './components/PopupApp';
import './styles.css';

// A native extension popup window loads this same bundle with `?popup=<id>`; render only that popup.
const popupId = new URLSearchParams(window.location.search).get('popup');

// The boundary's fallback renders when App (and its locale state) is gone — resolve from the OS locale.
const fallbackMessage = pick(coreDict, resolveLocale(navigator.language)).errors.renderFailure;

const container = document.getElementById('root');
if (container) {
  createRoot(container).render(
    <StrictMode>
      <ErrorBoundary fallbackMessage={fallbackMessage}>
        {popupId !== null ? <PopupApp id={popupId} /> : <App />}
      </ErrorBoundary>
    </StrictMode>,
  );
}
