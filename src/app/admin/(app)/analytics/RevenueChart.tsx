"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { formatPaise } from "@/lib/format";

export interface DailyPoint {
  date: string; // YYYY-MM-DD, Indian calendar day
  orders: number;
  gross_paise: number;
  refunded_paise: number;
  net_paise: number;
}

/** Brand lagoon — clears 3:1 against the admin's ivory surface. Data marks only; text stays in ink. */
const SERIES = "#3a6b7a";
const INK = "#232f48";
const GRID = "rgba(35,47,72,.12)";
const HEIGHT = 260;
const PAD = { top: 16, right: 16, bottom: 32, left: 64 };

const dayLabel = (iso: string, withYear = false) =>
  new Date(`${iso}T12:00:00+05:30`).toLocaleDateString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
    ...(withYear ? { year: "numeric" } : {}),
  });

/** Clean tick values: 0 and a few round steps up to at least the max. */
function ticks(maxPaise: number): number[] {
  const max = Math.max(maxPaise, 100_00); // at least ₹100, so an empty range still has an axis
  const rough = max / 4;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= rough) ?? rough;
  const out: number[] = [];
  for (let v = 0; v <= max + step * 0.001; v += step) out.push(Math.round(v));
  if (out[out.length - 1] < max) out.push(out[out.length - 1] + step);
  return out;
}

