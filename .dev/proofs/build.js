// Builds the proofs document for all 80 SEMNEST items and checks every
// non-nesting argument in exact rational arithmetic.
//   node .dev/proofs/build.js            -> check + semnest_proofs.tex (+ pdf if pdflatex is found)
'use strict';
const fs = require('fs'), path = require('path'), { execSync } = require('child_process');
const { load } = require('../load.js');
const SN = load('linalg.js', 'sem.js', 'bank.js', 'diagram.js');
const X = require('./exact.js');
const PROOFS = require('./items.js');
const DIR = __dirname;

const REL_TEX = {
  equiv: String.raw`$A \equiv B$: the models are \textbf{equivalent}.`,
  AinB: String.raw`$A \nest B$, $B \nnest A$: \textbf{A is nested in B} (strictly).`,
  BinA: String.raw`$B \nest A$, $A \nnest B$: \textbf{B is nested in A} (strictly).`,
  neither: String.raw`$A \nnest B$ and $B \nnest A$: \textbf{neither} is nested in the other.`,
};
const LEVEL = { 1: 'Easy', 2: 'Medium', 3: 'Hard', 4: 'Psychometrika' };

// ------------------------------------------------------------------ checks
let failures = 0;
const appendix = [];
function paramName(Mo, e) {
  const nm = (k) => { const v = Mo.vars[k]; const m = v.match(/^([A-Za-z]+?)(\d+)$/); return m ? `${m[1]}_{${m[2]}}` : v; };
  if (e.kind === 'A') return `${nm(e.j)}\\to ${nm(e.i)}`;
  if (e.kind === 'S') return e.i === e.j ? `\\mathrm{Var}(${nm(e.i)})` : `\\mathrm{Cov}(${nm(e.i)},${nm(e.j)})`;
  return `k_{${nm(e.i)},${nm(e.j)}}`;
}
function witnessFor(Mo, test) {
  for (let shift = 0; shift < 12; shift++) {
    const th = X.witness(Mo, shift);
    const S = X.implied(Mo, th);
    if (!S || !X.isPDnum(S)) continue;
    const r = test(th, S);
    if (r) return Object.assign({ th, shift }, r);
  }
  return null;
}
function checkDirection(it, from, to, d) {
  const MX = SN.sem.compile(it[from], it.obs), MY = SN.sem.compile(it[to], it.obs);
  const label = `${it.id} ${from}\\not\\preceq ${to}`;
  if (d.dim) {
    const w = witnessFor(MX, (th) => { const r = X.rank(X.jacobian(MX, th)); return r > MY.q ? { rank: r } : null; });
    if (!w) { failures++; console.log('FAIL dim', it.id, from, '->', to); return { ok: false }; }
    appendix.push({ id: it.id, kind: 'dim', from, to, M: MX, th: w.th, rank: w.rank, qY: MY.q });
    return { ok: true, tex: String.raw`$${from}\nnest ${to}$ by Lemma~D: the Jacobian of model $${from}$ has rank ${w.rank} at the rational point listed in Appendix~B, while model $${to}$ has only $q_${to}=${MY.q}$ free parameters.` };
  }
  const f = X.parseExpr(d.f);
  // f must vanish on the second model (exact, several random rational points)
  const rng = SN.la.rng(it.id.charCodeAt(0) * 131 + +it.id.slice(1));
  for (let k = 0; k < 4; k++) {
    let th, S;
    for (let t = 0; t < 30; t++) { th = X.randomPoint(MY, rng); S = X.implied(MY, th); if (S && X.isPDnum(S)) break; }
    const v = X.evalExpr(f, S, it.obs);
    if (!v.isZero()) { failures++; console.log('FAIL: f does not vanish on', to, it.id, d.f, v.toString()); return { ok: false }; }
  }
  const w = witnessFor(MX, (th, S) => { const v = X.evalExpr(f, S, it.obs); return v.isZero() ? null : { val: v }; });
  if (!w) { failures++; console.log('FAIL: f vanishes at the witnesses of', from, it.id); return { ok: false }; }
  appendix.push({ id: it.id, kind: 'sep', from, to, M: MX, th: w.th, val: w.val });
  const ftex = X.texExpr(f);
  const num = w.val.toNumber();
  return { ok: true, tex: String.raw`$${from}\nnest ${to}$ by Lemma~S with $f(\Sigma)=${ftex}$. ${d.why} So $f\equiv0$ on $\mathcal M_${to}$, whereas ` +
    (d.val ? String.raw`in model $${from}$, $f=${d.val}\neq0$ for generic parameters; e.g.\ ` : String.raw`in model $${from}$ `) +
    String.raw`at the point of Appendix~B, $f=${w.val.d === 1n && String(w.val.n).length < 12 ? w.val.toString() : num.toPrecision(4)}\neq0$.` };
}

