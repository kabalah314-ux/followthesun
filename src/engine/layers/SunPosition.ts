import { BARCELONA } from "../../config";
import { clamp } from "../../lib/coordinates";
import { SUN_UP_RAD, solarService, type SunPosition, type TrajectoryPoint } from "../../services/solarService";
import { formatClock, getZoneParts } from "../../services/timeService";
import type { View } from "../../types";

/**
 * SunPositionLayer — trayectoria solar del día y posición actual del sol sobre el mapa.
 *
 * Un diagrama polar centrado en el punto seleccionado (o en el centro de la vista):
 * el azimut es el ángulo, la elevación el radio. Gira con el mapa, así que el norte
 * del diagrama siempre coincide con el norte real aunque se rote la vista.
 */

export interface SunPathArgs {
  pos: SunPosition;
  time: number;
  dayStart: number;
  fade: number;
  night: boolean;
  anchor: [number, number];
}

export class SunPositionLayer {
  private trajectory: TrajectoryPoint[] = [];
  private trajectoryDay = -1;

  draw(ctx: CanvasRenderingContext2D, v: View, args: SunPathArgs) {
    const { pos, time, dayStart, fade, night, anchor } = args;
    if (this.trajectoryDay !== dayStart) {
      this.trajectory = solarService.getTrajectory(dayStart, BARCELONA.lat, BARCELONA.lng, 8);
      this.trajectoryDay = dayStart;
    }
    const traj = this.trajectory;
    if (traj.length < 2) return;

    const [ax, ay] = anchor;
    const R = clamp(Math.min(v.w, v.h) * 0.3, 110, 300);
    const rgb = night ? "255, 214, 150" : "190, 104, 22";
    const bearing = (v.bearing * Math.PI) / 180;
    const toXY = (az: number, alt: number): [number, number] => {
      const r = R * (1 - alt / (Math.PI / 2));
      const a = az - bearing;
      return [ax + r * Math.sin(a), ay - r * Math.cos(a)];
    };

    ctx.save();
    ctx.globalAlpha = fade;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";

    // Horizonte y puntos cardinales.
    ctx.beginPath();
    ctx.arc(ax, ay, R, 0, Math.PI * 2);
    ctx.setLineDash([2, 6]);
    ctx.lineWidth = 1;
    ctx.strokeStyle = `rgba(${rgb}, 0.38)`;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(ax, ay, R * 0.5, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(${rgb}, 0.16)`;
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.font = "600 10px Manrope, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = `rgba(${rgb}, 0.7)`;
    const cardinals: Array<[string, number]> = [
      ["N", 0],
      ["E", 90],
      ["S", 180],
      ["O", 270],
    ];
    for (const [label, deg] of cardinals) {
      const a = (deg * Math.PI) / 180 - bearing;
      ctx.fillText(label, ax + (R + 14) * Math.sin(a), ay - (R + 14) * Math.cos(a));
    }

    // Trayectoria completa (punteada) y tramo ya recorrido (continuo).
    ctx.beginPath();
    traj.forEach((p, i) => {
      const [x, y] = toXY(p.azimuth, p.altitude);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.setLineDash([4, 6]);
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = `rgba(${rgb}, 0.6)`;
    ctx.stroke();
    ctx.setLineDash([]);

    if (time > traj[0].time) {
      ctx.beginPath();
      let started = false;
      for (const p of traj) {
        if (p.time > time) break;
        const [x, y] = toXY(p.azimuth, p.altitude);
        if (!started) {
          ctx.moveTo(x, y);
          started = true;
        } else ctx.lineTo(x, y);
      }
      if (pos.altitude >= SUN_UP_RAD && started) {
        const [x, y] = toXY(pos.azimuth, Math.max(0, pos.altitude));
        ctx.lineTo(x, y);
      }
      ctx.lineWidth = 2;
      ctx.strokeStyle = `rgba(${rgb}, 0.95)`;
      ctx.stroke();
    }

    // Marcas horarias.
    const first = traj[0].time;
    const last = traj[traj.length - 1].time;
    for (let h = Math.ceil(first / 3_600_000) * 3_600_000; h < last; h += 3_600_000) {
      const p = solarService.getPosition(h, BARCELONA.lat, BARCELONA.lng);
      const [x, y] = toXY(p.azimuth, p.altitude);
      ctx.beginPath();
      ctx.arc(x, y, 2.2, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${rgb}, 0.9)`;
      ctx.fill();
      const hour = getZoneParts(h).hour;
      if (hour % 2 === 0) {
        const dx = x - ax;
        const dy = y - ay;
        const len = Math.hypot(dx, dy) || 1;
        ctx.fillStyle = `rgba(${rgb}, 0.85)`;
        ctx.fillText(`${String(hour).padStart(2, "0")}:00`, x + (dx / len) * 20, y + (dy / len) * 14);
      }
    }

    // Orto y ocaso.
    const rise = traj[0];
    const set = traj[traj.length - 1];
    ctx.fillStyle = `rgba(${rgb}, 0.9)`;
    for (const [pt, label] of [
      [rise, formatClock(rise.time)],
      [set, formatClock(set.time)],
    ] as Array<[TrajectoryPoint, string]>) {
      const [x, y] = toXY(pt.azimuth, 0);
      const dx = x - ax;
      const dy = y - ay;
      const len = Math.hypot(dx, dy) || 1;
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillText(label, x + (dx / len) * 24, y + (dy / len) * 14);
    }

    // Ancla y sol actual.
    ctx.beginPath();
    ctx.arc(ax, ay, 3, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(${rgb}, 0.8)`;
    ctx.lineWidth = 1.2;
    ctx.stroke();

    if (pos.altitude >= SUN_UP_RAD) {
      const [sx, sy] = toXY(pos.azimuth, Math.max(0, pos.altitude));
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(sx, sy);
      ctx.strokeStyle = `rgba(${rgb}, 0.22)`;
      ctx.lineWidth = 1;
      ctx.stroke();

      const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, 34);
      g.addColorStop(0, "rgba(255, 190, 80, 0.65)");
      g.addColorStop(1, "rgba(255, 190, 80, 0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(sx, sy, 34, 0, Math.PI * 2);
      ctx.fill();

      ctx.beginPath();
      ctx.arc(sx, sy, 6.5, 0, Math.PI * 2);
      ctx.fillStyle = "#ffb43c";
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = "rgba(255,255,255,0.95)";
      ctx.stroke();
    }

    ctx.restore();
  }
}
