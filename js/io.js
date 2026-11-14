/* Import / export: .xmind, PDF, Markdown/text, JSON, PNG, SVG */
(function (g) {
'use strict';
const MM = g.MindMap, uid = MM.uid;
const CDN = {
  jszip: 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js',
  pdf: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
  pdfWorker: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'
};
const loaded = {};
function script(src) {
  return loaded[src] || (loaded[src] = new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = src; s.onload = res;
    s.onerror = () => { delete loaded[src]; rej(new Error('Could not load the library: ' + src)); }; document.head.append(s);
  }));
}
const needZip = async () => { if (!g.JSZip) await script(CDN.jszip); };
async function needPdf() {
  if (!g.pdfjsLib) await script(CDN.pdf);
  if (!g.pdfjsLib.GlobalWorkerOptions.workerSrc) {      // load worker through a blob URL to avoid the cross-origin worker restriction
    const code = await (await fetch(CDN.pdfWorker)).text();
    g.pdfjsLib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
  }
}

const mkNode = (text, children = []) => ({ id: uid(), text: String(text || '').trim() || '(empty)', children });
const mkDoc = (title, root, layout = 'map') => ({ v: 1, id: uid(), title, layout, theme: 'classic', lineStyle: 'curve', root });
const baseName = f => f.replace(/\.[^.]+$/, '');
const safeName = s => (s || 'mindmap').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'mindmap';

/* ---------- XMind ---------- */
const XM_MARKERS = {
  'priority-1': 'p1', 'priority-2': 'p2', 'priority-3': 'p3', 'priority-4': 'p4', 'priority-5': 'p5', 'priority-6': 'p6', 'priority-7': 'p7',
  'task-start': 't0', 'task-oct': 't25', 'task-quarter': 't25', 'task-half': 't50', 'task-3oct': 't75', 'task-3quar': 't75', 'task-done': 't100',
  'symbol-right': 'ok', 'symbol-wrong': 'no', 'symbol-question': 'q', 'symbol-exclam': '!', 'other-lightbulb': 'idea', 'symbol-heart': 'heart',
  'flag-red': 'flag', 'flag-green': 'flag', 'flag-blue': 'flag', 'star-red': 'star', 'star-yellow': 'star', 'star-orange': 'star', 'symbol-pin': 'pin', 'symbol-warning': 'warn'
};
const XM_BACK = { p1: 'priority-1', p2: 'priority-2', p3: 'priority-3', p4: 'priority-4', p5: 'priority-5', p6: 'priority-6', p7: 'priority-7', t0: 'task-start', t25: 'task-quarter', t50: 'task-half', t75: 'task-3quar', t100: 'task-done', ok: 'symbol-right', no: 'symbol-wrong', q: 'symbol-question', '!': 'symbol-exclam', idea: 'other-lightbulb', heart: 'symbol-heart', flag: 'flag-red', star: 'star-red', pin: 'symbol-pin', warn: 'symbol-warning' };
const XM_LAYOUT = { 'org.xmind.ui.map.clockwise': 'map', 'org.xmind.ui.map.unbalanced': 'map', 'org.xmind.ui.logic.right': 'right', 'org.xmind.ui.logic.left': 'left', 'org.xmind.ui.org-chart.down': 'org', 'org.xmind.ui.tree.right': 'right' };
const XM_LAYOUT_BACK = { map: 'org.xmind.ui.map.clockwise', right: 'org.xmind.ui.logic.right', left: 'org.xmind.ui.logic.left', org: 'org.xmind.ui.org-chart.down' };
const okColor = c => /^#[0-9a-f]{6}$/i.test(c || '') ? c : null;

