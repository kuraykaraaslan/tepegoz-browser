import { StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { coreDict, pick, resolveLocale } from '@tepegoz/i18n';
import { ErrorBoundary } from '@tepegoz/ui';
import { App } from './App';
import { PopupApp } from './components/PopupApp';
import { MainMenuPopup } from './components/MainMenuPopup';
import './styles.css';

// A native popup window loads this same bundle with `?surface=<kind>` (see PopupWindowManager); render
// only that surface. Add a case here to host a new popup surface. Absent → the full browser chrome.
const params = new URLSearchParams(window.location.search);
const surface = params.get('surface');
const extId = params.get('id');

let node: ReactNode = <App />;
if (surface === 'main-menu') node = <MainMenuPopup />;
else if (surface === 'ext' && extId !== null) node = <PopupApp id={extId} />;

// The boundary's fallback renders when App (and its locale state) is gone — resolve from the OS locale.
const fallbackMessage = pick(coreDict, resolveLocale(navigator.language)).errors.renderFailure;

const container = document.getElementById('root');
if (container) {
  createRoot(container).render(
    <StrictMode>
      <ErrorBoundary fallbackMessage={fallbackMessage}>{node}</ErrorBoundary>
    </StrictMode>,
  );
}
