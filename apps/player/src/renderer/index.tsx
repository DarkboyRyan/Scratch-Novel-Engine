import { createRoot } from 'react-dom/client';

import { App } from './App';
import './styles/player.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Player root element is missing');
}

createRoot(rootElement).render(<App />);