const compactRupees = (paise: number) => {
  const r = paise / 100;
  if (r >= 100_000) return `₹${(r / 100_000).toLocaleString("en-IN", { maximumFractionDigits: 1 })}L`;
  if (r >= 1_000) return `₹${(r / 1_000).toLocaleString("en-IN", { maximumFractionDigits: 1 })}k`;
  return `₹${r.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
};

export default function RevenueChart({ daily }: { daily: DailyPoint[] }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    // Measure now, so the first paint is already the right width; the observer
    // keeps it right afterwards.
    setWidth(Math.max(280, Math.floor(el.clientWidth)));
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(280, Math.floor(entry.contentRect.width))));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const geometry = useMemo(() => {
    const innerW = width - PAD.left - PAD.right;
    const innerH = HEIGHT - PAD.top - PAD.bottom;
    // Net revenue can dip below zero on a day with a refund and no sales.
    const minNet = Math.min(0, ...daily.map((d) => d.net_paise));
    const yTicks = ticks(Math.max(...daily.map((d) => d.net_paise), 0));
    const yMax = yTicks[yTicks.length - 1];
    const yMin = minNet < 0 ? -ticks(-minNet)[ticks(-minNet).length - 1] : 0;
    const x = (i: number) => PAD.left + (daily.length <= 1 ? innerW / 2 : (i / (daily.length - 1)) * innerW);
    const y = (v: number) => PAD.top + innerH - ((v - yMin) / (yMax - yMin || 1)) * innerH;
    const line = daily.map((d, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(d.net_paise).toFixed(1)}`).join(" ");
    const area = daily.length
      ? `${line} L${x(daily.length - 1).toFixed(1)},${y(0).toFixed(1)} L${x(0).toFixed(1)},${y(0).toFixed(1)} Z`
      : "";
    // A handful of date labels, never crowding.
    const every = Math.max(1, Math.ceil(daily.length / Math.max(2, Math.floor(innerW / 90))));
    // The last day is always labelled; a regular tick too close to it is dropped
    // rather than letting the two labels collide.
    const lastDay = daily.length - 1;
    const xTicks = daily
      .map((_, i) => i)
      .filter((i) => i === lastDay || (i % every === 0 && lastDay - i >= Math.ceil(every / 2) + 1));
    const allTicks = minNet < 0 ? [yMin, ...yTicks] : yTicks;
    return { innerW, innerH, x, y, line, area, yTicks: allTicks, xTicks };
  }, [daily, width]);

  const onPointer = (clientX: number) => {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect || daily.length === 0) return;
    const px = clientX - rect.left - PAD.left;
    const i = Math.round((px / (geometry.innerW || 1)) * (daily.length - 1));
    setHover(Math.max(0, Math.min(daily.length - 1, i)));
  };

  const point = hover !== null ? daily[hover] : null;
  const lastIndex = daily.length - 1;
  const last = daily[lastIndex];

  return (
    <div>
      <div
        ref={wrapRef}
        className="relative select-none"
        style={{ height: HEIGHT }}
        onPointerMove={(e) => onPointer(e.clientX)}
        onPointerLeave={() => setHover(null)}
        tabIndex={0}
        role="img"
        aria-label={`Net revenue by day, ${daily.length} days. Use the table below for every value.`}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") setHover((h) => Math.min(lastIndex, (h ?? -1) + 1));
          if (e.key === "ArrowLeft") setHover((h) => Math.max(0, (h ?? lastIndex + 1) - 1));
          if (e.key === "Escape") setHover(null);
        }}
        onBlur={() => setHover(null)}
      >
        <svg width={width} height={HEIGHT} className="block overflow-visible">
          {geometry.yTicks.map((t) => (
            <g key={t}>
              <line x1={PAD.left} x2={width - PAD.right} y1={geometry.y(t)} y2={geometry.y(t)} stroke={GRID} strokeWidth={1} />
              <text
                x={PAD.left - 10}
                y={geometry.y(t)}
                textAnchor="end"
                dominantBaseline="middle"
                fontSize={11}
                fill={INK}
                opacity={0.6}
                style={{ fontVariantNumeric: "tabular-nums" }}
              >
                {compactRupees(t)}
              </text>
            </g>
          ))}
          {geometry.xTicks.map((i) => (
            <text key={i} x={geometry.x(i)} y={HEIGHT - 10} textAnchor="middle" fontSize={11} fill={INK} opacity={0.6}>
              {dayLabel(daily[i].date)}
            </text>
          ))}

          <path d={geometry.area} fill={SERIES} opacity={0.1} />
          <path d={geometry.line} fill="none" stroke={SERIES} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />

          {/* The latest day is marked and labelled; everything else is in the tooltip and table. */}
          {last && (
            <>
              <circle cx={geometry.x(lastIndex)} cy={geometry.y(last.net_paise)} r={6} fill="#eee0bf" />
              <circle cx={geometry.x(lastIndex)} cy={geometry.y(last.net_paise)} r={4} fill={SERIES} />
            </>
          )}

          {point && hover !== null && (
            <>
              <line
                x1={geometry.x(hover)}
                x2={geometry.x(hover)}
                y1={PAD.top}
                y2={PAD.top + geometry.innerH}
                stroke={INK}
                strokeWidth={1}
                opacity={0.35}
              />
              <circle cx={geometry.x(hover)} cy={geometry.y(point.net_paise)} r={6} fill="#eee0bf" />
              <circle cx={geometry.x(hover)} cy={geometry.y(point.net_paise)} r={4} fill={SERIES} />
            </>
          )}
        </svg>

        {point && hover !== null && (
          <div
            className="pointer-events-none absolute top-2 z-10 rounded px-3 py-2 font-body text-[12px] shadow-sm"
            style={{
              left: Math.min(Math.max(geometry.x(hover) + 12, 0), width - 190),
              background: "#fbf6ea",
              border: "1px solid rgba(35,47,72,.15)",
              color: INK,
              minWidth: 170,
            }}
          >
            <div className="opacity-60 text-[11px]">{dayLabel(point.date, true)}</div>
            <div className="mt-1 flex items-center gap-2">
              <span className="inline-block w-3" style={{ height: 2, background: SERIES }} />
              <strong className="font-normal text-[14px]">{formatPaise(point.net_paise)}</strong>
              <span className="opacity-60">net</span>
            </div>
            <div className="mt-1 opacity-70">
              {point.orders} order{point.orders === 1 ? "" : "s"} · {formatPaise(point.gross_paise)} gross
              {point.refunded_paise > 0 ? ` · ${formatPaise(point.refunded_paise)} refunded` : ""}
            </div>
          </div>
        )}
      </div>

      <details className="mt-4">
        <summary className="cursor-pointer text-[11px] tracking-[.22em] font-body font-light opacity-70">SHOW AS A TABLE</summary>
        <div className="mt-3 overflow-x-auto max-h-[320px] overflow-y-auto">
          <table className="w-full text-left font-body text-[13px]" style={{ fontVariantNumeric: "tabular-nums" }}>
            <thead>
              <tr className="text-[10px] tracking-[.22em] opacity-60">
                <th className="py-2 pr-4 font-normal">DAY</th>
                <th className="py-2 pr-4 font-normal text-right">ORDERS</th>
                <th className="py-2 pr-4 font-normal text-right">GROSS</th>
                <th className="py-2 pr-4 font-normal text-right">REFUNDED</th>
                <th className="py-2 font-normal text-right">NET</th>
              </tr>
            </thead>
            <tbody>
              {[...daily].reverse().map((d) => (
                <tr key={d.date} className="border-t border-black/10">
                  <td className="py-2 pr-4">{dayLabel(d.date, true)}</td>
                  <td className="py-2 pr-4 text-right">{d.orders}</td>
                  <td className="py-2 pr-4 text-right">{formatPaise(d.gross_paise)}</td>
                  <td className="py-2 pr-4 text-right">{d.refunded_paise ? formatPaise(d.refunded_paise) : "—"}</td>
                  <td className="py-2 text-right">{formatPaise(d.net_paise)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
