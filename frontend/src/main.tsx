import { createRoot } from 'react-dom/client';
import { setClientInfo } from '@pelagica/core';
import App from './App.tsx';
import { isDesktopBuild } from './utils/desktopApp.ts';
import { VERSION } from './utils/version.ts';

import './index.css';
import './theme.css';
import './arkoplex.css';
import '@pelagica/core/i18n';

if (isDesktopBuild) {
    setClientInfo({ name: 'ArkoPlex Desktop', version: VERSION, platform: 'desktop' });
} else {
    setClientInfo({ name: 'ArkoPlex', version: VERSION });
}

createRoot(document.getElementById('root')!).render(<App />);
