import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import AndroidApp from './mobile/AndroidApp';
import { isAndroid } from './services/androidMedia';
import './index.css';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    {isAndroid || new URLSearchParams(location.search).has('android') ? <AndroidApp /> : <App />}
  </React.StrictMode>
);
