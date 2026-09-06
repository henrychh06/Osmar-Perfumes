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

  /* -------------------------------------------------- pedidos */

  var ultimaFirma = '', ultimaHora = 0;

  /* Se registra al pulsar "Pedir por WhatsApp", que es la única caja del sitio.
     Es una intención de compra: el cliente todavía tiene que enviar el mensaje.
     Va con fetch + keepalive en vez del cliente de Supabase porque el clic
     navega a wa.me acto seguido y una petición normal se cancelaría. */
  function registraPedido(pedido) {
    if (!pedido || !(pedido.items || []).length) return;
    if (!window.SUPABASE_URL || !window.SUPABASE_ANON_KEY) return;

    var cuerpo = {
      canal: pedido.canal || 'whatsapp',
      items: pedido.items,
      total: Number(pedido.total) || 0
    };

    // Pulsar dos veces seguidas no debe crear dos pedidos iguales.
    var firma = JSON.stringify(cuerpo);
    var ahora = Date.now();
    if (firma === ultimaFirma && ahora - ultimaHora < 60000) return;
    ultimaFirma = firma;
    ultimaHora = ahora;

    try {
      fetch(window.SUPABASE_URL + '/rest/v1/orders', {
        method: 'POST',
        keepalive: true,
        headers: {
          'apikey': window.SUPABASE_ANON_KEY,
          'Authorization': 'Bearer ' + window.SUPABASE_ANON_KEY,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify(cuerpo)
      }).catch(function (e) { console.error('MarosData: no se pudo registrar el pedido:', e); });
    } catch (e) {
      console.error('MarosData: no se pudo registrar el pedido:', e);
    }
  }

  // Los enlaces de pedido llevan el detalle en data-pedido; el botón flotante
  // no lleva mensaje ni detalle, así que se ignora.
  function alPulsarPedido(e) {
    var a = e.target && e.target.closest && e.target.closest('a[href*="wa.me/"]');
    if (!a) return;
    if ((a.getAttribute('href') || '').indexOf('text=') === -1) return;
    var raw = a.getAttribute('data-pedido');
    if (!raw) return;
    try { registraPedido(JSON.parse(raw)); } catch (err) { /* atributo mal formado */ }
  }

  /* -------------------------------------------------- visitas */

  // Una fila por carga de página, para el gráfico de visitas del panel. Se
  // marca en sessionStorage para no sumar de nuevo si la misma pestaña
  // recarga la página varias veces seguidas (alguien probando el sitio).
  // Va con fetch + keepalive, igual que registraPedido, para no depender de
  // que el cliente de Supabase ya esté listo ni de esperar su respuesta.
  function registraVisita() {
    if (!window.SUPABASE_URL || !window.SUPABASE_ANON_KEY) return;
    try {
      var marca = 'maros:visita:' + location.pathname;
      if (sessionStorage.getItem(marca)) return;
      sessionStorage.setItem(marca, '1');
    } catch (e) { /* sin sessionStorage, se registra igual */ }

    try {
      fetch(window.SUPABASE_URL + '/rest/v1/page_views', {
        method: 'POST',
        keepalive: true,
        headers: {
          'apikey': window.SUPABASE_ANON_KEY,
          'Authorization': 'Bearer ' + window.SUPABASE_ANON_KEY,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify({ path: location.pathname })
      }).catch(function (e) { console.error('MarosData: no se pudo registrar la visita:', e); });
    } catch (e) {
      console.error('MarosData: no se pudo registrar la visita:', e);
    }
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
      // Sin cliente no hay datos; se da por cargado con lo que hay (nada) para
      // que quien espera no se quede colgado en un "cargando" eterno.
      console.error('MarosData: no apareció el cliente de Supabase.');
      data = {};
      loaded = true;
      notify();
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
    registraVisita();
    document.addEventListener('click', alPulsarPedido, true);
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
    whatsapp: whatsapp,
    registraPedido: registraPedido
  };
})();
