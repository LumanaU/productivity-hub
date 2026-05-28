import React from "react";
import ReactDOM from "react-dom/client";

const root = document.getElementById("root");

async function startApp() {
  try {
    const { default: App } = await import("./App.jsx");
    ReactDOM.createRoot(root).render(
      React.createElement(React.StrictMode, null, React.createElement(App))
    );
  } catch (e) {
    root.innerHTML = '<div style="padding:40px;font-family:sans-serif">'
      + '<h1 style="color:#ef4444">App Error</h1>'
      + '<pre style="color:#ef4444;white-space:pre-wrap;font-size:14px">'
      + e.message + '\n\n' + e.stack + '</pre></div>';
    console.error("App failed to load:", e);
  }
}

startApp();
