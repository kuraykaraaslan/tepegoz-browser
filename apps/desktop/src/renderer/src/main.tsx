import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { PopupApp } from './components/PopupApp';
import './styles.css';

// A native extension popup window loads this same bundle with `?popup=<id>`; render only that popup.
const popupId = new URLSearchParams(window.location.search).get('popup');

const container = document.getElementById('root');
if (container) {
  createRoot(container).render(
    <StrictMode>{popupId !== null ? <PopupApp id={popupId} /> : <App />}</StrictMode>,
  );
}
