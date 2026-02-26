import { createRoot } from "react-dom/client";
import { useState, useCallback } from "react";
import App from "./App.tsx";
import { SplashScreen } from "./components/SplashScreen.tsx";
import "./index.css";

function Root() {
  const [splashDone, setSplashDone] = useState(() => {
    if (sessionStorage.getItem('dp_splash_shown')) return true;
    return false;
  });

  const handleSplashFinished = useCallback(() => {
    sessionStorage.setItem('dp_splash_shown', 'true');
    setSplashDone(true);
  }, []);

  return (
    <>
      {!splashDone && <SplashScreen onFinished={handleSplashFinished} />}
      {splashDone && <App />}
    </>
  );
}

createRoot(document.getElementById("root")!).render(<Root />);