function xmJsonTopic(t) {
  const n = mkNode(t.title || '');
  if (t.notes) { const p = t.notes.plain && t.notes.plain.content; if (p) n.note = p; else if (t.notes.html) { const d = new DOMParser().parseFromString(JSON.stringify(t.notes.html), 'text/html'); n.note = (d.body.textContent || '').slice(0, 2000); } }
  if (t.href && /^https?:/i.test(t.href)) n.link = t.href;
  if (Array.isArray(t.labels) && t.labels.length) n.labels = t.labels.map(String);
  if (Array.isArray(t.markers)) { const m = t.markers.map(x => XM_MARKERS[x.markerId]).filter(Boolean); if (m.length) n.markers = [...new Set(m)]; }
  const pr = t.style && t.style.properties; if (pr) {
    const s = {}; const f = okColor(pr['svg:fill']); if (f) s.fill = f; const c = okColor(pr['fo:color']); if (c) s.color = c;
    if (/bold/i.test(pr['fo:font-weight'] || '')) s.bold = true; if (/italic/i.test(pr['fo:font-style'] || '')) s.italic = true;
    if (Object.keys(s).length) n.style = s;
  }
  const ch = t.children || {};
  (ch.attached || []).forEach(c => n.children.push(xmJsonTopic(c)));
  (ch.detached || []).forEach(c => n.children.push(xmJsonTopic(c)));
  if (t.collapsed || (t.branch === 'folded')) n.collapsed = true;
  return n;
}
function xmXmlTopic(el) {
  const kid = (p, name) => [...p.children].filter(c => c.localName === name);
  const n = mkNode((kid(el, 'title')[0] || {}).textContent || '');
  const notes = kid(el, 'notes')[0]; if (notes) { const pl = notes.getElementsByTagName('plain')[0]; if (pl && pl.textContent.trim()) n.note = pl.textContent.trim(); }
  const href = el.getAttribute('xlink:href') || el.getAttributeNS('http://www.w3.org/1999/xlink', 'href'); if (href && /^https?:/i.test(href)) n.link = href;
  const mr = kid(el, 'marker-refs')[0]; if (mr) { const m = [...mr.getElementsByTagName('marker-ref')].map(x => XM_MARKERS[x.getAttribute('marker-id')]).filter(Boolean); if (m.length) n.markers = [...new Set(m)]; }
  const lb = kid(el, 'labels')[0]; if (lb) n.labels = [...lb.getElementsByTagName('label')].map(x => x.textContent).filter(Boolean);
  const ch = kid(el, 'children')[0];
  if (ch) kid(ch, 'topics').forEach(ts => kid(ts, 'topic').forEach(t => n.children.push(xmXmlTopic(t))));
  if (el.getAttribute('branch') === 'folded') n.collapsed = true;
  return n;
}
async function importXMind(file) {
  await needZip();
  let zip; try { zip = await JSZip.loadAsync(file); } catch (e) { throw new Error('Could not read the .xmind file (corrupt or not the right format).'); }
  const docs = [];
  if (zip.file('content.json')) {
    const sheets = JSON.parse(await zip.file('content.json').async('string'));
    sheets.forEach((s, i) => { if (!s.rootTopic) return; const root = xmJsonTopic(s.rootTopic);
      docs.push(mkDoc(s.title && s.title.trim() ? s.title.trim() : (root.text || baseName(file.name)) + (i ? ' ' + (i + 1) : ''), root, XM_LAYOUT[s.rootTopic.structureClass] || 'map')); });
  } else if (zip.file('content.xml')) {
    const xml = new DOMParser().parseFromString(await zip.file('content.xml').async('string'), 'application/xml');
    [...xml.getElementsByTagName('sheet')].forEach((sh, i) => {
      const top = [...sh.children].find(c => c.localName === 'topic'); if (!top) return;
      const root = xmXmlTopic(top), tt = [...sh.children].find(c => c.localName === 'title');
      docs.push(mkDoc((tt && tt.textContent.trim()) || root.text || baseName(file.name) + (i ? ' ' + (i + 1) : ''), root));
    });
  } else throw new Error('This .xmind file has no readable content (very old XMind or password-protected).');
  if (!docs.length) throw new Error('No map found in the .xmind file.');
  return docs;
}
async function exportXMind(book) {
  const sheets = book.sheets || [book];
  await needZip();
  const topic = (n, top, doc) => {
    const t = { id: n.id, class: 'topic', title: n.text };
    if (top) t.structureClass = XM_LAYOUT_BACK[(doc || {}).layout] || XM_LAYOUT_BACK.map;
    if (n.note) t.notes = { plain: { content: n.note } };
    if (n.link) t.href = n.link;
    if (n.labels && n.labels.length) t.labels = n.labels;
    if (n.markers && n.markers.length) t.markers = n.markers.map(m => XM_BACK[m]).filter(Boolean).map(markerId => ({ markerId }));
    if (n.style && (n.style.fill || n.style.color)) { const p = {}; if (n.style.fill) p['svg:fill'] = n.style.fill; if (n.style.color) p['fo:color'] = n.style.color; t.style = { id: uid(), properties: p }; }
    if (n.collapsed) t.branch = 'folded';
    if (n.children.length) t.children = { attached: n.children.map(c => topic(c, false, doc)) };
    return t;
  };
  const zip = new JSZip();
  zip.file('content.json', JSON.stringify(sheets.map(sh => ({ id: uid(), class: 'sheet', title: sh.title, rootTopic: topic(sh.root, true, sh) }))));
  zip.file('metadata.json', JSON.stringify({ creator: { name: 'Mind Map' } }));
  zip.file('manifest.json', JSON.stringify({ 'file-entries': { 'content.json': {}, 'metadata.json': {} } }));
  return zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.xmind.workbook' });
}

