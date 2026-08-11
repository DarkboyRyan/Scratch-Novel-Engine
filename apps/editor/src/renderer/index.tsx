import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import App from './App';
import './styles/base.css';
import './styles/editor.css';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Cannot find the React root element.');
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
