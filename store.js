/* Datos compartidos de Maros.
 *
 * Cada página consulta por su cuenta la fila site_data de Supabase para pintar
 * su contenido. Este módulo hace esa misma lectura una sola vez y la ofrece a
 * quien la quiera, y sobre todo resuelve lo que hasta ahora no tenía dueño:
 * los ajustes globales del panel de administración.
 *
 * El caso concreto es el número de WhatsApp. El admin lo guardaba en
 * redes.whatsapp y no lo leía nadie: el número estaba escrito a mano en seis
 * sitios distintos, y cart.js esperaba un window.MAROS_WHATSAPP que nunca se
 * asignaba. Aquí se asigna, y además se reescriben los enlaces wa.me que ya
 * están en el DOM, para que el botón flotante de cada página también obedezca.
 *
 * Uso desde una página:
 *   MarosData.ready(function (data) { ... })   -> datos de site_data
 *   MarosData.get()                            -> null hasta que carga
 *   MarosData.whatsapp()                       -> solo dígitos
 */
(function () {
  'use strict';

  if (window.__marosStore) return;
  window.__marosStore = true;

  var WA_FALLBACK = '51987654321';

  var data = null;
  var loaded = false;
  var waiting = [];

  /* -------------------------------------------------- utilidades */

  function digits(v) {
    return String(v == null ? '' : v).replace(/[^0-9]/g, '');
  }

  function whatsapp() {
    var n = data && data.redes ? digits(data.redes.whatsapp) : '';
    // Un número peruano son 11 dígitos con prefijo; por debajo de 8 es basura
    // (un campo a medio escribir) y es mejor quedarse con el de siempre.
    return n.length >= 8 ? n : WA_FALLBACK;
  }

  /* -------------------------------------------------- ajustes globales */

  // Los <a href="https://wa.me/..."> están escritos a mano en el markup de cada
  // página. Se reescribe el número conservando el ?text= que lleve cada uno.
  function applyWhatsapp() {
    var num = whatsapp();
    window.MAROS_WHATSAPP = num;

    var links = document.querySelectorAll('a[href*="wa.me/"]');
    for (var i = 0; i < links.length; i++) {
      var href = links[i].getAttribute('href') || '';
      var next = href.replace(/wa\.me\/\d+/, 'wa.me/' + num);
      if (next !== href) links[i].setAttribute('href', next);
    }
  }

  function apply() {
    if (!loaded) return;
    applyWhatsapp();
  }

  /* -------------------------------------------------- carga */

  function notify() {
    var fns = waiting.splice(0);
    for (var i = 0; i < fns.length; i++) {
      try { fns[i](data); } catch (e) { console.error('MarosData:', e); }
    }
  }

  // window.sb lo crea el <helmet>, que corre después de este archivo.
  function withClient(cb, tries) {
    if (window.sb) { cb(window.sb); return; }
    if ((tries || 0) > 200) {
      console.error('MarosData: no apareció el cliente de Supabase.');
      return;
    }
    setTimeout(function () { withClient(cb, (tries || 0) + 1); }, 50);
  }

  function load() {
    withClient(function (sb) {
      sb.from('site_data').select('data').eq('id', 1).single().then(function (res) {
        if (res.error) console.error('MarosData: no se pudo cargar site_data:', res.error);
        data = (res.data && res.data.data) || {};
        loaded = true;
        apply();
        notify();
      });
    });
  }

  /* -------------------------------------------------- arranque */

  function init() {
    load();
    // El runtime x-dc vuelve a pintar la página y repone los enlaces con el
    // número escrito a mano; hay que reaplicar. Reescribir un href no altera
    // childList, así que esto no se retroalimenta con su propio observador.
    var pending = false;
    new MutationObserver(function () {
      if (pending || !loaded) return;
      pending = true;
      setTimeout(function () { pending = false; apply(); }, 100);
    }).observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  window.MarosData = {
    ready: function (fn) {
      if (typeof fn !== 'function') return;
      if (loaded) fn(data); else waiting.push(fn);
    },
    get: function () { return data; },
    whatsapp: whatsapp
  };
})();
