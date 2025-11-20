import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { OAuthProvider } from "./contexts/OAuthContext";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <OAuthProvider>
      <App />
    </OAuthProvider>
  </StrictMode>
);
