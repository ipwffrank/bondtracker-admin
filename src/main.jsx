import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { initSentry } from './sentry';

initSentry();

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