/* ---------- PDF ---------- */
async function pageOf(pdf, dest) {
  try {
    if (typeof dest === 'string') dest = await pdf.getDestination(dest);
    if (!Array.isArray(dest)) return null; const ref = dest[0];
    if (ref && typeof ref === 'object') return (await pdf.getPageIndex(ref)) + 1;
    if (Number.isInteger(ref)) return ref + 1;
  } catch (e) {}
  return null;
}
async function pdfOutlineToNodes(pdf, items, counter) {
  const out = [];
  for (const it of items) {
    if (counter.n++ > 4000) break;
    const n = mkNode(it.title);
    const p = await pageOf(pdf, it.dest); if (p) n.labels = ['tr.' + p];
    if (it.items && it.items.length) n.children = await pdfOutlineToNodes(pdf, it.items, counter);
    out.push(n);
  }
  return out;
}
async function pdfHeuristic(pdf, title, progress) {
  const N = pdf.numPages, lines = [];
  for (let p = 1; p <= N; p++) {
    const pg = await pdf.getPage(p), H = pg.getViewport({ scale: 1 }).height, tc = await pg.getTextContent(); progress && progress(p, N);
    const rows = [];
    tc.items.forEach(i => {
      if (!i.str || !i.str.trim()) return;
      const y = Math.round(i.transform[5]), h = Math.abs(i.transform[3]) || i.height || 0;
      let row = rows.find(r => Math.abs(r.y - y) <= 2); if (!row) { row = { y, items: [], h: 0 }; rows.push(row); }
      row.items.push(i); row.h = Math.max(row.h, h);
    });
    rows.sort((a, b) => b.y - a.y).forEach(r => {
      r.items.sort((a, b) => a.transform[4] - b.transform[4]);
      let text = '', prev = null;
      r.items.forEach(i => { if (prev) { const gap = i.transform[4] - (prev.transform[4] + prev.width); if (gap > r.h * 0.2 && !/\s$/.test(text) && !/^\s/.test(i.str)) text += ' '; } text += i.str; prev = i; });
      text = text.replace(/\s+/g, ' ').trim(); if (text) lines.push({ page: p, size: Math.round(r.h * 2) / 2, text, y: r.y });
    });
  }
  // drop running headers / footers / page numbers
  const key = t => t.replace(/\d+/g, '#').toLowerCase(), cnt = new Map();
  lines.forEach(l => { if (!l.band) return; const k = key(l.text); const s = cnt.get(k) || new Set(); s.add(l.page); cnt.set(k, s); });
  const rep = Math.max(3, N * 0.4);      // only lines in the top/bottom margin band count as running headers/footers
  const body = lines.filter(l => !(l.band && (cnt.get(key(l.text)).size >= rep || /^[\d\s.\-–]+$/.test(l.text))));
  const weight = new Map(); body.forEach(l => weight.set(l.size, (weight.get(l.size) || 0) + l.text.length));
  let bodySize = 0, best = 0; weight.forEach((w, s) => { if (w > best) { best = w; bodySize = s; } });
  const isHead = l => l.size >= bodySize * 1.12 && l.text.length >= 2 && l.text.length <= 160;
  const heads = [];
  body.forEach(l => {
    if (!isHead(l)) return; const last = heads[heads.length - 1];
    if (last && last.page === l.page && last.size === l.size && Math.abs(last.y - l.y) < l.size * 2.4 && last.lastIdx === body.indexOf(l) - 1) { last.text += ' ' + l.text; last.y = l.y; last.lastIdx = body.indexOf(l); }
    else heads.push({ page: l.page, size: l.size, text: l.text, y: l.y, lastIdx: body.indexOf(l) });
  });
  const root = mkNode(title);
  if (heads.length >= 3) {
    const sizes = [...new Set(heads.map(h => h.size))].sort((a, b) => b - a).slice(0, 4);
    const stack = [{ lvl: -1, n: root }];
    heads.forEach(h => {
      const lvl = Math.min(sizes.indexOf(h.size) === -1 ? sizes.length - 1 : sizes.indexOf(h.size), 3);
      while (stack[stack.length - 1].lvl >= lvl) stack.pop();
      const n = mkNode(h.text); n.labels = ['tr.' + h.page]; stack[stack.length - 1].n.children.push(n); stack.push({ lvl, n });
    });
    return { root, how: 'heading' };
  }
  const byPage = new Map(); body.forEach(l => { (byPage.get(l.page) || byPage.set(l.page, []).get(l.page)).push(l.text); });
  byPage.forEach((txt, p) => {
    const n = mkNode('Trang ' + p + ': ' + txt[0].slice(0, 90)); n.note = txt.join('\n').slice(0, 2500); root.children.push(n);
  });
  return { root, how: 'page' };
}
async function importPDF(file, progress) {
  await needPdf();
  const data = new Uint8Array(await file.arrayBuffer());
  let pdf; try { pdf = await pdfjsLib.getDocument({ data }).promise; }
  catch (e) { throw new Error(e && e.name === 'PasswordException' ? 'This PDF is password-protected. Remove the password and import again.' : 'Could not read the PDF file.'); }
  let title = baseName(file.name);
  try { const m = await pdf.getMetadata(); const t = m && m.info && m.info.Title; if (t && t.trim().length > 2 && !/^(untitled|microsoft word.*|document\d*)$/i.test(t.trim())) title = t.trim(); } catch (e) {}
  let outline = null; try { outline = await pdf.getOutline(); } catch (e) {}
  let root, how;
  if (outline && outline.length) { root = mkNode(title, await pdfOutlineToNodes(pdf, outline, { n: 0 })); how = 'outline'; }
  else { const r = await pdfHeuristic(pdf, title, progress); root = r.root; how = r.how; }
  if (!root.children.length) throw new Error('The PDF has no extractable text (it may be a scan). Run OCR first, then import again.');
  const d = mkDoc(title, root, 'right'); d.importNote = how === 'outline' ? 'Used the PDF outline (bookmarks).' : how === 'heading' ? 'The PDF has no outline; headings were detected by font size.' : 'The PDF has no outline and no headings were found; each page became a topic (text is in the note).';
  return [d];
}

