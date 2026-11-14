/* Gemini integration. The API key is typed by each user and kept ONLY in this browser's localStorage;
   requests go straight from the browser to Google's Gemini API (no server of ours in between). */
(function (g) {
'use strict';
const API = 'https://generativelanguage.googleapis.com/v1beta';
const K_KEY = 'mm-gemini-key', K_MODEL = 'mm-gemini-model', K_LIST = 'mm-gemini-models';
const FALLBACK_MODELS = [
  ['gemini-2.5-flash', 'Gemini 2.5 Flash'], ['gemini-2.5-pro', 'Gemini 2.5 Pro'], ['gemini-2.5-flash-lite', 'Gemini 2.5 Flash-Lite']
];
const ls = { get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} }, del: k => { try { localStorage.removeItem(k); } catch (e) {} } };
const err = (m, code) => Object.assign(new Error(m), { code });

const getKey = () => ls.get(K_KEY) || '';
const setKey = k => { k = String(k || '').trim(); k ? ls.set(K_KEY, k) : ls.del(K_KEY); };
const hasKey = () => !!getKey();
const getModel = () => ls.get(K_MODEL) || FALLBACK_MODELS[0][0];
const setModel = m => ls.set(K_MODEL, m);
function models() { try { const l = JSON.parse(ls.get(K_LIST) || 'null'); if (Array.isArray(l) && l.length) return l; } catch (e) {} return FALLBACK_MODELS; }

async function call(path, body, key) {
  key = key || getKey(); if (!key) throw err('Add your Gemini API key in Settings → AI (Gemini).', 'nokey');
  let r; try { r = await fetch(API + path, { method: body ? 'POST' : 'GET', headers: Object.assign({ 'x-goog-api-key': key }, body ? { 'Content-Type': 'application/json' } : {}), body: body ? JSON.stringify(body) : undefined }); }
  catch (e) { throw err('Could not reach the Gemini API. Check your internet connection.', 'net'); }
  let j = null; try { j = await r.json(); } catch (e) {}
  if (!r.ok) {
    const m = (j && j.error && j.error.message) || ('Gemini API error ' + r.status);
    const code = r.status === 429 ? 'quota' : (r.status === 400 && /API key/i.test(m)) || r.status === 401 || r.status === 403 ? 'badkey' : 'api';
    throw err(code === 'quota' ? 'Rate limit or quota reached for this key. Wait a moment or check your plan. (' + m + ')' : code === 'badkey' ? 'Gemini rejected the API key. Check that it is correct and enabled. (' + m + ')' : m, code);
  }
  return j;
}

/** Validate a key and refresh the list of models that can generate text. */
async function testKey(key) {
  const j = await call('/models?pageSize=200', null, key);
  const list = (j.models || []).filter(m => (m.supportedGenerationMethods || []).includes('generateContent') && /^models\/gemini/.test(m.name) && !/embedding|aqa|imagen|tts|image|live|vision|robotics|computer-use/i.test(m.name))
    .map(m => [m.name.replace(/^models\//, ''), m.displayName || m.name.replace(/^models\//, '')]);
  list.sort((a, b) => b[0].localeCompare(a[0]));
  if (list.length) ls.set(K_LIST, JSON.stringify(list));
  return list;
}

const SYSTEM = [
  'You are an assistant built into a mind-mapping app. The user\'s mind map is provided as an indented outline.',
  'Reply in the same language the user writes in; if the request is empty or ambiguous, use the language of the map.',
  'Always answer with ONE JSON object: {"reply": string, "topics": array}.',
  '"reply" is a concise answer (short paragraphs or "- " bullets, **bold** allowed).',
  '"topics" is OPTIONAL: include it only when the user asks you to create, expand, break down or restructure something. It is a list of {"text": string, "children": [...]} that could be added to the map.',
  'Topic text must be short (max 10 words), concrete and non-duplicated; at most 3 levels deep and 40 topics in total. Never repeat the topic that is being expanded or topics that already exist under it.'
].join(' ');

function outline(root, max) {
  const lines = []; let size = 0;
  (function w(n, d) {
    if (size > (max || 12000)) return;
    const t = ('  '.repeat(d) + '- ' + String(n.text).replace(/\s+/g, ' ')).slice(0, 220) + (n.note ? '  [note: ' + String(n.note).replace(/\s+/g, ' ').slice(0, 120) + ']' : '');
    lines.push(t); size += t.length; n.children.forEach(c => w(c, d + 1));
  })(root, 0);
  return lines.join('\n') + (size > (max || 12000) ? '\n- … (map truncated)' : '');
}
function pathOf(mm, id) {
  const out = []; for (let x = mm.index.get(id); x; x = x.p ? mm.index.get(x.p.id) : null) out.unshift(x.n.text.replace(/\s+/g, ' '));
  return out.join(' > ');
}

function cleanTopics(arr, state = { n: 0 }, depth = 0) {
  if (!Array.isArray(arr) || depth > 3) return [];
  const out = [];
  for (const t of arr) {
    if (state.n >= 60) break;
    const text = String(t && (t.text || t.title || t.name) || '').replace(/\s+/g, ' ').trim().slice(0, 200); if (!text) continue;
    state.n++; out.push({ text, children: cleanTopics(t.children, state, depth + 1) });
  }
  return out;
}
function parse(text) {
  let s = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try { const j = JSON.parse(s); return { reply: String(j.reply || '').trim(), topics: cleanTopics(j.topics) }; }
  catch (e) { return { reply: String(text || '').trim(), topics: [] }; }
}

/** history: [{role:'user'|'ai', text}] (plain text); mm: MindMap instance; selectedId: topic the user is focused on */
async function ask(mm, history, userText, selectedId) {
  const sel = selectedId && mm.get(selectedId) ? selectedId : null;
  const ctx = 'MAP OUTLINE:\n' + outline(mm.doc.root) + '\n\nSELECTED TOPIC: ' + (sel ? pathOf(mm, sel) : '(none)') + '\n\nUSER REQUEST: ' + userText;
  const contents = history.slice(-8).map(h => ({ role: h.role === 'ai' ? 'model' : 'user', parts: [{ text: h.text }] }));
  contents.push({ role: 'user', parts: [{ text: ctx }] });
  const j = await call('/models/' + encodeURIComponent(getModel()) + ':generateContent', {
    systemInstruction: { parts: [{ text: SYSTEM }] }, contents, generationConfig: { temperature: 0.7, responseMimeType: 'application/json' }
  });
  if (j.promptFeedback && j.promptFeedback.blockReason) throw err('The request was blocked (' + j.promptFeedback.blockReason + '). Try rephrasing.', 'blocked');
  const cand = (j.candidates || [])[0]; const txt = cand && cand.content && cand.content.parts ? cand.content.parts.map(p => p.text || '').join('') : '';
  if (!txt) throw err('Gemini returned an empty answer' + (cand && cand.finishReason ? ' (' + cand.finishReason + ')' : '') + '. Try again.', 'empty');
  return parse(txt);
}

g.MMAI = { getKey, setKey, hasKey, getModel, setModel, models, testKey, ask, outline, pathOf, FALLBACK_MODELS };
})(window);
