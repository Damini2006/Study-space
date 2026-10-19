import { useEffect, useRef } from "react";

export function useKeyboardShortcuts(config) {
  const callbacks = useRef(config);
  callbacks.current = config;

  useEffect(() => {
    const handleKeyDown = (event) => {
      const { escape, enter, numbers } = callbacks.current;

      // Escape key
      if (event.key === "Escape" && escape) {
        escape();
      }

      // Enter key
      if (event.key === "Enter" && enter) {
        enter();
      }

      // Number keys for quick navigation
      if (numbers && event.key >= "1" && event.key <= "9") {
        const idx = parseInt(event.key, 10);
        if (numbers[idx]) {
          numbers[idx]();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);
}