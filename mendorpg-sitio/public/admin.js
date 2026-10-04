/* ===== MendoRPG: modo administrador, lápices de edición y crónicas =====
   IMPORTANTE: acá solo se dibujan las pantallas. La seguridad real vive en el servidor
   (carpeta netlify/functions): sin una sesión de administrador válida el servidor rechaza
   cualquier cambio, aunque alguien modifique este archivo en su navegador. */
(function () {
  'use strict';

  /* ---------- utilidades ---------- */
  const HINT = 'mendo_admin';
  const S = {
    admin: false, editing: false,
    saved: { texts: {}, links: {} }, cur: { texts: {}, links: {} },
    posts: [], shown: 5, postsLoaded: false, trailer: null
  };
  let overlay = null, overlayDirty = false, bar = null, layer = null;

  function el(tag, attrs, kids) {
    const n = document.createElement(tag);
    for (const k in (attrs || {})) {
      const v = attrs[k];
      if (k === 'class') n.className = v;
      else if (k === 'text') n.textContent = v;
      else if (k.slice(0, 2) === 'on') n.addEventListener(k.slice(2), v);
      else if (v !== false && v != null) n.setAttribute(k, v);
    }
    (kids || []).forEach(c => { if (c) n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return n;
  }
  function api(path, opts) {
    opts = opts || {};
    const init = { method: opts.method || 'GET', credentials: 'same-origin', cache: 'no-store', headers: {} };
    if (opts.json !== undefined) { init.headers['content-type'] = 'application/json'; init.body = JSON.stringify(opts.json); }
    if (opts.raw !== undefined) { init.body = opts.raw; if (opts.type) init.headers['content-type'] = opts.type; }
    return fetch(path, init).then(r => r.json().catch(() => ({})).then(d => ({ status: r.status, ok: r.ok, data: d })));
  }
  const clone = o => JSON.parse(JSON.stringify(o));
  const today = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  const todayLong = () => { try { return new Date().toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' }); } catch (e) { return ''; } };
  function fmtDate(iso) {
    try { const p = iso.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' }); }
    catch (e) { return iso; }
  }
  const SAFE_HREF = /^(https?:\/\/|mailto:|\/|#)/i;

  /* ---------- Markdown seguro (solo etiquetas permitidas) ---------- */
  function escHtml(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function mdInline(raw) {
    const tokens = [];
    const keep = html => '\u0000' + (tokens.push(html) - 1) + '\u0000';
    let s = escHtml(raw);
    s = s.replace(/`([^`]+)`/g, (m, c) => keep('<code>' + c + '</code>'));
    const fmt = t => t
      .replace(/\*\*([^*]+?)\*\*/g, '<strong>$1</strong>')
      .replace(/__([^_]+?)__/g, '<strong>$1</strong>')
      .replace(/(^|[^*\w])\*([^*\s][^*]*?)\*(?!\*)/g, '$1<em>$2</em>')
      .replace(/(^|[^_\w])_([^_\s][^_]*?)_(?![_\w])/g, '$1<em>$2</em>')
      .replace(/~~([^~]+?)~~/g, '<s>$1</s>');
    s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (m, t, u) =>
      keep('<a href="' + u + '" target="_blank" rel="noopener noreferrer">' + fmt(t) + '</a>'));
    s = s.replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, (m, pre, u) =>
      pre + keep('<a href="' + u + '" target="_blank" rel="noopener noreferrer">' + u + '</a>'));
    s = fmt(s);
    return s.replace(/\u0000(\d+)\u0000/g, (m, i) => tokens[+i]);
  }
  function mdRender(src) {
    const lines = String(src || '').replace(/\r\n/g, '\n').split('\n');
    const out = [];
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      if (!line.trim()) { i++; continue; }
      let m;
      if ((m = /^(#{1,3})\s+(.*)$/.exec(line))) { const lv = m[1].length + 2; out.push('<h' + lv + '>' + mdInline(m[2]) + '</h' + lv + '>'); i++; continue; }
      if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) { out.push('<hr>'); i++; continue; }
      if (/^>\s?/.test(line)) {
        const q = [];
        while (i < lines.length && /^>\s?/.test(lines[i])) { q.push(mdInline(lines[i].replace(/^>\s?/, ''))); i++; }
        out.push('<blockquote>' + q.join('<br>') + '</blockquote>'); continue;
      }
      if (/^\s*[-*]\s+/.test(line)) {
        const li = [];
        while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) { li.push('<li>' + mdInline(lines[i].replace(/^\s*[-*]\s+/, '')) + '</li>'); i++; }
        out.push('<ul>' + li.join('') + '</ul>'); continue;
      }
      if (/^\s*\d+[.)]\s+/.test(line)) {
        const li = [];
        while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) { li.push('<li>' + mdInline(lines[i].replace(/^\s*\d+[.)]\s+/, '')) + '</li>'); i++; }
        out.push('<ol>' + li.join('') + '</ol>'); continue;
      }
      const p = [];
      while (i < lines.length && lines[i].trim() && !/^(#{1,3}\s|>\s?|\s*[-*]\s+|\s*\d+[.)]\s+|\s*(-{3,}|\*{3,})\s*$)/.test(lines[i])) { p.push(mdInline(lines[i])); i++; }
      if (p.length) out.push('<p>' + p.join('<br>') + '</p>');
      else { out.push('<p>' + mdInline(lines[i]) + '</p>'); i++; }
    }
    return out.join('');
  }
  window.MendoMarkdown = mdRender;

  /* ---------- ventanas ---------- */
  function closeOverlay(force) {
    if (overlayDirty && !force && !window.confirm('Tenés cambios sin guardar. ¿Cerrar igual?')) return false;
    if (overlay) { overlay.remove(); overlay = null; }
    document.body.style.overflow = '';
    overlayDirty = false;
    scheduleLayout();
    return true;
  }
  function shell(title, buttons, narrow) {
    closeOverlay(true);
    const body = el('div', { class: 'ma-body' });
    const head = el('div', { class: 'ma-head' }, [el('span', { class: 'ma-title', text: title }), el('div', { class: 'ma-actions' }, buttons || [])]);
    overlay = el('div', { class: 'ma-overlay ma-ui', role: 'dialog', 'aria-modal': 'true' }, [el('div', { class: 'ma-panel' + (narrow ? ' narrow' : '') }, [head, body])]);
    overlay.addEventListener('mousedown', e => { if (e.target === overlay) closeOverlay(); });
    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden';
    return body;
  }
  const closeBtn = () => el('button', { class: 'ma-btn small', type: 'button', text: 'CERRAR', onclick: () => closeOverlay() });

  /* ---------- sesión ---------- */
  function setAdmin(v) {
    S.admin = v;
    try { v ? localStorage.setItem(HINT, '1') : localStorage.removeItem(HINT); } catch (e) { /* sin almacenamiento */ }
    if (v) { S.editing = true; } else { S.editing = false; }
    renderBar(); renderBlog(); renderTrailer(); syncEditMode();
  }
  function sessionExpired(msg) {
    setAdmin(false);
    showLogin(msg || 'Tu sesión venció. Volvé a entrar.');
  }

  function showLogin(note) {
    const msg = el('div', { class: 'ma-msg err', text: note || '' });
    const user = el('input', { class: 'ma-input', type: 'text', autocomplete: 'username', spellcheck: 'false' });
    const pass = el('input', { class: 'ma-input', type: 'password', autocomplete: 'current-password' });
    const go = el('button', { class: 'ma-btn primary', type: 'submit', text: 'ENTRAR' });
    const form = el('form', {}, [
      el('label', { class: 'ma-label', text: 'USUARIO' }), user,
      el('label', { class: 'ma-label', text: 'CONTRASEÑA' }), pass,
      el('div', { class: 'ma-actions', style: 'margin-top:18px' }, [go, msg])
    ]);
    form.addEventListener('submit', e => {
      e.preventDefault();
      go.disabled = true; msg.className = 'ma-msg'; msg.textContent = 'Verificando…';
      api('/api/login', { method: 'POST', json: { user: user.value, pass: pass.value } }).then(r => {
        if (r.ok) { closeOverlay(true); setAdmin(true); }
        else { go.disabled = false; msg.className = 'ma-msg err'; msg.textContent = (r.data && r.data.error) || 'No se pudo iniciar sesión.'; pass.value = ''; pass.focus(); }
      }).catch(() => { go.disabled = false; msg.className = 'ma-msg err'; msg.textContent = 'No se pudo conectar con el servidor.'; });
    });
    const body = shell('ACCESO DE ADMINISTRADOR', [closeBtn()], true);
    body.appendChild(el('p', { class: 'ma-hint', text: 'Solo para el equipo de MendoRPG.' }));
    body.appendChild(form);
    setTimeout(() => user.focus(), 30);
  }

  /* ---------- barra del administrador ---------- */
  function dirtyCount() {
    let n = 0;
    ['texts', 'links'].forEach(k => {
      const a = S.cur[k], b = S.saved[k];
      new Set(Object.keys(a).concat(Object.keys(b))).forEach(key => { if (a[key] !== b[key]) n++; });
    });
    return n;
  }
  function barMsg(text, kind) {
    if (!bar) return;
    const m = bar.querySelector('.ma-msg'); m.className = 'ma-msg' + (kind ? ' ' + kind : ''); m.textContent = text || '';
    if (text && kind === 'ok') setTimeout(() => { if (m.textContent === text) m.textContent = ''; }, 3500);
  }
  function renderBar() {
    if (!S.admin) { if (bar) { bar.remove(); bar = null; } document.body.classList.remove('ma-has-bar'); return; }
    const n = dirtyCount();
    if (!bar) {
      bar = el('div', { class: 'ma-bar ma-ui' });
      document.body.appendChild(bar);
      document.body.classList.add('ma-has-bar');
    }
    bar.innerHTML = '';
    const pub = el('button', { class: 'ma-btn primary', type: 'button', text: 'PUBLICAR' + (n ? ' (' + n + ')' : ''), onclick: publishContent });
    pub.disabled = !n;
    const disc = el('button', { class: 'ma-btn', type: 'button', text: 'DESCARTAR', onclick: () => {
      if (!dirtyCount() || window.confirm('¿Descartar los cambios sin publicar?')) { S.cur = clone(S.saved); renderBar(); rescan(); }
    } });
    disc.disabled = !n;
    [
      el('span', { class: 'ma-bar-tag', text: 'ADMIN' }),
      el('button', { class: 'ma-btn', type: 'button', text: S.editing ? '✎ EDICIÓN: SÍ' : '✎ EDICIÓN: NO', title: 'Mostrar u ocultar los lápices', onclick: () => { S.editing = !S.editing; renderBar(); syncEditMode(); } }),
      el('button', { class: 'ma-btn', type: 'button', text: '+ CRÓNICA', onclick: () => openPostEditor(null) }),
      el('button', { class: 'ma-btn', type: 'button', text: 'REGISTRO DE CAMBIOS', onclick: showChangelogEditor }),
      pub, disc,
      el('button', { class: 'ma-btn danger', type: 'button', text: 'SALIR', onclick: logout }),
      el('span', { class: 'ma-msg' })
    ].forEach(x => bar.appendChild(x));
  }
  function logout() {
    if (dirtyCount() && !window.confirm('Hay cambios sin publicar que se van a perder. ¿Salir igual?')) return;
    api('/api/logout', { method: 'POST' }).then(() => { S.cur = clone(S.saved); setAdmin(false); rescan(); });
  }
  function publishContent() {
    barMsg('Publicando…');
    api('/api/content', { method: 'PUT', json: S.cur }).then(r => {
      if (r.status === 401) return sessionExpired('Tu sesión venció. Volvé a entrar; tus cambios siguen acá sin publicar.');
      if (!r.ok) return barMsg((r.data && r.data.error) || 'No se pudo publicar.', 'err');
      S.saved = clone(r.data.content); S.cur = clone(r.data.content);
      renderBar(); barMsg('Publicado ✓', 'ok'); rescan();
    }).catch(() => barMsg('No se pudo conectar con el servidor.', 'err'));
  }
  window.addEventListener('beforeunload', e => { if (S.admin && dirtyCount()) { e.preventDefault(); e.returnValue = ''; } });

  /* ---------- motor de textos editables (lápices) ---------- */
  const SKIP_TAGS = { SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, TEXTAREA: 1, INPUT: 1, SELECT: 1, OPTION: 1, SVG: 1 };
  const origText = new WeakMap(), appliedText = new WeakMap();
  const origHref = new WeakMap(), appliedHref = new WeakMap();
  let tracked = [];

  function eligible(node) {
    const p = node.parentElement;
    if (!p || SKIP_TAGS[p.tagName] || SKIP_TAGS[p.tagName && p.tagName.toUpperCase()]) return false;
    if (p.closest('.ma-ui,.ma-pencil-layer,[data-mendo-noedit]')) return false;
    const v = node.nodeValue;
    return v.trim().length >= 2 && /[A-Za-z0-9À-ÿ]/.test(v);
  }
  const lead = s => s.match(/^\s*/)[0];
  const trail = s => s.match(/\s*$/)[0];

  function processText(node) {
    const cur = node.nodeValue;
    if (appliedText.get(node) === undefined || cur !== appliedText.get(node)) origText.set(node, cur);
    const orig = origText.get(node);
    const ov = S.cur.texts[orig.trim()];
    const want = ov !== undefined ? lead(orig) + ov + trail(orig) : orig;
    if (node.nodeValue !== want) node.nodeValue = want;
    appliedText.set(node, want);
  }
  function processLinks() {
    document.querySelectorAll('a[href]').forEach(a => {
      if (a.closest('.ma-ui,.ma-pencil-layer')) return;
      const cur = a.getAttribute('href');
      if (appliedHref.get(a) === undefined || cur !== appliedHref.get(a)) origHref.set(a, cur);
      const orig = origHref.get(a);
      const ov = S.cur.links[orig];
      const want = ov && SAFE_HREF.test(ov) ? ov : orig;
      if (cur !== want) a.setAttribute('href', want);
      appliedHref.set(a, want);
    });
  }
  function rescan() {
    scanQueued = false;
    const list = [];
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = w.nextNode())) { if (eligible(n)) { processText(n); list.push(n); } }
    tracked = list;
    processLinks();
    scheduleLayout();
  }
  let scanQueued = false;
  function scheduleScan() { if (!scanQueued) { scanQueued = true; requestAnimationFrame(rescan); } }

  /* pencils */
  const pencils = new Map();
  let layoutQueued = false;
  const PENCIL_SVG = '<svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true"><path fill="currentColor" d="M3 17.25V21h3.75L17.8 9.94l-3.75-3.75L3 17.25zM20.7 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>';
  function scheduleLayout() { if (!layoutQueued && S.editing && S.admin) { layoutQueued = true; requestAnimationFrame(layout); } }
  function ensureLayer() { if (!layer) { layer = el('div', { class: 'ma-pencil-layer ma-ui' }); document.body.appendChild(layer); } return layer; }
  function layout() {
    layoutQueued = false;
    if (!S.editing || !S.admin) { if (layer) layer.style.display = 'none'; return; }
    ensureLayer().style.display = '';
    const vw = window.innerWidth, vh = window.innerHeight;
    const live = new Set();
    const range = document.createRange();
    tracked.forEach(node => {
      if (!node.isConnected) return;
      range.selectNodeContents(node);
      const r = range.getBoundingClientRect();
      if (r.width < 2 || r.height < 2 || r.bottom < -30 || r.top > vh + 30 || r.right < 0 || r.left > vw) return;
      const cx = Math.min(Math.max(r.left + Math.min(r.width, 40) / 2, 0), vw - 1);
      const cy = Math.min(Math.max(r.top + r.height / 2, 0), vh - 1);
      const hit = document.elementFromPoint(cx, cy);
      const p = node.parentElement;
      if (hit && !(hit.closest('.ma-pencil-layer') || p.contains(hit) || hit.contains(p))) return;
      let b = pencils.get(node);
      if (!b) {
        b = el('button', { class: 'ma-pencil', type: 'button', title: 'Editar este texto', 'aria-label': 'Editar este texto', onclick: () => openTextEditor(node) });
        b.innerHTML = PENCIL_SVG;
        layer.appendChild(b); pencils.set(node, b);
      }
      b.classList.toggle('changed', S.cur.texts[(origText.get(node) || '').trim()] !== undefined);
      b.style.left = Math.min(Math.max(r.right + 3, 2), vw - 26) + 'px';
      b.style.top = Math.min(Math.max(r.top - 8, 2), vh - 26) + 'px';
      live.add(node);
    });
    pencils.forEach((b, node) => { if (!live.has(node)) { b.remove(); pencils.delete(node); } });
  }
  function syncEditMode() {
    document.body.classList.toggle('mendo-edit-on', S.admin && S.editing);
    if (!(S.admin && S.editing)) { pencils.forEach(b => b.remove()); pencils.clear(); if (layer) layer.style.display = 'none'; }
    else scheduleLayout();
  }

  function openTextEditor(node) {
    const orig = origText.get(node) || node.nodeValue;
    const key = orig.trim();
    const a = node.parentElement && node.parentElement.closest('a[href]');
    const aOrig = a ? origHref.get(a) : null;
    const hasLink = !!(a && aOrig && /^(https?:|mailto:)/i.test(aOrig));
    const area = el('textarea', { class: 'ma-area', maxlength: '2000' });
    area.value = S.cur.texts[key] !== undefined ? S.cur.texts[key] : key;
    const url = el('input', { class: 'ma-input', type: 'text', placeholder: 'https://…', maxlength: '2000' });
    if (hasLink) url.value = S.cur.links[aOrig] || aOrig;
    const msg = el('div', { class: 'ma-msg err' });
    const apply = el('button', { class: 'ma-btn primary', type: 'button', text: 'APLICAR', onclick: () => {
      const val = area.value.replace(/\s+/g, ' ').trim();
      if (!val) { msg.textContent = 'El texto no puede quedar vacío (usá “Restaurar original”).'; return; }
      if (hasLink) {
        const u = url.value.trim();
        if (u && !/^(https?:\/\/|mailto:)/i.test(u)) { msg.textContent = 'El enlace debe empezar con https:// o mailto:'; return; }
        if (!u || u === aOrig) delete S.cur.links[aOrig]; else S.cur.links[aOrig] = u;
      }
      if (val === key) delete S.cur.texts[key]; else S.cur.texts[key] = val;
      closeOverlay(true); renderBar(); rescan();
    } });
    const restore = el('button', { class: 'ma-btn', type: 'button', text: 'RESTAURAR ORIGINAL', onclick: () => {
      delete S.cur.texts[key]; if (hasLink) delete S.cur.links[aOrig];
      closeOverlay(true); renderBar(); rescan();
    } });
    const body = shell('EDITAR TEXTO', [closeBtn()], true);
    body.appendChild(el('p', { class: 'ma-hint', text: 'Si el mismo texto aparece en otro lugar de la página, también se cambia ahí. Los cambios se ven recién al tocar PUBLICAR.' }));
    body.appendChild(el('label', { class: 'ma-label', text: 'TEXTO' })); body.appendChild(area);
    if (hasLink) { body.appendChild(el('label', { class: 'ma-label', text: 'ENLACE (A DÓNDE LLEVA)' })); body.appendChild(url); }
    body.appendChild(el('div', { class: 'ma-actions', style: 'margin-top:16px' }, [apply, restore, msg]));
    setTimeout(() => { area.focus(); area.select(); }, 30);
  }

  /* ---------- registro de cambios (changelog) ---------- */
  let clEntries = [], clBox = null, clDirty = false;
  function defaultsChangelog() {
    try { const j = JSON.parse(document.getElementById('mendo-changelog').textContent); return Array.isArray(j) ? j : []; } catch (e) { return []; }
  }
  function clCard(e, i) {
    const bind = (field, node) => node.addEventListener('input', () => { clEntries[i][field] = node.value; overlayDirty = true; });
    const ver = el('input', { class: 'ma-input', type: 'text', placeholder: 'v1.1', maxlength: '40' }); ver.value = e.version || ''; bind('version', ver);
    const fecha = el('input', { class: 'ma-input', type: 'text', placeholder: '3 de octubre de 2026', maxlength: '60' }); fecha.value = e.fecha || ''; bind('fecha', fecha);
    const tit = el('input', { class: 'ma-input', type: 'text', placeholder: 'Ej: Actualización de la Vendimia', maxlength: '140' }); tit.value = e.titulo || ''; bind('titulo', tit);
    const cam = el('textarea', { class: 'ma-area', placeholder: 'Un cambio por línea' }); cam.value = (e.cambios || []).join('\n');
    cam.addEventListener('input', () => { clEntries[i].cambios = cam.value.split('\n'); overlayDirty = true; });
    const move = d => { const j = i + d; if (j < 0 || j >= clEntries.length) return; const t = clEntries[i]; clEntries[i] = clEntries[j]; clEntries[j] = t; overlayDirty = true; clRender(); };
    return el('div', { class: 'ma-card' }, [
      el('div', { class: 'ma-card-top' }, [
        el('span', { class: 'ma-title', text: i === 0 ? 'ENTRADA MÁS RECIENTE' : 'ENTRADA ' + (i + 1) }),
        el('div', { class: 'ma-actions' }, [
          el('button', { class: 'ma-btn small', type: 'button', text: '▲', title: 'Subir', onclick: () => move(-1) }),
          el('button', { class: 'ma-btn small', type: 'button', text: '▼', title: 'Bajar', onclick: () => move(1) }),
          el('button', { class: 'ma-btn small danger', type: 'button', text: 'ELIMINAR', onclick: () => { if (window.confirm('¿Eliminar esta entrada?')) { clEntries.splice(i, 1); overlayDirty = true; clRender(); } } })
        ])
      ]),
      el('div', { class: 'ma-row' }, [
        el('div', {}, [el('label', { class: 'ma-label', text: 'VERSIÓN' }), ver]),
        el('div', {}, [el('label', { class: 'ma-label', text: 'FECHA' }), fecha])
      ]),
      el('label', { class: 'ma-label', text: 'TÍTULO (OPCIONAL)' }), tit,
      el('label', { class: 'ma-label', text: 'CAMBIOS' }), cam
    ]);
  }
  function clRender() {
    clBox.innerHTML = '';
    if (!clEntries.length) clBox.appendChild(el('p', { class: 'ma-hint', text: 'No hay entradas. Creá la primera con “+ NUEVA ENTRADA”.' }));
    clEntries.forEach((e, i) => clBox.appendChild(clCard(e, i)));
  }
  function showChangelogEditor() {
    const msg = el('div', { class: 'ma-msg' });
    const save = el('button', { class: 'ma-btn primary', type: 'button', text: 'GUARDAR Y PUBLICAR' });
    const body = shell('REGISTRO DE CAMBIOS DEL SERVIDOR', [closeBtn()]);
    body.appendChild(el('p', { class: 'ma-hint', text: 'Lo que publiques acá lo ven todos los jugadores al instante. La entrada de arriba es la más reciente.' }));
    const add = el('button', { class: 'ma-btn', type: 'button', text: '+ NUEVA ENTRADA', onclick: () => { clEntries.unshift({ version: '', fecha: todayLong(), titulo: '', cambios: [] }); overlayDirty = true; clRender(); } });
    body.appendChild(el('div', { class: 'ma-actions', style: 'margin-top:14px' }, [add, save, msg]));
    clBox = el('div'); body.appendChild(clBox);
    msg.textContent = 'Cargando…';
    api('/api/changelog').then(r => {
      clEntries = clone(r.ok && Array.isArray(r.data.entries) ? r.data.entries : defaultsChangelog());
      msg.textContent = ''; clRender();
    }).catch(() => { clEntries = clone(defaultsChangelog()); msg.className = 'ma-msg err'; msg.textContent = 'No se pudo leer lo publicado.'; clRender(); });
    save.addEventListener('click', () => {
      const payload = clEntries.map(e => ({ version: e.version, fecha: e.fecha, titulo: e.titulo, cambios: (e.cambios || []).map(c => String(c).trim()).filter(Boolean) }));
      save.disabled = true; msg.className = 'ma-msg'; msg.textContent = 'Publicando…';
      api('/api/changelog', { method: 'PUT', json: { entries: payload } }).then(r => {
        save.disabled = false;
        if (r.status === 401) return sessionExpired();
        if (!r.ok) { msg.className = 'ma-msg err'; msg.textContent = (r.data && r.data.error) || 'No se pudo guardar.'; return; }
        clEntries = r.data.entries; overlayDirty = false; clRender();
        window.dispatchEvent(new CustomEvent('mendo-changelog', { detail: r.data.entries }));
        msg.className = 'ma-msg ok'; msg.textContent = 'Publicado ✓';
      }).catch(() => { save.disabled = false; msg.className = 'ma-msg err'; msg.textContent = 'No se pudo conectar con el servidor.'; });
    });
  }

  /* ---------- crónicas (blog) ---------- */
  let blogRoot = null;
  function ensureBlogRoot() {
    const r = document.getElementById('mendo-blog-root');
    if (r && r !== blogRoot) { blogRoot = r; renderBlog(); }
  }
  function lightbox(src, alt) {
    const lb = el('div', { class: 'cr-lightbox ma-ui', onclick: () => lb.remove() }, [el('img', { src: src, alt: alt || '' })]);
    const esc = e => { if (e.key === 'Escape') { lb.remove(); document.removeEventListener('keydown', esc); } };
    document.addEventListener('keydown', esc);
    document.body.appendChild(lb);
  }
  function renderBlog() {
    if (!blogRoot) return;
    blogRoot.innerHTML = '';
    if (S.admin) {
      blogRoot.appendChild(el('div', { class: 'cr-top' }, [el('button', { class: 'ma-btn primary', type: 'button', text: '+ NUEVA CRÓNICA', onclick: () => openPostEditor(null) })]));
    }
    if (!S.postsLoaded) { blogRoot.appendChild(el('div', { class: 'cr-empty', text: 'Cargando crónicas…' })); return; }
    if (!S.posts.length) {
      blogRoot.appendChild(el('div', { class: 'cr-empty', text: S.admin ? 'Todavía no hay crónicas. Creá la primera con “+ NUEVA CRÓNICA”.' : 'Pronto vas a ver acá los sucesos y eventos del reino.' }));
      return;
    }
    S.posts.slice(0, S.shown).forEach(p => {
      const body = el('div', { class: 'md' }); body.innerHTML = mdRender(p.cuerpo);
      const kids = [];
      if (p.imagen) {
        const src = '/api/img/' + p.imagen;
        kids.push(el('img', { class: 'cr-img', src: src, alt: p.titulo, loading: 'lazy', onclick: () => lightbox(src, p.titulo) }));
      }
      const inner = [
        el('div', { class: 'cr-meta' }, [el('span', { text: fmtDate(p.fecha).toUpperCase() })]),
        el('h3', { class: 'cr-title', text: p.titulo })
      ];
      if (p.cuerpo) inner.push(body);
      if (S.admin) {
        inner.push(el('div', { class: 'cr-admin' }, [
          el('button', { class: 'ma-btn small', type: 'button', text: '✎ EDITAR', onclick: () => openPostEditor(p) }),
          el('button', { class: 'ma-btn small danger', type: 'button', text: 'ELIMINAR', onclick: () => deletePost(p) })
        ]));
      }
      kids.push(el('div', { class: 'cr-body' }, inner));
      blogRoot.appendChild(el('article', { class: 'cr-post' }, kids));
    });
    if (S.posts.length > S.shown) {
      blogRoot.appendChild(el('div', { class: 'cr-more' }, [el('button', { class: 'ma-btn', type: 'button', text: 'VER CRÓNICAS ANTERIORES', onclick: () => { S.shown += 5; renderBlog(); } })]));
    }
  }
  function loadPosts() {
    api('/api/posts').then(r => { if (r.ok && Array.isArray(r.data.posts)) { S.posts = r.data.posts; } S.postsLoaded = true; renderBlog(); })
      .catch(() => { S.postsLoaded = true; renderBlog(); });
  }
  function deletePost(p) {
    if (!window.confirm('¿Eliminar la crónica “' + p.titulo + '”? No se puede deshacer.')) return;
    api('/api/posts?id=' + encodeURIComponent(p.id), { method: 'DELETE' }).then(r => {
      if (r.status === 401) return sessionExpired();
      if (!r.ok) return barMsg((r.data && r.data.error) || 'No se pudo eliminar.', 'err');
      S.posts = r.data.posts; renderBlog(); barMsg('Crónica eliminada', 'ok');
    }).catch(() => barMsg('No se pudo conectar con el servidor.', 'err'));
  }

  // Reduce la foto en el navegador (máx. 1600 px) antes de subirla: carga rápido y se quitan datos ocultos de la foto.
  function shrinkImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const max = 1600, k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(img.naturalWidth * k)); c.height = Math.max(1, Math.round(img.naturalHeight * k));
        const g = c.getContext('2d'); g.fillStyle = '#0a1018'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        c.toBlob(b => b ? resolve(b) : reject(new Error('No se pudo procesar la imagen')), 'image/jpeg', 0.88);
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('No se pudo leer esa imagen. Probá con JPG, PNG o WebP.')); };
      img.src = url;
    });
  }

  function openPostEditor(post) {
    const st = { imagen: post ? post.imagen : null, previewUrl: post && post.imagen ? '/api/img/' + post.imagen : null, preview: false };
    const msg = el('div', { class: 'ma-msg' });
    const titulo = el('input', { class: 'ma-input', type: 'text', maxlength: '160', placeholder: 'Ej: Noche de la Vendimia Negra' }); titulo.value = post ? post.titulo : '';
    const fecha = el('input', { class: 'ma-input', type: 'date' }); fecha.value = post ? post.fecha : today();
    const area = el('textarea', { class: 'ma-area tall', maxlength: '20000', placeholder: 'Escribí acá lo que pasó. Podés usar **negrita**, *cursiva*, listas y más (mirá los botones de arriba).' }); area.value = post ? post.cuerpo : '';
    const prev = el('div', { class: 'ma-preview md', style: 'display:none' });
    const mark = () => { overlayDirty = true; };
    titulo.addEventListener('input', mark); fecha.addEventListener('input', mark); area.addEventListener('input', mark);

    // imagen
    const thumb = el('img', { alt: '' }); const imgMsg = el('div', { class: 'ma-msg' });
    const file = el('input', { type: 'file', accept: 'image/*', style: 'display:none' });
    const pick = el('button', { class: 'ma-btn small', type: 'button', onclick: () => file.click() });
    const rm = el('button', { class: 'ma-btn small danger', type: 'button', text: 'QUITAR IMAGEN', onclick: () => { st.imagen = null; st.previewUrl = null; mark(); drawImg(); } });
    function drawImg() {
      thumb.style.display = st.previewUrl ? '' : 'none'; if (st.previewUrl) thumb.src = st.previewUrl;
      rm.style.display = st.previewUrl ? '' : 'none';
      pick.textContent = st.previewUrl ? 'CAMBIAR IMAGEN' : 'ADJUNTAR IMAGEN (OPCIONAL)';
    }
    file.addEventListener('change', () => {
      const f = file.files && file.files[0]; file.value = '';
      if (!f) return;
      imgMsg.className = 'ma-msg'; imgMsg.textContent = 'Procesando y subiendo…'; pick.disabled = true; publish.disabled = true;
      shrinkImage(f).then(blob => api('/api/upload', { method: 'POST', raw: blob, type: 'image/jpeg' }).then(r => {
        if (r.status === 401) { sessionExpired('Tu sesión venció. Volvé a entrar y subí la imagen de nuevo.'); return; }
        if (!r.ok) throw new Error((r.data && r.data.error) || 'No se pudo subir la imagen');
        st.imagen = r.data.id; st.previewUrl = URL.createObjectURL(blob); mark(); drawImg(); imgMsg.textContent = '';
      })).catch(e => { imgMsg.className = 'ma-msg err'; imgMsg.textContent = e.message; })
        .then(() => { pick.disabled = false; publish.disabled = false; });
    });

    // barra de formato Markdown
    function wrap(before, after, ph) {
      const s = area.selectionStart, e = area.selectionEnd, sel = area.value.slice(s, e) || ph;
      area.setRangeText(before + sel + after, s, e, 'end');
      area.setSelectionRange(s + before.length, s + before.length + sel.length); area.focus(); mark();
    }
    function prefix(fn) {
      const v = area.value; let s = area.selectionStart, e = area.selectionEnd;
      const a = v.lastIndexOf('\n', s - 1) + 1; let b = v.indexOf('\n', e); if (b < 0) b = v.length;
      const lines = v.slice(a, b).split('\n').map(fn).join('\n');
      area.setRangeText(lines, a, b, 'select'); area.focus(); mark();
    }
    const tb = el('div', { class: 'ma-toolbar' });
    [
      ['N', 'Negrita', () => wrap('**', '**', 'texto en negrita'), 'font-weight:900'],
      ['K', 'Cursiva', () => wrap('*', '*', 'texto en cursiva'), 'font-style:italic'],
      ['S', 'Tachado', () => wrap('~~', '~~', 'texto tachado'), 'text-decoration:line-through'],
      ['T', 'Título', () => prefix(l => '## ' + l.replace(/^#+\s*/, '')), ''],
      ['•', 'Lista', () => prefix(l => '- ' + l.replace(/^\s*[-*]\s+/, '')), ''],
      ['1.', 'Lista numerada', () => { let n = 0; prefix(l => (++n) + '. ' + l.replace(/^\s*\d+[.)]\s+/, '')); }, ''],
      ['❝', 'Cita', () => prefix(l => '> ' + l.replace(/^>\s?/, '')), ''],
      ['🔗', 'Enlace', () => { const u = window.prompt('Dirección del enlace (https://…)'); if (u && /^https?:\/\//i.test(u.trim())) wrap('[', '](' + u.trim() + ')', 'texto del enlace'); else if (u) window.alert('El enlace debe empezar con https://'); }, ''],
      ['</>', 'Código', () => wrap('`', '`', 'código'), ''],
      ['—', 'Línea separadora', () => { area.setRangeText('\n\n---\n\n', area.selectionStart, area.selectionEnd, 'end'); area.focus(); mark(); }, '']
    ].forEach(t => tb.appendChild(el('button', { class: 'ma-btn small', type: 'button', text: t[0], title: t[1], 'aria-label': t[1], style: t[3], onclick: t[2] })));
    const toggle = el('button', { class: 'ma-btn small', type: 'button', text: 'VISTA PREVIA', onclick: () => {
      st.preview = !st.preview;
      if (st.preview) { prev.innerHTML = mdRender(area.value) || '<p style="opacity:.6">(Todavía no escribiste nada)</p>'; }
      prev.style.display = st.preview ? '' : 'none'; area.style.display = st.preview ? 'none' : ''; tb.style.opacity = st.preview ? '.4' : ''; tb.style.pointerEvents = st.preview ? 'none' : '';
      toggle.textContent = st.preview ? 'VOLVER A EDITAR' : 'VISTA PREVIA';
    } });

    const publish = el('button', { class: 'ma-btn primary', type: 'button', text: post ? 'GUARDAR CAMBIOS' : 'PUBLICAR CRÓNICA' });
    publish.addEventListener('click', () => {
      if (!titulo.value.trim()) { msg.className = 'ma-msg err'; msg.textContent = 'Falta el título.'; titulo.focus(); return; }
      publish.disabled = true; msg.className = 'ma-msg'; msg.textContent = 'Publicando…';
      const payload = { titulo: titulo.value, cuerpo: area.value, fecha: fecha.value, imagen: st.imagen };
      if (post) payload.id = post.id;
      api('/api/posts', { method: post ? 'PUT' : 'POST', json: payload }).then(r => {
        publish.disabled = false;
        if (r.status === 401) return sessionExpired('Tu sesión venció. Volvé a entrar (el texto que escribiste se perdió al cerrar, copialo antes si lo necesitás).');
        if (!r.ok) { msg.className = 'ma-msg err'; msg.textContent = (r.data && r.data.error) || 'No se pudo publicar.'; return; }
        S.posts = r.data.posts; overlayDirty = false; closeOverlay(true); renderBlog();
        barMsg(post ? 'Cambios guardados ✓' : 'Crónica publicada ✓', 'ok');
        const sec = document.getElementById('cronicas'); if (sec && !post) sec.scrollIntoView({ behavior: 'smooth' });
      }).catch(() => { publish.disabled = false; msg.className = 'ma-msg err'; msg.textContent = 'No se pudo conectar con el servidor.'; });
    });

    const body = shell(post ? 'EDITAR CRÓNICA' : 'NUEVA CRÓNICA', [el('button', { class: 'ma-btn small', type: 'button', text: 'CANCELAR', onclick: () => closeOverlay() })]);
    body.appendChild(el('div', { class: 'ma-row', style: 'grid-template-columns:2fr 1fr' }, [
      el('div', {}, [el('label', { class: 'ma-label', text: 'TÍTULO' }), titulo]),
      el('div', {}, [el('label', { class: 'ma-label', text: 'FECHA DEL SUCESO' }), fecha])
    ]));
    body.appendChild(el('label', { class: 'ma-label', text: 'IMAGEN' }));
    body.appendChild(el('div', { class: 'ma-imgbox' }, [thumb, el('div', {}, [el('div', { class: 'ma-actions' }, [pick, rm]), imgMsg]), file]));
    body.appendChild(el('label', { class: 'ma-label', text: 'TEXTO' }));
    body.appendChild(el('div', { class: 'ma-actions', style: 'justify-content:space-between' }, [tb, toggle]));
    body.appendChild(area); body.appendChild(prev);
    body.appendChild(el('p', { class: 'ma-hint', text: 'La imagen es opcional. Para separar párrafos dejá una línea en blanco.' }));
    body.appendChild(el('div', { class: 'ma-actions', style: 'margin-top:14px' }, [publish, msg]));
    drawImg();
    setTimeout(() => titulo.focus(), 30);
  }

  /* ---------- trailer: video del reino (el admin lo sube, todos lo ven) ---------- */
  let trRoot = null, trBusy = false;
  const TR_MAX = 100 * 1024 * 1024; // igual que el servidor
  function ensureTrailerRoot() {
    const r = document.getElementById('mendo-trailer-root');
    if (r && r !== trRoot) { trRoot = r; renderTrailer(); }
  }
  function renderTrailer() {
    if (!trRoot || trBusy) return;
    trRoot.innerHTML = '';
    const t = S.trailer;
    if (t) trRoot.appendChild(el('video', { id: 'mendo-trailer-video', class: 'tr-video', src: '/api/trailer/video/' + t.id, controls: '', playsinline: '', preload: 'metadata' }));
    if (!S.admin) return;
    const file = el('input', { type: 'file', accept: 'video/mp4,video/webm,.mp4,.webm', style: 'display:none' });
    file.addEventListener('change', () => { const f = file.files && file.files[0]; file.value = ''; if (f) uploadTrailer(f); });
    const btns = [el('button', { class: 'ma-btn small', type: 'button', text: t ? 'CAMBIAR VIDEO' : 'SUBIR VIDEO', onclick: () => file.click() })];
    if (t) btns.push(el('button', { class: 'ma-btn small danger', type: 'button', text: 'QUITAR', onclick: removeTrailer }));
    trRoot.appendChild(el('div', { class: 'tr-admin ma-ui' + (t ? '' : ' empty') }, btns.concat([file])));
  }
  function loadTrailer() {
    api('/api/trailer').then(r => { if (r.ok) S.trailer = r.data.trailer || null; renderTrailer(); }).catch(() => {});
  }
  const trNeed = r => {
    if (r.status === 401) { const e = new Error('Tu sesión venció.'); e.expired = true; throw e; }
    if (!r.ok) throw new Error((r.data && r.data.error) || 'Error del servidor.');
    return r;
  };
  // Un pedazo del video; se usa XMLHttpRequest para poder mostrar el avance de la subida.
  function putChunk(id, i, blob, onP) {
    return new Promise((resolve, reject) => {
      const x = new XMLHttpRequest();
      x.open('PUT', '/api/trailer?action=chunk&id=' + id + '&i=' + i);
      x.setRequestHeader('content-type', 'application/octet-stream');
      x.upload.onprogress = e => { if (e.lengthComputable) onP(e.loaded / e.total); };
      x.onerror = x.ontimeout = () => reject(new Error('Se cortó la conexión.'));
      x.onload = () => { let d = {}; try { d = JSON.parse(x.responseText); } catch (e) { /* sin cuerpo */ } resolve({ status: x.status, ok: x.status >= 200 && x.status < 300, data: d }); };
      x.send(blob);
    });
  }
  async function uploadTrailer(f) {
    if (trBusy || !trRoot) return;
    trBusy = true;
    const label = el('div', { class: 'ma-msg', text: 'Preparando…' });
    const fill = el('i');
    const bar = el('div', { class: 'tr-bar' }, [fill]);
    const box = el('div', { class: 'tr-up ma-ui' }, [label, bar]);
    trRoot.appendChild(box);
    try {
      if (!/\.(mp4|webm)$/i.test(f.name)) throw new Error('Formato no permitido. Usá MP4 o WebM.');
      if (f.size > TR_MAX) throw new Error('El video pesa ' + Math.ceil(f.size / 1048576) + ' MB; el máximo es ' + (TR_MAX / 1048576) + ' MB.');
      const st = trNeed(await api('/api/trailer?action=start', { method: 'POST', json: { size: f.size } })).data;
      const prog = p => { const v = Math.round(p * 100); fill.style.width = v + '%'; label.textContent = 'Subiendo video… ' + v + '%'; };
      for (let i = 0; i < st.n; i++) {
        const blob = f.slice(i * st.chunk, (i + 1) * st.chunk);
        let r;
        try { r = await putChunk(st.id, i, blob, q => prog((i + q) / st.n)); } catch (e) { r = await putChunk(st.id, i, blob, q => prog((i + q) / st.n)); } // un reintento si se corta
        trNeed(r);
      }
      label.textContent = 'Terminando…';
      S.trailer = trNeed(await api('/api/trailer?action=finish', { method: 'POST', json: { id: st.id } })).data.trailer;
      trBusy = false; renderTrailer(); barMsg('Video del trailer publicado ✓', 'ok');
    } catch (e) {
      trBusy = false;
      if (e.expired) { box.remove(); return sessionExpired('Tu sesión venció. Volvé a entrar y subí el video de nuevo.'); }
      bar.remove(); label.className = 'ma-msg err'; label.textContent = e.message || 'No se pudo subir el video.';
      setTimeout(() => box.remove(), 6000);
    }
  }
  function removeTrailer() {
    if (!window.confirm('¿Quitar el video del trailer? La página vuelve a mostrar el recuadro de “PLAY”.')) return;
    api('/api/trailer', { method: 'DELETE' }).then(r => {
      if (r.status === 401) return sessionExpired();
      if (!r.ok) return barMsg((r.data && r.data.error) || 'No se pudo quitar el video.', 'err');
      S.trailer = null; renderTrailer(); barMsg('Video quitado', 'ok');
    }).catch(() => barMsg('No se pudo conectar con el servidor.', 'err'));
  }

  /* ---------- arranque ---------- */
  function applyContent(c) {
    S.saved = { texts: (c && c.texts) || {}, links: (c && c.links) || {} };
    if (!dirtyCount() || !S.admin) S.cur = clone(S.saved);
    rescan();
  }
  function loadContent() {
    api('/api/content').then(r => { if (r.ok && r.data.content) applyContent(r.data.content); }).catch(() => { /* sin servidor: se ve la página original */ });
  }

  window.MendoAdmin = {
    open() {
      if (S.admin) { S.editing = true; renderBar(); syncEditMode(); barMsg('Modo edición activado'); return; }
      api('/api/session').then(r => { if (r.ok && r.data.admin) setAdmin(true); else showLogin(); }).catch(() => showLogin('No se pudo conectar con el servidor.'));
    }
  };

  const mo = new MutationObserver(muts => {
    for (const m of muts) {
      const t = m.target.nodeType === 1 ? m.target : m.target.parentElement;
      if (t && t.closest && t.closest('.ma-ui,.ma-pencil-layer,.cr-lightbox')) continue;
      scheduleScan(); ensureBlogRoot(); ensureTrailerRoot(); return;
    }
  });
  function start() {
    mo.observe(document.body, { subtree: true, childList: true, characterData: true });
    window.addEventListener('scroll', scheduleLayout, true);
    window.addEventListener('resize', scheduleLayout);
    if (window.ResizeObserver) new ResizeObserver(scheduleLayout).observe(document.body);
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && overlay) closeOverlay(); });
    ensureBlogRoot(); ensureTrailerRoot(); scheduleScan();
    loadContent(); loadPosts(); loadTrailer();
    let hint = null; try { hint = localStorage.getItem(HINT); } catch (e) { /* nada */ }
    if (hint) api('/api/session').then(r => { if (r.ok && r.data.admin) setAdmin(true); else { try { localStorage.removeItem(HINT); } catch (e) { /* nada */ } } }).catch(() => {});
  }
  if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
})();
