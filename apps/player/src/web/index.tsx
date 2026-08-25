import { createRoot } from 'react-dom/client';

import { App } from '../renderer/App';
import '../renderer/styles/player.css';
import { webPlayerGateway } from './WebPlayerGateway';

const rootElement = document.getElementById('root');
if (rootElement === null) {
  throw new Error('Web Player root element is missing');
}

createRoot(rootElement).render(<App gateway={webPlayerGateway} />);
