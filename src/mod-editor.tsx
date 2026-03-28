import './index.css';
import 'emoji-picker-element';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ModEditorApp } from './mod-editor/ModEditorApp';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ModEditorApp />
  </StrictMode>
);
