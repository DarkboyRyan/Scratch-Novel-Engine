/**
 * 主要作用：创建 Web Player React 根节点并注入浏览器 Gateway。
 * 关键函数与实现：`rootElement`；基于 React 组件、Hooks、可访问交互与受控状态实现。
 */
import { createRoot } from 'react-dom/client';

import { App } from '../renderer/App';
import '../renderer/styles/player.css';
import { webPlayerGateway } from './WebPlayerGateway';

const rootElement = document.getElementById('root');
if (rootElement === null) {
  throw new Error('Web Player root element is missing');
}

createRoot(rootElement).render(<App gateway={webPlayerGateway} />);
