import { createRoot } from "react-dom/client";
import App from "./app/App.tsx";
import "./styles/index.css";

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    registrations.forEach((registration) => registration.unregister());
  });
}

const root = document.getElementById("root")!;

if (window.location.pathname.startsWith("/eval/record")) {
  import("./app/components/eval/EvalRecorder.tsx").then(({ EvalRecorder }) => {
    createRoot(root).render(<EvalRecorder />);
  });
} else {
  createRoot(root).render(<App />);
}
