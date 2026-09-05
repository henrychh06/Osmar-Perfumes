/* Buscador de Maros.
 *
 * Hasta ahora el desplegable de la lupa era una maqueta: el campo de texto no
 * estaba conectado a nada y los cuatro resultados eran HTML fijo con productos
 * que ni siquiera existen en el catálogo. Ese bloque estaba copiado igual en
 * las seis páginas.
 *
 * Este módulo lo sustituye por uno de verdad, dibujándose a sí mismo como hacen
 * cart.js y nav.js, así que las páginas no llevan markup de búsqueda. Busca a
 * la vez en decants, perfumes y packs, y al elegir un resultado abre su ficha.
 *
 * Las direcciones de destino se leen de los enlaces del propio <nav>, porque el
 * sitio publicado usa /decants/ mientras que en local son Decants.dc.html.
 */
(function () {
  'use strict';

  if (window.__marosSearch) return;
  window.__marosSearch = true;

  var overlay = null, input = null, listBox = null;
  var isOpen = false, datos = null, hits = [];

  /* -------------------------------------------------- utilidades */

  function norm(v) {
    return String(v == null ? '' : v)
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  }

  function money(n) {
    var x = Number(n);
    return isFinite(x) ? 'S/. ' + x.toFixed(2) : '';
  }

  /* El <nav> ya tiene los enlaces con la ruta correcta para este despliegue.
     Se excluye la marca: su bajada dice "Perfumes & Decants", así que buscando
     por subcadena se llevaba todos los decants a la portada. Y se compara el
     texto completo, no un trozo, para que "decants" no case con "packs de
     decants". */
  function urlDe(clave) {
    var links = document.querySelectorAll('nav.nav > a:not(.nav-brand)');
    for (var i = 0; i < links.length; i++) {
      if (norm(links[i].textContent).trim() === clave) {
        return links[i].getAttribute('href') || '';
      }
    }
    return '';
  }

  /* -------------------------------------------------- estilos */

  function injectStyles() {
    if (document.getElementById('ms-styles')) return;
    var css = [
      // Sin esta regla, el display:flex de abajo le gana al [hidden] del
      // navegador y el panel se queda pintado al cerrarlo.
      '.ms-back[hidden]{display:none}',
      '.ms-back{position:fixed;inset:0;background:rgba(27,24,22,0.55);z-index:1100;display:flex;',
      'align-items:flex-start;justify-content:center;padding:12vh 16px 16px}',
      ".ms-panel{background:#fff;width:min(720px,100%);max-height:76vh;display:flex;flex-direction:column;",
      "border-radius:8px;box-shadow:0 24px 60px rgba(27,24,22,0.28);font-family:'Manrope',system-ui,sans-serif;color:#1b1816;overflow:hidden}",
      '.ms-head{display:flex;align-items:center;gap:12px;padding:18px 20px;border-bottom:1px solid #e6e3e1;flex:none}',
      '.ms-head svg{flex:none;color:#8a8480}',
      '.ms-input{flex:1;min-width:0;border:none;outline:none;font:inherit;font-size:18px;color:#1b1816;background:none}',
      '.ms-x{flex:none;background:none;border:none;padding:6px;cursor:pointer;color:#8a8480;display:flex}',
      '.ms-body{flex:1;overflow:auto;overscroll-behavior:contain;padding:8px 0 12px}',
      '.ms-group{font-size:10.5px;letter-spacing:0.14em;text-transform:uppercase;color:#8a8480;padding:14px 20px 6px}',
      '.ms-item{display:flex;align-items:center;gap:12px;width:100%;padding:9px 20px;background:none;border:none;',
      'cursor:pointer;text-align:left;font:inherit;color:inherit}',
      '.ms-item:hover,.ms-item:focus-visible{background:#faf7f1;outline:none}',
      '.ms-thumb{width:44px;height:44px;flex:none;object-fit:cover;background:#f0efee;border-radius:4px}',
      '.ms-name{flex:1;min-width:0;font-size:14px;line-height:1.3}',
      '.ms-brand{display:block;font-size:10.5px;letter-spacing:0.1em;text-transform:uppercase;color:#8a8480}',
      ".ms-price{flex:none;font-size:13px;color:#5c5651;font-feature-settings:'tnum' 1;white-space:nowrap}",
      '.ms-msg{padding:26px 20px;text-align:center;font-size:13.5px;color:#8a8480}',
      '@media (max-width:640px){.ms-back{padding:0}.ms-panel{width:100%;max-height:100%;height:100%;border-radius:0}}'
    ].join('');
    var st = document.createElement('style');
    st.id = 'ms-styles';
    st.textContent = css;
    document.head.appendChild(st);
  }

  /* -------------------------------------------------- construcción */

  function build() {
    if (overlay) return;
    injectStyles();

    overlay = document.createElement('div');
    overlay.className = 'ms-back';
    overlay.hidden = true;
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });

    var panel = document.createElement('div');
    panel.className = 'ms-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Buscar en la tienda');

    var head = document.createElement('div');
    head.className = 'ms-head';
    head.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><circle cx="11" cy="11" r="7"></circle><path d="m21 21-4.3-4.3"></path></svg>';

    input = document.createElement('input');
    input.type = 'text';
    input.className = 'ms-input';
    input.placeholder = 'Buscar perfumes, decants o packs';
    input.setAttribute('aria-label', 'Buscar');
    input.addEventListener('input', render);
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { close(); return; }
      if (e.key === 'Enter' && hits.length) { e.preventDefault(); go(hits[0]); }
    });

    var x = document.createElement('button');
    x.type = 'button';
    x.className = 'ms-x';
    x.setAttribute('aria-label', 'Cerrar');
    x.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"></path></svg>';
    x.addEventListener('click', close);

    head.appendChild(input);
    head.appendChild(x);

    listBox = document.createElement('div');
    listBox.className = 'ms-body';

    panel.appendChild(head);
    panel.appendChild(listBox);
    overlay.appendChild(panel);
    document.body.appendChild(overlay);
  }

  /* -------------------------------------------------- datos */

  function catalogo() {
    var d = datos || {};
    var prods = d.products || [];
    var packs = d.packs || [];
    var out = [];

    prods.forEach(function (p) {
      if (p.enDecants && p.p3 !== '' && p.p3 != null) {
        out.push({ grupo: 'Decants', destino: 'decants', id: p.id, marca: p.marca, nombre: p.nombre,
                   linea: p.linea, img: (p.imagenes || [])[0] || '', precio: 'Desde ' + money(p.p3) });
      }
      if (p.enCatalogo && p.pFrasco !== '' && p.pFrasco != null) {
        out.push({ grupo: 'Perfumes', destino: 'catalogo', id: p.id, marca: p.marca, nombre: p.nombre,
                   linea: p.linea, img: (p.imagenes || [])[0] || '', precio: money(p.pFrasco) });
      }
    });

    packs.forEach(function (k) {
      out.push({ grupo: 'Packs', destino: 'packs', id: k.id, marca: k.tipo || '', nombre: k.nombre,
                 linea: k.subtitulo || '', img: (k.imagenes || [])[0] || '', precio: '' });
    });

    return out;
  }

  var DESTINOS = { decants: 'decants', catalogo: 'catalogo', packs: 'packs de decants' };

  function go(item) {
    var base = urlDe(DESTINOS[item.destino] || item.destino);
    // Sin enlace, o con href="#", el destino es esta misma página: el Catálogo
    // enlaza así a sí mismo. Se abre la ficha en el sitio en vez de navegar.
    if (!base || base === '#') {
      close();
      if (window.MarosAbreFicha) window.MarosAbreFicha(item.id);
      return;
    }
    window.location.href = base + (base.indexOf('?') === -1 ? '?' : '&') + 'p=' + encodeURIComponent(item.id);
  }

  /* -------------------------------------------------- pintado */

  function render() {
    var q = norm(input.value).trim();
    listBox.innerHTML = '';
    hits = [];

    if (!q) {
      listBox.innerHTML = '<div class="ms-msg">Escribe para buscar entre los decants, los perfumes y los packs.</div>';
      return;
    }
    if (!datos) {
      listBox.innerHTML = '<div class="ms-msg">Cargando el catálogo…</div>';
      return;
    }

    var todos = catalogo().filter(function (it) {
      return (norm(it.nombre) + ' ' + norm(it.marca) + ' ' + norm(it.linea)).indexOf(q) !== -1;
    });

    if (!todos.length) {
      listBox.innerHTML = '<div class="ms-msg">No encontramos nada para «' + input.value.trim() + '».</div>';
      return;
    }

    ['Decants', 'Perfumes', 'Packs'].forEach(function (grupo) {
      var del = todos.filter(function (it) { return it.grupo === grupo; }).slice(0, 8);
      if (!del.length) return;

      var h = document.createElement('div');
      h.className = 'ms-group';
      h.textContent = grupo;
      listBox.appendChild(h);

      del.forEach(function (it) {
        hits.push(it);
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'ms-item';

        var img = document.createElement('img');
        img.className = 'ms-thumb';
        img.alt = '';
        if (it.img) img.src = it.img;

        var name = document.createElement('div');
        name.className = 'ms-name';
        var brand = document.createElement('span');
        brand.className = 'ms-brand';
        brand.textContent = it.marca || '';
        name.appendChild(brand);
        name.appendChild(document.createTextNode(it.nombre || ''));

        var price = document.createElement('div');
        price.className = 'ms-price';
        price.textContent = it.precio || '';

        b.appendChild(img);
        b.appendChild(name);
        b.appendChild(price);
        b.addEventListener('click', function () { go(it); });
        listBox.appendChild(b);
      });
    });
  }

  /* -------------------------------------------------- abrir / cerrar */

  function open() {
    build();
    if (isOpen) return;
    isOpen = true;
    overlay.hidden = false;
    input.value = '';
    render();
    input.focus({ preventScroll: true });
    if (window.MarosNav && window.MarosNav.syncLock) window.MarosNav.syncLock();
  }

  function close() {
    if (!isOpen) return;
    isOpen = false;
    overlay.hidden = true;
    // nav.js es el dueño del bloqueo de scroll y sabe si algo más lo necesita.
    if (window.MarosNav && window.MarosNav.syncLock) window.MarosNav.syncLock();
  }

  /* -------------------------------------------------- arranque */

  function init() {
    if (window.MarosData) window.MarosData.ready(function (d) { datos = d; if (isOpen) render(); });

    // La lupa del nav sigue teniendo su propio handler en cada página; se
    // intercepta en captura para que abra este buscador y no el antiguo.
    document.addEventListener('click', function (e) {
      var btn = e.target && e.target.closest && e.target.closest('button[aria-label="Buscar"]');
      if (!btn) return;
      e.preventDefault();
      e.stopPropagation();
      open();
    }, true);

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && isOpen) close();
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  window.MarosSearch = { open: open, close: close };
})();