// ------------------------------------------------------------------ TikZ
function tikzPair(it) {
  const sa = SN.sem.parse(it.A, it.obs), sb = SN.sem.parse(it.B, it.obs);
  const LA = SN.diagram.layout(sa, Object.assign({}, it.pos, it.posA), it.res);
  const LB = SN.diagram.layout(sb, Object.assign({}, it.pos, it.posB), it.res);
  const b = SN.diagram.unionBounds([LA, LB]);
  const w = b.x1 - b.x0 + 0.4, h = b.y1 - b.y0 + 0.4;
  const s = Math.min(7.6 / w, 5.6 / h, 1.25);
  const G = SN.diagram.G;
  const styles = String.raw`[x=1cm, y=1cm,
    obs/.style={draw, rounded corners=0.6pt, minimum size=${(2 * G.obsHalf * s).toFixed(3)}cm, inner sep=0pt, fill=white, font=\fontsize{${(9 * Math.min(1, s)).toFixed(1)}}{10}\selectfont},
    lat/.style={draw, circle, minimum size=${(2 * G.latR * s).toFixed(3)}cm, inner sep=0pt, fill=latfill, font=\fontsize{${(9 * Math.min(1, s)).toFixed(1)}}{10}\selectfont},
    resid/.style={draw=residc, line width=0.4pt}, residarrow/.style={draw=residc, -{Stealth[length=1.6pt]}, line width=0.4pt},
    path/.style={-{Stealth[length=${(3.4 * Math.min(1, s + 0.15)).toFixed(1)}pt]}, line width=0.55pt},
    cov/.style={{Stealth[length=${(3.4 * Math.min(1, s + 0.15)).toFixed(1)}pt]}-{Stealth[length=${(3.4 * Math.min(1, s + 0.15)).toFixed(1)}pt]}, line width=0.55pt},
    net/.style={draw=netc, line width=1.1pt, line cap=round},
    elabel/.style={font=\scriptsize\itshape, fill=white, inner sep=0.6pt}]`;
  const one = (L) => SN.diagram.tikz(L, { scale: s, bounds: b }).replace('\\begin{tikzpicture}[x=1cm,y=1cm]', '\\begin{tikzpicture}' + styles);
  return { A: one(LA), B: one(LB) };
}

