// Small SVG charts in the app's style: thin marks with rounded ends, a recessive grid, values in
// ink (never in the series colour), a legend for two or more series, and a tooltip on hover.
import { useId, useRef, useState } from 'react';

// Series colours, in fixed order (validated for colour-blind separation; amber always gets a text label).
export const SERIES = ['var(--c1)', 'var(--c2)', 'var(--c3)'];

function useTip() {
  const box = useRef(null);
  const [tip, setTip] = useState(null);
  const show = (e, content) => {
    const r = box.current?.getBoundingClientRect();
    if (!r) return;
    setTip({ x: e.clientX - r.left, y: e.clientY - r.top, w: r.width, content });
  };
  const node = tip && (
    <div className="ch-tip" style={{ left: Math.min(Math.max(tip.x, 70), tip.w - 70), top: tip.y }} role="status">
      {tip.content}
    </div>
  );
  return { box, show, hide: () => setTip(null), node };
}

export function ChartCard({ title, sub, legend, children, className = '', action }) {
  return (
    <section className={`chart-card card ${className}`}>
      <header className="ch-head">
        <div>
          <h3>{title}</h3>
          {sub && <p>{sub}</p>}
        </div>
        {action}
      </header>
      {legend && legend.length > 1 && (
        <ul className="ch-legend">
          {legend.map((l, i) => (
            <li key={l}><i style={{ background: SERIES[i] }} />{l}</li>
          ))}
        </ul>
      )}
      {children}
    </section>
  );
}

export function ChartEmpty({ children }) {
  return <div className="ch-empty">{children}</div>;
}

// Horizontal bars, one row per item; values: one number per series (null = no data yet).
// rows: [{ label, sub?, values: [n|null, …] }], max: the axis end (e.g. 100 for percent).
export function BarRows({ rows, series = ['Value'], max = 100, unit = '%', threshold, thresholdLabel }) {
  const t = useTip();
  const fmt = (v) => (v == null ? '—' : `${Number.isInteger(v) ? v : v.toFixed(1)}${unit}`);
  return (
    <div className="ch-rows" ref={t.box} onMouseLeave={t.hide}>
      {threshold != null && (
        <span className="ch-threshold" style={{ left: `calc(var(--lab) + (100% - var(--lab) - var(--val)) * ${threshold / max})` }} title={thresholdLabel}>
          <em>{thresholdLabel}</em>
        </span>
      )}
      {rows.map((r) => (
        <div
          key={r.label}
          className="ch-row"
          onMouseMove={(e) =>
            t.show(e, (
              <>
                <strong>{r.label}</strong>
                {r.sub && <span className="ch-tip-sub">{r.sub}</span>}
                {r.values.map((v, i) => (
                  <span key={i} className="ch-tip-line"><i style={{ background: SERIES[i] }} />{series[i]}<b>{fmt(v)}</b></span>
                ))}
              </>
            ))
          }
        >
          <span className="ch-row-label" title={r.label}>{r.label}</span>
          <span className="ch-row-bars">
            {r.values.map((v, i) => (
              <span key={i} className="ch-row-track">
                <span className="ch-row-bar" style={{ width: `${v == null ? 0 : Math.max(1.5, (Math.min(v, max) / max) * 100)}%`, background: SERIES[i] }} />
              </span>
            ))}
          </span>
          <span className="ch-row-vals">
            {r.values.map((v, i) => <span key={i} className={v == null ? 'none' : ''}>{fmt(v)}</span>)}
          </span>
        </div>
      ))}
      {t.node}
    </div>
  );
}

