import { cleanup, configure } from "@testing-library/react";
import { afterEach } from "vitest";

// O padrão de 1 s das buscas assíncronas (`findBy*`, `waitFor`) estoura quando a suíte roda junto
// com outras na mesma máquina; a espera maior só custa tempo quando o teste falharia de qualquer jeito.
configure({ asyncUtilTimeout: 5000 });

afterEach(() => {
  cleanup();
  document.head.querySelectorAll("script").forEach((script) => script.remove());
  delete window.turnstile;
  localStorage.clear();
});
