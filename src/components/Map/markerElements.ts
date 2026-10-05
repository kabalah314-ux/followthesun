/** Elementos DOM de los marcadores del mapa (se estilan en index.css). Sin innerHTML. */

/** Crea un `<div>` con hijos `<span>` vacíos de las clases dadas. */
function withSpans(className: string, spans: string[]): HTMLDivElement {
  const el = document.createElement("div");
  el.className = className;
  for (const cls of spans) {
    const span = document.createElement("span");
    span.className = cls;
    el.appendChild(span);
  }
  return el;
}

export function createPinElement(): HTMLDivElement {
  return withSpans("fts-pin", ["fts-pin__ring", "fts-pin__ring fts-pin__ring--b", "fts-pin__core"]);
}

export function createUserElement(): HTMLDivElement {
  return withSpans("fts-user", ["fts-user__pulse", "fts-user__dot"]);
}

export function createFindElement(onClick: () => void): HTMLDivElement {
  const el = withSpans("fts-find", ["fts-find__halo", "fts-find__badge", "fts-find__score", "fts-find__label"]);
  el.addEventListener("click", (e) => {
    e.stopPropagation();
    onClick();
  });
  return el;
}

export interface FindMarkerState {
  rank: number;
  name: string;
  /** Texto bajo el marcador (la puntuación). */
  score?: string;
  active: boolean;
  /** El resultado principal destaca; el resto se atenúa. */
  primary: boolean;
}

export function updateFindElement(el: HTMLElement, s: FindMarkerState) {
  const badge = el.querySelector<HTMLElement>(".fts-find__badge");
  const label = el.querySelector<HTMLElement>(".fts-find__label");
  const score = el.querySelector<HTMLElement>(".fts-find__score");
  if (badge) badge.textContent = String(s.rank);
  if (label) label.textContent = s.name;
  if (score) score.textContent = s.score ?? "";
  el.classList.toggle("is-active", s.active);
  el.classList.toggle("is-primary", s.primary);
  el.classList.toggle("is-dim", !s.primary && !s.active);
}