// Vertical columns. data: [{ label, value, tone? ('fail' | 'muted') , title? }]
export function Columns({ data, height = 150, unit = '', labelEvery = 1, showValues = true }) {
  const t = useTip();
  const max = Math.max(1, ...data.map((d) => d.value));
  const ticks = niceTicks(max);
  const top = ticks[ticks.length - 1];
  return (
    <div className="ch-cols-wrap" ref={t.box} onMouseLeave={t.hide}>
      <div className="ch-cols" style={{ height }}>
        <div className="ch-grid" aria-hidden="true">
          {ticks.map((v) => (
            <span key={v} style={{ bottom: `${(v / top) * 100}%` }}><em>{v}</em></span>
          ))}
        </div>
        {data.map((d, i) => (
          <div
            key={d.label + i}
            className={`ch-col ${d.tone || ''}`}
            onMouseMove={(e) => t.show(e, <><strong>{d.title || d.label}</strong><span className="ch-tip-line">{d.value}{unit}</span></>)}
          >
            <span className="ch-col-bar" style={{ height: `${(d.value / top) * 100}%` }}>
              {showValues && d.value > 0 && <b>{d.value}</b>}
            </span>
          </div>
        ))}
      </div>
      <div className="ch-cols-x">
        {data.map((d, i) => <span key={d.label + i}>{i % labelEvery === 0 ? d.label : ''}</span>)}
      </div>
      {t.node}
    </div>
  );
}

// One line over time with a crosshair. points: [{ label, value (0–100 or null), title? }]
export function Line({ points, height = 150, unit = '%', min = 0, max = 100 }) {
  const t = useTip();
  const id = useId();
  const [hover, setHover] = useState(null);
  const W = 600;
  const H = height;
  const pad = { l: 34, r: 12, t: 12, b: 22 };
  const valid = points.filter((p) => p.value != null);
  if (valid.length === 0) return <ChartEmpty>No data yet.</ChartEmpty>;
  const x = (i) => pad.l + (points.length === 1 ? (W - pad.l - pad.r) / 2 : (i / (points.length - 1)) * (W - pad.l - pad.r));
  const y = (v) => pad.t + (1 - (v - min) / (max - min)) * (H - pad.t - pad.b);
  const path = points.map((p, i) => (p.value == null ? null : `${x(i)},${y(p.value)}`)).filter(Boolean);
  const ticks = [min, min + (max - min) / 2, max];
  const onMove = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    let best = 0;
    points.forEach((_, i) => { if (Math.abs(x(i) - px) < Math.abs(x(best) - px)) best = i; });
    setHover(best);
    const p = points[best];
    t.show(e, <><strong>{p.title || p.label}</strong><span className="ch-tip-line">{p.value == null ? 'No data' : `${p.value}${unit}`}</span></>);
  };
  const every = Math.ceil(points.length / 8);
  return (
    <div className="ch-line" ref={t.box} onMouseLeave={() => { t.hide(); setHover(null); }}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ height }} onMouseMove={onMove} role="img" aria-label="Line chart">
        <defs>
          <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="var(--blue)" stopOpacity="0.16" />
            <stop offset="1" stopColor="var(--blue)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {ticks.map((v) => (
          <g key={v}>
            <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} className="ch-gridline" />
            <text x={pad.l - 6} y={y(v) + 3} className="ch-axis" textAnchor="end">{v}</text>
          </g>
        ))}
        {path.length > 1 && <polygon points={`${path[0].split(',')[0]},${y(min)} ${path.join(' ')} ${path[path.length - 1].split(',')[0]},${y(min)}`} fill={`url(#${id})`} />}
        <polyline points={path.join(' ')} fill="none" stroke="var(--blue)" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
        {hover != null && <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={H - pad.b} className="ch-cross" />}
        {points.map((p, i) =>
          p.value == null ? null : (
            <circle key={i} cx={x(i)} cy={y(p.value)} r={hover === i ? 5 : 3.5} className="ch-dot" vectorEffect="non-scaling-stroke" />
          )
        )}
        {points.map((p, i) => (i % every === 0 ? <text key={`l${i}`} x={x(i)} y={H - 6} className="ch-axis" textAnchor="middle">{p.label}</text> : null))}
      </svg>
      {t.node}
    </div>
  );
}

