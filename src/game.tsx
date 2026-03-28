import './index.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { GameRoot } from './game/GameApp';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <GameRoot />
  </StrictMode>
);
