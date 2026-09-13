// Minimal YAML subset parser for OpenAPI / Kubernetes manifests.
// Zero dependencies. Maps, sequences, scalars, quotes, comments, `|` / `>` blocks,
// multi-document (`---`). Not a full YAML 1.2 implementation.

function stripInlineComment(line) {
  let single = false;
  let dbl = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === "'" && !dbl) single = !single;
    else if (c === '"' && !single) dbl = !dbl;
    else if (c === '#' && !single && !dbl) return line.slice(0, i).trimEnd();
  }
  return line;
}

function indentOf(line) {
  const m = /^ */.exec(line);
  return m ? m[0].length : 0;
}

function parseScalar(raw) {
  const s = raw.trim();
  if (s === '' || s === '~' || /^null$/i.test(s)) return null;
  if (/^true$/i.test(s)) return true;
  if (/^false$/i.test(s)) return false;
  if (/^-?\d+$/.test(s)) return Number(s);
  if (/^-?\d+\.\d+$/.test(s)) return Number(s);
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1);
  }
  return s;
}

function parseFlow(s) {
  try {
    const jsonish = s
      .replace(/([{,]\s*)([A-Za-z_][\w-]*)\s*:/g, '$1"$2":')
      .replace(/'/g, '"');
    return JSON.parse(jsonish);
  } catch {
    return parseScalar(s);
  }
}

/** Parse one YAML document into a JS value. */
export function parseYaml(text) {
  const lines = String(text).replace(/\t/g, '  ').split(/\r?\n/);
  let i = 0;

  const peek = () => lines[i];
  const next = () => lines[i++];
  const done = () => i >= lines.length;

  const skipBlanks = () => {
    while (!done()) {
      const s = stripInlineComment(peek()).trim();
      if (s === '' || s === '...' ) { next(); continue; }
      break;
    }
  };

  const readBlock = (parentIndent, folded) => {
    const rows = [];
    let contentIndent = null;
    while (!done()) {
      const line = peek();
      const ind = indentOf(line);
      const blank = line.trim() === '';
      if (blank) {
        rows.push('');
        next();
        continue;
      }
      if (ind <= parentIndent) break;
      if (contentIndent == null) contentIndent = ind;
      rows.push(line.slice(contentIndent));
      next();
    }
    while (rows.length && rows.at(-1) === '') rows.pop();
    return folded ? rows.join(' ').replace(/  +/g, ' ') : rows.join('\n');
  };

  function parseAt(minIndent) {
    skipBlanks();
    if (done()) return null;
    const line = peek();
    const ind = indentOf(line);
    if (ind < minIndent) return null;
    const stripped = stripInlineComment(line).trim();
    if (stripped.startsWith('{') || stripped.startsWith('[')) {
      next();
      return parseFlow(stripped);
    }
    if (stripped.startsWith('-')) return parseSeq(ind);
    if (stripped.includes(':')) return parseMap(ind);
    next();
    return parseScalar(stripped);
  }

  function parseSeq(baseIndent) {
    const arr = [];
    while (!done()) {
      skipBlanks();
      if (done()) break;
      const line = peek();
      const ind = indentOf(line);
      const stripped = stripInlineComment(line).trim();
      if (ind < baseIndent) break;
      if (!stripped.startsWith('-')) break;
      next();
      const rest = stripped.replace(/^- ?/, '');
      if (rest === '') {
        arr.push(parseAt(baseIndent + 1));
      } else if (rest.startsWith('|') || rest.startsWith('>')) {
        arr.push(readBlock(ind, rest.startsWith('>')));
      } else if (rest.startsWith('{') || rest.startsWith('[')) {
        arr.push(parseFlow(rest));
      } else if (/^[^'"]+:\s*/.test(rest) || rest.endsWith(':')) {
        // "- key: value" or "- key:" then nested
        const synthetic = `${' '.repeat(ind + 2)}${rest}`;
        const saved = lines[i];
        // Temporarily inject — easier: parse key/value from rest as one-entry map start
        const colon = rest.indexOf(':');
        const key = rest.slice(0, colon).trim().replace(/^['"]|['"]$/g, '');
        const after = rest.slice(colon + 1).trim();
        const obj = {};
        if (after === '' || after.startsWith('|') || after.startsWith('>')) {
          if (after.startsWith('|') || after.startsWith('>')) {
            obj[key] = readBlock(ind, after.startsWith('>'));
          } else {
            skipBlanks();
            if (!done() && indentOf(peek()) > ind) {
              const childInd = indentOf(peek());
              const child = stripInlineComment(peek()).trim();
              obj[key] = child.startsWith('-') ? parseSeq(childInd) : parseMap(childInd);
            } else {
              obj[key] = null;
            }
          }
        } else {
          obj[key] = parseScalar(after);
        }
        // More keys for this list item at ind+2
        Object.assign(obj, parseMapContinuation(ind + 2, obj));
        arr.push(obj);
        void saved;
      } else {
        arr.push(parseScalar(rest));
      }
    }
    return arr;
  }

  function parseMapContinuation(baseIndent, seed = {}) {
    // Continue reading keys at baseIndent into seed; used after "- key: val"
    const obj = seed;
    while (!done()) {
      skipBlanks();
      if (done()) break;
      const line = peek();
      const ind = indentOf(line);
      const stripped = stripInlineComment(line).trim();
      if (ind < baseIndent) break;
      if (ind > baseIndent) break;
      if (stripped.startsWith('-')) break;
      if (!stripped.includes(':')) break;
      next();
      const colon = stripped.indexOf(':');
      const key = stripped.slice(0, colon).trim().replace(/^['"]|['"]$/g, '');
      const rest = stripped.slice(colon + 1).trim();
      obj[key] = readMapValue(ind, rest);
    }
    return obj;
  }

  function readMapValue(keyIndent, rest) {
    if (rest.startsWith('|') || rest.startsWith('>')) {
      return readBlock(keyIndent, rest.startsWith('>'));
    }
    if (rest.startsWith('{') || rest.startsWith('[')) return parseFlow(rest);
    if (rest !== '') return parseScalar(rest);
    skipBlanks();
    if (done()) return null;
    const nInd = indentOf(peek());
    if (nInd <= keyIndent) return null;
    const nStrip = stripInlineComment(peek()).trim();
    if (nStrip.startsWith('-')) return parseSeq(nInd);
    return parseMap(nInd);
  }

  function parseMap(baseIndent) {
    const obj = {};
    while (!done()) {
      skipBlanks();
      if (done()) break;
      const line = peek();
      const ind = indentOf(line);
      const stripped = stripInlineComment(line).trim();
      if (ind < baseIndent) break;
      if (ind > baseIndent) break;
      if (stripped.startsWith('-')) break;
      if (stripped === '---' || stripped === '...') { next(); break; }
      if (!stripped.includes(':')) break;
      next();
      const colon = stripped.indexOf(':');
      const key = stripped.slice(0, colon).trim().replace(/^['"]|['"]$/g, '');
      const rest = stripped.slice(colon + 1).trim();
      obj[key] = readMapValue(ind, rest);
    }
    return obj;
  }

  skipBlanks();
  if (done()) return null;
  if (stripInlineComment(peek()).trim() === '---') next();
  skipBlanks();
  if (done()) return null;
  const first = stripInlineComment(peek()).trim();
  if (first.startsWith('-')) return parseSeq(indentOf(peek()));
  return parseMap(indentOf(peek()));
}

/** Split multi-doc YAML and parse each document. */
export function parseYamlDocs(text) {
  const raw = String(text);
  const parts = raw.split(/^\s*---\s*$/m).map((p) => p.trim()).filter((p) => p && p !== '...');
  if (parts.length === 0) return [];
  return parts.map((p) => parseYaml(p)).filter((v) => v != null);
}

/** Parse JSON or YAML text. Filenames ending in .json force JSON. */
export function parseJsonOrYaml(text, filename = '') {
  const t = String(text).trim();
  if (!t) return null;
  const lower = String(filename).toLowerCase();
  if (lower.endsWith('.json') || t.startsWith('{') || t.startsWith('[')) {
    return JSON.parse(t);
  }
  const docs = parseYamlDocs(t);
  if (docs.length === 0) return null;
  if (docs.length === 1) return docs[0];
  return docs;
}