/* ---------- text / markdown / json ---------- */
async function importText(file) {
  const text = await file.text(), title = baseName(file.name), nodes = MM.parseOutline(text);
  if (!nodes.length) throw new Error('The file is empty.');
  const root = nodes.length === 1 ? nodes[0] : mkNode(title, nodes);
  return [mkDoc(root.text || title, root, 'right')];
}
async function importJSON(file) {
  let d; try { d = JSON.parse(await file.text()); } catch (e) { throw new Error('Invalid JSON file.'); }
  if (!d || (!d.root && !d.sheets)) throw new Error('This JSON file is not a map from this app.');
  d.id = uid(); return [d];
}
async function importFile(file, progress) {
  const n = file.name.toLowerCase();
  if (n.endsWith('.xmind')) return importXMind(file);
  if (n.endsWith('.pdf')) return importPDF(file, progress);
  if (n.endsWith('.json')) return importJSON(file);
  if (/\.(md|markdown|txt)$/.test(n)) return importText(file);
  throw new Error('Unsupported format. Use .xmind, .pdf, .md, .txt or .json.');
}
function kindOf(name) { name = name.toLowerCase(); return name.endsWith('.xmind') ? 'xmind' : name.endsWith('.pdf') ? 'pdf' : 'other'; }

function toMarkdown(book) {
  const out = [];
  (book.sheets || [book]).forEach(doc => {
    out.push('# ' + doc.root.text.replace(/\n/g, ' '), '');
    const w = (n, d) => { out.push('  '.repeat(d) + '- ' + n.text.replace(/\n/g, ' ') + (n.link ? ' (' + n.link + ')' : '')); if (n.note) out.push('  '.repeat(d + 1) + '> ' + n.note.replace(/\n/g, ' ')); n.children.forEach(c => w(c, d + 1)); };
    doc.root.children.forEach(c => w(c, 0)); out.push('');
  });
  return out.join('\n').trim() + '\n';
}
function download(blob, name) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.append(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
}

g.MMIO = { importFile, kindOf, exportXMind, toMarkdown, download, safeName, importXMind, importPDF, importText };
})(window);