// Part-to-whole on one bar. parts: [{ label, value, color }]
export function Stack({ parts, total }) {
  const t = useTip();
  const sum = total ?? parts.reduce((a, p) => a + p.value, 0);
  return (
    <div className="ch-stack-wrap" ref={t.box} onMouseLeave={t.hide}>
      <div className="ch-stack">
        {parts.map((p) =>
          p.value > 0 ? (
            <span
              key={p.label}
              style={{ flexGrow: p.value, background: p.color }}
              onMouseMove={(e) => t.show(e, <><strong>{p.label}</strong><span className="ch-tip-line">{p.value} · {sum ? Math.round((p.value / sum) * 100) : 0}%</span></>)}
            />
          ) : null
        )}
        {sum === 0 && <span className="empty" style={{ flexGrow: 1 }} />}
      </div>
      <ul className="ch-stack-legend">
        {parts.map((p) => (
          <li key={p.label}>
            <i style={{ background: p.color }} />
            <span>{p.label}</span>
            <b>{p.value}</b>
            <small>{sum ? Math.round((p.value / sum) * 100) : 0}%</small>
          </li>
        ))}
      </ul>
      {t.node}
    </div>
  );
}

function niceTicks(max) {
  const step = max <= 5 ? 1 : max <= 10 ? 2 : max <= 25 ? 5 : max <= 50 ? 10 : Math.ceil(max / 5 / 10) * 10;
  const out = [];
  for (let v = 0; v <= max + step - 1 && out.length < 7; v += step) out.push(v);
  if (out[out.length - 1] < max) out.push(out[out.length - 1] + step);
  return out;
}

// Part-to-whole ring with the total in the middle and a legend with percentages.
// parts: [{ label, value, color }]
export function Donut({ parts, center, centerLabel, size = 150 }) {
  const t = useTip();
  const total = parts.reduce((a, p) => a + p.value, 0);
  const r = 15.9;
  const C = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div className="ch-donut" ref={t.box} onMouseLeave={t.hide}>
      <svg viewBox="0 0 42 42" width={size} height={size} role="img" aria-label={`${centerLabel}: ${center}`}>
        <circle cx="21" cy="21" r={r} fill="none" className="ch-donut-track" strokeWidth="5.2" />
        {total > 0 &&
          parts.map((p) => {
            if (!p.value) return null;
            const len = (p.value / total) * C;
            const gap = parts.filter((x) => x.value).length > 1 ? 0.6 : 0;
            const el = (
              <circle
                key={p.label}
                cx="21"
                cy="21"
                r={r}
                fill="none"
                stroke={p.color}
                strokeWidth="5.2"
                strokeDasharray={`${Math.max(0, len - gap)} ${C}`}
                strokeDashoffset={-offset}
                transform="rotate(-90 21 21)"
                onMouseMove={(e) => t.show(e, <><strong>{p.label}</strong><span className="ch-tip-line">{p.value} · {Math.round((p.value / total) * 100)}%</span></>)}
              />
            );
            offset += len;
            return el;
          })}
        <text x="21" y="21" textAnchor="middle" className="ch-donut-num">{center}</text>
        <text x="21" y="26.5" textAnchor="middle" className="ch-donut-sub">{centerLabel}</text>
      </svg>
      <ul className="ch-donut-legend">
        {parts.map((p) => (
          <li key={p.label}>
            <i style={{ background: p.color }} />
            <span>{p.label}</span>
            <b>{total ? Math.round((p.value / total) * 100) : 0}%</b>
          </li>
        ))}
      </ul>
      {t.node}
    </div>
  );
}

// Ranked list: a code tile, title, sub line, value and a thin bar.
// items: [{ key, code, title, sub, value (0–max), label, to? }]
export function RankList({ items, max = 100 }) {
  return (
    <ol className="ch-rank">
      {items.map((it, i) => (
        <li key={it.key}>
          <span className={`ch-rank-tile ${i === 0 ? 'first' : ''}`}>{it.code}</span>
          <span className="ch-rank-text">
            <strong title={it.title}>{it.title}</strong>
            <small>{it.sub}</small>
            <span className="ch-rank-bar"><i style={{ width: `${it.value == null ? 0 : Math.min(100, (it.value / max) * 100)}%` }} /></span>
          </span>
          <b className="ch-rank-val">{it.label}</b>
        </li>
      ))}
    </ol>
  );
}