// ------------------------------------------------------------------ document
const esc = (t) => t.replace(/[&%#_]/g, (c) => '\\' + c);
function syntaxTex(s) { return '\\texttt{' + esc(s).replace(/;\s*/g, '; ').replace(/~/g, '\\char`\\~{}').replace(/\^/g, '\\^{}') + '}'; }

const pages = [];
for (const it of SN.bank.items) {
  const P = PROOFS[it.id];
  if (!P) { failures++; console.log('no proof for', it.id); continue; }
  const MA = SN.sem.compile(it.A, it.obs), MB = SN.sem.compile(it.B, it.obs);
  const holdsAB = it.rel === 'equiv' || it.rel === 'AinB', holdsBA = it.rel === 'equiv' || it.rel === 'BinA';
  const part = (holds, d, from, to) => {
    if (holds) {
      if (!d || !d.text) { failures++; console.log('missing nesting proof', it.id, from, to); return ''; }
      return String.raw`$${from}\nest ${to}$. ` + d.text;
    }
    if (!d || (!d.dim && !d.f)) { failures++; console.log('missing non-nesting proof', it.id, from, to); return ''; }
    const r = checkDirection(it, from, to, d);
    return r.ok ? r.tex : '\\textbf{CHECK FAILED}';
  };
  const ab = part(holdsAB, P.ab, 'A', 'B');
  const ba = part(holdsBA, P.ba, 'B', 'A');
  const tk = tikzPair(it);
  const p = it.obs.length;
  pages.push(String.raw`\clearpage
\section*{${it.id} \quad ${esc(P.title)}}
\addcontentsline{toc}{subsection}{${it.id}\quad ${esc(P.title)}}
\noindent\textit{Level: ${LEVEL[it.level]}.} Observed variables: $${it.obs.map(v => { const m = v.match(/^([A-Za-z]+?)(\d+)$/); return m ? `${m[1]}_{${m[2]}}` : v; }).join(', ')}$ ($p=${p}$, ${p * (p + 1) / 2} moments).\par\medskip
\noindent\begin{minipage}[t]{0.49\textwidth}\centering\textbf{\color{acol}Model A} \;{\small $q_A=${MA.q}$}\\[2pt]
${tk.A}\\[1pt]{\scriptsize ${syntaxTex(it.A || '(no paths: variances only)')}}\end{minipage}\hfill
\begin{minipage}[t]{0.49\textwidth}\centering\textbf{\color{bcol}Model B} \;{\small $q_B=${MB.q}$}\\[2pt]
${tk.B}\\[1pt]{\scriptsize ${syntaxTex(it.B || '(no paths: variances only)')}}\end{minipage}
\par\bigskip
\noindent\textbf{Claim.} ${REL_TEX[it.rel]}\par\smallskip
\noindent\textbf{Proof.} (i) ${ab}\par\smallskip
\noindent(ii) ${ba}\hfill$\square$\par\medskip
\noindent{\small\textit{In the game:} ${esc(it.why)}}
`);
}

// appendix B: witness points
const appTex = appendix.map(a => {
  const pars = a.M.groups.map((g, k) => {
    const e = g.entries[0];
    return `$${g.label ? g.label + '\\,{:}\\,' : ''}${paramName(a.M, e)}=${a.th[k].tex()}$`;
  }).join(', ');
  const res = a.kind === 'dim' ? `rank of the Jacobian $=${a.rank}>q_${a.to}=${a.qY}$` : `$f=${a.val.d === 1n ? a.val.toString() : a.val.toNumber().toPrecision(6)}$`;
  return String.raw`\noindent\textbf{${a.id}}, model ${a.from} (for $${a.from}\nnest ${a.to}$): ${res}. {\footnotesize ${pars}.}\par\smallskip`;
}).join('\n');

const pre = fs.readFileSync(path.join(DIR, 'preamble.tex'), 'utf8');
const doc = pre.replace('%%ITEMS%%', () => pages.join('\n')).replace('%%APPENDIX%%', () => appTex);
fs.writeFileSync(path.join(DIR, 'semnest_proofs.tex'), doc);
console.log(failures ? failures + ' FAILURES' : 'all checks passed', '-', pages.length, 'items,', appendix.length, 'exact checks');
if (process.argv.includes('--pdf') || true) {
  try {
    for (let k = 0; k < 2; k++) execSync('pdflatex -interaction=nonstopmode -halt-on-error semnest_proofs.tex', { cwd: DIR, stdio: 'pipe' });
    console.log('PDF written:', path.join(DIR, 'semnest_proofs.pdf'));
  } catch (e) {
    const log = fs.existsSync(path.join(DIR, 'semnest_proofs.log')) ? fs.readFileSync(path.join(DIR, 'semnest_proofs.log'), 'utf8') : '';
    const i = log.indexOf('\n!');
    console.log('pdflatex failed:', i >= 0 ? log.slice(i, i + 900) : e.message.slice(0, 900));
  }
}
process.exitCode = failures ? 1 : 0;
