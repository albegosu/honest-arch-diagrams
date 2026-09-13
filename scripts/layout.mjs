#!/usr/bin/env node
// Grammar-exact layout for honest-arch-diagrams models.
// Places the verified spine in ranked columns, drops companions onto one
// supporting row under their lane (datastores under Workload = the Data lane),
// routes edges as orthogonal elbows with a hop-arc over crossings, and can emit
// a self-contained SVG. This is the grammar-faithful alternative to delegating
// layout to D2 (which does not keep Data under Workload).
//
// Usage:
//   node scripts/layout.mjs <model.json>                 # prints geometry JSON
//   node scripts/layout.mjs <model.json> --svg out.svg   # also writes an SVG
//
// See references/layout.md and references/visual-grammar.md.

import { readFileSync, writeFileSync } from 'node:fs';

// --- constants (references/layout.md) ---
const NODE_W = 148;
const NODE_H = 56;
const H_GAP = 96;
const START_X = 90;
const BASE_Y = 240;
const SPINE_STACK_GAP = 48;
const ROW_GAP = 72;
const COMPANION_STACK_GAP = 22;
const CORNER_R = 8;
const ACCENT = '#2563eb';

// Rank by kind (lb+tls stack; endpoints+pod stack), not by lane.
const HOP_RANK = {
  dns: 0, lb: 1, tls: 1, ingress: 2, httproute: 2,
  oauth2_proxy: 3, service: 4, endpoints: 5, pod: 5,
};

const cx = (n) => n.x + n.w / 2;
const cy = (n) => n.y + n.h / 2;
const dist = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);
const unit = (a, b) => {
  const d = dist(a, b) || 1;
  return { x: (b.x - a.x) / d, y: (b.y - a.y) / d };
};

