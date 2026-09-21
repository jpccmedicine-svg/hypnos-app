/* HYPNOS v2.0 — Interfaz y orquestación.
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
    infusor: 'sfs2_252',
    rows: [{ farmaco: 'morfina', presentacion: 'morfina_2', dosisDiaria: 60 }],
    ultimo: null, // último resultado de infusor
    conversion: null, // última conversión de opioides
    aplicada: null, // conversión transferida al infusor: { dosis, nombre, verificar, conversion }
    alertas: { infusor: [], opioide: [], guiado: [], conversion: [] },
  };

  /* La advertencia de factor sin verificar viaja con la dosis aplicada: solo se retira
   * cuando esa dosis de morfina ya no figura en el infusor. */
  function avisoAplicada() {
    const a = state.aplicada;
    if (!a || !a.verificar) return null;
    return 'La dosis de morfina del infusor procede de un factor de conversión de ' + a.nombre + ' no contrastado con el Anexo 6 del Ministerio. Verifique la equivalencia antes de prescribir.';
  }
  function sincronizarAplicada() {
    const a = state.aplicada;
    if (a && !state.rows.some((r) => r.farmaco === 'morfina' && Number(r.dosisDiaria) === a.dosis)) state.aplicada = null;
    const msg = avisoAplicada();
    setAlertas('conversion', msg ? [{ nivel: 'ambar', codigo: 'FACTOR_SIN_VERIFICAR', mensaje: msg }] : []);
  }

  /* ───────────── Toast ───────────── */
  let toastTimer;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 2600);
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
  function setAlertas(fuente, alertas) { state.alertas[fuente] = alertas; renderSemaforo(); }
  function renderSemaforo() {
    const todas = [];
    const vistos = {};
    Object.keys(state.alertas).forEach((k) => state.alertas[k].forEach((a) => {
      if (!vistos[a.codigo]) { vistos[a.codigo] = 1; todas.push(a); }
    }));
    const nivel = todas.some((a) => a.nivel === 'rojo') ? 'rojo' : todas.length ? 'ambar' : 'verde';
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

  /* ───────────── Tab 1 · Infusor ───────────── */
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
        <div><label>Presentación</label><select data-f="presentacion">${opcionesPres(r.farmaco, r.presentacion)}</select></div>
        <div><label>Dosis diaria (mg/día)</label><input data-f="dosisDiaria" type="number" inputmode="decimal" min="0" step="any" value="${esc(r.dosisDiaria)}"></div>
        <button class="btn danger icon" type="button" data-act="del" aria-label="Quitar ${esc(H.FARMACOS[r.farmaco].nombre)}">✕</button>
      </div>`).join('') || '<p class="muted">Añada al menos un fármaco.</p>';
  }
  function leerInfusor() {
    if (state.infusor !== 'custom') return state.infusor;
    return { id: 'custom', llenado: $('#c-llenado').value, volumenReal: $('#c-real').value, ritmo: $('#c-ritmo').value };
  }
  function recalcular() {
    const cont = $('#resultado');
    sincronizarAplicada();
    try {
      const r = H.calcularInfusor({ infusor: leerInfusor(), farmacos: state.rows });
      state.ultimo = r;
      $('#infusor-resumen').innerHTML =
        `<span class="chip">⏱ ${fmt(r.horas)} h</span><span class="chip">📅 ${fmt(r.dias)} días</span>` +
        `<span class="chip">💧 ${fmt(r.infusor.llenado)} ml llenado</span><span class="chip">⚙ ${fmt(r.infusor.ritmo)} ml/h</span>` +
        (r.infusor.volumenReal !== r.infusor.llenado ? `<span class="chip">Vol. real ${fmt(r.infusor.volumenReal)} ml</span>` : '');
      setAlertas('infusor', r.semaforo.alertas);
      cont.innerHTML = r.farmacos.length ? renderResultado(r) : '<div class="card muted">Introduzca una dosis diaria para calcular la preparación.</div>';
    } catch (e) {
      state.ultimo = null;
      $('#infusor-resumen').innerHTML = '';
      setAlertas('infusor', []);
      cont.innerHTML = `<div class="card muted">⚠ ${esc(e.message)}</div>`;
    }
    if (!$('#panel-nota').hidden) actualizarNota();
  }
  function renderResultado(r) {
    const pct = Math.min(100, (r.volumenAspirado / r.infusor.llenado) * 100);
    const filas = r.farmacos.map((f) => `
      <tr><th scope="row">${esc(f.nombre)}<small>${esc(f.presentacion.label)}</small></th>
        <td>${fmt(f.totalMg)} mg</td><td><strong>${fmt(f.volumenAspirar)} ml</strong></td>
        <td>${f.ampollas}</td><td>${fmt(f.volumenSobrante)} ml</td></tr>`).join('');
    const rescates = r.farmacos.filter((f) => f.rescate).map((f) => `<li><strong>${esc(f.nombre)}:</strong> ${esc(f.rescate.texto)}</li>`).join('');
    return `
      <div class="card">
        <h3>Preparación</h3>
        <div class="tabla-wrap"><table class="tabla">
          <thead><tr><th>Fármaco</th><th>Total</th><th>Aspirar</th><th>Amp.</th><th>Desechar</th></tr></thead>
          <tbody>${filas}
            <tr class="suero"><th scope="row">Suero fisiológico 0,9 % c.s.p.</th><td colspan="4"><strong>${fmt(r.suero)} ml</strong></td></tr>
          </tbody></table></div>
        <div class="meter ${r.volumenExcedido ? 'over' : ''}" role="img" aria-label="Volumen de fármacos ${fmt(r.volumenAspirado)} de ${fmt(r.infusor.llenado)} ml"><span style="width:${pct}%"></span></div>
        <ul class="lista desglose">
          <li><strong>Volumen total de fármacos a aspirar:</strong> ${fmt(r.volumenAspirado)} ml</li>
          ${r.farmacos.map((f) => `<li>${esc(f.nombre)}: ${f.ampollas} amp. de ${esc(f.presentacion.label)}; desechar ${fmt(f.volumenSobrante)} ml</li>`).join('')}
          <li><strong>Suero fisiológico 0,9 % a añadir:</strong> ${fmt(r.suero)} ml</li>
          <li><strong>Volumen final total preparado:</strong> ${fmt(r.volumenFinal)} ml (llenado ${fmt(r.infusor.llenado)} ml)</li>
        </ul>
      </div>
      <div class="card">
        <h3>Rescates SC · intervalo mínimo de seguridad</h3>
        <ul class="lista">${rescates || '<li class="muted">Sin rescates definidos.</li>'}</ul>
      </div>
      <div class="card estado ${r.semaforo.nivel}"><strong>${{ rojo: '⛔', ambar: '⚠️', verde: 'ℹ️' }[r.semaforo.nivel]}${esc(r.semaforo.resumen)}</strong>
        ${r.semaforo.alertas.map((a) => `<p>${esc(a.mensaje)}</p>`).join('')}
      </div>
      <div class="btn-row"><button class="btn primary" type="button" data-act="a-nota">📝 Pasar a nota clínica</button></div>`;
  }
  function initInfusor() {
    const sel = $('#infusor-select');
    sel.innerHTML = Object.keys(H.INFUSORES).map((k) => `<option value="${k}">${esc(H.INFUSORES[k].nombre)}</option>`).join('');
    sel.value = state.infusor;
    sel.addEventListener('change', () => {
      state.infusor = sel.value;
      $('#custom-fields').hidden = sel.value !== 'custom';
      recalcular();
    });
    ['#c-llenado', '#c-real', '#c-ritmo'].forEach((s) => $(s).addEventListener('input', recalcular));
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
    renderRows(); recalcular();
  }

  /* ───────────── Tab 2 · Guiado ───────────── */
  const g = { paso: 0, resp: {} };
  function renderGuiado() {
    const cont = $('#guiado');
    const total = H.GUIA_PASOS.length;
    if (g.paso >= total) return renderPlan(cont);
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
          g.resp[p.id] = v; g.paso++; renderGuiado();
        } else if (a === 'atras') {
          g.paso = Math.max(0, g.paso - 1);
          if (g.paso < H.GUIA_PASOS.length) setAlertas('guiado', []);
          renderGuiado();
        } else if (a === 'reiniciar') {
          g.paso = 0; g.resp = {}; setAlertas('guiado', []); renderGuiado();
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

  /* ───────────── Tab 3 · Opioides ───────────── */
  function initOpioides() {
    const sel = $('#opioide-select'), dosis = $('#opioide-dosis'), parche = $('#opioide-parche');
    sel.innerHTML = Object.keys(H.OPIOIDES).map((k) => `<option value="${k}">${k === 'metadona' ? '⛔ ' : ''}${esc(H.OPIOIDES[k].nombre)}</option>`).join('');
    sel.value = 'fentanilo_td';
    function actualizarCampos() {
      const op = H.OPIOIDES[sel.value];
      const usaParche = !!op.valores;
      parche.hidden = !usaParche; dosis.hidden = usaParche || !!op.bloqueado;
      $('#opioide-dosis-label').textContent = op.bloqueado ? 'Dosis (bloqueada)' : 'Dosis (' + op.unidad + ')';
      if (usaParche) parche.innerHTML = op.valores.map((v) => `<option value="${v}">${fmt(v)} ${op.unidad}</option>`).join('');
      calcular();
    }
    function calcular() {
      const op = H.OPIOIDES[sel.value];
      const val = op.valores ? parche.value : dosis.value;
      const cont = $('#opioide-resultado');
      if (op.bloqueado) {
        const b = H.convertirOpioide('metadona', 1);
        state.conversion = null;
        setAlertas('opioide', [{ nivel: 'rojo', codigo: b.codigo, mensaje: b.mensaje }]);
        cont.innerHTML = `<div class="alert rojo" role="alert"><strong>⛔ Bloqueo ético · Metadona</strong><p>${esc(b.mensaje)}</p><p><strong>No se ofrece cálculo.</strong> Contacte con la unidad de paliativos o del dolor.</p></div>`;
        return;
      }
      setAlertas('opioide', []);
      if (val === '') { state.conversion = null; cont.innerHTML = '<div class="card muted">Introduzca la dosis actual del paciente.</div>'; return; }
      const r = H.convertirOpioide(sel.value, val, { reduccion: $('#opioide-reduccion').value });
      if (r.error) { state.conversion = null; cont.innerHTML = `<div class="alert ambar"><p>${esc(r.error)}</p></div>`; return; }
      state.conversion = r;
      if (r.verificar) {
        setAlertas('opioide', [{ nivel: 'ambar', codigo: 'FACTOR_SIN_VERIFICAR', mensaje: 'La dosis de morfina procede de un factor de conversión de ' + r.nombre + ' no contrastado con el Anexo 6 del Ministerio. Verifique la equivalencia antes de prescribir.' }]);
      }
      const fen = r.fentaniloTD;
      cont.innerHTML = `
        <div class="card">
          <h3>${esc(r.nombre)} ${fmt(r.dosis)} ${esc(r.unidad)}</h3>
          <div class="kpis">
            <div class="kpi"><span>Morfina oral</span><strong>${fmt(r.morfinaOral)}</strong><small>mg/día</small></div>
            <div class="kpi destacado"><span>Morfina SC (50 %)</span><strong>${fmt(r.morfinaSC)}</strong><small>mg/día</small></div>
            <div class="kpi"><span>Rescate SC (1/6)</span><strong>${fmt(r.rescateSC)}</strong><small>mg</small></div>
          </div>
          ${r.reduccion ? `<p class="muted">Incluye reducción del ${fmt(r.reduccion * 100, 0)} % por tolerancia cruzada incompleta (bruto ${fmt(r.morfinaOralBruta)} mg/día oral).</p>` : ''}
          <p class="muted">Equivalente en fentanilo TD: ${fmt(fen.teorico)} mcg/h teóricos${fen.parche ? ' → parche de ' + fmt(fen.parche) + ' mcg/h' : ' (por debajo del parche mínimo)'}.</p>
        </div>
        ${r.factorTexto ? `<p class="muted">Factor de conversión a morfina oral: ${esc(r.factorTexto)}.</p>` : ''}
        ${r.aviso ? `<div class="alert ambar"><strong>⚠️ Titulación prudente</strong><p>${esc(r.aviso)}</p></div>` : ''}
        ${r.rangoMorfinaOral[0] !== r.rangoMorfinaOral[1] ? `<p class="muted">Rango de equivalencia: ${fmt(r.rangoMorfinaOral[0])}–${fmt(r.rangoMorfinaOral[1])} mg/día de morfina oral (se usa el extremo inferior).</p>` : ''}
        ${r.verificar ? '<div class="alert rojo" role="alert"><strong>Factor sin verificar</strong><p>El factor de este opioide no está contrastado con el Anexo 6 del Ministerio. Compruebe la equivalencia en el documento oficial antes de prescribir.</p></div>' : ''}
        <div class="alert ambar"><strong>⚠️ Recuerde</strong><p>Las tablas son aproximadas: reevalúe al paciente, considere reducir 25–50 % por tolerancia cruzada incompleta y ajuste según respuesta y función renal/hepática.</p></div>
        <div class="btn-row"><button class="btn primary" type="button" id="opioide-a-infusor">💉 Usar morfina SC en Infusor</button></div>`;
      $('#opioide-a-infusor').addEventListener('click', () => {
        const otros = state.rows.filter((x) => x.farmaco !== 'morfina');
        const dosisSC = H.round(r.morfinaSC, 2);
        state.rows = [{ farmaco: 'morfina', presentacion: 'morfina_2', dosisDiaria: dosisSC }].concat(otros);
        state.aplicada = { dosis: dosisSC, nombre: r.nombre, verificar: !!r.verificar, conversion: r };
        renderRows(); recalcular(); switchTab('rapido');
      });
    }
    sel.addEventListener('change', actualizarCampos);
    dosis.addEventListener('input', calcular);
    parche.addEventListener('change', calcular);
    $('#opioide-reduccion').addEventListener('change', calcular);
    actualizarCampos();
  }

  /* ───────────── Tab 4 · Nota ───────────── */
  function actualizarNota() {
    const d = {
      sistema: $('#n-sistema').value, ambito: $('#n-ambito').value, paciente: $('#n-paciente').value.trim(),
      contexto: $('#n-contexto').value, sintomas: $('#n-sintomas').value.trim(), tratamientoPrevio: $('#n-previo').value.trim(),
      observaciones: $('#n-obs').value.trim(), informaFamilia: $('#n-familia').checked, sedacion: $('#n-sedacion').checked,
      infusor: state.ultimo && state.ultimo.farmacos.length ? state.ultimo : null,
      // Solo la conversión transferida al infusor (y aún vigente) consta en la nota; si no, prescripción manual directa.
      conversion: state.aplicada ? state.aplicada.conversion : null,
      avisoFactor: avisoAplicada(),
    };
    $('#nota-texto').value = H.generarNota(d);
    $('#nota-estado').textContent = state.ultimo && state.ultimo.semaforo.nivel === 'rojo' ? '⛔ Semáforo rojo: revise antes de exportar' : '';
  }
  /* Reinicia todos los módulos para no arrastrar datos entre pacientes. */
  function nuevaConsulta() {
    g.paso = 0; g.resp = {}; g.plan = null;
    state.rows = [{ farmaco: 'morfina', presentacion: 'morfina_2', dosisDiaria: '' }];
    state.aplicada = null; state.conversion = null;
    Object.keys(state.alertas).forEach((k) => { state.alertas[k] = []; });
    state.infusor = 'sfs2_252';
    $('#infusor-select').value = state.infusor; $('#custom-fields').hidden = true;
    $('#c-llenado').value = '100'; $('#c-real').value = ''; $('#c-ritmo').value = '2';
    $('#opioide-select').value = 'fentanilo_td';
    $('#opioide-dosis').value = ''; $('#opioide-reduccion').value = '0';
    $$('#panel-nota input[type="text"], #panel-nota textarea:not(#nota-texto)').forEach((el) => { el.value = ''; });
    $$('#panel-nota input[type="checkbox"]').forEach((el) => { el.checked = false; });
    $$('#panel-nota select').forEach((el) => { el.selectedIndex = 0; });
    renderGuiado(); renderRows(); recalcular();
    $('#opioide-select').dispatchEvent(new Event('change'));
    actualizarNota();
    switchTab('guiado');
  }
  function copiar(texto) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(texto);
    return new Promise((ok, ko) => {
      const ta = $('#nota-texto'); ta.select();
      try { document.execCommand('copy') ? ok() : ko(new Error('copy')); } catch (e) { ko(e); }
    });
  }
  function initNota() {
    $$('#panel-nota input, #panel-nota select, #panel-nota textarea:not(#nota-texto)').forEach((el) => {
      el.addEventListener('input', actualizarNota); el.addEventListener('change', actualizarNota);
    });
    $('#nota-regenerar').addEventListener('click', () => { actualizarNota(); toast('Nota regenerada'); });
    $('#nota-copiar').addEventListener('click', () => {
      copiar($('#nota-texto').value).then(() => toast('Nota copiada al portapapeles ✓'), () => toast('No se pudo copiar: seleccione y copie manualmente'));
    });
    actualizarNota();
  }

  /* ───────────── Tab 5 · Familias ───────────── */
  function initFamilias() {
    $('#familias').innerHTML = H.FAMILIAS.map((f, i) => `<details class="card acordeon"${i === 0 ? ' open' : ''}><summary>${esc(f.pregunta)}</summary><p>${esc(f.respuesta)}</p></details>`).join('');
    $('#rescate-guia').innerHTML = H.RESCATE_SC_PASOS.map((p) => `<li>${esc(p)}</li>`).join('');
  }

  /* ───────────── Arranque ───────────── */
  function init() {
    initTheme(); initTabs(); initSemaforo();
    initInfusor(); initGuiado(); initOpioides(); initNota(); initFamilias();
    if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
      navigator.serviceWorker.register('sw.js').catch(() => { /* offline-first: fallo silencioso */ });
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
