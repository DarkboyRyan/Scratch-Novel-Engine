/**
 * 主要作用：创建桌面 Player 的 React 根节点并载入全局样式。
 * 关键函数与实现：`rootElement`；基于 React 组件、Hooks、可访问交互与受控状态实现。
 */
import { createRoot } from 'react-dom/client';

import { App } from './App';
import './styles/player.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Player root element is missing');
}

createRoot(rootElement).render(<App />);
