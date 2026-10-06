/* Éditeur visuel du site CEA FOR AFRICA (mode édition : ?edition=1, réservé aux éditeurs et administrateurs).
   Cliquer sur un texte, un chiffre, un lien ou une image ouvre un panneau de modification ; l'enregistrement passe par
   /api/admin/textes et s'applique à cette page ou à tout le site. Le mode « Naviguer » rend aux clics leur comportement normal. */
(function () {
  'use strict';
  var dataEl = document.getElementById('cea-edit-data');
  if (!dataEl) return;
  var DATA = JSON.parse(dataEl.textContent || '{}');
  var PAGE = DATA.page || location.pathname;
  var ORIG = DATA.originals || {};
  var LABEL = { text: 'Texte', href: 'Adresse du lien', src: 'Image', alt: "Description de l'image (texte alternatif)", title: 'Infobulle', placeholder: 'Texte indicatif du champ', 'data-countdown': 'Date et heure du compte à rebours (AAAA-MM-JJTHH:MM)' };
  var norm = function (s) { return String(s || '').replace(/[ \t\n\r\f]+/g, ' ').replace(/^ | $/g, ''); };
  var mode = 'edit';
  var count = Object.keys(ORIG).length;
  var root = document.documentElement;
  root.classList.add('cea-editing');

  /* ===== barre d'outils ===== */
  var bar = el('div', { class: 'cea-bar', role: 'toolbar', 'aria-label': 'Mode édition' });
  bar.innerHTML =
    '<b class="cea-bar-t">✎ Mode édition</b>' +
    '<span class="cea-seg" role="group" aria-label="Clics"><button type="button" data-mode="edit" aria-pressed="true">Modifier</button><button type="button" data-mode="nav" aria-pressed="false">Naviguer</button></span>' +
    '<label class="cea-chk"><input type="checkbox" id="ceaVisitor" /> Voir comme un visiteur</label>' +
    '<span class="cea-n" id="ceaCount"></span>' +
    '<span class="cea-sp"></span>' +
    '<a href="/admin/textes">Back-office</a>' +
    '<a href="' + location.pathname + '" id="ceaQuit" class="cea-quit">Quitter</a>';
  document.body.appendChild(bar);
  var setCount = function () { document.getElementById('ceaCount').textContent = count ? count + ' élément' + (count > 1 ? 's' : '') + ' modifié' + (count > 1 ? 's' : '') + ' sur cette page' : 'Cliquez sur un texte, un chiffre, un lien ou une image'; };
  setCount();
  bar.addEventListener('click', function (e) {
    var b = e.target.closest('[data-mode]');
    if (!b) return;
    mode = b.dataset.mode;
    bar.querySelectorAll('[data-mode]').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
    root.classList.toggle('cea-nav', mode === 'nav');
  });
  document.getElementById('ceaVisitor').addEventListener('change', function (e) { root.classList.toggle('cea-visitor', e.target.checked); });

  /* ===== clics ===== */
  document.addEventListener('click', function (e) {
    if (e.target.closest('.cea-bar, .cea-panel')) return;
    var t = e.target.closest('cea-t');
    var a = e.target.closest('[data-cea-a]');
    if (mode === 'edit' && !e.altKey && (t || a)) {
      e.preventDefault(); e.stopPropagation();
      open(t, t ? t.parentElement && t.parentElement.closest('[data-cea-a]') : a);
      return;
    }
    // Navigation interne : on reste en mode édition
    var link = e.target.closest('a[href]');
    if (link && !e.defaultPrevented && link.origin === location.origin && !/^\/(api|admin|espace)\b/.test(link.pathname) && !link.target) {
      var u = new URL(link.href);
      if (u.pathname === location.pathname && u.hash) return;
      e.preventDefault();
      u.searchParams.set('edition', '1');
      location.href = u.href;
    }
  }, true);

  /* ===== panneau ===== */
  var panel = null;
  function fieldsFor(t, holder) {
    var out = [];
    if (t) { var k = t.dataset.k; out.push({ kind: 'text', key: k, s: t.dataset.s || '', node: t, current: norm(t.textContent) }); }
    if (holder) {
      holder.dataset.ceaA.split(' ').forEach(function (m) {
        var p = m.split(':'); if (p.length < 2) return;
        out.push({ kind: p[0], key: p[1], s: p[2] || '', node: holder, current: holder.getAttribute(p[0]) || '' });
      });
    }
    out.forEach(function (f) { f.original = ORIG[f.key] !== undefined ? ORIG[f.key] : f.current; });
    // Ordre : image, texte, puis attributs
    var rank = { src: 0, alt: 1, text: 2 };
    return out.sort(function (x, y) { return (rank[x.kind] ?? 3) - (rank[y.kind] ?? 3); });
  }
  function open(t, holder) {
    close();
    var fields = fieldsFor(t, holder);
    if (!fields.length) return;
    var target = t || holder;
    var shared = !!target.closest('header.top, #drawer, footer.foot, .cookie, #copilot');
    var s = fields.find(function (f) { return f.s; });
    var site = s ? s.s === 's' : shared;
    target.classList.add('cea-cur');
    panel = el('div', { class: 'cea-panel', role: 'dialog', 'aria-modal': 'false', 'aria-label': 'Modifier' });
    var h = '<div class="cea-ph"><b>Modifier</b><button type="button" class="cea-x" aria-label="Fermer">✕</button></div><form class="cea-pb">';
    fields.forEach(function (f, i) {
      var id = 'ceaF' + i;
      h += '<div class="cea-f">';
      if (f.kind === 'src') {
        h += '<label>' + LABEL.src + '</label><img class="cea-prev" src="' + attr(f.current) + '" alt="" />' +
          '<input type="file" accept="image/png,image/jpeg,image/webp" data-i="' + i + '" class="cea-file" />' +
          '<input type="text" id="' + id + '" data-i="' + i + '" value="' + attr(f.current) + '" aria-label="Adresse de l\'image" />';
      } else {
        h += '<label for="' + id + '">' + (LABEL[f.kind] || f.kind) + '</label>';
        h += f.kind === 'text'
          ? '<textarea id="' + id + '" data-i="' + i + '" rows="' + Math.min(8, Math.max(2, Math.ceil(f.current.length / 48))) + '">' + esc(f.current) + '</textarea>'
          : '<input type="text" id="' + id + '" data-i="' + i + '" value="' + attr(f.current) + '" />';
      }
      if (f.s) h += '<div class="cea-o">Texte d’origine : <span>' + esc(f.original) + '</span> <button type="button" class="cea-reset" data-i="' + i + '">Rétablir</button></div>';
      h += '</div>';
    });
    h += '<fieldset class="cea-scope"><legend>Appliquer la modification</legend>' +
      '<label><input type="radio" name="scope" value="page"' + (site ? '' : ' checked') + ' /> Sur cette page seulement</label>' +
      '<label><input type="radio" name="scope" value="site"' + (site ? ' checked' : '') + ' /> Partout sur le site <small>(en-tête, pied de page, texte répété)</small></label></fieldset>' +
      '<div class="cea-act"><button type="submit" class="cea-save">Enregistrer</button><button type="button" class="cea-cancel">Annuler</button>' +
      (holder && holder.matches('a[href]') ? '<button type="button" class="cea-go">Ouvrir le lien</button>' : '') + '</div>' +
      '<p class="cea-msg" role="status"></p></form>';
    panel.innerHTML = h;
    document.body.appendChild(panel);
    var first = panel.querySelector('textarea, input[type=text]');
    if (first) { first.focus(); if (first.select) first.select(); }
    var msg = panel.querySelector('.cea-msg');
    var scope = function () { return panel.querySelector('input[name=scope]:checked').value; };

    panel.querySelector('.cea-x').onclick = close;
    panel.querySelector('.cea-cancel').onclick = close;
    var go = panel.querySelector('.cea-go');
    if (go) go.onclick = function () { var u = new URL(holder.href); if (u.origin === location.origin) u.searchParams.set('edition', '1'); location.href = u.href; };
    panel.querySelectorAll('.cea-file').forEach(function (inp) {
      inp.onchange = function () {
        var f = fields[+inp.dataset.i]; var file = inp.files && inp.files[0]; if (!file) return;
        var altField = fields.find(function (x) { return x.kind === 'alt'; });
        var altVal = altField ? panel.querySelector('[data-i="' + fields.indexOf(altField) + '"]').value : '';
        var fallback = norm(holder.getAttribute('alt') || '').length >= 3 ? holder.getAttribute('alt') : 'Image du site CEA FOR AFRICA';
        var fd = new FormData(); fd.append('file', file); fd.append('alt', norm(altVal).length >= 3 ? altVal : fallback);
        msg.textContent = 'Envoi de l’image…';
        fetch('/api/admin/medias', { method: 'POST', body: fd, credentials: 'same-origin' }).then(function (r) { return r.json(); }).then(function (r) {
          if (!r.ok) throw new Error(r.error || 'Envoi impossible.');
          panel.querySelector('#ceaF' + inp.dataset.i).value = r.url;
          panel.querySelector('.cea-prev').src = r.url;
          msg.textContent = 'Image prête : cliquez sur Enregistrer.';
        }).catch(function (err) { msg.textContent = err.message; });
        void f;
      };
    });
    panel.querySelectorAll('.cea-reset').forEach(function (b) {
      b.onclick = function () {
        var f = fields[+b.dataset.i];
        send({ action: 'reset', page: PAGE, kind: f.kind, key: f.key, original: f.original, scope: f.s === 's' ? 'site' : 'page' })
          .then(function (r) { apply(f, r); toast('Texte d’origine rétabli.'); close(); }).catch(function (err) { msg.textContent = err.message; });
      };
    });
    panel.querySelector('form').addEventListener('keydown', function (e) { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); this.requestSubmit(); } });
    panel.querySelector('form').onsubmit = function (e) {
      e.preventDefault();
      var jobs = [];
      fields.forEach(function (f, i) {
        var v = panel.querySelector('[data-i="' + i + '"]:not(.cea-file)').value;
        if (norm(v) === norm(f.current) && !(f.s && scope() !== (f.s === 's' ? 'site' : 'page'))) return;
        jobs.push(function () { return send({ action: 'save', page: PAGE, kind: f.kind, key: f.key, original: f.original, value: v, scope: scope() }).then(function (r) { apply(f, r); }); });
      });
      if (!jobs.length) return close();
      var btn = panel.querySelector('.cea-save'); btn.disabled = true; msg.textContent = 'Enregistrement…';
      jobs.reduce(function (p, j) { return p.then(j); }, Promise.resolve())
        .then(function () { toast(scope() === 'site' ? 'Enregistré sur tout le site.' : 'Enregistré sur cette page.'); close(); })
        .catch(function (err) { btn.disabled = false; msg.textContent = err.message; });
    };
  }
  function apply(f, r) {
    var was = !!f.s;
    f.s = r.s || '';
    if (f.kind === 'text') { f.node.textContent = r.value; if (f.s) f.node.dataset.s = f.s; else delete f.node.dataset.s; }
    else {
      f.node.setAttribute(f.kind, r.value);
      f.node.dataset.ceaA = f.node.dataset.ceaA.split(' ').map(function (m) { var p = m.split(':'); return p[1] === f.key ? p[0] + ':' + p[1] + ':' + f.s : m; }).join(' ');
    }
    if (f.s) ORIG[f.key] = f.original; else delete ORIG[f.key];
    // Même texte ailleurs sur la page : même clé, même valeur
    if (f.kind === 'text') document.querySelectorAll('cea-t[data-k="' + f.key + '"]').forEach(function (n) { n.textContent = r.value; if (f.s) n.dataset.s = f.s; else delete n.dataset.s; });
    count += (f.s ? 1 : 0) - (was ? 1 : 0); setCount();
  }
  function close() {
    if (panel) panel.remove(); panel = null;
    document.querySelectorAll('.cea-cur').forEach(function (n) { n.classList.remove('cea-cur'); });
  }
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && panel) close(); });

  function send(body) {
    return fetch('/api/admin/textes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify(body) })
      .then(function (r) { return r.json().catch(function () { return { ok: false, error: 'Erreur ' + r.status }; }); })
      .then(function (r) { if (!r.ok) throw new Error(r.error || 'Enregistrement impossible.'); return r; });
  }
  function toast(t) {
    var n = el('div', { class: 'cea-toast', role: 'status' }); n.textContent = t; document.body.appendChild(n);
    setTimeout(function () { n.remove(); }, 2600);
  }
  function el(tag, attrs) { var n = document.createElement(tag); for (var k in attrs) n.setAttribute(k, attrs[k]); return n; }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function attr(s) { return esc(s).replace(/"/g, '&quot;'); }
})();