/** Rounded orthogonal path through a list of points. */
function roundedPath(pts, r = CORNER_R) {
  if (pts.length < 2) return '';
  let d = `M ${pts[0].x},${pts[0].y}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const p0 = pts[i - 1], p1 = pts[i], p2 = pts[i + 1];
    const rr = Math.min(r, dist(p0, p1) / 2, dist(p1, p2) / 2);
    const v1 = unit(p0, p1), v2 = unit(p1, p2);
    const a = { x: p1.x - v1.x * rr, y: p1.y - v1.y * rr };
    const b = { x: p1.x + v2.x * rr, y: p1.y + v2.y * rr };
    d += ` L ${a.x},${a.y} Q ${p1.x},${p1.y} ${b.x},${b.y}`;
  }
  const last = pts[pts.length - 1];
  d += ` L ${last.x},${last.y}`;
  return d;
}

/** Horizontal run from x0 to x1 at y, hopping over each x in crossXs. */
function horizontalWithHops(x0, x1, y, crossXs) {
  const dir = x1 >= x0 ? 1 : -1;
  const xs = crossXs
    .filter((x) => x > Math.min(x0, x1) + CORNER_R && x < Math.max(x0, x1) - CORNER_R)
    .sort((a, b) => (a - b) * dir);
  let d = `M ${x0},${y}`;
  for (const x of xs) {
    d += ` L ${x - CORNER_R * dir},${y} a ${CORNER_R},${CORNER_R} 0 0,1 ${CORNER_R * 2 * dir},0`;
  }
  d += ` L ${x1},${y}`;
  return d;
}

export function layout(model) {
  const nodes = new Map();

  // --- 1. spine columns by rank ---
  const ranks = new Map();
  for (const h of model.hops) {
    const r = HOP_RANK[h.kind] ?? 4;
    (ranks.get(r) ?? ranks.set(r, []).get(r)).push(h);
  }
  const sortedRanks = [...ranks.keys()].sort((a, b) => a - b);
  const colX = new Map(); // rank -> x
  sortedRanks.forEach((rank, col) => {
    const x = START_X + col * (NODE_W + H_GAP);
    colX.set(rank, x);
    const ids = ranks.get(rank);
    const span = ids.length * NODE_H + (ids.length - 1) * SPINE_STACK_GAP;
    let y = BASE_Y - span / 2;
    for (const h of ids) {
      nodes.set(h.id, {
        id: h.id, kind: h.kind, label: h.label, lane: h.lane,
        band: h.lane, satellite: false,
        x, y, w: NODE_W, h: NODE_H,
      });
      y += NODE_H + SPINE_STACK_GAP;
    }
  });

  const xForKind = (kinds) => {
    const rank = sortedRanks.find((r) => kinds.includes(r));
    return rank != null ? colX.get(rank) : START_X;
  };
  const workloadX = xForKind([5]) ?? xForKind([4]) ?? START_X; // pod/endpoints col
  const appX = xForKind([4]) ?? START_X;                        // service col
  const identityX = xForKind([3, 2]) ?? appX;                   // oauth/gateway col

  const spineBottom = Math.max(...[...nodes.values()].map((n) => n.y + n.h), BASE_Y);
  const rowY = spineBottom + ROW_GAP;

  // --- 2. companions on the supporting row ---
  const laneForCompanion = (c) => {
    if (c.kind === 'db' || c.kind === 'cloud') return { x: workloadX, band: 'Data' };
    if (c.kind === 'auth') return { x: identityX, band: 'Identity' };
    return { x: appX, band: 'App' };
  };
  const stackColumns = new Map(); // x -> next y
  const around = [];
  for (const c of model.companions) {
    if (c.relation === 'around') { around.push(c); continue; }
    const { x, band } = laneForCompanion(c);
    const y = stackColumns.get(x) ?? rowY;
    nodes.set(c.id, {
      id: c.id, kind: c.kind, label: c.label, band,
      satellite: true, relation: 'linked', subtitle: c.subtitle, anchor: c.anchor,
      x, y, w: NODE_W, h: NODE_H,
    });
    stackColumns.set(x, y + NODE_H + COMPANION_STACK_GAP);
  }
  // around companions: their own "Also in this release" band, bottom-left
  let ay = rowY;
  for (const c of around) {
    nodes.set(c.id, {
      id: c.id, kind: c.kind, label: c.label, band: 'Also in this release',
      satellite: true, relation: 'around', subtitle: 'release',
      x: START_X, y: ay, w: NODE_W, h: NODE_H,
    });
    ay += NODE_H + COMPANION_STACK_GAP;
  }

  // --- 3. edges ---
  const pathVerticals = []; // {x, y0, y1} for hop-arc crossing detection
  const edges = [];
  for (const e of model.edges) {
    const s = nodes.get(e.from), t = nodes.get(e.to);
    if (!s || !t) continue;
    if (e.path) {
      const sp = { x: s.x + s.w, y: cy(s) };
      const tp = { x: t.x, y: cy(t) };
      let pts;
      if (Math.abs(sp.y - tp.y) < 1) {
        pts = [sp, tp];
      } else {
        const midX = (sp.x + tp.x) / 2;
        pts = [sp, { x: midX, y: sp.y }, { x: midX, y: tp.y }, tp];
        pathVerticals.push({ x: midX, y0: Math.min(sp.y, tp.y), y1: Math.max(sp.y, tp.y) });
      }
      edges.push({ kind: 'path', d: roundedPath(pts), from: e.from, to: e.to });
    }
  }
  // linked companion 'uses' edges (anchor -> companion), dashed, with hop-arcs
  for (const c of model.companions) {
    if (c.relation !== 'linked') continue;
    const a = nodes.get(c.anchor), comp = nodes.get(c.id);
    if (!a || !comp) continue;
    const start = { x: cx(a), y: a.y + a.h };
    const end = { x: cx(comp), y: comp.y };
    const midY = (start.y + end.y) / 2;
    const crosses = pathVerticals
      .filter((v) => midY >= v.y0 && midY <= v.y1)
      .map((v) => v.x);
    const d =
      `M ${start.x},${start.y} L ${start.x},${midY} ` +
      horizontalWithHops(start.x, end.x, midY, crosses).replace(/^M [^ ]+ /, '') +
      ` L ${end.x},${end.y}`;
    edges.push({
      kind: 'linked', d, from: c.anchor, to: c.id,
      label: `${c.subtitle ?? 'uses'} (${c.evidence})`,
      lx: Math.min(start.x, end.x) + 10, ly: midY - 6,
    });
  }

  // --- 4. lane bands (bbox per band) ---
  const bands = [];
  const byBand = new Map();
  for (const n of nodes.values()) {
    (byBand.get(n.band) ?? byBand.set(n.band, []).get(n.band)).push(n);
  }
  const PAD = 18, HEADER = 26;
  for (const [label, ns] of byBand) {
    const x0 = Math.min(...ns.map((n) => n.x)) - PAD;
    const x1 = Math.max(...ns.map((n) => n.x + n.w)) + PAD;
    const y0 = Math.min(...ns.map((n) => n.y)) - PAD - HEADER;
    const y1 = Math.max(...ns.map((n) => n.y + n.h)) + PAD;
    const around = ns.every((n) => n.relation === 'around');
    bands.push({ label, x: x0, y: y0, w: x1 - x0, h: y1 - y0, dashed: around });
  }

  return { app: model.app, nodes: [...nodes.values()], edges, bands };
}

// --- SVG emitter ---
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function toSvg(g) {
  const all = [
    ...g.nodes.map((n) => ({ x: n.x, y: n.y, X: n.x + n.w, Y: n.y + n.h })),
    ...g.bands.map((b) => ({ x: b.x, y: b.y, X: b.x + b.w, Y: b.y + b.h })),
  ];
  const minX = Math.min(...all.map((a) => a.x)) - 24;
  const minY = Math.min(...all.map((a) => a.y)) - 24;
  const maxX = Math.max(...all.map((a) => a.X)) + 24;
  const maxY = Math.max(...all.map((a) => a.Y)) + 40;
  const W = maxX - minX, H = maxY - minY;

  const parts = [];
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX} ${minY} ${W} ${H}" font-family="ui-sans-serif,system-ui,Arial" font-size="13">`);
  parts.push(`<rect x="${minX}" y="${minY}" width="${W}" height="${H}" fill="#ffffff"/>`);

  // bands first (background)
  for (const b of g.bands) {
    const dash = b.dashed ? ' stroke-dasharray="6 4"' : '';
    parts.push(`<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="10" fill="#f8fafc" stroke="#cbd5e1"${dash}/>`);
    parts.push(`<text x="${b.x + 12}" y="${b.y + 17}" fill="#64748b" font-size="11" letter-spacing="0.5">${esc(b.label.toUpperCase())}</text>`);
  }

  // edges
  for (const e of g.edges) {
    if (e.kind === 'path') {
      parts.push(`<path d="${e.d}" fill="none" stroke="${ACCENT}" stroke-width="2"/>`);
    } else {
      parts.push(`<path d="${e.d}" fill="none" stroke="#94a3b8" stroke-width="1.5" stroke-dasharray="4 3"/>`);
      if (e.label) {
        parts.push(`<text x="${e.lx}" y="${e.ly}" fill="#94a3b8" font-size="10">${esc(e.label)}</text>`);
      }
    }
  }

  // nodes
  for (const n of g.nodes) {
    const dash = n.satellite ? ' stroke-dasharray="6 4"' : '';
    const stroke = n.satellite ? '#94a3b8' : '#334155';
    parts.push(`<rect x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" rx="8" fill="#ffffff" stroke="${stroke}" stroke-width="1.5"${dash}/>`);
    parts.push(`<text x="${cx(n)}" y="${cy(n) + 4}" text-anchor="middle" fill="#0f172a">${esc(n.label)}</text>`);
  }

  parts.push('</svg>');
  return parts.join('\n');
}

function main() {
  const args = process.argv.slice(2);
  const file = args.find((a) => !a.startsWith('--'));
  const svgIdx = args.indexOf('--svg');
  if (!file) {
    console.error('usage: node scripts/layout.mjs <model.json> [--svg out.svg]');
    process.exit(1);
  }
  const model = JSON.parse(readFileSync(file, 'utf8'));
  const g = layout(model);
  if (svgIdx !== -1 && args[svgIdx + 1]) {
    writeFileSync(args[svgIdx + 1], toSvg(g));
    console.error(`wrote ${args[svgIdx + 1]}`);
  }
  console.log(JSON.stringify(g, null, 2));
}

// Run only when invoked directly.
if (import.meta.url === `file://${process.argv[1]}`) main();
