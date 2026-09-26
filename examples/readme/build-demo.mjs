#!/usr/bin/env node
// Builds examples/readme/demo.svg: the animated README demo.
//
//   node examples/readme/build-demo.mjs
//
// Nothing in it is drawn by hand. It runs the real CLI on the k8s fixture
// (from-k8s → lint → layout), takes the geometry from layout.mjs and the
// terminal lines from lint's actual output, then adds one hop without evidence
// (what an LLM "improving" the diagram does) and shows lint rejecting it.
// Animated with CSS + SMIL only, so it plays inside a README <img>.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "../..");
const cli = join(repo, "skills/honest-arch-diagrams/scripts/cli.mjs");
const fixture = join(repo, "skills/honest-arch-diagrams/adapters/k8s/fixtures/checkout.k8s.json");
const pkg = JSON.parse(readFileSync(join(repo, "package.json"), "utf8"));

// ── Run the real pipeline in a scratch dir, so outputs carry short file names ──
const work = mkdtempSync(join(tmpdir(), "honest-arch-demo-"));
copyFileSync(fixture, join(work, "checkout.k8s.json"));
const run = (...args) => {
  try {
    return execFileSync(process.execPath, [cli, ...args], { cwd: work, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch (err) {
    return `${err.stdout ?? ""}${err.stderr ?? ""}`; // lint exits 1 on purpose below
  }
};
run("from-k8s", "checkout.k8s.json", "--out", "checkout.model.json");
const model = JSON.parse(readFileSync(join(work, "checkout.model.json"), "utf8"));
const pass = run("lint", "checkout.model.json").split("\n")[0].trim();
const layout = JSON.parse(run("layout", "checkout.model.json"));

// An LLM's edit: a plausible gateway between Ingress and oauth2-proxy, no evidence.
const at = model.hops.findIndex((h) => h.id === "oauth");
const invented = { id: "api-gateway", kind: "gateway", label: "API Gateway", lane: "Gateway" };
const llm = { ...model, hops: [...model.hops.slice(0, at), invented, ...model.hops.slice(at)] };
writeFileSync(join(work, "llm.model.json"), JSON.stringify(llm, null, 2));
const failLines = run("lint", "llm.model.json").split("\n").map((l) => l.trim()).filter(Boolean);
const fail = [failLines[0], failLines.find((l) => l.startsWith("-"))?.replace(/^-\s*/, "")].filter(Boolean).join("  ·  ");
if (!pass.startsWith("PASS") || !fail.startsWith("FAIL")) throw new Error(`unexpected lint output:\n${pass}\n${fail}`);

// ── Theme ─────────────────────────────────────────────────────────────────────
const W = 1280, H = 760, T = 16; // canvas, loop seconds
const C = {
  bg: "#1c1f22", panel: "#23272b", line: "#3a4047", text: "#e6e8eb", muted: "#8b949e", faint: "#5c646d",
  path: "#5b9dff", pathFill: "#1d2a3d", companion: "#8b949e", pass: "#5fd38d", fail: "#ff6b61", failFill: "#3a2224",
};
const mono = `ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace`;
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const pct = (s) => `${((s / T) * 100).toFixed(2)}%`;
const HOLD_END = T - 0.8; // everything fades out here, then the loop restarts

// Keyframes are generated per element with absolute times, so every element
// stays in phase with the one loop.
const css = [];
let uid = 0;
const appear = (start, { to = 1, dur = 0.35 } = {}) => {
  const name = `a${uid++}`;
  css.push(`@keyframes ${name}{0%,${pct(start)}{opacity:0}${pct(start + dur)},${pct(HOLD_END)}{opacity:${to}}${pct(HOLD_END + 0.4)},100%{opacity:0}}`);
  return `style="opacity:0;animation:${name} ${T}s linear infinite"`;
};
const draw = (start, dur) => {
  const name = `d${uid++}`;
  css.push(`@keyframes ${name}{0%,${pct(start)}{stroke-dashoffset:1}${pct(start + dur)},100%{stroke-dashoffset:0}}`);
  return `pathLength="1" stroke-dasharray="1" style="stroke-dashoffset:1;animation:${name} ${T}s linear infinite"`;
};
// A bg-colored cover slides right in steps: reads as typing, works in any renderer.
const typed = (x, y, width, start, chars) => {
  const name = `t${uid++}`;
  const dur = Math.min(1.1, 0.02 * chars + 0.25);
  css.push(`@keyframes ${name}{0%,${pct(start)}{transform:translateX(0)}${pct(start + dur)},100%{transform:translateX(${width}px)}}`);
  return `<rect x="${x}" y="${y - 15}" width="${width}" height="21" fill="${C.panel}" style="animation:${name} ${T}s steps(${Math.max(8, Math.round(chars / 2))},end) infinite"/>`;
};

// ── Layout: header, terminal, diagram, footer ────────────────────────────────
const out = [];
const text = (x, y, s, { fill = C.text, size = 13, weight = 400, anchor = "start", extra = "" } = {}) =>
  `<text x="${x}" y="${y}" fill="${fill}" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}" ${extra}>${esc(s)}</text>`;

out.push(`<rect width="${W}" height="${H}" fill="${C.bg}"/>`);
out.push(text(40, 50, "HONEST-ARCH-DIAGRAMS / REQUEST PATH", { size: 22, weight: 700 }));
out.push(text(40, 74, "evidence in → diagram out · every hop proven · never invents one", { fill: C.muted }));
// legend
const lx = 890;
out.push(`<line x1="${lx}" y1="36" x2="${lx + 28}" y2="36" stroke="${C.path}" stroke-width="2.5"/>`, text(lx + 38, 40, "verified path", { fill: C.muted, size: 12 }));
out.push(`<line x1="${lx}" y1="56" x2="${lx + 28}" y2="56" stroke="${C.companion}" stroke-width="1.5" stroke-dasharray="4 3"/>`, text(lx + 38, 60, "inferred companion", { fill: C.muted, size: 12 }));
out.push(`<line x1="${lx}" y1="76" x2="${lx + 28}" y2="76" stroke="${C.fail}" stroke-width="1.5" stroke-dasharray="4 3"/>`, text(lx + 38, 80, "invented hop, rejected", { fill: C.muted, size: 12 }));
out.push(`<line x1="40" y1="94" x2="${W - 40}" y2="94" stroke="${C.line}"/>`);

// Terminal: commands and lint's real output.
const term = { x: 40, y: 108, w: W - 80, h: 150 };
out.push(`<clipPath id="term"><rect x="${term.x + 1}" y="${term.y + 1}" width="${term.w - 2}" height="${term.h - 2}" rx="5"/></clipPath>`);
out.push(`<rect x="${term.x}" y="${term.y}" width="${term.w}" height="${term.h}" rx="6" fill="${C.panel}" stroke="${C.line}"/>`);
const termLines = [];
const CW = 7.9; // mono advance at 13px, generous
const lines = [
  { t: 0.3, tag: "01 / DERIVE", s: "$ npx honest-arch-diagrams from-k8s checkout.k8s.json --out checkout.model.json", type: true },
  { t: 5.0, tag: "02 / LINT", s: "$ npx honest-arch-diagrams lint checkout.model.json", type: true },
  { t: 5.9, tag: "", s: pass, color: C.pass, word: "PASS" },
  { t: 7.8, tag: "03 / LLM EDIT", s: `# an LLM "improves" it: + ${invented.label} between Ingress and oauth2-proxy, no evidence`, color: C.faint },
  { t: 9.3, tag: "", s: "$ npx honest-arch-diagrams lint llm.model.json", type: true },
  { t: 10.3, tag: "", s: fail, color: C.fail, word: "FAIL" },
];
lines.forEach((l, i) => {
  const y = term.y + 28 + i * 22;
  const x = term.x + 150;
  const g = [];
  if (l.tag) g.push(text(term.x + 18, y, l.tag, { fill: C.muted, size: 11, weight: 600, extra: `letter-spacing="0.6"` }));
  if (l.word) {
    g.push(text(x, y, l.word, { fill: l.color, weight: 700 }));
    g.push(text(x + (l.word.length + 1) * CW, y, l.s.slice(l.word.length + 1), { fill: C.text }));
  } else {
    g.push(text(x, y, l.s, { fill: l.color ?? C.text }));
  }
  if (l.type) g.push(typed(x - 2, y, l.s.length * CW + 12, l.t, l.s.length));
  termLines.push(`<g ${appear(l.t, { dur: l.type ? 0.05 : 0.3 })}>${g.join("")}</g>`);
});
out.push(`<g clip-path="url(#term)">${termLines.join("")}</g>`);

// Diagram: layout.mjs geometry, scaled into the lower panel.
const nodes = Object.fromEntries(layout.nodes.map((n) => [n.id, n]));
const all = [...layout.nodes, ...layout.bands];
const bx0 = Math.min(...all.map((b) => b.x)), by0 = Math.min(...all.map((b) => b.y));
const bx1 = Math.max(...all.map((b) => b.x + b.w)), by1 = Math.max(...all.map((b) => b.y + b.h));
const S = Math.min((W - 80) / (bx1 - bx0), 372 / (by1 - by0));
const ox = 40 + ((W - 80) - (bx1 - bx0) * S) / 2, oy = 282;
const tf = `transform="translate(${(ox - bx0 * S).toFixed(1)} ${(oy - by0 * S).toFixed(1)}) scale(${S.toFixed(4)})"`;
const d = [];
const labelSize = (n) => Math.min(14, (n.w - 14) / (String(n.label).length * 0.61)).toFixed(1);

// bands
for (const b of layout.bands) {
  d.push(`<g ${appear(0.6 + (b.dashed ? 0.3 : 0))}><rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="8" fill="none" stroke="${C.line}" ${b.dashed ? `stroke-dasharray="6 4"` : ""}/>` +
    `<text x="${b.x + 12}" y="${b.y + 18}" fill="${C.faint}" font-size="11" font-weight="600" letter-spacing="0.8">${esc(b.label.toUpperCase())}</text></g>`);
}

// the spine, hop by hop: the edge draws, then the node lights up
const spine = layout.edges.filter((e) => e.kind === "path");
const order = [spine[0].from, ...spine.map((e) => e.to)];
const STEP = 0.5, S0 = 1.6;
const litAt = Object.fromEntries(order.map((id, i) => [id, S0 + i * STEP]));
spine.forEach((e, i) => {
  d.push(`<path d="${e.d}" fill="none" stroke="${C.path}" stroke-width="2.5" ${draw(S0 + i * STEP + 0.05, STEP - 0.05)}/>`);
});

// the request dot rides the spine once it is drawn (SMIL: plays in an <img>)
const pathPts = [];
order.forEach((id, i) => {
  const n = nodes[id];
  if (i === 0) pathPts.push(`M ${n.x + n.w / 2},${n.y + n.h / 2}`);
  const e = spine[i];
  if (e) pathPts.push(e.d.replace(/^M/, "L"));
  else pathPts.push(`L ${n.x + n.w / 2},${n.y + n.h / 2}`);
});
const dotStart = S0 + order.length * STEP, dotEnd = dotStart + 1.6;
const kt = (s) => (s / T).toFixed(4);
d.push(`<circle r="6" fill="${C.path}" opacity="0"><animateMotion dur="${T}s" repeatCount="indefinite" path="${pathPts.join(" ")}" keyPoints="0;0;1;1" keyTimes="0;${kt(dotStart)};${kt(dotEnd)};1" calcMode="linear"/>` +
  `<animate attributeName="opacity" dur="${T}s" repeatCount="indefinite" values="0;0;1;1;0;0" keyTimes="0;${kt(dotStart)};${kt(dotStart + 0.1)};${kt(dotEnd)};${kt(dotEnd + 0.2)};1"/></circle>`);

// companions: dashed, evidence on the edge
const linked = layout.edges.filter((e) => e.kind !== "path");
const COMP = 4.4;
linked.forEach((e, i) => {
  const [, x, y] = e.d.match(/M\s*([\d.]+),([\d.]+)/);
  d.push(`<g ${appear(COMP + i * 0.25)}><path d="${e.d}" fill="none" stroke="${C.companion}" stroke-width="1.5" stroke-dasharray="4 3"/>` +
    (e.label ? `<text x="${+x + 10}" y="${e.d.split("L")[1].trim().split(",")[1] - 6}" fill="${C.muted}" font-size="10">${esc(e.label)}</text>` : "") + `</g>`);
});

// nodes
for (const n of layout.nodes) {
  const onPath = n.id in litAt;
  const t0 = onPath ? litAt[n.id] : COMP + 0.3;
  if (onPath) {
    const name = `n${uid++}`;
    css.push(`@keyframes ${name}{0%,${pct(t0)}{stroke:${C.line};fill:${C.panel}}${pct(t0 + 0.25)},100%{stroke:${C.path};fill:${C.pathFill}}}`);
    d.push(`<g ${appear(0.8)}><rect x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" rx="6" stroke-width="1.8" style="stroke:${C.line};fill:${C.panel};animation:${name} ${T}s linear infinite"/>` +
      `<text x="${n.x + n.w / 2}" y="${n.y + n.h / 2 + 5}" text-anchor="middle" fill="${C.text}" font-size="${labelSize(n)}">${esc(n.label)}</text></g>`);
  } else {
    d.push(`<g ${appear(t0)}><rect x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" rx="6" fill="${C.bg}" stroke="${C.companion}" stroke-width="1.4" stroke-dasharray="5 4"/>` +
      `<text x="${n.x + n.w / 2}" y="${n.y + n.h / 2 + 5}" text-anchor="middle" fill="${C.muted}" font-size="${labelSize(n)}">${esc(n.label)}</text></g>`);
  }
}

// the invented hop: appears as a detour, lint rejects it, it gets struck out
const ing = nodes.ingress, oa = nodes.oauth;
const gx = (ing.x + ing.w / 2 + oa.x + oa.w / 2) / 2 - 80, gy = ing.y + ing.h + 110, gw = 160, gh = 56;
const INV = 8.0, REJ = 10.6;
const detour = `M ${ing.x + ing.w / 2},${ing.y + ing.h} L ${ing.x + ing.w / 2},${gy + gh / 2} L ${gx},${gy + gh / 2} ` +
  `M ${gx + gw},${gy + gh / 2} L ${oa.x + oa.w / 2},${gy + gh / 2} L ${oa.x + oa.w / 2},${oa.y + oa.h}`;
d.push(`<g ${appear(INV)}><path d="${detour}" fill="none" stroke="${C.fail}" stroke-width="2" stroke-dasharray="6 4"/>` +
  `<rect x="${gx}" y="${gy}" width="${gw}" height="${gh}" rx="6" fill="${C.failFill}" stroke="${C.fail}" stroke-width="1.8" stroke-dasharray="6 4"/>` +
  `<text x="${gx + gw / 2}" y="${gy + gh / 2 + 5}" text-anchor="middle" fill="${C.text}" font-size="14">${esc(invented.label)}</text>` +
  `<text x="${gx + gw / 2}" y="${gy - 16}" text-anchor="middle" fill="${C.fail}" font-size="11" letter-spacing="0.6">NO EVIDENCE</text></g>`);
d.push(`<g ${appear(REJ)}><line x1="${gx - 8}" y1="${gy - 4}" x2="${gx + gw + 8}" y2="${gy + gh + 4}" stroke="${C.fail}" stroke-width="3"/>` +
  `<line x1="${gx + gw + 8}" y1="${gy - 4}" x2="${gx - 8}" y2="${gy + gh + 4}" stroke="${C.fail}" stroke-width="3"/>` +
  `<text x="${gx + gw / 2}" y="${gy + gh + 26}" text-anchor="middle" fill="${C.fail}" font-size="12" font-weight="700" letter-spacing="0.6">REJECTED BY LINT · NOT DRAWN</text></g>`);

out.push(`<g ${tf}>${d.join("")}</g>`);

// Footer
out.push(`<line x1="40" y1="${H - 62}" x2="${W - 40}" y2="${H - 62}" stroke="${C.line}"/>`);
out.push(text(40, H - 34, "$ npx honest-arch-diagrams", { fill: C.text }));
out.push(text(320, H - 34, "$ npx skills add albegosu/honest-arch-diagrams", { fill: C.text }));
out.push(text(W - 40, H - 34, `evidence: k8s · gitops · compose · terraform · openapi · otel  ·  v${pkg.version}`, { fill: C.faint, size: 12, anchor: "end" }));

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family='${mono}' role="img" aria-label="honest-arch-diagrams: derive a request path from Kubernetes, lint it, and reject a hop an LLM invented">
<style>${css.join("")}</style>
${out.join("\n")}
</svg>
`;
writeFileSync(join(here, "demo.svg"), svg);
console.log(`Wrote examples/readme/demo.svg (${(svg.length / 1024).toFixed(1)} kB, ${T}s loop)\n  ${pass}\n  ${fail}`);
