/** Elementos DOM de los marcadores del mapa (se estilan en index.css). */

export function createPinElement(): HTMLDivElement {
  const el = document.createElement("div");
  el.className = "fts-pin";
  el.innerHTML =
    '<span class="fts-pin__ring"></span><span class="fts-pin__ring fts-pin__ring--b"></span><span class="fts-pin__core"></span>';
  return el;
}

export function createUserElement(): HTMLDivElement {
  const el = document.createElement("div");
  el.className = "fts-user";
  el.innerHTML = '<span class="fts-user__pulse"></span><span class="fts-user__dot"></span>';
  return el;
}

export function createFindElement(onClick: () => void): HTMLDivElement {
  const el = document.createElement("div");
  el.className = "fts-find";
  el.innerHTML =
    '<span class="fts-find__halo"></span><span class="fts-find__badge"></span><span class="fts-find__score"></span><span class="fts-find__label"></span>';
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
