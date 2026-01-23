
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

console.log("[SBLIX] index.tsx initialized");

const rootElement = document.getElementById('root');
if (!rootElement) {
  console.error("[SBLIX] Could not find root element to mount to");
  throw new Error("Could not find root element to mount to");
}

try {
  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
  console.log("[SBLIX] React render complete");
} catch (err) {
  console.error("[SBLIX] Fatal render error:", err);
}
