/* Carrito compartido de Maros.
 *
 * Cada página del sitio es una instancia independiente del runtime x-dc, con su
 * propio estado en memoria: por eso antes el carrito era solo un número que se
 * perdía al navegar. Este módulo guarda el pedido real en localStorage (única
 * memoria compartida entre páginas) y dibuja su propio panel directamente en el
 * DOM, para no tener que duplicar el mismo markup en las 6 páginas.
 *
 * Uso desde una página:
 *   MarosCart.add({ tipo, nombre, detalle, tamano, precio, qty })
 *   MarosCart.open()
 *   MarosCart.count()            -> unidades totales (para el globito del nav)
 *   MarosCart.onChange(fn)       -> avisa cuando cambia (para re-renderizar)
 */
(function () {
  'use strict';

  var KEY = 'maros:cart:v1';
  var WA_DEFAULT = '51987654321';
  var subs = [];

  function waNumber() {
    return (window.MAROS_WHATSAPP || WA_DEFAULT).replace(/[^0-9]/g, '');
  }

  function fmt(n) { return 'S/. ' + Number(n || 0).toFixed(2); }

  // localStorage puede lanzar (modo privado, cookies bloqueadas). En ese caso el
  // carrito sigue funcionando en memoria durante la visita, solo que no persiste.
  var memory = null;

  function read() {
    if (memory) return memory;
    try {
      var raw = window.localStorage.getItem(KEY);
      memory = raw ? JSON.parse(raw) : [];
    } catch (e) {
      memory = [];
    }
    if (!Array.isArray(memory)) memory = [];
    return memory;
  }

  function write(items) {
    memory = items;
    try { window.localStorage.setItem(KEY, JSON.stringify(items)); } catch (e) { /* sin persistencia */ }
    notify();
  }

  function notify() {
    render();
    subs.forEach(function (fn) { try { fn(); } catch (e) { console.error(e); } });
  }

  function keyOf(item) {
    return [item.tipo || '', item.nombre || '', item.tamano || '', item.detalle || ''].join('|');
  }

  function add(item) {
    if (!item || !item.nombre) return;
    var items = read().slice();
    var k = keyOf(item);
    var qty = Math.max(1, Number(item.qty) || 1);
    var found = null;
    for (var i = 0; i < items.length; i++) { if (items[i].k === k) { found = items[i]; break; } }
    if (found) {
      found.qty += qty;
    } else {
      items.push({
        k: k,
        tipo: item.tipo || '',
        nombre: String(item.nombre),
        detalle: item.detalle ? String(item.detalle) : '',
        tamano: item.tamano ? String(item.tamano) : '',
        precio: Number(item.precio) || 0,
        qty: qty
      });
    }
    write(items);
    open();
  }

  function setQty(k, qty) {
    var items = read().slice();
    for (var i = 0; i < items.length; i++) {
      if (items[i].k === k) {
        if (qty <= 0) { items.splice(i, 1); } else { items[i].qty = qty; }
        break;
      }
    }
    write(items);
  }

  function remove(k) { setQty(k, 0); }
  function clear() { write([]); }

  function count() {
    return read().reduce(function (a, it) { return a + (Number(it.qty) || 0); }, 0);
  }

  function total() {
    return read().reduce(function (a, it) { return a + (Number(it.precio) || 0) * (Number(it.qty) || 0); }, 0);
  }

  /* Mensaje de WhatsApp detallado: una línea por producto con tamaño, cantidad,
     precio unitario y subtotal, más el detalle de las fragancias incluidas. */
  function waMessage() {
    var items = read();
    if (!items.length) return '';
    var lines = ['Hola! Quiero hacer este pedido:', ''];
    items.forEach(function (it, i) {
      var line = (i + 1) + '. ' + it.nombre;
      if (it.tamano) line += ' — ' + it.tamano;
      lines.push(line);
      if (it.detalle) lines.push('   Incluye: ' + it.detalle);
      lines.push('   Cantidad: ' + it.qty + '  ·  Precio unit.: ' + fmt(it.precio) + '  ·  Subtotal: ' + fmt(it.precio * it.qty));
      lines.push('');
    });
    lines.push('TOTAL: ' + fmt(total()));
    lines.push('');
    lines.push('Pago contra entrega (previo adelanto). Quedo atento para coordinar la entrega.');
    return lines.join('\n');
  }

  function waHref() {
    var msg = waMessage();
    return 'https://wa.me/' + waNumber() + (msg ? '?text=' + encodeURIComponent(msg) : '');
  }

  /* ---------- Panel ---------- */

  var root = null;
  var isOpen = false;

  function injectStyles() {
    if (document.getElementById('maros-cart-styles')) return;
    var el = document.createElement('style');
    el.id = 'maros-cart-styles';
    el.textContent = [
      '.mc-backdrop{position:fixed;inset:0;background:rgba(27,24,22,0.5);z-index:1000;opacity:0;transition:opacity .25s ease}',
      '.mc-backdrop.mc-on{opacity:1}',
      '.mc-panel{position:fixed;top:0;right:0;bottom:0;width:min(420px,100vw);background:#fff;z-index:1001;display:flex;flex-direction:column;',
      'box-shadow:-8px 0 30px rgba(27,24,22,0.18);transform:translateX(100%);transition:transform .32s cubic-bezier(0.23,1,0.32,1);',
      "font-family:'Manrope',system-ui,sans-serif;color:#1b1816}",
      '.mc-panel.mc-on{transform:translateX(0)}',
      '.mc-head{display:flex;align-items:center;justify-content:space-between;padding:20px 22px;border-bottom:1px solid #e6e3e1}',
      ".mc-title{font-family:'Oswald',system-ui,sans-serif;font-size:20px;letter-spacing:.08em;text-transform:uppercase;margin:0}",
      '.mc-x{background:none;border:none;cursor:pointer;padding:6px;color:#1b1816;line-height:0;border-radius:50%}',
      '.mc-x:hover{background:#f0efee}',
      '.mc-body{flex:1;overflow:auto;padding:14px 22px}',
      '.mc-empty{text-align:center;color:#6f6a66;font-size:13.5px;line-height:1.6;padding:48px 10px}',
      '.mc-item{display:grid;gap:6px;padding:15px 0;border-bottom:1px solid #efedeb}',
      '.mc-name{font-size:14px;font-weight:600;line-height:1.35}',
      '.mc-meta{font-size:12px;color:#6f6a66;line-height:1.5}',
      '.mc-row{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:2px}',
      '.mc-qty{display:flex;align-items:center;border:1px solid #ddd9d6;border-radius:999px;overflow:hidden}',
      '.mc-qty button{width:30px;height:28px;border:none;background:#fff;cursor:pointer;font-size:15px;color:#1b1816;line-height:1}',
      '.mc-qty button:hover{background:#f0efee}',
      '.mc-qty span{min-width:26px;text-align:center;font-size:13px;font-variant-numeric:tabular-nums}',
      '.mc-price{font-size:13.5px;font-weight:600;font-variant-numeric:tabular-nums}',
      '.mc-del{background:none;border:none;color:#8c2f2f;font-size:11.5px;cursor:pointer;padding:0;text-decoration:underline;justify-self:start}',
      '.mc-foot{border-top:1px solid #e6e3e1;padding:18px 22px;display:grid;gap:12px}',
      '.mc-total{display:flex;align-items:baseline;justify-content:space-between;font-size:15px;font-weight:700}',
      '.mc-total span:last-child{font-variant-numeric:tabular-nums}',
      '.mc-wa{display:flex;align-items:center;justify-content:center;gap:9px;background:#25d366;color:#fff;text-decoration:none;',
      'padding:13px 18px;border-radius:999px;font-size:13.5px;font-weight:600;transition:background .2s ease}',
      '.mc-wa:hover{background:#1fb958;color:#fff}',
      '.mc-clear{background:none;border:none;color:#6f6a66;font-size:12px;cursor:pointer;text-decoration:underline;padding:0}',
      '.mc-note{font-size:11.5px;color:#6f6a66;text-align:center;line-height:1.5;margin:0}',
      '@media (prefers-reduced-motion: reduce){.mc-backdrop,.mc-panel{transition-duration:.001s}}'
    ].join('');
    document.head.appendChild(el);
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function ensureRoot() {
    if (root) return root;
    injectStyles();
    root = document.createElement('div');
    root.id = 'maros-cart-root';
    document.body.appendChild(root);
    return root;
  }

  function render() {
    if (!root) return;
    if (!isOpen) { root.innerHTML = ''; return; }
    var items = read();
    var html = '<div class="mc-backdrop" data-mc-close></div>';
    html += '<aside class="mc-panel" role="dialog" aria-label="Tu carrito">';
    html += '<div class="mc-head"><h2 class="mc-title">Tu carrito</h2>';
    html += '<button class="mc-x" aria-label="Cerrar" data-mc-close><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg></button></div>';
    html += '<div class="mc-body">';
    if (!items.length) {
      html += '<p class="mc-empty">Todavía no agregaste nada.<br>Elige un decant, un pack o arma tu combo.</p>';
    } else {
      items.forEach(function (it) {
        html += '<div class="mc-item">';
        html += '<div class="mc-name">' + esc(it.nombre) + '</div>';
        if (it.tamano) html += '<div class="mc-meta">Tamaño: ' + esc(it.tamano) + '</div>';
        if (it.detalle) html += '<div class="mc-meta">Incluye: ' + esc(it.detalle) + '</div>';
        html += '<div class="mc-meta">' + esc(fmt(it.precio)) + ' c/u</div>';
        html += '<div class="mc-row"><div class="mc-qty">';
        html += '<button aria-label="Quitar uno" data-mc-dec="' + esc(it.k) + '">−</button>';
        html += '<span>' + it.qty + '</span>';
        html += '<button aria-label="Agregar uno" data-mc-inc="' + esc(it.k) + '">+</button>';
        html += '</div><span class="mc-price">' + esc(fmt(it.precio * it.qty)) + '</span></div>';
        html += '<button class="mc-del" data-mc-del="' + esc(it.k) + '">Quitar</button>';
        html += '</div>';
      });
    }
    html += '</div>';
    html += '<div class="mc-foot">';
    html += '<div class="mc-total"><span>Total</span><span>' + esc(fmt(total())) + '</span></div>';
    if (items.length) {
      html += '<a class="mc-wa" href="' + esc(waHref()) + '" target="_blank" rel="noopener">';
      html += '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-8.5 8.5 8.5 8.5 0 0 1-3.8-.9L3 21l1.9-5.7a8.5 8.5 0 1 1 16.1-3.8Z"/></svg>';
      html += 'Pedir por WhatsApp</a>';
      html += '<p class="mc-note">Se abre WhatsApp con tu pedido detallado listo para enviar.</p>';
      html += '<button class="mc-clear" data-mc-clear>Vaciar carrito</button>';
    }
    html += '</div></aside>';
    root.innerHTML = html;
    // Se activan las clases en el siguiente cuadro para que la transición corra.
    requestAnimationFrame(function () {
      var b = root.querySelector('.mc-backdrop');
      var p = root.querySelector('.mc-panel');
      if (b) b.classList.add('mc-on');
      if (p) p.classList.add('mc-on');
    });
  }

  function onRootClick(e) {
    var t = e.target.closest ? e.target.closest('[data-mc-close],[data-mc-inc],[data-mc-dec],[data-mc-del],[data-mc-clear]') : null;
    if (!t) return;
    if (t.hasAttribute('data-mc-close')) { close(); return; }
    if (t.hasAttribute('data-mc-clear')) { clear(); return; }
    var k = t.getAttribute('data-mc-inc') || t.getAttribute('data-mc-dec') || t.getAttribute('data-mc-del');
    if (!k) return;
    var items = read();
    var cur = 0;
    for (var i = 0; i < items.length; i++) { if (items[i].k === k) { cur = items[i].qty; break; } }
    if (t.hasAttribute('data-mc-inc')) setQty(k, cur + 1);
    else if (t.hasAttribute('data-mc-dec')) setQty(k, cur - 1);
    else remove(k);
  }

  function open() {
    ensureRoot();
    isOpen = true;
    render();
  }

  function close() {
    isOpen = false;
    render();
  }

  function init() {
    ensureRoot();
    root.addEventListener('click', onRootClick);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && isOpen) close(); });
    // Otra pestaña del mismo sitio modificó el carrito.
    window.addEventListener('storage', function (e) {
      if (e.key === KEY) { memory = null; notify(); }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  window.MarosCart = {
    add: add, remove: remove, setQty: setQty, clear: clear,
    read: read, count: count, total: total,
    open: open, close: close,
    waMessage: waMessage, waHref: waHref,
    onChange: function (fn) { if (typeof fn === 'function') subs.push(fn); }
  };
})();
