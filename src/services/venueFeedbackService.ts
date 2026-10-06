import type { TerraceCertainty, Venue, VenueFeedback } from "../types";

/**
 * venueFeedbackService — lo que la gente confirma desde la app.
 *
 * Ninguna fuente abierta documenta bien qué terrazas existen. La comunidad de OpenStreetMap pone
 * `outdoor_seating=yes` en algunas; el resto es heuristico. Pero una persona que está sentada en la
 * terraza y pulsa «sí, aquí hay mesas al sol» es la mejor fuente posible — y es gratis.
 *
 * Se guarda en el dispositivo (sin cuentas todavía). Cuando haya backend, esta misma interfaz sirve
 * para sincronizarlo y las confirmaciones de mucha gente pasarían a marcar la terraza como
 * `confirmed` para todo el mundo.
 */

const KEY = "fts:venue-feedback:v1";
const MAX = 300;

function read(): VenueFeedback[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (f): f is VenueFeedback =>
        !!f &&
        typeof f === "object" &&
        typeof (f as VenueFeedback).venueId === "string" &&
        typeof (f as VenueFeedback).confirmedAt === "number"
    );
  } catch {
    return [];
  }
}

class VenueFeedbackService {
  private items: VenueFeedback[] = typeof window === "undefined" ? [] : read();
  private listeners = new Set<() => void>();

  subscribe = (l: () => void) => {
    this.listeners.add(l);
    return () => {
      this.listeners.delete(l);
    };
  };

  getSnapshot = (): VenueFeedback[] => this.items;

  private commit(next: VenueFeedback[]) {
    this.items = next.slice(0, MAX);
    try {
      window.localStorage.setItem(KEY, JSON.stringify(this.items));
    } catch {
      /* sin almacenamiento: sigue en memoria */
    }
    this.listeners.forEach((l) => l());
  }

  get(venueId: string): VenueFeedback | undefined {
    return this.items.find((f) => f.venueId === venueId);
  }

  list(): VenueFeedback[] {
    return this.items;
  }

  /** Registra una confirmación. Devuelve el feedback guardado. */
  record(input: {
    venue: Venue;
    hasTerrace: boolean;
    sunAtMoment: boolean;
  }): VenueFeedback {
    const entry: VenueFeedback = {
      venueId: input.venue.id,
      venueName: input.venue.name,
      latitude: input.venue.latitude,
      longitude: input.venue.longitude,
      hasTerrace: input.hasTerrace,
      sunAtMoment: input.sunAtMoment,
      confirmedAt: Date.now(),
    };
    const rest = this.items.filter((f) => f.venueId !== entry.venueId);
    this.commit([entry, ...rest]);
    return entry;
  }

  /** Certeza de terraza que aporta el feedback, o undefined si no hay. */
  certaintyFor(venueId: string): TerraceCertainty | undefined {
    const f = this.get(venueId);
    if (!f) return undefined;
    return f.hasTerrace ? "confirmed" : "none";
  }

  /** Certeza final: fuente externa + lo que ha confirmado la gente. */
  combinedFor(venue: Venue): { terrace: TerraceCertainty; source: string } {
    const feedback = this.get(venue.id);
    const fromFeedback = this.certaintyFor(venue.id);
    if (!feedback || !fromFeedback) {
      return { terrace: venue.terrace, source: venue.terraceSource };
    }
    // Una persona que ha estado allí manda sobre cualquier heurística.
    return {
      terrace: fromFeedback,
      source: `Confirmado por ti el ${new Date(feedback.confirmedAt).toLocaleDateString("es-ES")}`,
    };
  }
}

export const venueFeedbackService = new VenueFeedbackService();
