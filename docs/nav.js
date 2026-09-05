/* Menú móvil de Maros.
 *
 * Igual que cart.js, este módulo dibuja su propio markup directamente en el
 * DOM en vez de duplicarlo en las seis páginas. Lee los enlaces que ya existen
 * en el <nav>, así que añadir o quitar una sección del sitio no obliga a tocar
 * este archivo.
 *
 * El <nav> lo pinta el runtime x-dc después de cargar la página, y lo vuelve a
 * pintar cuando cambia el estado (por ejemplo el globito del carrito), lo que
 * borra nuestro botón. Por eso hay un MutationObserver que lo repone.
 *
 * Ese observador convive con el propio runtime, así que hay dos precauciones
 * para no acabar en un bucle de renders mutuos:
 *   - refresh() no escribe absolutamente nada si el DOM ya está como debe;
 *   - mientras escribimos, el observador se desconecta.
 *
 * De paso resuelve el bloqueo de scroll del fondo, que hasta ahora no existía:
 * es el mismo mecanismo para el menú y para el modal de producto.
 */
(function () {
  'use strict';

  // El runtime mueve el <helmet> al <head> y al hacerlo re-ejecuta los scripts
  // que encuentra dentro. Este archivo se carga desde el <head> real, pero la
  // guarda evita construir dos menús si alguna vez vuelve a pasar.
  if (window.__marosNav) return;
  window.__marosNav = true;

  var BURGER_SVG = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"></path></svg>';
  var CLOSE_SVG = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"></path></svg>';

  var LOCK = 'mp-no-scroll';

  var menu = null;      // el panel, se crea una sola vez
  var panel = null;
  var linksBox = null;
  var isOpen = false;
  var hideTimer = null;
  var signature = '';   // para no rehacer los enlaces en cada re-render

  /* -------------------------------------------------- lectura del nav */

  function navLinks(nav) {
    var out = [];
    var kids = nav.children;
    for (var i = 0; i < kids.length; i++) {
      var el = kids[i];
      if (el.tagName === 'A' && !el.classList.contains('nav-brand')) out.push(el);
    }
    return out;
  }

  function signatureOf(list) {
    return list.map(function (a) {
      return a.textContent.trim() + '|' + a.getAttribute('href') + '|' + (a.getAttribute('aria-current') || '');
    }).join('~');
  }

  /* -------------------------------------------------- construcción */

  function buildMenu() {
    if (menu) return;

    menu = document.createElement('div');
    menu.className = 'mp-menu';
    menu.id = 'mp-menu';
    menu.hidden = true;

    var backdrop = document.createElement('div');
    backdrop.className = 'mp-menu-backdrop';
    backdrop.addEventListener('click', close);

    panel = document.createElement('nav');
    panel.className = 'mp-menu-panel';
    panel.setAttribute('aria-label', 'Menú principal');

    var head = document.createElement('div');
    head.className = 'mp-menu-head';

    var brand = document.createElement('a');
    brand.className = 'mp-menu-brand';
    brand.textContent = 'MAROS';

    var closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'mp-menu-close';
    closeBtn.setAttribute('aria-label', 'Cerrar menú');
    closeBtn.innerHTML = CLOSE_SVG;
    closeBtn.addEventListener('click', close);

    head.appendChild(brand);
    head.appendChild(closeBtn);

    linksBox = document.createElement('div');

    panel.appendChild(head);
    panel.appendChild(linksBox);
    menu.appendChild(backdrop);
    menu.appendChild(panel);
    document.body.appendChild(menu);
  }

  // Copia al panel los enlaces que ya están en el <nav>.
  function syncLinks(nav, sources, sig) {
    signature = sig;

    var brandSrc = nav.querySelector('.nav-brand');
    if (brandSrc) {
      var brandEl = panel.querySelector('.mp-menu-brand');
      brandEl.setAttribute('href', brandSrc.getAttribute('href') || '#');
      var firstSpan = brandSrc.querySelector('span');
      if (firstSpan) brandEl.textContent = firstSpan.textContent.trim();
    }

    linksBox.innerHTML = '';
    sources.forEach(function (src) {
      var a = document.createElement('a');
      a.className = 'mp-menu-link';
      a.textContent = src.textContent.trim();
      var href = src.getAttribute('href');
      a.setAttribute('href', href || '#');
      if (src.getAttribute('aria-current')) a.setAttribute('aria-current', src.getAttribute('aria-current'));

      a.addEventListener('click', function (e) {
        // El Catálogo enlaza a sí mismo con href="#" y un handler del runtime:
        // hay que disparar el original, no seguir el ancla.
        if (!href || href === '#') {
          e.preventDefault();
          close();
          src.click();
          return;
        }
        close();
      });

      linksBox.appendChild(a);
    });
  }

  // El botón va junto a buscar y carrito, en el último <div> hijo del <nav>.
  function ensureBurger(nav) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'mp-burger';
    btn.setAttribute('aria-label', 'Abrir menú');
    btn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    btn.setAttribute('aria-controls', 'mp-menu');
    btn.innerHTML = BURGER_SVG;
    btn.addEventListener('click', open);

    var icons = null;
    var kids = nav.children;
    for (var i = kids.length - 1; i >= 0; i--) {
      if (kids[i].tagName === 'DIV') { icons = kids[i]; break; }
    }
    (icons || nav).appendChild(btn);
  }

  /* -------------------------------------------------- abrir / cerrar */

  // El menú, el modal de producto y el panel del carrito comparten el bloqueo:
  // se libera solo cuando ninguno de los tres está abierto.
  function wantsLock() {
    return isOpen ||
      !!document.querySelector('.dialog-backdrop') ||
      !!document.querySelector('.mc-panel');
  }

  function setExpanded(v) {
    var b = document.querySelector('.mp-burger');
    if (b) b.setAttribute('aria-expanded', v ? 'true' : 'false');
  }

  function applyLock() {
    var want = wantsLock();
    if (document.body.classList.contains(LOCK) !== want) {
      document.body.classList.toggle(LOCK, want);
    }
  }

  function open() {
    if (isOpen) return;
    buildMenu();
    if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
    menu.hidden = false;
    void menu.offsetWidth;  // fuerza el reflow para que la transición corra
    menu.classList.add('mp-on');
    isOpen = true;
    setExpanded(true);
    applyLock();
    var first = linksBox && linksBox.querySelector('.mp-menu-link');
    if (first) first.focus({ preventScroll: true });
  }

  function close() {
    if (!isOpen || !menu) return;
    menu.classList.remove('mp-on');
    isOpen = false;
    setExpanded(false);
    applyLock();
    hideTimer = setTimeout(function () {
      if (!isOpen) menu.hidden = true;
      hideTimer = null;
    }, 340);
  }

  /* -------------------------------------------------- observación */

  var observer = null;
  var pending = false;
  var burst = 0;
  var burstAt = 0;

  function watch() {
    if (observer) observer.observe(document.body, { childList: true, subtree: true });
  }

  function unwatch() {
    if (observer) observer.disconnect();
  }

  function refresh() {
    pending = false;

    var nav = document.querySelector('nav.nav');
    var sources = nav ? navLinks(nav) : [];
    var sig = sources.length ? signatureOf(sources) : null;

    var needBurger = !!nav && !nav.querySelector('.mp-burger');
    var needLinks = !!sig && sig !== signature;
    var needLock = document.body.classList.contains(LOCK) !== wantsLock();

    // Si el DOM ya está como debe no se escribe nada. Es lo que impide que el
    // runtime y este observador se disparen mutuamente sin fin.
    if (!needBurger && !needLinks && !needLock) return;

    // Cortafuegos: si aun así acabamos en un ciclo, dejamos de observar en vez
    // de colgar la pestaña. El menú seguirá funcionando con lo ya montado.
    var now = Date.now();
    if (now - burstAt > 1000) { burst = 0; burstAt = now; }
    if (++burst > 30) {
      unwatch();
      observer = null;
      return;
    }

    unwatch();
    try {
      if (nav) {
        buildMenu();
        if (needBurger) ensureBurger(nav);
        if (needLinks) syncLinks(nav, sources, sig);
      }
      applyLock();
    } finally {
      watch();
    }
  }

  function schedule() {
    if (pending) return;
    pending = true;
    // rAF es lo barato, pero no corre con la pestaña en segundo plano: el
    // temporizador se encarga de esos casos.
    requestAnimationFrame(refresh);
    setTimeout(function () { if (pending) refresh(); }, 250);
  }

  function init() {
    observer = new MutationObserver(schedule);
    refresh();
    watch();

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && isOpen) close();
    });
    // Al volver a escritorio el panel deja de tener sentido.
    window.addEventListener('resize', function () {
      if (isOpen && window.innerWidth > 900) close();
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  window.MarosNav = { open: open, close: close };
})();
