/* HYPNOS 2.2 — Interfaz y orquestación.
 * En Node (require) expone el motor de cálculo para tests; en navegador monta la PWA. */
(function () {
  'use strict';

  if (typeof document === 'undefined') {
    if (typeof module === 'object' && module.exports) module.exports = require('./engine.js');
    return;
  }

  const H = window.HypnosEngine;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const fmt = H.fmt;
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const state = {
    modo: 'sencillo',
    diasSeleccionados: 5, // 1 | 2 | 4 | 5 | 7 | 'custom'
    infusor: 'sfs2_250',
    rows: [{ farmaco: 'morfina', presentacion: 'morfina_2', dosisDiaria: 60 }],
    parchesFentanilo: [{ parche: 25, cantidad: 1 }],
    ultimo: null, // último resultado de infusor
    conversion: null, // última conversión de opioides
    aplicada: null, // conversión transferida al infusor: { dosis, nombre, verificar, conversion }
    alertas: { infusor: [], opioide: [], guiado: [], conversion: [] },
  };

  /* Las advertencias de conversión viajan con la dosis aplicada: solo se retiran
   * cuando esa dosis de morfina ya no figura en el infusor. */
  function alertasConversionAplicada() {
    const a = state.aplicada;
    if (!a) return [];
    const list = [];
    if (a.verificar) {
      list.push({
        nivel: 'ambar',
        codigo: 'FACTOR_SIN_VERIFICAR',
        mensaje: 'La dosis de morfina del infusor procede de un factor de conversión de ' + a.nombre + ' no contrastado con el Anexo 6 del Ministerio. Verifique la equivalencia antes de prescribir.',
      });
    }
    if (a.conversion && a.conversion.extrapoladoFueraTablaAnexo6) {
      list.push({
        nivel: 'ambar',
        codigo: 'FENTANILO_EXTRAPOLADO',
        mensaje: 'La dosis de fentanilo TD (' + fmt(a.conversion.dosis) + ' µg/h) supera el máximo tabulado en el Anexo 6 (150 µg/h). Verifique manualmente en fuentes oficiales antes de prescribir.',
      });
    }
    if (a.conversion && a.conversion.reduccion === 0) {
      list.push({
        nivel: 'ambar',
        codigo: 'ROTACION_SIN_REDUCCION',
        mensaje: 'Conversión aplicada sin reducción (0 %): equivale a la ratio teórica bruta. En rotación clínica por tolerancia cruzada incompleta se recomienda reducir un 25–50 % (Anexo 5, Ministerio de Sanidad).',
      });
    }
    return list;
  }
  function avisoAplicada() {
    const alertas = alertasConversionAplicada();
    return alertas.length ? alertas.map((x) => x.mensaje).join(' ') : null;
  }
  function sincronizarAplicada() {
    const a = state.aplicada;
    if (a && !state.rows.some((r) => r.farmaco === 'morfina' && Number(r.dosisDiaria) === a.dosis)) state.aplicada = null;
    setAlertas('conversion', alertasConversionAplicada());
  }

  /* ───────────── Toast ───────────── */
  let toastTimer;
  function toast(msg, ms) {
    const t = $('#toast');
    if (!t) return;
    t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, ms || 2600);
  }

  /* ───────────── Identidad, Versión y Contacto (HYP-006) ───────────── */
  function initIdentidadContacto() {
    const verEl = $('#app-version');
    const footVerEl = $('#footer-version');
    const authorEl = $('#app-author');
    if (verEl) verEl.textContent = H.VERSION;
    if (footVerEl) footVerEl.textContent = H.VERSION;
    if (authorEl) authorEl.textContent = 'by ' + H.AUTOR;
    document.title = 'Hypnos ' + H.VERSION + ' by ' + H.AUTOR + ' · Asistente clínico de Paliativos';

    const link = $('#contacto-mailto');
    if (link) {
      const asunto = encodeURIComponent('Hypnos ' + H.VERSION + ' - Correcciones y comentarios');
      link.setAttribute('href', 'mailto:' + H.CONTACTO_EMAIL + '?subject=' + asunto);
    }
    const btnCopiarCorreo = $('#contacto-copiar');
    if (btnCopiarCorreo) {
      btnCopiarCorreo.addEventListener('click', () => {
        copiarTextoPlano(H.CONTACTO_EMAIL).then(
          () => toast('Dirección copiada: ' + H.CONTACTO_EMAIL),
          () => toast('Correo de contacto: ' + H.CONTACTO_EMAIL, 4500)
        );
      });
    }
  }

  /* ───────────── Tema ───────────── */
  function setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    try { localStorage.setItem('hypnos-theme', theme); } catch (e) { /* modo privado */ }
    $('meta[name="theme-color"]').setAttribute('content', theme === 'dark' ? '#020617' : '#0f172a');
    $('#theme-toggle').setAttribute('aria-label', theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro');
    $('#theme-icon').setAttribute('d', theme === 'dark'
      ? 'M12 4V2m0 20v-2M4 12H2m20 0h-2M5.6 5.6 4.2 4.2m15.6 15.6-1.4-1.4M5.6 18.4l-1.4 1.4M19.8 4.2l-1.4 1.4M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10z'
      : 'M12 3a9 9 0 1 0 9 9 7 7 0 0 1-9-9z');
  }
  function initTheme() {
    let t = null;
    try { t = localStorage.getItem('hypnos-theme'); } catch (e) { /* noop */ }
    if (!t) t = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    setTheme(t);
    $('#theme-toggle').addEventListener('click', () => setTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'));
  }

  /* ───────────── Modo Sencillo / Experto ───────────── */
  function setModo(modo) {
    state.modo = modo;
    try { localStorage.setItem('hypnos-modo', modo); } catch (e) { /* modo privado */ }
    document.body.setAttribute('data-modo', modo);
    const bS = $('#btn-modo-sencillo'), bE = $('#btn-modo-experto');
    if (bS) { bS.classList.toggle('active', modo === 'sencillo'); bS.setAttribute('aria-checked', String(modo === 'sencillo')); }
    if (bE) { bE.classList.toggle('active', modo === 'experto'); bE.setAttribute('aria-checked', String(modo === 'experto')); }
    // Si vuelve a modo sencillo desde 4 días o personalizado, ajustar a 5 días por defecto
    if (modo === 'sencillo' && (state.diasSeleccionados === 'custom' || state.diasSeleccionados === 4)) {
      state.diasSeleccionados = 5;
      state.infusor = 'sfs2_250';
    }
    renderRows();
    recalcular();
  }
  function initModo() {
    let m = null;
    try { m = localStorage.getItem('hypnos-modo'); } catch (e) { /* noop */ }
    if (m !== 'sencillo' && m !== 'experto') m = 'sencillo';
    state.modo = m;
    document.body.setAttribute('data-modo', m);
    const bS = $('#btn-modo-sencillo'), bE = $('#btn-modo-experto');
    if (bS) { bS.classList.toggle('active', m === 'sencillo'); bS.setAttribute('aria-checked', String(m === 'sencillo')); }
    if (bE) { bE.classList.toggle('active', m === 'experto'); bE.setAttribute('aria-checked', String(m === 'experto')); }
    $('#btn-modo-sencillo').addEventListener('click', () => setModo('sencillo'));
    $('#btn-modo-experto').addEventListener('click', () => setModo('experto'));
  }

  /* ───────────── Pestañas ───────────── */
  function switchTab(id, focus) {
    $$('[role="tab"]').forEach((b) => {
      const on = b.dataset.tab === id;
      b.setAttribute('aria-selected', on);
      b.tabIndex = on ? 0 : -1;
      if (on && focus) b.focus();
    });
    $$('[role="tabpanel"]').forEach((p) => { p.hidden = p.id !== 'panel-' + id; });
    if (id === 'nota') actualizarNota();
    window.scrollTo({ top: 0 });
  }
  function initTabs() {
    const tabs = $$('[role="tab"]');
    tabs.forEach((b, i) => {
      b.addEventListener('click', () => switchTab(b.dataset.tab));
      b.addEventListener('keydown', (e) => {
        let n = null;
        if (e.key === 'ArrowRight') n = (i + 1) % tabs.length;
        else if (e.key === 'ArrowLeft') n = (i - 1 + tabs.length) % tabs.length;
        else if (e.key === 'Home') n = 0;
        else if (e.key === 'End') n = tabs.length - 1;
        if (n !== null) { e.preventDefault(); switchTab(tabs[n].dataset.tab, true); }
      });
    });
  }

  /* ───────────── Semáforo ───────────── */
  function setAlertas(fuente, alertas) {
    state.alertas[fuente] = alertas; renderSemaforo();
    if (!$('#panel-nota').hidden) actualizarNota();
  }
  const semaforoActual = () => H.semaforoGlobal(...Object.keys(state.alertas).map((k) => state.alertas[k]));
  function renderSemaforo() {
    const { nivel, alertas: todas } = semaforoActual();
    const badge = $('#semaforo-badge');
    badge.className = 'semaforo ' + nivel;
    const nombre = { rojo: 'Rojo', ambar: 'Ámbar', verde: 'Verde' }[nivel];
    $('#semaforo-label').textContent = todas.length
      ? nombre + ' · ' + todas.length + (todas.length === 1 ? ' alerta' : ' alertas')
      : 'Sin alertas automáticas';
    const panel = $('#semaforo-panel');
    panel.className = 'semaforo-panel ' + nivel;
    panel.innerHTML = todas.length
      ? todas.map((a) => `<div class="alert ${a.nivel}" role="alert"><strong>${a.nivel === 'rojo' ? '⛔ Alerta roja' : '⚠️ Precaución'}</strong><p>${esc(a.mensaje)}</p></div>`).join('')
      : '<div class="alert verde"><strong>Sin alertas automáticas detectadas · Requiere validación del prescriptor</strong><p>Las comprobaciones automáticas son limitadas: la revisión clínica sigue siendo imprescindible.</p></div>';
  }
  function initSemaforo() {
    const badge = $('#semaforo-badge');
    badge.addEventListener('click', () => {
      const panel = $('#semaforo-panel');
      panel.hidden = !panel.hidden;
      badge.setAttribute('aria-expanded', String(!panel.hidden));
    });
    renderSemaforo();
  }

  /* ───────────── Tab 1 · Infusor (HYP-002, HYP-003, HYP-004) ───────────── */
  function opcionesFarmaco(sel) {
    return Object.keys(H.FARMACOS).map((k) => `<option value="${k}"${k === sel ? ' selected' : ''}>${esc(H.FARMACOS[k].nombre)}</option>`).join('');
  }
  function opcionesPres(farmaco, sel) {
    return H.FARMACOS[farmaco].presentaciones.map((p) => `<option value="${p.id}"${p.id === sel ? ' selected' : ''}>${esc(p.label)}</option>`).join('');
  }
  function renderRows() {
    $('#farmacos-list').innerHTML = state.rows.map((r, i) => `
      <div class="fila" data-i="${i}">
        <div><label>Fármaco</label><select data-f="farmaco">${opcionesFarmaco(r.farmaco)}</select></div>
        <div class="fila-pres"><label>Presentación</label><select data-f="presentacion">${opcionesPres(r.farmaco, r.presentacion)}</select></div>
        <div><label>Dosis diaria (mg/día)</label><input data-f="dosisDiaria" type="number" inputmode="decimal" min="0" step="any" value="${esc(r.dosisDiaria)}"></div>
        <button class="btn danger icon" type="button" data-act="del" aria-label="Quitar ${esc(H.FARMACOS[r.farmaco].nombre)}">✕</button>
      </div>`).join('') || '<p class="muted">Añada al menos un fármaco.</p>';
  }

  function syncDurBtnsUI() {
    $$('.dur-btn').forEach((b) => {
      const val = b.dataset.dias === 'custom' ? 'custom' : Number(b.dataset.dias);
      const on = state.diasSeleccionados === val;
      b.classList.toggle('active', on);
      b.setAttribute('aria-checked', String(on));
    });
  }

  /* HYP-002: Filtra dispositivos compatibles para la duración seleccionada, autoselecciona SOLO si es único,
   * muestra solo compatibles con etiquetas cortas si hay varios (invalidando selección previa incompatible sin
   * elegir arbitrariamente en Modo Experto), o invalida si no queda ninguno. */
  function actualizarSeleccionInfusorPorDuracion() {
    const wrap = $('#device-compat-wrap');
    const sel = $('#infusor-select');
    const customFields = $('#custom-fields');

    if (state.diasSeleccionados === 'custom') {
      state.infusor = 'custom';
      customFields.hidden = false;
      sel.hidden = true;
      wrap.innerHTML = `<div class="compat-unico"><span class="compat-tag">Modo personalizado</span> <span class="compat-params">Defina volumen y caudal; verifique el prospecto del fabricante (precaución ámbar activa).</span></div>` +
        `<p class="compat-nota">La duración del dispositivo no garantiza por sí sola la estabilidad fisicoquímica de la mezcla.</p>`;
      return { compatible: true };
    }

    customFields.hidden = true;
    let filtro;
    try {
      filtro = H.filtrarInfusoresCompatibles({ dias: state.diasSeleccionados, farmacos: state.rows });
    } catch (e) {
      state.infusor = null;
      sel.innerHTML = '';
      sel.hidden = true;
      wrap.innerHTML = `<div class="compat-empty" role="alert">⚠ ${esc(e.message)}</div>`;
      return { compatible: false, error: e.message };
    }

    if (filtro.ninguno) {
      state.infusor = null;
      sel.innerHTML = '';
      sel.hidden = true;
      wrap.innerHTML = `<div class="compat-empty" role="alert"><strong>Sin dispositivo compatible</strong> · ${esc(filtro.motivoIncompatibilidad)}</div>`;
      return { compatible: false, error: filtro.motivoIncompatibilidad };
    }

    if (filtro.unico) {
      const unico = filtro.autoseleccionado;
      state.infusor = unico.id;
      sel.innerHTML = `<option value="${esc(unico.id)}" selected>${esc(unico.nombre)} — ${esc(unico.etiquetaCorta)}</option>`;
      sel.value = unico.id;
      sel.hidden = true;
      wrap.innerHTML =
        `<div class="compat-unico"><span class="compat-tag">Selección automática</span> <strong>${esc(unico.nombre)}</strong> · <span class="compat-params">${esc(unico.etiquetaCorta)}</span></div>` +
        `<p class="compat-nota">La duración del dispositivo no garantiza por sí sola la estabilidad fisicoquímica de la mezcla.</p>`;
      return { compatible: true };
    }

    // Varios dispositivos compatibles con diferencias relevantes:
    // conservar solo si el dispositivo actualmente seleccionado sigue siendo compatible.
    // En Modo Experto NO autoseleccionar arbitrariamente cuando hay >1 opción compatible.
    const sigueCompatible = filtro.compatibles.some((x) => x.id === state.infusor);
    if (!sigueCompatible) {
      state.infusor = state.modo === 'experto' ? null : filtro.compatibles[0].id;
    }
    sel.innerHTML =
      (state.infusor === null ? '<option value="" selected disabled>Seleccione un dispositivo compatible…</option>' : '') +
      filtro.compatibles
        .map((x) => `<option value="${esc(x.id)}"${x.id === state.infusor ? ' selected' : ''}>${esc(x.nombre)} — ${esc(x.etiquetaCorta)}</option>`)
        .join('');
    sel.value = state.infusor || '';
    sel.hidden = true;

    const tarjetas = filtro.compatibles.map((x) => {
      const activo = x.id === state.infusor;
      return `<button type="button" class="compat-card${activo ? ' active' : ''}" role="radio" aria-checked="${activo}" data-infusor-id="${esc(x.id)}">` +
        `<strong>${esc(x.nombre)}</strong>` +
        `<span>${esc(x.etiquetaCorta)}</span>` +
        `</button>`;
    }).join('');

    const labelTexto = state.infusor === null
      ? `Seleccione un modelo compatible (${filtro.compatibles.length} disponibles)`
      : `Modelos compatibles (${filtro.compatibles.length})`;

    wrap.innerHTML =
      `<label class="field-label">${esc(labelTexto)}</label>` +
      `<div class="compat-opciones" role="radiogroup" aria-label="Modelos de infusor compatibles">${tarjetas}</div>` +
      `<p class="compat-nota">La duración del dispositivo no garantiza por sí sola la estabilidad fisicoquímica de la mezcla.</p>`;
    return { compatible: true, requiereSeleccion: state.infusor === null };
  }

  function leerInfusor() {
    if (!state.infusor) return null;
    if (state.infusor !== 'custom') return state.infusor;
    const llen = $('#c-llenado').value;
    if ($('#c-real')) $('#c-real').value = llen;
    return { id: 'custom', llenado: llen, volumenReal: llen, ritmo: $('#c-ritmo').value };
  }

  function setDuracion(diasVal) {
    const nuevaDuracion = diasVal === 'custom' ? 'custom' : Number(diasVal);
    if (state.modo === 'experto' && nuevaDuracion !== state.diasSeleccionados && nuevaDuracion !== 'custom') {
      // Al cambiar de duración en modo experto, invalidar la selección previa para recalcular;
      // si solo queda 1 compatible se autoseleccionará; si quedan varios se pedirá elección explícita.
      state.infusor = null;
    }
    state.diasSeleccionados = nuevaDuracion;
    syncDurBtnsUI();
    recalcular();
  }

  /* HYP-003: Resumen informativo estático (dl/dt/dd), sin apariencia de botones */
  function renderResumenFicha(r) {
    return `
      <div class="ficha-item"><dt>Horas</dt><dd>${fmt(r.horas)} h</dd></div>
      <div class="ficha-item"><dt>Días</dt><dd>${fmt(r.dias)} días</dd></div>
      <div class="ficha-item"><dt>Llenado</dt><dd>${fmt(r.infusor.llenado)} ml</dd></div>
      <div class="ficha-item"><dt>Caudal</dt><dd>${fmt(r.infusor.ritmo)} ml/h</dd></div>
      <div class="ficha-item"><dt>Vol. real</dt><dd>${fmt(r.infusor.volumenReal)} ml</dd></div>`;
  }

  function recalcular() {
    const cont = $('#resultado');
    sincronizarAplicada();
    syncDurBtnsUI();

    const estadoDisp = actualizarSeleccionInfusorPorDuracion();
    if (!estadoDisp.compatible) {
      state.ultimo = null;
      $('#infusor-resumen').innerHTML = '';
      setAlertas('infusor', [{
        nivel: 'rojo',
        codigo: 'VOLUMEN_EXCEDIDO',
        mensaje: estadoDisp.error || 'Sin dispositivo compatible para la duración y el volumen de fármacos configurados.',
      }]);
      cont.innerHTML = `<div class="card estado rojo" role="alert"><strong>⛔ Sin dispositivo compatible</strong><p>${esc(estadoDisp.error || 'Ajuste la duración, use una presentación más concentrada o reduzca el volumen.')}</p></div>`;
      if (!$('#panel-nota').hidden) actualizarNota();
      return;
    }

    if (estadoDisp.requiereSeleccion) {
      state.ultimo = null;
      $('#infusor-resumen').innerHTML = '';
      setAlertas('infusor', []);
      cont.innerHTML = `<div class="card muted" role="status">Seleccione uno de los modelos compatibles para calcular la preparación.</div>`;
      if (!$('#panel-nota').hidden) actualizarNota();
      return;
    }

    try {
      const r = H.calcularInfusor({ infusor: leerInfusor(), farmacos: state.rows });
      state.ultimo = r;
      $('#infusor-resumen').innerHTML = renderResumenFicha(r);
      setAlertas('infusor', r.semaforo.alertas);
      cont.innerHTML = r.farmacos.length ? renderResultado(r) : '<div class="card muted">Introduzca una dosis diaria para calcular la preparación.</div>';
    } catch (e) {
      state.ultimo = null;
      $('#infusor-resumen').innerHTML = '';
      setAlertas('infusor', [{ nivel: 'rojo', codigo: 'ENTRADA_INVALIDA', mensaje: e.message }]);
      cont.innerHTML = `<div class="card estado rojo" role="alert"><strong>⛔ Datos inválidos</strong><p>${esc(e.message)}</p></div>`;
    }
    if (!$('#panel-nota').hidden) actualizarNota();
  }

  /* HYP-004: En modo sencillo muestra solo presentación identificable, «Añadir al infusor: X ml» y «Abrir: N ampollas»,
   * retirando «aspirar» y «desechar». En modo experto conserva la tabla técnica completa. */
  function renderPreparacionSencilla(r) {
    const items = r.farmacos.map((f) => `
      <li class="prep-item">
        <div class="prep-head">
          <strong>${esc(f.nombre)}</strong>
          <span class="prep-pres">${esc(f.presentacion.label)} · ${fmt(f.dosisDiaria)} mg/24 h (${fmt(f.totalMg)} mg totales)</span>
        </div>
        <div class="prep-acciones">
          <span class="prep-dato">Añadir al infusor: <strong>${fmt(f.volumenIncorporar)} ml</strong></span>
          <span class="prep-dato">Abrir: <strong>${f.ampollas} ${f.tipoEnvase === 'vial' ? (f.ampollas === 1 ? 'vial' : 'viales') : 'ampollas'}</strong></span>
          ${f.sobraContenido ? `<span class="prep-sobrante">${esc(f.notaSobrante)}</span>` : ''}
        </div>
      </li>`).join('');
    return `
      <ul class="prep-sencilla">${items}</ul>
      <div class="prep-suero">
        <strong>Suero fisiológico 0,9 %</strong>
        <span>Añadir al infusor: <strong class="vol-suero">${fmt(r.suero)} ml</strong></span>
      </div>`;
  }

  function renderPreparacionExperta(r) {
    const filas = r.farmacos.map((f) => {
      const envTxt = f.tipoEnvase === 'vial' ? (f.ampollas === 1 ? 'vial' : 'viales') : 'ampollas';
      return `
        <tr><th scope="row">${esc(f.nombre)}<small>${esc(f.presentacion.label)}</small></th>
          <td>${fmt(f.totalMg)} mg</td>
          <td><strong>${fmt(f.volumenIncorporar)} ml</strong></td>
          <td>${f.ampollas} ${envTxt}</td>
          <td>${fmt(f.volumenSobrante)} ml</td></tr>`;
    }).join('');
    return `
      <div class="tabla-wrap"><table class="tabla">
        <thead><tr><th>Fármaco</th><th>Total</th><th>Añadir</th><th>Abrir</th><th>Sobrante</th></tr></thead>
        <tbody>${filas}
          <tr class="suero"><th scope="row">Suero fisiológico 0,9 % a añadir</th><td colspan="4"><strong>${fmt(r.suero)} ml</strong></td></tr>
        </tbody></table></div>`;
  }

  function renderResultado(r) {
    const pct = Math.min(100, (r.volumenAspirado / r.infusor.llenado) * 100);
    const cuerpoPrep = state.modo === 'sencillo' ? renderPreparacionSencilla(r) : renderPreparacionExperta(r);
    const rescates = r.farmacos.filter((f) => f.rescate).map((f) => `<li><strong>${esc(f.nombre)}:</strong> ${esc(f.rescate.texto)}</li>`).join('');
    const nivel = r.semaforo.nivel;
    const estado = nivel === 'verde'
      ? `<p class="estado-discreto verde">ℹ️ ${esc(r.semaforo.resumen)}</p>`
      : `<div class="card estado ${nivel}"><strong>${nivel === 'rojo' ? '⛔' : '⚠️'} ${esc(r.semaforo.resumen)}</strong>
          ${r.semaforo.alertas.map((a) => `<p>${esc(a.mensaje)}</p>`).join('')}
        </div>`;
    return `
      <div class="card">
        <h3>Preparación</h3>
        ${cuerpoPrep}
        <div class="meter ${r.volumenExcedido ? 'over' : ''}" role="img" aria-label="Volumen de fármacos ${fmt(r.volumenAspirado)} de ${fmt(r.infusor.llenado)} ml"><span style="width:${pct}%"></span></div>
        <p class="resumen-vol"><strong>Volumen final total preparado:</strong> ${fmt(r.volumenFinal)} ml (llenado ${fmt(r.infusor.llenado)} ml)</p>
      </div>
      <div class="card">
        <h3>Rescates SC · intervalo mínimo de seguridad</h3>
        <ul class="lista">${rescates || '<li class="muted">Sin rescates definidos.</li>'}</ul>
      </div>
      ${estado}
      <div class="btn-row"><button class="btn primary" type="button" data-act="a-nota">📝 Pasar a nota clínica</button></div>`;
  }

  function initInfusor() {
    const sel = $('#infusor-select');
    sel.addEventListener('change', () => {
      state.infusor = sel.value;
      recalcular();
    });
    $('#device-compat-wrap').addEventListener('click', (e) => {
      const card = e.target.closest('[data-infusor-id]');
      if (!card) return;
      state.infusor = card.dataset.infusorId;
      recalcular();
    });
    $$('.dur-btn').forEach((b) => b.addEventListener('click', () => {
      setDuracion(b.dataset.dias === 'custom' ? 'custom' : Number(b.dataset.dias));
    }));
    ['#c-llenado', '#c-ritmo'].forEach((s) => $(s).addEventListener('input', () => {
      if ($('#c-real')) $('#c-real').value = $('#c-llenado').value;
      recalcular();
    }));

    const list = $('#farmacos-list');
    list.addEventListener('input', (e) => {
      const fila = e.target.closest('.fila');
      if (!fila || e.target.dataset.f !== 'dosisDiaria') return;
      state.rows[+fila.dataset.i].dosisDiaria = e.target.value;
      recalcular();
    });
    list.addEventListener('change', (e) => {
      const fila = e.target.closest('.fila');
      if (!fila) return;
      const r = state.rows[+fila.dataset.i];
      if (e.target.dataset.f === 'farmaco') {
        r.farmaco = e.target.value;
        r.presentacion = H.FARMACOS[r.farmaco].presentaciones[0].id;
        renderRows();
      } else if (e.target.dataset.f === 'presentacion') r.presentacion = e.target.value;
      recalcular();
    });
    list.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act="del"]');
      if (!b) return;
      state.rows.splice(+b.closest('.fila').dataset.i, 1);
      renderRows(); recalcular();
    });
    $('#add-farmaco').addEventListener('click', () => {
      const usados = state.rows.map((r) => r.farmaco);
      const libre = Object.keys(H.FARMACOS).find((k) => usados.indexOf(k) === -1) || 'morfina';
      state.rows.push({ farmaco: libre, presentacion: H.FARMACOS[libre].presentaciones[0].id, dosisDiaria: '' });
      renderRows(); recalcular();
      const filas = $$('.fila', list); const ult = filas[filas.length - 1];
      if (ult) $('input', ult).focus();
    });
    $('#resultado').addEventListener('click', (e) => { if (e.target.closest('[data-act="a-nota"]')) switchTab('nota'); });
    renderRows();
    recalcular();
  }

  /* ───────────── Tab 2 · Guiado ───────────── */
  const g = { paso: 0, resp: {} };
  function sincronizarAlertasGuiado() {
    const tieneRespuestas = Object.keys(g.resp).some((k) => k !== 'midazolamDisnea');
    if (!tieneRespuestas) {
      if (state.alertas.guiado.length) setAlertas('guiado', []);
      return;
    }
    const parcial = H.planGuiado(g.resp);
    setAlertas('guiado', parcial.semaforo.alertas);
  }
  function renderGuiado() {
    const cont = $('#guiado');
    const total = H.GUIA_PASOS.length;
    if (g.paso >= total) return renderPlan(cont);
    g.plan = null;
    sincronizarAlertasGuiado();
    const p = H.GUIA_PASOS[g.paso];
    const progreso = `<div class="progreso" role="progressbar" aria-valuemin="1" aria-valuemax="${total}" aria-valuenow="${g.paso + 1}"><span style="width:${((g.paso + 1) / total) * 100}%"></span></div><p class="muted">Paso ${g.paso + 1} de ${total}</p>`;
    let cuerpo;
    if (p.tipo === 'multi') {
      const sel = g.resp[p.id] || [];
      cuerpo = p.opciones.map((o) => `<label class="opt check"><input type="checkbox" value="${o.valor}"${sel.indexOf(o.valor) !== -1 ? ' checked' : ''}> <span>${esc(o.label)}</span></label>`).join('') +
        '<button class="btn primary" type="button" data-act="continuar">Continuar →</button>';
    } else {
      cuerpo = p.opciones.map((o) => `<button class="opt ${o.valor === 'metadona' ? 'peligro' : ''}" type="button" data-v="${o.valor}"><strong>${esc(o.label)}</strong>${o.desc ? `<small>${esc(o.desc)}</small>` : ''}</button>`).join('');
    }
    cont.innerHTML = `<div class="card">${progreso}<h3>${esc(p.titulo)}</h3><div class="opts">${cuerpo}</div>
      <div class="btn-row">${g.paso > 0 ? '<button class="btn ghost" type="button" data-act="atras">← Atrás</button>' : ''}<button class="btn ghost" type="button" data-act="reiniciar">Reiniciar</button></div></div>`;
  }
  function renderPlan(cont) {
    const plan = H.planGuiado(g.resp);
    setAlertas('guiado', plan.semaforo.alertas);
    const bloq = plan.bloqueos.map((b) => `<div class="alert rojo" role="alert"><strong>⛔ Bloqueo ético · Metadona</strong><p>${esc(b.mensaje)}</p></div>`).join('');
    const sug = plan.sugerencias.map((s) => `<li><strong>${esc(s.nombre)}</strong> · ${fmt(s.dosisDiaria)} mg/día inicial<br><small>${s.notas.map(esc).join(' ')}</small></li>`).join('');
    const dest = plan.destacadas.map((a) => `<div class="alert ambar destacada" role="alert"><strong>⚠️ ${a.codigo === 'ERC_GRAVE' ? 'Insuficiencia renal grave' : 'Opioide previo'}</strong><p>${esc(a.mensaje)}</p></div>`).join('');
    const mida = plan.ofreceMidazolamDisnea
      ? `<label class="opt check"><input type="checkbox" data-act="mida-disnea"${g.resp.midazolamDisnea ? ' checked' : ''}> <span>Añadir midazolam para la disnea (reservado si hay ansiedad/pánico asociado)</span></label>`
      : '';
    cont.innerHTML = `
      ${bloq}
      ${dest}
      <div class="card"><h3>Plan orientativo</h3>
        ${mida}
        ${sug ? `<ul class="lista">${sug}</ul>` : '<p class="muted">Sin fármacos sugeridos automáticamente.</p>'}
        ${plan.advertencias.length ? `<div class="alert ambar"><strong>⚠️ A tener en cuenta</strong>${plan.advertencias.map((a) => `<p>${esc(a)}</p>`).join('')}</div>` : ''}
      </div>
      <div class="card"><h3>Medidas generales</h3><ul class="lista">${plan.medidas.map((m) => `<li>${esc(m)}</li>`).join('')}</ul></div>
      <div class="btn-row">
        ${plan.sugerencias.length ? '<button class="btn primary" type="button" data-act="cargar">💉 Cargar en Infusor</button>' : ''}
        <button class="btn ghost" type="button" data-act="atras">← Atrás</button>
        <button class="btn ghost" type="button" data-act="nueva">Nueva consulta</button>
      </div>`;
    g.plan = plan;
  }
  function initGuiado() {
    const cont = $('#guiado');
    cont.addEventListener('change', (e) => {
      if (e.target.dataset.act !== 'mida-disnea') return;
      g.resp.midazolamDisnea = e.target.checked;
      renderGuiado();
    });
    cont.addEventListener('click', (e) => {
      const opt = e.target.closest('[data-v]');
      const act = e.target.closest('[data-act]');
      if (opt && !act) {
        g.resp[H.GUIA_PASOS[g.paso].id] = opt.dataset.v; g.paso++; renderGuiado();
      } else if (act) {
        const a = act.dataset.act;
        if (a === 'continuar') {
          const p = H.GUIA_PASOS[g.paso];
          const v = $$('input:checked', cont).map((i) => i.value);
          if (!v.length) { toast('Seleccione al menos un síntoma'); return; }
          g.resp[p.id] = v;
          if (p.id === 'sintomas' && v.indexOf('disnea') === -1) delete g.resp.midazolamDisnea;
          g.paso++; renderGuiado();
        } else if (a === 'atras') {
          g.paso = Math.max(0, g.paso - 1);
          renderGuiado();
        } else if (a === 'reiniciar') {
          g.paso = 0; g.resp = {}; renderGuiado();
        } else if (a === 'nueva') {
          nuevaConsulta(); toast('Nueva consulta: todos los campos reiniciados');
        } else if (a === 'cargar' && g.plan) {
          state.rows = g.plan.sugerencias.map((s) => ({ farmaco: s.farmaco, presentacion: H.FARMACOS[s.farmaco].presentaciones[0].id, dosisDiaria: s.dosisDiaria }));
          state.aplicada = null;
          renderRows(); recalcular(); switchTab('rapido'); toast('Sugerencias cargadas: revise dosis y presentaciones');
        }
      }
    });
    renderGuiado();
  }

  /* ───────────── Tab 3 · Opioides (HYP-001: combinación de parches de fentanilo) ───────────── */
  function opcionesParcheFentanilo(selVal) {
    return H.PRESENTACIONES_FENTANILO_TD.map((p) =>
      `<option value="${p.liberacion}"${Number(selVal) === p.liberacion ? ' selected' : ''}>${esc(p.label)}</option>`
    ).join('');
  }

  function renderFilasParchesFentanilo() {
    const rowsEl = $('#fentanilo-rows');
    if (!rowsEl) return;
    const n = state.parchesFentanilo.length;
    rowsEl.innerHTML = state.parchesFentanilo.map((r, i) => `
      <div class="parche-fila" data-fp-i="${i}">
        <div>
          <label>Presentación</label>
          <select data-fp="parche" aria-label="Presentación del parche ${i + 1}">${opcionesParcheFentanilo(r.parche)}</select>
        </div>
        <div>
          <label>Cantidad</label>
          <input data-fp="cantidad" type="number" inputmode="numeric" min="1" max="10" step="1" value="${esc(r.cantidad)}" aria-label="Cantidad de parches fila ${i + 1}">
        </div>
        ${n > 1 ? `<button class="btn danger icon" type="button" data-fp-act="del" aria-label="Eliminar fila de parche ${i + 1}">✕</button>` : '<span></span>'}
      </div>`).join('');
  }

  function initOpioides() {
    const sel = $('#opioide-select');
    const dosisWrap = $('#opioide-dosis-wrap');
    const dosis = $('#opioide-dosis');
    const parche = $('#opioide-parche');
    const fentWrap = $('#fentanilo-parches-wrap');
    const fentRows = $('#fentanilo-rows');
    const fentDesglose = $('#fentanilo-desglose');

    sel.innerHTML = Object.keys(H.OPIOIDES).map((k) => `<option value="${k}">${k === 'metadona' ? '⛔ ' : ''}${esc(H.OPIOIDES[k].nombre)}</option>`).join('');
    sel.value = 'fentanilo_td';

    function actualizarCampos() {
      const op = H.OPIOIDES[sel.value];
      const esFentanilo = sel.value === 'fentanilo_td';
      const usaParcheUnico = !esFentanilo && !!op.valores;

      fentWrap.hidden = !esFentanilo;
      dosisWrap.hidden = esFentanilo;
      parche.hidden = !usaParcheUnico;
      dosis.hidden = esFentanilo || usaParcheUnico || !!op.bloqueado;
      $('#opioide-dosis-label').textContent = op.bloqueado ? 'Dosis (bloqueada)' : 'Dosis (' + op.unidad + ')';
      if (usaParcheUnico) {
        parche.innerHTML = op.valores.map((v) => `<option value="${v}">${fmt(v)} ${op.unidad}</option>`).join('');
      }
      if (esFentanilo) {
        renderFilasParchesFentanilo();
      }
      calcular();
    }

    function calcular() {
      const op = H.OPIOIDES[sel.value];
      const cont = $('#opioide-resultado');
      if (op.bloqueado) {
        const b = H.convertirOpioide('metadona', 1);
        state.conversion = null;
        setAlertas('opioide', [{ nivel: 'rojo', codigo: b.codigo, mensaje: b.mensaje }]);
        cont.innerHTML = `<div class="alert rojo" role="alert"><strong>⛔ Bloqueo ético · Metadona</strong><p>${esc(b.mensaje)}</p><p><strong>No se ofrece cálculo.</strong> Contacte con la unidad de paliativos o del dolor.</p></div>`;
        return;
      }
      setAlertas('opioide', []);

      let entrada;
      if (sel.value === 'fentanilo_td') {
        const comb = H.calcularParchesFentanilo(state.parchesFentanilo);
        if (comb.error) {
          fentDesglose.textContent = '⚠ ' + comb.error;
          state.conversion = null;
          cont.innerHTML = `<div class="alert ambar" role="alert"><p>${esc(comb.error)}</p></div>`;
          return;
        }
        fentDesglose.textContent = 'Desglose: ' + comb.desgloseTexto + ' · Dosis total: ' + fmt(comb.dosisTotal) + ' µg/h';
        entrada = state.parchesFentanilo;
      } else {
        const val = op.valores ? parche.value : dosis.value;
        if (val === '') {
          state.conversion = null;
          cont.innerHTML = '<div class="card muted">Introduzca la dosis actual del paciente.</div>';
          return;
        }
        entrada = val;
      }

      const r = H.convertirOpioide(sel.value, entrada, { reduccion: $('#opioide-reduccion').value });
      if (r.error) {
        state.conversion = null;
        cont.innerHTML = `<div class="alert ambar" role="alert"><p>${esc(r.error)}</p></div>`;
        return;
      }
      state.conversion = r;
      const alertasOp = [];
      if (r.verificar) {
        alertasOp.push({ nivel: 'ambar', codigo: 'FACTOR_SIN_VERIFICAR', mensaje: 'La dosis de morfina procede de un factor de conversión de ' + r.nombre + ' no contrastado con el Anexo 6 del Ministerio. Verifique la equivalencia antes de prescribir.' });
      }
      if (r.extrapoladoFueraTablaAnexo6) {
        alertasOp.push({ nivel: 'ambar', codigo: 'FENTANILO_EXTRAPOLADO', mensaje: 'La dosis total de fentanilo TD (' + fmt(r.dosis) + ' µg/h) supera el máximo tabulado en el Anexo 6 (150 µg/h). No se ofrece conversión automática a morfina fuera de tabla oficial.' });
      }
      setAlertas('opioide', alertasOp);

      const unidadTit = r.unidadMostrar || r.unidad;
      const advEsp = (r.advertenciasEspecificas || []).map((m) => `<div class="alert ambar" role="alert"><strong>⚠️ Advertencia de ficha técnica</strong><p>${esc(m)}</p></div>`).join('');

      if (r.transferibleAInfusor === false) {
        cont.innerHTML = `
          <div class="card">
            <h3>${esc(r.nombre)} · ${fmt(r.dosis)} ${esc(unidadTit)}</h3>
            ${r.desgloseParches ? `<p class="muted"><strong>Desglose registrado:</strong> ${esc(r.desgloseParches)}</p>` : ''}
            ${r.notaRegistro ? `<p class="muted">${esc(r.notaRegistro)}</p>` : ''}
          </div>
          ${advEsp}
          ${r.aviso ? `<div class="alert ambar"><strong>⚠️ Criterio clínico y ficha técnica</strong><p>${esc(r.aviso)}</p></div>` : ''}`;
        return;
      }

      const fen = r.fentaniloTD;
      const lineaFentDestino = r.opioide !== 'fentanilo_td' && fen
        ? `<p class="muted">Orientación a fentanilo TD: ${fmt(fen.teorico)} µg/h teóricos (Anexo 6)${fen.parcheTabla2Rotacion ? ' · inicio en rotación Tabla 2 FT AEMPS (~150:1): parche ' + fmt(fen.parcheTabla2Rotacion) + ' µg/h' : ''}.</p>`
        : '';
      const lineaRotacionAnexo5 = r.rangoRotacionSC
        ? `<p class="muted"><strong>Rango recomendado en rotación clínica (reducción 25–50 %, Anexo 5):</strong> ${fmt(r.rangoRotacionSC[0])}–${fmt(r.rangoRotacionSC[1])} mg/24 h de morfina SC (${fmt(r.rangoRotacionOral[0])}–${fmt(r.rangoRotacionOral[1])} mg/24 h oral).</p>`
        : '';

      cont.innerHTML = `
        <div class="card">
          <h3>${esc(r.nombre)} · ${fmt(r.dosis)} ${esc(unidadTit)}</h3>
          ${r.desgloseParches ? `<p class="muted"><strong>Desglose registrado:</strong> ${esc(r.desgloseParches)}</p>` : ''}
          <div class="kpis">
            <div class="kpi"><span>Morfina oral</span><strong>${fmt(r.morfinaOral)}</strong><small>mg/24 h</small></div>
            <div class="kpi destacado"><span>Morfina SC (50 %)</span><strong>${fmt(r.morfinaSC)}</strong><small>mg/24 h</small></div>
            <div class="kpi"><span>Rescate SC (1/6)</span><strong>${fmt(r.rescateSC)}</strong><small>mg</small></div>
          </div>
          ${r.reduccion ? `<p class="muted">Incluye reducción del ${fmt(r.reduccion * 100, 0)} % por tolerancia cruzada incompleta (equivalencia teórica bruta ${fmt(r.morfinaOralBruta)} mg/24 h oral · ${fmt(r.morfinaSCBruta)} mg/24 h SC).</p>` : `<p class="muted">Equivalencia teórica bruta (0 % reducción). En rotación clínica aplique reducción del 25–50 % por tolerancia cruzada incompleta.</p>`}
          ${lineaRotacionAnexo5}
          ${r.notaRegistro ? `<p class="muted">${esc(r.notaRegistro)}</p>` : ''}
          ${lineaFentDestino}
        </div>
        ${r.factorTexto ? `<p class="muted">Base de conversión: ${esc(r.factorTexto)}.</p>` : ''}
        ${advEsp}
        ${r.aviso ? `<div class="alert ambar"><strong>⚠️ Criterio clínico y ficha técnica</strong><p>${esc(r.aviso)}</p></div>` : ''}
        ${r.rangoMorfinaOral && r.rangoMorfinaOral[0] !== r.rangoMorfinaOral[1] ? `<p class="muted">Rango de equivalencia: ${fmt(r.rangoMorfinaOral[0])}–${fmt(r.rangoMorfinaOral[1])} mg/24 h de morfina oral (se usa el extremo inferior).</p>` : ''}
        ${r.verificar ? '<div class="alert rojo" role="alert"><strong>Factor sin verificar</strong><p>El factor de este opioide no está contrastado con el Anexo 6 del Ministerio. Compruebe la equivalencia en el documento oficial antes de prescribir.</p></div>' : ''}
        <div class="btn-row"><button class="btn primary" type="button" id="opioide-a-infusor">💉 Usar morfina SC en Infusor</button></div>`;

      $('#opioide-a-infusor').addEventListener('click', () => {
        const otros = state.rows.filter((x) => x.farmaco !== 'morfina');
        const dosisSC = H.round(r.morfinaSC, 2);
        state.rows = [{ farmaco: 'morfina', presentacion: 'morfina_2', dosisDiaria: dosisSC }].concat(otros);
        state.aplicada = { dosis: dosisSC, nombre: r.nombre, verificar: !!r.verificar, conversion: r };
        renderRows(); recalcular(); switchTab('rapido');
      });
    }

    fentRows.addEventListener('change', (e) => {
      const fila = e.target.closest('.parche-fila');
      if (!fila) return;
      const idx = +fila.dataset.fpI;
      if (e.target.dataset.fp === 'parche') {
        state.parchesFentanilo[idx].parche = Number(e.target.value);
        calcular();
      }
    });
    fentRows.addEventListener('input', (e) => {
      const fila = e.target.closest('.parche-fila');
      if (!fila || e.target.dataset.fp !== 'cantidad') return;
      const idx = +fila.dataset.fpI;
      state.parchesFentanilo[idx].cantidad = e.target.value;
      calcular();
    });
    fentRows.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-fp-act="del"]');
      if (!btn) return;
      const fila = btn.closest('.parche-fila');
      if (!fila || state.parchesFentanilo.length <= 1) return;
      state.parchesFentanilo.splice(+fila.dataset.fpI, 1);
      renderFilasParchesFentanilo();
      calcular();
    });
    $('#add-parche-fentanilo').addEventListener('click', () => {
      state.parchesFentanilo.push({ parche: 25, cantidad: 1 });
      renderFilasParchesFentanilo();
      calcular();
    });

    sel.addEventListener('change', actualizarCampos);
    dosis.addEventListener('input', calcular);
    parche.addEventListener('change', calcular);
    $('#opioide-reduccion').addEventListener('change', calcular);
    actualizarCampos();
  }

  /* ───────────── Tab 4 · Nota clínica (HYP-005: solo Infusor actual y copia sencilla) ───────────── */
  let copiadoTimer;
  function ocultarIndicadorCopiado() {
    const badge = $('#nota-copiado-msg');
    const btn = $('#nota-copiar');
    if (badge) badge.hidden = true;
    if (btn) btn.textContent = 'Copiar';
  }

  function actualizarNota() {
    ocultarIndicadorCopiado();
    const sem = semaforoActual();
    const rojo = sem.nivel === 'rojo';
    const motivosRojo = sem.alertas.filter((a) => a.nivel === 'rojo').map((a) => a.mensaje);
    const tieneFilasIncompletas = state.rows.some((r) => r.dosisDiaria === '' || r.dosisDiaria == null || Number(r.dosisDiaria) <= 0);
    const infusorValido = state.ultimo && Array.isArray(state.ultimo.farmacos) && state.ultimo.farmacos.length > 0 && !tieneFilasIncompletas ? state.ultimo : null;
    const d = {
      infusor: infusorValido,
      conversion: state.aplicada ? state.aplicada.conversion : null,
      avisoFactor: avisoAplicada(),
      bloqueoActivo: rojo,
      motivoBloqueo: motivosRojo.join(' '),
    };
    $('#nota-texto').value = H.generarNota(d);
    const bloqueado = rojo || !infusorValido;
    $('#nota-estado').textContent = rojo
      ? '⛔ Alerta roja activa: resuelva los bloqueos antes de copiar'
      : (!infusorValido
          ? 'Sin fármacos válidos o existen filas sin dosis en el infusor'
          : (sem.nivel === 'ambar' ? '⚠️ Precaución clínica activa: revise las advertencias antes de copiar' : ''));
    const alertasBox = $('#nota-alertas');
    if (alertasBox) {
      alertasBox.innerHTML = sem.alertas.length
        ? sem.alertas.map((a) => `<div class="alert ${a.nivel}" role="alert"><strong>${a.nivel === 'rojo' ? '⛔ Alerta roja' : '⚠️ Precaución clínica antes de finalizar'}</strong><p>${esc(a.mensaje)}</p></div>`).join('')
        : '';
    }
    $('#nota-copiar').setAttribute('aria-disabled', String(bloqueado));
  }

  /* Reinicia todos los módulos para no arrastrar datos entre pacientes. */
  function nuevaConsulta() {
    g.paso = 0; g.resp = {}; g.plan = null;
    state.rows = [{ farmaco: 'morfina', presentacion: 'morfina_2', dosisDiaria: '' }];
    state.parchesFentanilo = [{ parche: 25, cantidad: 1 }];
    state.aplicada = null; state.conversion = null;
    Object.keys(state.alertas).forEach((k) => { state.alertas[k] = []; });
    state.diasSeleccionados = 5;
    state.infusor = 'sfs2_250';
    $('#c-llenado').value = '100'; $('#c-real').value = '100'; $('#c-ritmo').value = '2';
    $('#opioide-select').value = 'fentanilo_td';
    $('#opioide-dosis').value = ''; $('#opioide-reduccion').value = '0';
    renderGuiado(); renderRows(); recalcular();
    $('#opioide-select').dispatchEvent(new Event('change'));
    actualizarNota();
    switchTab('guiado');
  }

  function copiarConExecCommand(texto, fallbackTextarea) {
    return new Promise((ok, ko) => {
      const ta = fallbackTextarea || $('#nota-texto');
      if (!ta) { ko(new Error('Sin elemento de texto')); return; }
      const prev = ta.value;
      const usarTemporal = fallbackTextarea == null && ta.value !== texto;
      if (usarTemporal) ta.value = texto;
      ta.focus();
      ta.select();
      try {
        const exito = document.execCommand('copy');
        if (usarTemporal) ta.value = prev;
        if (exito) {
          try {
            ta.setSelectionRange(0, 0);
            if (window.getSelection) window.getSelection().removeAllRanges();
          } catch (_) { /* noop */ }
          ok();
        } else {
          ko(new Error('copy_failed'));
        }
      } catch (e) {
        if (usarTemporal) ta.value = prev;
        ko(e);
      }
    });
  }

  function copiarTextoPlano(texto, fallbackTextarea) {
    if (navigator.clipboard && window.isSecureContext && typeof navigator.clipboard.writeText === 'function') {
      return navigator.clipboard.writeText(texto).catch(() => copiarConExecCommand(texto, fallbackTextarea));
    }
    return copiarConExecCommand(texto, fallbackTextarea);
  }

  function initNota() {
    const pre = document.createElement('pre');
    pre.id = 'nota-print'; pre.className = 'print-only nota-print';
    $('#nota-texto').insertAdjacentElement('afterend', pre);

    $('#nota-copiar').addEventListener('click', () => {
      actualizarNota();
      if (semaforoActual().nivel === 'rojo') {
        toast('⛔ Bloqueo de seguridad: resuelva las alertas rojas antes de copiar', 5000);
        return;
      }
      const tieneFilasIncompletas = state.rows.some((r) => r.dosisDiaria === '' || r.dosisDiaria == null || Number(r.dosisDiaria) <= 0);
      if (!state.ultimo || !state.ultimo.farmacos.length || tieneFilasIncompletas) {
        toast('Configure al menos un fármaco con dosis válida (y sin filas vacías) antes de copiar');
        return;
      }
      copiarTextoPlano($('#nota-texto').value, $('#nota-texto')).then(
        () => {
          const badge = $('#nota-copiado-msg');
          const btn = $('#nota-copiar');
          if (badge) badge.hidden = false;
          if (btn) btn.textContent = 'Copiado';
          clearTimeout(copiadoTimer);
          copiadoTimer = setTimeout(ocultarIndicadorCopiado, 3000);
          toast('Copiado');
        },
        () => {
          ocultarIndicadorCopiado();
          const ta = $('#nota-texto');
          if (ta) { ta.focus(); ta.select(); }
          toast('No se pudo copiar automáticamente: texto seleccionado para copia manual', 4000);
        }
      );
    });
    actualizarNota();
  }

  /* ───────────── Tab 5 · Familias ───────────── */
  const CABECERA_GUIAS = 'HYPNOS · Cuidados Paliativos — Guía para Familias y Cuidadores';
  const guiaPorId = (id) => H.GUIAS_FAMILIA.find((x) => x.id === id);
  const fechaLarga = () => new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });

  function guiaCuerpo(gu, hs) {
    const secciones = gu.secciones.map((s) => {
      const lista = s.numerada ? 'ol' : 'ul';
      return `<section class="guia-seccion"><${hs}>${esc(s.titulo)}</${hs}>` +
        (s.contenido ? `<p>${esc(s.contenido)}</p>` : '') +
        (s.destacado ? `<p class="guia-destacado">${esc(s.destacado)}</p>` : '') +
        (s.items && s.items.length ? `<${lista} class="guia-items">${s.items.map((i) => `<li>${esc(i)}</li>`).join('')}</${lista}>` : '') +
        '</section>';
    }).join('');
    const telefonos = gu.telefonos.map((t) => `<li><strong>${esc(t.servicio)}:</strong> ` +
      (t.numero ? `<span class="tel-num">${esc(t.numero)}</span>` : '<span class="tel-hueco"><span class="sr-only">Anote aquí el número</span></span>') +
      (t.nota ? `<small>${esc(t.nota)}</small>` : '') + '</li>').join('');
    return `<p class="guia-intro">${esc(gu.introduccion)}</p>${secciones}
      <section class="guia-advertencias" role="note"><${hs}>⚠️ Importante</${hs}><ul>${gu.advertencias.map((a) => `<li>${esc(a)}</li>`).join('')}</ul></section>
      <section class="guia-telefonos"><${hs}>📞 Teléfonos de contacto</${hs}><ul>${telefonos}</ul></section>
      <p class="guia-fuente">${esc(gu.fuente)}</p>`;
  }
  function sincronizarBotonesGuia() {
    const visor = $('#guia-visor');
    $$('[data-guia-act="ver"]').forEach((b) => {
      const on = !visor.hidden && visor.dataset.guia === b.dataset.guia;
      b.setAttribute('aria-expanded', String(on));
      b.textContent = on ? '✕ Ocultar guía' : '👁️ Ver guía';
    });
  }
  function mostrarGuia(id) {
    const gu = guiaPorId(id);
    const visor = $('#guia-visor');
    if (!gu) return;
    visor.dataset.guia = gu.id;
    visor.innerHTML = `
      <div class="guia-visor-head">
        <div><h3 id="guia-visor-titulo">${esc(gu.titulo)}</h3><p class="guia-sub">${esc(gu.subtitulo)}</p></div>
        <button class="btn ghost icon" type="button" data-guia-act="cerrar" aria-label="Cerrar la guía">✕</button>
      </div>
      ${guiaCuerpo(gu, 'h4')}
      <div class="btn-row">
        <button class="btn primary" type="button" data-guia-act="imprimir" data-guia="${esc(gu.id)}">🖨️ Descargar en PDF / Imprimir</button>
        <button class="btn ghost" type="button" data-guia-act="cerrar">Cerrar guía</button>
      </div>`;
    visor.hidden = false;
    sincronizarBotonesGuia();
    visor.focus({ preventScroll: true });
    visor.scrollIntoView({ block: 'start' });
  }
  function cerrarGuia() {
    const visor = $('#guia-visor');
    const id = visor.dataset.guia;
    visor.hidden = true; visor.innerHTML = ''; delete visor.dataset.guia;
    sincronizarBotonesGuia();
    const b = $$('[data-guia-act="ver"]').find((x) => x.dataset.guia === id);
    if (b) b.focus();
  }
  function imprimirGuia(id) {
    const gu = guiaPorId(id);
    if (!gu) return;
    $('#print-area').innerHTML = `
      <article class="print-doc">
        <header class="print-head">
          <p class="print-inst">${esc(CABECERA_GUIAS)}</p>
          <p class="print-fecha">Fecha: ${esc(fechaLarga())}</p>
        </header>
        <h1>${esc(gu.titulo)}</h1>
        <p class="guia-sub">${esc(gu.subtitulo)}</p>
        ${guiaCuerpo(gu, 'h2')}
        <footer class="print-pie">Documento generado con Hypnos ${esc(H.VERSION)} by ${esc(H.AUTOR)} · Entregado por su equipo de Cuidados Paliativos.</footer>
      </article>`;
    document.body.classList.add('imprimiendo-guia');
    window.print();
  }
  function initFamilias() {
    $('#guias-lista').innerHTML = H.GUIAS_FAMILIA.map((gu) => `
      <article class="card guia-card">
        <h4>${esc(gu.titulo)}</h4>
        <p>${esc(gu.subtitulo)}</p>
        <div class="btn-row">
          <button class="btn ghost" type="button" data-guia-act="ver" data-guia="${esc(gu.id)}" aria-controls="guia-visor" aria-expanded="false">👁️ Ver guía</button>
          <button class="btn primary" type="button" data-guia-act="imprimir" data-guia="${esc(gu.id)}">🖨️ Descargar en PDF / Imprimir</button>
        </div>
      </article>`).join('');
    $('#panel-familias').addEventListener('click', (e) => {
      const b = e.target.closest('[data-guia-act]');
      if (!b) return;
      const a = b.dataset.guiaAct;
      const visor = $('#guia-visor');
      if (a === 'ver') {
        if (!visor.hidden && visor.dataset.guia === b.dataset.guia) cerrarGuia(); else mostrarGuia(b.dataset.guia);
      } else if (a === 'cerrar') cerrarGuia();
      else if (a === 'imprimir') imprimirGuia(b.dataset.guia);
    });
    $('#familias').innerHTML = H.FAMILIAS.map((f, i) => `<details class="card acordeon"${i === 0 ? ' open' : ''}><summary>${esc(f.pregunta)}</summary><p>${esc(f.respuesta)}</p></details>`).join('');
    $('#rescate-guia').innerHTML = H.RESCATE_SC_PASOS.map((p) => `<li>${esc(p)}</li>`).join('');
  }

  /* ───────────── Impresión ───────────── */
  let desplegadosAlImprimir = [];
  function antesDeImprimir() {
    $('#familias-print-cabecera').innerHTML = `<p class="print-inst">${esc(CABECERA_GUIAS)}</p><p class="print-fecha">Fecha: ${esc(fechaLarga())}</p>`;
    $('#nota-print').textContent = $('#nota-texto').value;
    desplegadosAlImprimir = $$('main details:not([open])');
    desplegadosAlImprimir.forEach((d) => { d.open = true; });
  }
  function despuesDeImprimir() {
    desplegadosAlImprimir.forEach((d) => { d.open = false; });
    desplegadosAlImprimir = [];
    document.body.classList.remove('imprimiendo-guia');
    $('#print-area').innerHTML = '';
  }
  function initImpresion() {
    window.addEventListener('beforeprint', antesDeImprimir);
    window.addEventListener('afterprint', despuesDeImprimir);
  }

  /* ───────────── Arranque ───────────── */
  function init() {
    initIdentidadContacto();
    initTheme(); initModo(); initTabs(); initSemaforo();
    initInfusor(); initGuiado(); initOpioides(); initNota(); initFamilias(); initImpresion();
    if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
      navigator.serviceWorker.register('sw.js').catch(() => { /* offline-first: fallo silencioso */ });
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
