/* HYPNOS 2.3 — Interfaz y orquestación.
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
  const round = H.round;
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const state = {
    modo: 'sencillo',
    diasSeleccionados: 5, // 1 | 2 | 4 | 5 | 7 | 'custom'
    infusor: 'sfs2_250',
    rows: [], // Corrección 3: Abre vacío por defecto (sin precargar midazolam ni morfina)
    parchesFentanilo: [{ parche: 25, cantidad: 1 }],
    ultimo: null, // último resultado de infusor
    conversion: null, // última conversión de opioides
    aplicada: null, // conversión transferida al infusor: { dosis, nombre, verificar, conversion }
    alertas: { infusor: [], opioide: [], guiado: [], conversion: [] },
    ramsay: {
      nivelObservado: null,
      nivelObjetivo: null,
      noValorado: false,
      preferencias: '',
      voluntadesAnticipadas: false,
      representanteLegal: false,
      consentimientoDocumentado: false,
      reevaluacionConfort: '',
    },
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

  /* ───────────── Identidad, Versión y Contacto (Corrección 4) ───────────── */
  function initIdentidadContacto() {
    const verEl = $('#app-version');
    const footVerEl = $('#footer-version');
    if (verEl) verEl.textContent = H.VERSION;
    if (footVerEl) footVerEl.textContent = H.VERSION;
    // By JP solamente en el pie de página de forma discreta
    document.title = 'Hypnos ' + H.VERSION + ' · Asistente clínico de Cuidados Paliativos';

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
    $('meta[name="theme-color"]').setAttribute('content', theme === 'dark' ? '#090d16' : '#0f172a');
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
    try { localStorage.setItem('hypnos-modo', modo); } catch (e) { /* noop */ }
    document.body.setAttribute('data-modo', modo);
    const bS = $('#btn-modo-sencillo'), bE = $('#btn-modo-experto');
    if (bS) { bS.classList.toggle('active', modo === 'sencillo'); bS.setAttribute('aria-checked', String(modo === 'sencillo')); }
    if (bE) { bE.classList.toggle('active', modo === 'experto'); bE.setAttribute('aria-checked', String(modo === 'experto')); }
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
  function switchTab(id) {
    $$('.tabs button').forEach((b) => {
      const on = b.dataset.tab === id;
      b.classList.toggle('active', on);
      b.setAttribute('aria-selected', String(on));
      b.setAttribute('tabindex', on ? '0' : '-1');
    });
    $$('.panel').forEach((p) => {
      const match = p.id === 'panel-' + id;
      p.hidden = !match;
      p.classList.toggle('active', match);
    });
    if (id === 'nota') actualizarNota();
  }
  function initTabs() {
    $$('.tabs button').forEach((b) => b.addEventListener('click', () => switchTab(b.dataset.tab)));
  }

  /* ───────────── Semáforo clínico integrado ───────────── */
  function semaforoActual() {
    return H.semaforoGlobal(
      state.alertas.infusor,
      state.alertas.opioide,
      state.alertas.guiado,
      state.alertas.conversion
    );
  }
  function actualizarSemaforoUI() {
    const s = semaforoActual();
    const badge = $('#semaforo-badge');
    badge.className = 'semaforo ' + s.nivel;
    const txts = {
      verde: 'Sin alertas detectadas',
      ambar: s.alertas.length === 1 ? '1 precaución clínica' : s.alertas.length + ' precauciones',
      rojo: s.alertas.length === 1 ? '1 bloqueo de seguridad' : s.alertas.length + ' bloqueos',
    };
    $('#semaforo-label').textContent = txts[s.nivel];
    actualizarPanelSemaforo();
  }
  function setAlertas(modulo, lista) {
    state.alertas[modulo] = lista || [];
    actualizarSemaforoUI();
  }
  function actualizarPanelSemaforo() {
    const s = semaforoActual();
    const p = $('#semaforo-panel');
    if (s.alertas.length === 0) {
      p.innerHTML = `<div class="card"><p class="muted"><strong>Semáforo en verde:</strong> No se han detectado incompatibilidades ni alertas automáticas. Toda prescripción debe ser revisada y validada por el facultativo responsable.</p></div>`;
      return;
    }
    const items = s.alertas.map((a) => `
      <div class="alert ${a.nivel}">
        <strong>${a.nivel === 'rojo' ? '⛔ Bloqueo' : '⚠️ Precaución'}${a.titulo ? ': ' + esc(a.titulo) : ''}</strong>
        <p>${esc(a.mensaje)}</p>
      </div>`).join('');
    p.innerHTML = items;
  }
  function initSemaforo() {
    $('#semaforo-badge').addEventListener('click', () => {
      const p = $('#semaforo-panel');
      const expandido = !p.hidden;
      p.hidden = expandido;
      $('#semaforo-badge').setAttribute('aria-expanded', String(!expandido));
    });
  }

  /* ───────────── Tab 1 · Infusor ───────────── */
  function opcionesFarmaco(sel) {
    return Object.keys(H.FARMACOS).map((k) => {
      const f = H.FARMACOS[k];
      const sufijo = f.bloqueadoSC ? ' (Bloqueado SC · Ficha CIMA)' : '';
      return `<option value="${k}"${k === sel ? ' selected' : ''}>${esc(f.nombre)}${sufijo}</option>`;
    }).join('');
  }
  function opcionesPres(farmaco, sel) {
    return H.FARMACOS[farmaco].presentaciones.map((p) => `<option value="${p.id}"${p.id === sel ? ' selected' : ''}>${esc(p.label)}</option>`).join('');
  }

  /* Corrección 3: Visualización de estado vacío cuando no hay medicamentos */
  function renderRows() {
    const cont = $('#farmacos-list');
    if (!state.rows || state.rows.length === 0) {
      cont.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon" aria-hidden="true">💊</div>
          <p class="empty-title">Constructor de infusor vacío</p>
          <p class="muted">No hay medicamentos seleccionados en el infusor. Pulse <strong>«＋ Añadir fármaco»</strong> para incorporar la medicación necesaria.</p>
        </div>`;
      return;
    }

    cont.innerHTML = state.rows.map((r, i) => {
      const farmacoObj = H.FARMACOS[r.farmaco];
      const avisoBloqueo = farmacoObj && farmacoObj.bloqueadoSC
        ? `<div class="alerta-bloqueo-farmaco alert rojo" role="alert">
            <strong>⛔ Incorporado al catálogo · Bloqueado para preparación en infusor SC continuo:</strong>
            <p><small>${esc(farmacoObj.motivoBloqueoSC)}</small></p>
           </div>`
        : '';
      return `
      <div class="fila" data-i="${i}">
        <div><label>Fármaco</label><select data-f="farmaco">${opcionesFarmaco(r.farmaco)}</select></div>
        <div class="fila-pres"><label>Presentación</label><select data-f="presentacion">${opcionesPres(r.farmaco, r.presentacion)}</select></div>
        <div><label>Dosis diaria (mg/día)</label><input data-f="dosisDiaria" type="number" inputmode="decimal" min="0" step="any" placeholder="Dosis mg/24 h" value="${esc(r.dosisDiaria != null ? r.dosisDiaria : '')}"></div>
        <button class="btn danger icon" type="button" data-act="del" aria-label="Quitar ${esc(farmacoObj ? farmacoObj.nombre : r.farmaco)}">✕</button>
      </div>
      ${avisoBloqueo}`;
    }).join('');
  }

  function syncDurBtnsUI() {
    $$('.dur-btn').forEach((b) => {
      const val = b.dataset.dias === 'custom' ? 'custom' : Number(b.dataset.dias);
      const on = state.diasSeleccionados === val;
      b.classList.toggle('active', on);
      b.setAttribute('aria-checked', String(on));
    });
  }

  function actualizarSeleccionInfusorPorDuracion() {
    const wrap = $('#device-compat-wrap');
    const sel = $('#infusor-select');
    const customFields = $('#custom-fields');

    if (state.diasSeleccionados === 'custom') {
      state.infusor = 'custom';
      customFields.hidden = false;
      sel.hidden = true;
      wrap.innerHTML = `<div class="compat-unico"><span class="compat-tag">Modo personalizado</span> <span class="compat-params">Defina volumen y caudal; verifique el prospecto del fabricante (precaución activa).</span></div>` +
        `<p class="compat-nota">La duración del dispositivo no garantiza por sí sola la estabilidad fisicoquímica de la mezcla.</p>`;
      return { compatible: true };
    }

    customFields.hidden = true;
    let filtro;
    try {
      filtro = H.filtrarInfusoresCompatibles({ dias: state.diasSeleccionados, farmacos: state.rows });
    } catch (e) {
      filtro = { compatibles: [], unico: false, ninguno: true, motivoIncompatibilidad: e.message };
    }

    if (filtro.ninguno || filtro.compatibles.length === 0) {
      state.infusor = null;
      sel.hidden = true;
      wrap.innerHTML = `<div class="compat-ninguno"><span class="compat-alert">⚠️ Sin dispositivo compatible</span> <span class="compat-motivo">${esc(filtro.motivoIncompatibilidad || 'Incompatible')}</span></div>`;
      return { compatible: false, motivo: filtro.motivoIncompatibilidad };
    }

    if (filtro.unico) {
      state.infusor = filtro.autoseleccionado.id;
      sel.hidden = true;
      wrap.innerHTML = `<div class="compat-unico"><span class="compat-tag">Dispositivo seleccionado</span> <strong class="compat-nombre">${esc(filtro.autoseleccionado.nombre)}</strong> <span class="compat-etiqueta">${esc(filtro.autoseleccionado.etiquetaCorta)}</span></div>`;
      return { compatible: true, infusor: filtro.autoseleccionado };
    }

    const idActualSigueCompatible = filtro.compatibles.some((c) => c.id === state.infusor);
    if (!idActualSigueCompatible) state.infusor = filtro.compatibles[0].id;

    sel.innerHTML = filtro.compatibles.map((c) =>
      `<option value="${c.id}"${c.id === state.infusor ? ' selected' : ''}>${esc(c.nombre)} · ${esc(c.etiquetaCorta)}</option>`
    ).join('');
    sel.hidden = false;

    const cardsHtml = filtro.compatibles.map((c) => {
      const activo = c.id === state.infusor;
      return `<button type="button" class="compat-card ${activo ? 'active' : ''}" data-infusor-id="${c.id}">
        <strong>${esc(c.nombre)}</strong>
        <span class="compat-kpis">${esc(c.etiquetaCorta)}</span>
      </button>`;
    }).join('');

    wrap.innerHTML = `<div class="compat-multi-head"><span class="field-label">Dispositivos compatibles para ${fmt(state.diasSeleccionados)} días (elija uno):</span></div><div class="compat-cards-grid">${cardsHtml}</div>`;
    return { compatible: true, seleccionMultiple: true };
  }

  function setDuracion(dias) {
    state.diasSeleccionados = dias;
    syncDurBtnsUI();
    actualizarSeleccionInfusorPorDuracion();
    recalcular();
  }

  function leerInfusor() {
    if (state.diasSeleccionados === 'custom') {
      const llenado = Number($('#c-llenado').value);
      return {
        id: 'custom',
        llenado,
        volumenReal: llenado,
        ritmo: Number($('#c-ritmo').value),
      };
    }
    return state.infusor;
  }

  function renderInfusorResumen(d, motivoIncompatible) {
    const el = $('#infusor-resumen');
    if (!el) return;
    if (motivoIncompatible || !d) {
      el.innerHTML = `
        <div class="kpi-item kpi-alerta">
          <dt class="kpi-label">Estado</dt>
          <dd class="kpi-val text-danger">Incompatible</dd>
        </div>
        <div class="kpi-item kpi-full">
          <dt class="kpi-label">Motivo</dt>
          <dd class="kpi-val">${esc(motivoIncompatible || 'Seleccione dispositivo compatible.')}</dd>
        </div>`;
      return;
    }
    const inf = d.infusor;
    el.innerHTML = `
      <div class="kpi-item">
        <dt class="kpi-label">Duración nominal</dt>
        <dd class="kpi-val"><strong>${fmt(inf.diasCategoria || Math.round(d.dias))} días</strong></dd>
      </div>
      <div class="kpi-item">
        <dt class="kpi-label">Volumen llenado</dt>
        <dd class="kpi-val"><strong>${fmt(inf.llenado)} ml</strong></dd>
      </div>
      <div class="kpi-item">
        <dt class="kpi-label">Caudal nominal</dt>
        <dd class="kpi-val"><strong>${fmt(inf.ritmo)} ml/h</strong></dd>
      </div>
      <div class="kpi-item">
        <dt class="kpi-label">Dispositivo</dt>
        <dd class="kpi-val kpi-device-name" title="${esc(inf.fabricante || inf.nombre)}">${esc(inf.referenciaFabricante ? inf.referenciaFabricante + ' · ' + (inf.diasCategoria || fmt(d.dias)) + 'd' : inf.nombre)}</dd>
      </div>`;
  }

  function recalcular() {
    sincronizarAplicada();
    const compatResult = actualizarSeleccionInfusorPorDuracion();
    const cont = $('#resultado');
    if (!compatResult.compatible) {
      state.ultimo = null;
      renderInfusorResumen(null, compatResult.motivo);
      setAlertas('infusor', [{ nivel: 'rojo', codigo: 'DISPOSITIVO_INCOMPATIBLE', mensaje: compatResult.motivo || 'Dispositivo incompatible.' }]);
      cont.innerHTML = `<div class="card estado rojo" role="alert"><strong>⛔ Dispositivo incompatible</strong><p>${esc(compatResult.motivo)}</p></div>`;
      if (!$('#panel-nota').hidden) actualizarNota();
      return;
    }

    try {
      const infLeido = leerInfusor();
      if (!infLeido) {
        state.ultimo = null;
        renderInfusorResumen(null, 'No se ha seleccionado dispositivo.');
        cont.innerHTML = '<div class="card muted"><p>Seleccione un dispositivo compatible.</p></div>';
        return;
      }
      const dur = H.calcularDuracion(infLeido);
      renderInfusorResumen(dur);

      const r = H.calcularInfusor({ infusor: infLeido, farmacos: state.rows });
      state.ultimo = r;
      setAlertas('infusor', r.semaforo.alertas);

      if (!r.farmacos.length) {
        cont.innerHTML = `
          <div class="card empty-result">
            <div class="empty-result-cuerpo">
              <p class="empty-title">Preparación no calculada</p>
              <p class="muted">Añada fármacos con su dosis diaria para calcular la preparación, comprobar los volúmenes de llenado y revisar el desglose matemático.</p>
            </div>
          </div>`;
      } else {
        cont.innerHTML = renderResultado(r);
      }
    } catch (e) {
      state.ultimo = null;
      setAlertas('infusor', [{ nivel: 'rojo', codigo: 'ERROR_CALCULO', mensaje: e.message }]);
      cont.innerHTML = `<div class="card estado rojo" role="alert"><strong>⛔ Datos no válidos</strong><p>${esc(e.message)}</p></div>`;
    }
    if (!$('#panel-nota').hidden) actualizarNota();
  }

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
          ${f.sobraContenido ? `<span class="prep-sobrante">Habrá sobrante en ${f.tipoEnvase === 'vial' ? 'el vial' : 'la ampolla'}</span>` : ''}
        </div>
      </li>`).join('');
    return `
      <ul class="prep-sencilla">${items}</ul>
      <div class="prep-suero">
        <strong>Suero fisiológico 0,9 % (Diluyente)</strong>
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
          <td>${f.sobraContenido ? (f.tipoEnvase === 'vial' ? 'Habrá sobrante en el vial' : 'Habrá sobrante en la ampolla') : 'Sin sobrante'}</td></tr>`;
    }).join('');
    return `
      <div class="tabla-wrap"><table class="tabla">
        <thead><tr><th>Fármaco</th><th>Total</th><th>Añadir</th><th>Abrir</th><th>Sobrante</th></tr></thead>
        <tbody>${filas}
          <tr class="suero"><th scope="row">Suero fisiológico 0,9 % a añadir</th><td colspan="4"><strong>${fmt(r.suero)} ml</strong></td></tr>
        </tbody></table></div>`;
  }

  /* Corrección 1: Desglose matemático explícito y comprobable paso a paso */
  function renderDesgloseMatematico(r) {
    if (!r.operaciones || !r.farmacos.length) return '';

    const farmacosOps = r.farmacos.map((f, i) => `
      <div class="desglose-f-box">
        <div class="desglose-f-header">
          <strong>${i + 1}. ${esc(f.nombre)}</strong>
          <span class="badge muted">${esc(f.presentacion.label)}</span>
        </div>
        <div class="desglose-grid">
          <div class="d-item"><span class="d-lbl">Concentración:</span> <code class="d-val">${esc(f.operaciones.concentracion)}</code></div>
          <div class="d-item"><span class="d-lbl">Dosis acumulada:</span> <code class="d-val">${fmt(f.totalMg)} mg totales</code></div>
          <div class="d-item"><span class="d-lbl">Volumen a extraer:</span> <code class="d-val">${esc(f.operaciones.volumenAspirar)}</code></div>
          <div class="d-item"><span class="d-lbl">Envases a abrir:</span> <code class="d-val">${esc(f.operaciones.ampollas)}</code></div>
          <div class="d-item"><span class="d-lbl">Volumen en envases:</span> <code class="d-val">${esc(f.operaciones.volumenEnvases)}</code></div>
          ${f.sobraContenido ? `<div class="d-item"><span class="prep-sobrante">Habrá sobrante en ${f.tipoEnvase === 'vial' ? 'el vial' : 'la ampolla'}.</span></div>` : ''}
        </div>
      </div>
    `).join('');

    return `
      <details class="card desglose-card" open>
        <summary class="desglose-summary">
          <span class="desglose-title">📐 Desglose matemático y comprobación paso a paso</span>
          <span class="desglose-badge">Aritmética verificada</span>
        </summary>
        <div class="desglose-cuerpo">
          <p class="muted">Operaciones exactas utilizadas para el cálculo de masa acumulada, volumen a aspirar y diluyente para el infusor de ${fmt(r.infusor.diasCategoria || Math.round(r.dias))} días nominales, según su volumen de llenado y caudal de ${fmt(r.infusor.ritmo)} ml/h:</p>
          <div class="desglose-farmacos-lista">${farmacosOps}</div>
          <div class="desglose-dispositivo-box">
            <h5>Balance volumétrico del infusor</h5>
            <div class="desglose-grid">
              <div class="d-item"><span class="d-lbl">Volumen total de fármacos:</span> <code class="d-val">${esc(r.operaciones.volumenFarmacos)}</code></div>
              <div class="d-item"><span class="d-lbl">Diluyente (Suero Fisiológico 0,9 %):</span> <code class="d-val">${esc(r.operaciones.diluyente)}</code></div>
              <div class="d-item"><span class="d-lbl">Volumen final preparado:</span> <code class="d-val">${esc(r.operaciones.volumenFinal)}</code></div>
              <div class="d-item"><span class="d-lbl">Duración y ritmo:</span> <code class="d-val">${fmt(r.infusor.diasCategoria || Math.round(r.dias))} días nominales · ${fmt(r.infusor.ritmo)} ml/h</code></div>
            </div>
          </div>
        </div>
      </details>`;
  }

  function renderResultado(r) {
    const pct = Math.min(100, (r.volumenAspirado / r.infusor.llenado) * 100);
    const cuerpoPrep = state.modo === 'sencillo' ? renderPreparacionSencilla(r) : renderPreparacionExperta(r);
    const desgloseMat = renderDesgloseMatematico(r);
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
        <p class="resumen-vol"><strong>Volumen final total preparado:</strong> ${fmt(r.volumenFinal)} ml (llenado nominal ${fmt(r.infusor.llenado)} ml)</p>
      </div>
      ${desgloseMat}
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

    // Corrección 3: Botón para vaciar / reiniciar constructor de infusor
    const btnVaciar = $('#vaciar-infusor');
    if (btnVaciar) {
      btnVaciar.addEventListener('click', () => {
        state.rows = [];
        state.aplicada = null;
        renderRows();
        recalcular();
        toast('Constructor de infusores vaciado');
      });
    }

    $('#resultado').addEventListener('click', (e) => { if (e.target.closest('[data-act="a-nota"]')) switchTab('nota'); });
    renderRows();
    recalcular();
  }

  /* ───────────── Tab 2 · Modo Guiado (HYP-009 y HYP-010) ───────────── */
  const g = { paso: 0, resp: {}, ramsayCompletada: false };
  function sincronizarAlertasGuiado() {
    const tieneRespuestas = Object.keys(g.resp).some((k) => k !== 'midazolamDisnea');
    if (!tieneRespuestas) {
      if (state.alertas.guiado.length) setAlertas('guiado', []);
      return;
    }
    const parcial = H.planGuiado(g.resp);
    setAlertas('guiado', parcial.semaforo.alertas);
  }

  function esRutaSedacion() {
    return Boolean(
      (g.resp.sintomas && g.resp.sintomas.indexOf('sedacion') !== -1) ||
      g.resp.contexto === 'refractario'
    );
  }

  function renderGuiado() {
    const cont = $('#guiado');
    const total = H.GUIA_PASOS.length;

    // Si ha completado los 5 pasos:
    if (g.paso >= total) {
      // HYP-010: Si es ruta de sedación y no se ha completado la pantalla temprana de Ramsay,
      // mostrar la valoración de Ramsay ANTES de las propuestas de tratamiento.
      if (esRutaSedacion() && !g.ramsayCompletada) {
        return renderRamsayPaso(cont);
      }
      return renderPlan(cont);
    }

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

  /* HYP-010: Pantalla integrada y temprana de valoración de sedación (Ramsay) */
  function renderRamsayPaso(cont) {
    const r = state.ramsay;
    const niveles = H.ESCALA_RAMSAY.niveles;

    // Selector segmentado nivel actual (1 a 6 + no valorado)
    const btnsActual = niveles.map((n) => {
      const sel = !r.noValorado && r.nivelObservado === n.nivel;
      return `<button type="button" class="ramsay-seg-btn ${sel ? 'active' : ''}" data-act="set-ramsay-obs" data-nivel="${n.nivel}">${n.nivel}</button>`;
    }).join('') + `<button type="button" class="ramsay-seg-btn ramsay-seg-special ${r.noValorado ? 'active' : ''}" data-act="set-ramsay-obs-noval">No valorado</button>`;

    // Selector segmentado objetivo (1 a 6 + no aplica)
    const btnsObjetivo = niveles.map((n) => {
      const sel = r.nivelObjetivo === n.nivel;
      return `<button type="button" class="ramsay-seg-btn ${sel ? 'active' : ''}" data-act="set-ramsay-obj" data-nivel="${n.nivel}">${n.nivel}</button>`;
    }).join('') + `<button type="button" class="ramsay-seg-btn ramsay-seg-special ${r.nivelObjetivo === null ? 'active' : ''}" data-act="set-ramsay-obj-null">No aplica</button>`;

    // Descripción breve del nivel actual seleccionado
    let descActual = '<span class="muted">Sin nivel seleccionado. Seleccione un nivel observado o «No valorado».</span>';
    if (r.noValorado) {
      descActual = '<strong>No valorado / no aplicable</strong> · El paciente no ha sido evaluado aún con la escala o no requiere sedación.';
    } else if (r.nivelObservado != null) {
      const item = niveles.find((x) => x.nivel === r.nivelObservado);
      if (item) descActual = `<strong>${esc(item.titulo)}</strong> · <small>${esc(item.descripcion)}</small>`;
    }

    // Descripción breve del nivel objetivo seleccionado
    let descObjetivo = '<span class="muted">Sin objetivo fijado (opcional). Seleccione un nivel objetivo o «No aplica».</span>';
    if (r.nivelObjetivo === null) {
      descObjetivo = '<strong>No aplica / sin objetivo profundo</strong> · No se persigue disminución intencionada de la consciencia.';
    } else if (r.nivelObjetivo != null) {
      const item = niveles.find((x) => x.nivel === r.nivelObjetivo);
      if (item) descObjetivo = `<strong>${esc(item.titulo)}</strong> · <small>${esc(item.estadoClinico)}</small>`;
    }

    // Acordeón accesible de criterios completos (6 niveles validados según BMJ 1974 y SECPAL)
    const tablaCriterios = niveles.map((n) => `
      <div class="ramsay-criterio-item">
        <div class="ramsay-criterio-head">
          <span class="ramsay-badge-num">${n.nivel}</span>
          <strong>${esc(n.titulo)}</strong>
        </div>
        <p class="ramsay-criterio-desc">${esc(n.descripcion)}</p>
        <p class="ramsay-criterio-clinico"><small><em>Criterio clínico:</em> ${esc(n.estadoClinico)}</small></p>
      </div>
    `).join('');

    cont.innerHTML = `
      <div class="card">
        <div class="card-head">
          <h3>Nivel de sedación (Escala de Ramsay)</h3>
          <span class="badge info">Valoración previa a tratamiento</span>
        </div>
        <p class="muted">Valoración clínica individualizada según guías SECPAL / INGESA 2021. La escala monitoriza confort y profundidad; <strong>nunca prescribe dosis ni fármacos automáticos</strong>.</p>

        <div class="ramsay-control-bloque">
          <label class="field-label">Nivel actual observado</label>
          <div class="ramsay-seg-group" role="radiogroup" aria-label="Nivel actual observado">
            ${btnsActual}
          </div>
          <div class="ramsay-desc-box">${descActual}</div>
        </div>

        <div class="ramsay-control-bloque">
          <label class="field-label">Objetivo individualizado</label>
          <div class="ramsay-seg-group" role="radiogroup" aria-label="Objetivo individualizado">
            ${btnsObjetivo}
          </div>
          <div class="ramsay-desc-box">${descObjetivo}</div>
        </div>

        <details class="ramsay-criterios-detalles">
          <summary>📖 Consultar criterios clínicos completos (6 niveles validados)</summary>
          <div class="ramsay-criterios-lista">
            ${tablaCriterios}
            <p class="ramsay-fuente"><small>Fuente: Ramsay MA, Savege TM, Simpson BR, Goodwin R. Controlled sedation with alphaxalone-alphadolone. BMJ 1974; 2(5920):656-659. Manual Merck y Guía SECPAL.</small></p>
          </div>
        </details>

        <div class="ramsay-doc-form">
          <h5>Garantías clínicas y voluntades</h5>
          <div class="grid2">
            <label class="opt check">
              <input type="checkbox" data-act="toggle-voluntades" ${r.voluntadesAnticipadas ? 'checked' : ''}>
              <span>Voluntades anticipadas consultadas</span>
            </label>
            <label class="opt check">
              <input type="checkbox" data-act="toggle-representante" ${r.representanteLegal ? 'checked' : ''}>
              <span>Representante o familia informados</span>
            </label>
            <label class="opt check">
              <input type="checkbox" data-act="toggle-consentimiento" ${r.consentimientoDocumentado ? 'checked' : ''}>
              <span>Consentimiento informado documentado</span>
            </label>
          </div>
          <div class="form-group" style="margin-top: .6rem;">
            <label for="ramsay-pref-input">Preferencias y objetivos del paciente:</label>
            <input type="text" id="ramsay-pref-input" placeholder="Ej: Mantener capacidad de comunicación o alivio pleno de disnea refractaria" value="${esc(r.preferencias)}">
          </div>
        </div>

        <div class="btn-row" style="margin-top: 1.2rem;">
          <button class="btn primary" type="button" data-act="ramsay-continuar">Continuar a propuestas de tratamiento →</button>
          <button class="btn ghost" type="button" data-act="ramsay-atras">← Atrás</button>
          <button class="btn ghost" type="button" data-act="reiniciar">Reiniciar</button>
        </div>
      </div>
    `;
  }

  /* HYP-010: Resumen estructurado de la valoración de Ramsay para la revisión de tratamiento */
  function renderRamsayResumen() {
    const r = state.ramsay;
    const niveles = H.ESCALA_RAMSAY.niveles;

    let nivelObsTexto = 'No valorado';
    if (!r.noValorado && r.nivelObservado != null) {
      const it = niveles.find((x) => x.nivel === r.nivelObservado);
      nivelObsTexto = it ? `Nivel ${r.nivelObservado} (${it.titulo.split(':')[1]?.trim() || it.titulo})` : `Nivel ${r.nivelObservado}`;
    }

    let nivelObjTexto = 'No aplica / sin objetivo fijado';
    if (r.nivelObjetivo != null) {
      const it = niveles.find((x) => x.nivel === r.nivelObjetivo);
      nivelObjTexto = it ? `Nivel ${r.nivelObjetivo} (${it.titulo.split(':')[1]?.trim() || it.titulo})` : `Nivel ${r.nivelObjetivo}`;
    }

    const evaluacion = H.evaluarRamsay({
      nivelObservado: r.noValorado ? null : r.nivelObservado,
      nivelObjetivo: r.nivelObjetivo,
      noValorado: r.noValorado,
      preferenciasPaciente: r.preferencias,
      voluntadesAnticipadas: r.voluntadesAnticipadas,
      representanteLegal: r.representanteLegal,
      consentimientoDocumentado: r.consentimientoDocumentado,
    });

    const garantias = [];
    if (r.voluntadesAnticipadas) garantias.push('Voluntades anticipadas consultadas');
    if (r.representanteLegal) garantias.push('Familia/representante informado');
    if (r.consentimientoDocumentado) garantias.push('Consentimiento informado');
    const garantiasHtml = garantias.length
      ? garantias.map((g) => `<span class="badge verde">✓ ${esc(g)}</span>`).join(' ')
      : '<span class="muted">Pendiente de registro de garantías éticas documentadas.</span>';

    return `
      <div class="card ramsay-resumen-card">
        <div class="card-head">
          <div class="ramsay-resumen-title">
            <span class="ramsay-moon-ico" aria-hidden="true">🌙</span>
            <h4>Valoración de sedación (Ramsay)</h4>
          </div>
          <button class="btn ghost btn-sm" type="button" data-act="ramsay-editar">✏️ Modificar valoración</button>
        </div>
        <div class="ramsay-resumen-grid">
          <div class="ramsay-resumen-item">
            <span class="ramsay-resumen-lbl">Nivel actual observado:</span>
            <strong class="ramsay-resumen-val">${esc(nivelObsTexto)}</strong>
          </div>
          <div class="ramsay-resumen-item">
            <span class="ramsay-resumen-lbl">Objetivo terapéutico:</span>
            <strong class="ramsay-resumen-val">${esc(nivelObjTexto)}</strong>
          </div>
        </div>
        ${evaluacion.valido && !evaluacion.noValorado ? `
          <div class="alert ${evaluacion.concordancia === 'en_objetivo' ? 'verde' : 'ambar'} ramsay-eval-alert">
            <strong>${esc(evaluacion.mensajeConcordancia)}</strong>
            <p><small>${esc(evaluacion.advertencia)}</small></p>
          </div>
        ` : `<div class="alert ambar"><p><small>${esc(H.ESCALA_RAMSAY.advertenciaClinica)}</small></p></div>`}
        <div class="ramsay-garantias-row">
          <div class="ramsay-garantias-list">${garantiasHtml}</div>
          ${r.preferencias ? `<p class="ramsay-pref-resumen"><small><strong>Preferencias:</strong> ${esc(r.preferencias)}</small></p>` : ''}
        </div>
      </div>
    `;
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

    // HYP-010: Resumen de la valoración de Ramsay visible durante la revisión del tratamiento
    const ramsayResumenHtml = (esRutaSedacion() || state.ramsay.nivelObservado != null || state.ramsay.noValorado)
      ? renderRamsayResumen()
      : '';

    cont.innerHTML = `
      ${bloq}
      ${dest}
      ${ramsayResumenHtml}
      <div class="card"><h3>Propuestas de tratamiento orientativas</h3>
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

  /* Reinicia todos los módulos para no arrastrar datos entre pacientes. */
  function nuevaConsulta() {
    g.paso = 0;
    g.resp = {};
    g.plan = null;
    g.ramsayCompletada = false;
    state.rows = []; // Constructor vacío (Corrección 3)
    state.ultimo = null;
    state.aplicada = null;
    state.conversion = null;
    state.parchesFentanilo = [{ parche: 25, cantidad: 1 }];
    state.ramsay = {
      nivelObservado: null,
      nivelObjetivo: null,
      noValorado: false,
      preferencias: '',
      voluntadesAnticipadas: false,
      representanteLegal: false,
      consentimientoDocumentado: false,
      reevaluacionConfort: '',
    };
    Object.keys(state.alertas).forEach((k) => { state.alertas[k] = []; });
    state.diasSeleccionados = 5;
    state.infusor = 'sfs2_250';
    if ($('#c-llenado')) $('#c-llenado').value = '100';
    if ($('#c-real')) $('#c-real').value = '100';
    if ($('#c-ritmo')) $('#c-ritmo').value = '2';
    if ($('#opioide-select')) $('#opioide-select').value = 'fentanilo_td';
    if ($('#opioide-dosis')) $('#opioide-dosis').value = '';
    if ($('#opioide-reduccion')) $('#opioide-reduccion').value = '0';
    renderGuiado();
    renderRows();
    recalcular();
    if ($('#opioide-select')) $('#opioide-select').dispatchEvent(new Event('change'));
    actualizarNota();
    switchTab('guiado');
  }

  function initGuiado() {
    const cont = $('#guiado');
    cont.addEventListener('change', (e) => {
      if (e.target.dataset.act === 'mida-disnea') {
        g.resp.midazolamDisnea = e.target.checked;
        renderGuiado();
      } else if (e.target.dataset.act === 'toggle-voluntades') {
        state.ramsay.voluntadesAnticipadas = e.target.checked;
      } else if (e.target.dataset.act === 'toggle-representante') {
        state.ramsay.representanteLegal = e.target.checked;
      } else if (e.target.dataset.act === 'toggle-consentimiento') {
        state.ramsay.consentimientoDocumentado = e.target.checked;
      }
    });

    cont.addEventListener('input', (e) => {
      if (e.target.id === 'ramsay-pref-input') {
        state.ramsay.preferencias = e.target.value;
      }
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
          g.ramsayCompletada = false;
          renderGuiado();
        } else if (a === 'reiniciar') {
          g.paso = 0; g.resp = {}; g.ramsayCompletada = false; renderGuiado();
        } else if (a === 'nueva') {
          nuevaConsulta(); toast('Nueva consulta iniciada');
        } else if (a === 'cargar' && g.plan) {
          state.rows = g.plan.sugerencias.map((s) => ({ farmaco: s.farmaco, presentacion: H.FARMACOS[s.farmaco].presentaciones[0].id, dosisDiaria: s.dosisDiaria }));
          state.aplicada = null;
          renderRows(); recalcular(); switchTab('rapido'); toast('Sugerencias cargadas en el infusor');
        } else if (a === 'set-ramsay-obs') {
          state.ramsay.noValorado = false;
          state.ramsay.nivelObservado = Number(act.dataset.nivel);
          renderGuiado();
        } else if (a === 'set-ramsay-obs-noval') {
          state.ramsay.noValorado = true;
          state.ramsay.nivelObservado = null;
          renderGuiado();
        } else if (a === 'set-ramsay-obj') {
          state.ramsay.nivelObjetivo = Number(act.dataset.nivel);
          renderGuiado();
        } else if (a === 'set-ramsay-obj-null') {
          state.ramsay.nivelObjetivo = null;
          renderGuiado();
        } else if (a === 'ramsay-continuar') {
          g.ramsayCompletada = true;
          renderGuiado();
        } else if (a === 'ramsay-atras') {
          g.paso = Math.max(0, H.GUIA_PASOS.length - 1);
          g.ramsayCompletada = false;
          renderGuiado();
        } else if (a === 'ramsay-editar') {
          g.ramsayCompletada = false;
          renderGuiado();
        }
      }
    });
    renderGuiado();
  }

  /* ───────────── Tab 3 · Opioides (HYP-001) ───────────── */
  function opcionesParcheFentanilo(selVal) {
    return H.PRESENTACIONES_FENTANILO_TD.map((p) => {
      const val = p.liberacion !== undefined ? p.liberacion : p.liberacionReal;
      const lbl = p.label !== undefined ? p.label : p.etiqueta;
      return `<option value="${val}"${Math.abs(Number(selVal) - val) < 1e-6 ? ' selected' : ''}>${esc(lbl)}</option>`;
    }).join('');
  }

  function renderFilasParchesFentanilo() {
    const rowsEl = $('#fentanilo-rows');
    if (!rowsEl) return;
    const n = state.parchesFentanilo.length;
    rowsEl.innerHTML = state.parchesFentanilo.map((r, i) => `
      <div class="parche-fila" data-fp-i="${i}">
        <div>
          <label>Presentación</label>
          <select data-fp="parche">${opcionesParcheFentanilo(r.parche)}</select>
        </div>
        <div>
          <label>Cantidad (número entero)</label>
          <input data-fp="cantidad" type="number" inputmode="numeric" min="1" max="10" step="1" value="${esc(r.cantidad)}">
        </div>
        ${n > 1 ? `<button class="btn danger icon" type="button" data-act="del-parche-fentanilo" aria-label="Eliminar fila de parche">✕</button>` : ''}
      </div>`).join('');
  }

  function calcularYRenderizarOpioides() {
    const sel = $('#opioide-select').value;
    const reduccion = Number($('#opioide-reduccion').value);
    const cont = $('#opioide-resultado');
    const fentaniloWrap = $('#fentanilo-parches-wrap');
    const dosisWrap = $('#opioide-dosis-wrap');
    const dosisLabel = $('#opioide-dosis-label');
    const dosisInput = $('#opioide-dosis');
    const parcheSelect = $('#opioide-parche');
    const desgloseP = $('#fentanilo-desglose');

    const esFentanilo = sel === 'fentanilo_td';
    fentaniloWrap.hidden = !esFentanilo;
    dosisWrap.hidden = esFentanilo;

    let res;
    if (esFentanilo) {
      res = H.convertirOpioide('fentanilo_td', state.parchesFentanilo, { reduccion });
      if (!res.error && desgloseP) {
        desgloseP.textContent = `Dosis total de fentanilo: ${fmt(res.dosis)} µg/h (${res.desgloseTexto || res.desgloseParches})`;
      }
    } else if (sel === 'metadona') {
      dosisInput.hidden = false;
      parcheSelect.hidden = true;
      res = H.convertirOpioide('metadona', 1);
    } else {
      const def = H.OPIOIDES[sel];
      if (!def) {
        cont.innerHTML = '';
        setAlertas('opioide', []);
        return;
      }
      dosisLabel.textContent = `Dosis actual (${def.unidad})`;
      if (def.valores) {
        dosisInput.hidden = true;
        parcheSelect.hidden = false;
        if (!parcheSelect.options.length || parcheSelect.dataset.op !== sel) {
          parcheSelect.innerHTML = def.valores.map((v) => `<option value="${v}">${v} ${def.unidad}</option>`).join('');
          parcheSelect.dataset.op = sel;
        }
        res = H.convertirOpioide(sel, Number(parcheSelect.value), { reduccion });
      } else {
        dosisInput.hidden = false;
        parcheSelect.hidden = true;
        const val = Number(dosisInput.value);
        if (!(val > 0)) {
          cont.innerHTML = '<div class="card muted"><p>Introduzca la dosis actual para calcular la equivalencia.</p></div>';
          setAlertas('opioide', []);
          state.conversion = null;
          return;
        }
        res = H.convertirOpioide(sel, val, { reduccion });
      }
    }

    state.conversion = res;
    if (res.error) {
      cont.innerHTML = `<div class="card estado rojo" role="alert"><strong>⛔ Entrada inválida</strong><p>${esc(res.error)}</p></div>`;
      setAlertas('opioide', [{ nivel: 'rojo', codigo: 'OPIOIDE_INVALIDO', mensaje: res.error }]);
      return;
    }
    if (res.bloqueado) {
      cont.innerHTML = `<div class="card estado rojo" role="alert"><strong>⛔ ${esc(res.titulo)}</strong><p>${esc(res.mensaje)}</p></div>`;
      setAlertas('opioide', [res]);
      return;
    }

    const alertasOp = [];
    if (res.verificar) {
      alertasOp.push({
        nivel: 'ambar',
        codigo: 'FACTOR_SIN_VERIFICAR',
        mensaje: 'Equivalencia de ' + res.nombre + ' en rango clínico orientativo (Anexo 6). Titular con rescates.',
      });
    }
    if (res.extrapoladoFueraTablaAnexo6) {
      alertasOp.push({
        nivel: 'ambar',
        codigo: 'FENTANILO_EXTRAPOLADO',
        mensaje: res.aviso,
      });
    }
    if (reduccion === 0) {
      alertasOp.push({
        nivel: 'ambar',
        codigo: 'ROTACION_SIN_REDUCCION',
        mensaje: 'Conversión calculada sin reducción por tolerancia cruzada incompleta (0 %).',
      });
    }
    setAlertas('opioide', alertasOp);

    let equivalenciaCuerpo;
    if (res.extrapoladoFueraTablaAnexo6) {
      equivalenciaCuerpo = `
        <div class="alert ambar" role="alert">
          <strong>⚠️ Dosis superior a 150 µg/h</strong>
          <p>${esc(res.aviso)}</p>
        </div>`;
    } else {
      equivalenciaCuerpo = `
        <div class="kpis">
          <div class="kpi"><span class="kpi-label">Morfina SC diaria</span><strong>${fmt(res.morfinaSC)} mg/día</strong><small>Dosis a cargar en infusor</small></div>
          <div class="kpi"><span class="kpi-label">Morfina oral equivalente</span><strong>${fmt(res.morfinaOral)} mg/día</strong><small>Referencia oral</small></div>
          <div class="kpi"><span class="kpi-label">Rescate SC (1/6)</span><strong>${fmt(res.rescateSC)} mg</strong><small>Cada 4 h si dolor o disnea</small></div>
        </div>
        <p class="muted"><small>Rango orientativo de rotación (reducción 25–50 %): ${fmt(res.rangoRotacionSC[0])}–${fmt(res.rangoRotacionSC[1])} mg/día SC (${fmt(res.rangoRotacionOral[0])}–${fmt(res.rangoRotacionOral[1])} mg/día oral).</small></p>`;
    }

    cont.innerHTML = `
      <div class="card">
        <h3>Equivalencia a morfina</h3>
        <p class="muted">Opioide actual: <strong>${esc(res.nombre)}</strong> · Dosis: <strong>${fmt(res.dosis)} ${esc(res.unidad)}</strong>${res.textoDesglose ? ` (${esc(res.textoDesglose)})` : ''} · Reducción por tolerancia cruzada: <strong>${fmt(reduccion * 100)} %</strong></p>
        ${equivalenciaCuerpo}
        ${res.aviso && !res.extrapoladoFueraTablaAnexo6 ? `<div class="alert ambar" role="alert"><p>${esc(res.aviso)}</p></div>` : ''}
        <p class="muted legal"><small>${esc(res.factorTexto)} · Basado en Anexo 6 del Plan de Optimización de Opioides (Ministerio de Sanidad, 2024).</small></p>
      </div>
      <div class="btn-row">
        ${res.transferibleAInfusor ? `<button class="btn primary" type="button" data-act="aplicar-infusor">💉 Aplicar ${fmt(res.morfinaSC)} mg/día de Morfina al Infusor</button>` : ''}
      </div>`;
  }

  function initOpioides() {
    const sel = $('#opioide-select');
    sel.innerHTML = Object.keys(H.OPIOIDES).map((k) => `<option value="${k}">${esc(H.OPIOIDES[k].nombre)}</option>`).join('');
    sel.value = 'fentanilo_td';

    sel.addEventListener('change', calcularYRenderizarOpioides);
    $('#opioide-dosis').addEventListener('input', calcularYRenderizarOpioides);
    $('#opioide-parche').addEventListener('change', calcularYRenderizarOpioides);
    $('#opioide-reduccion').addEventListener('change', calcularYRenderizarOpioides);

    $('#add-parche-fentanilo').addEventListener('click', () => {
      if (state.parchesFentanilo.length >= 8) {
        toast('Límite de seguridad alcanzado (máximo 8 filas de parches)');
        return;
      }
      state.parchesFentanilo.push({ parche: 25, cantidad: 1 });
      renderFilasParchesFentanilo();
      calcularYRenderizarOpioides();
    });

    const fRows = $('#fentanilo-rows');
    fRows.addEventListener('change', (e) => {
      const fila = e.target.closest('.parche-fila');
      if (!fila) return;
      const idx = +fila.dataset.fpI;
      if (e.target.dataset.fp === 'parche') state.parchesFentanilo[idx].parche = Number(e.target.value);
      calcularYRenderizarOpioides();
    });
    fRows.addEventListener('input', (e) => {
      const fila = e.target.closest('.parche-fila');
      if (!fila || e.target.dataset.fp !== 'cantidad') return;
      const idx = +fila.dataset.fpI;
      const v = parseInt(e.target.value, 10);
      state.parchesFentanilo[idx].cantidad = Number.isInteger(v) && v > 0 ? v : 1;
      calcularYRenderizarOpioides();
    });
    fRows.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act="del-parche-fentanilo"]');
      if (!b) return;
      const fila = b.closest('.parche-fila');
      state.parchesFentanilo.splice(+fila.dataset.fpI, 1);
      renderFilasParchesFentanilo();
      calcularYRenderizarOpioides();
    });

    $('#opioide-resultado').addEventListener('click', (e) => {
      const b = e.target.closest('[data-act="aplicar-infusor"]');
      if (!b || !state.conversion || !state.conversion.transferibleAInfusor) return;
      const conv = state.conversion;
      const morfinaDosis = round(conv.morfinaSC, 2);
      const filaMorf = state.rows.find((r) => r.farmaco === 'morfina');
      if (filaMorf) {
        filaMorf.dosisDiaria = morfinaDosis;
      } else {
        state.rows.unshift({ farmaco: 'morfina', presentacion: 'morfina_2', dosisDiaria: morfinaDosis });
      }
      state.aplicada = {
        dosis: morfinaDosis,
        nombre: conv.nombre,
        verificar: conv.verificar,
        conversion: conv,
      };
      renderRows();
      recalcular();
      switchTab('rapido');
      toast(`Morfina ${fmt(morfinaDosis)} mg/día aplicada al infusor desde ${conv.nombre}`);
    });

    renderFilasParchesFentanilo();
    calcularYRenderizarOpioides();
  }

  /* ───────────── Tab 4 · Nota clínica (HYP-005) ───────────── */
  function actualizarNota() {
    const estadoEl = $('#nota-estado');
    const alertasEl = $('#nota-alertas');
    const txtArea = $('#nota-texto');
    const s = semaforoActual();

    const hayBloqueoRojo = s.nivel === 'rojo';
    const tieneFilasIncompletas = state.rows.some((r) => r.dosisDiaria === '' || r.dosisDiaria == null || Number(r.dosisDiaria) <= 0);
    const infusorValido = state.ultimo && Array.isArray(state.ultimo.farmacos) && state.ultimo.farmacos.length > 0 && !tieneFilasIncompletas ? state.ultimo : null;

    let texto;
    if (hayBloqueoRojo) {
      const mot = s.alertas.filter((a) => a.nivel === 'rojo').map((a) => a.mensaje).join('\n- ');
      texto = H.generarNota({
        bloqueoActivo: true,
        motivoBloqueo: mot,
      });
    } else if (!infusorValido) {
      texto = H.generarNota({ infusor: null });
    } else {
      texto = H.generarNota({
        infusor: infusorValido,
        conversion: state.aplicada ? state.aplicada.conversion : null,
        avisoFactor: avisoAplicada(),
      });
    }
    if (txtArea) txtArea.value = texto;

    if (alertasEl) {
      if (hayBloqueoRojo) {
        alertasEl.innerHTML = `<div class="alert rojo" role="alert"><strong>⛔ Preparación bloqueada</strong><p>Existen alertas de seguridad que impiden generar una receta válida.</p></div>`;
      } else if (tieneFilasIncompletas && state.rows.length > 0) {
        alertasEl.innerHTML = `<div class="alert ambar" role="alert"><strong>⚠️ Fármacos incompletos</strong><p>Hay fármacos añadidos sin dosis válida. Asigne dosis o elimine filas antes de copiar.</p></div>`;
      } else if (!infusorValido) {
        alertasEl.innerHTML = `<div class="alert ambar" role="alert"><strong>ℹ️ Infusor vacío</strong><p>Añada medicamentos con dosis en la pestaña de Infusor para completar la nota clínica.</p></div>`;
      } else {
        alertasEl.innerHTML = '';
      }
    }

    if (estadoEl) {
      if (hayBloqueoRojo) estadoEl.textContent = '⛔ Bloqueada por alertas de seguridad';
      else if (!infusorValido) estadoEl.textContent = 'Pendiente de prescripción';
      else estadoEl.textContent = `${infusorValido.farmacos.length} ${infusorValido.farmacos.length === 1 ? 'fármaco' : 'fármacos'} · ${fmt(infusorValido.infusor.diasCategoria || Math.round(infusorValido.dias))} días`;
    }
  }

  function copiarTextoPlano(texto, elementoFallback) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(texto).catch(() => fallbackCopia(elementoFallback, texto));
    }
    return fallbackCopia(elementoFallback, texto);
  }

  function fallbackCopia(elemento, texto) {
    return new Promise((resolve, reject) => {
      try {
        let textarea = elemento;
        let creado = false;
        if (!textarea || typeof textarea.select !== 'function') {
          textarea = document.createElement('textarea');
          textarea.value = texto;
          textarea.style.position = 'fixed';
          textarea.style.opacity = '0';
          document.body.appendChild(textarea);
          creado = true;
        }
        textarea.focus();
        textarea.select();
        const ok = document.execCommand('copy');
        if (creado) document.body.removeChild(textarea);
        if (ok) resolve(); else reject(new Error('execCommand falló'));
      } catch (err) {
        reject(err);
      }
    });
  }

  let copiadoTimer = null;
  function ocultarIndicadorCopiado() {
    const badge = $('#nota-copiado-msg');
    const btn = $('#nota-copiar');
    if (badge) badge.hidden = true;
    if (btn) btn.textContent = 'Copiar';
  }

  function initNota() {
    $('#nota-copiar').addEventListener('click', () => {
      actualizarNota();
      if (semaforoActual().nivel === 'rojo') {
        toast('⛔ Bloqueo de seguridad: resuelva las alertas rojas antes de copiar', 5000);
        return;
      }
      const tieneFilasIncompletas = state.rows.some((r) => r.dosisDiaria === '' || r.dosisDiaria == null || Number(r.dosisDiaria) <= 0);
      if (!state.ultimo || !state.ultimo.farmacos.length || tieneFilasIncompletas) {
        toast('Configure al menos un fármaco con dosis válida antes de copiar');
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
          toast('Copiado al portapapeles');
        },
        () => {
          ocultarIndicadorCopiado();
          const ta = $('#nota-texto');
          if (ta) { ta.focus(); ta.select(); }
          toast('Texto seleccionado para copia manual', 4000);
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
        <footer class="print-pie">Documento generado con Hypnos ${esc(H.VERSION)} · Por ${esc(H.AUTOR)} · Cuidados Paliativos.</footer>
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
    const fc = $('#familias-print-cabecera');
    if (fc) fc.innerHTML = `<p class="print-inst">${esc(CABECERA_GUIAS)}</p><p class="print-fecha">Fecha: ${esc(fechaLarga())}</p>`;
    const np = $('#nota-print');
    const nt = $('#nota-texto');
    if (np && nt) np.textContent = nt.value;
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
