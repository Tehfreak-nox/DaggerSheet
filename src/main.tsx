import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { loadMode } from './app/theme';
import { installTapPulse } from './ui/pulse';
import './styles/sheet.css';
import './styles/persona.css';
import './styles/app.css';

loadMode();
installTapPulse();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
