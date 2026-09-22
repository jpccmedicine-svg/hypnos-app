/* HYPNOS v2.0 — Motor algorítmico y de lógica clínica.
 * Sin dependencias. Funciona en navegador (window.HypnosEngine) y Node (require).
 * Herramienta de apoyo a la decisión: NO sustituye el juicio clínico. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.HypnosEngine = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const EPS = 1e-9;
  const round = (n, d = 2) => Math.round((n + Number.EPSILON) * Math.pow(10, d)) / Math.pow(10, d);

  /* ───────────── Infusores ─────────────
   * llenado    = volumen nominal a preparar (fármacos + suero) en ml.
   * volumenReal = volumen efectivamente administrado (incluye sobrellenado del dispositivo).
   * Duración real = volumenReal / ritmo (días reales exactos, sin redondear). */
  const INFUSORES = {
    sfs2_250: { id: 'sfs2_250', nombre: 'Surefuser SFS-2 · 250 ml @ 2 ml/h', llenado: 250, volumenReal: 250, ritmo: 2 },
    sfs2_252: { id: 'sfs2_252', nombre: 'Surefuser SFS-2 · 252 ml reales @ 2 ml/h (llenado 250 ml)', llenado: 250, volumenReal: 252, ritmo: 2 },
    sfs1: { id: 'sfs1', nombre: 'Surefuser SFS-1 · 100 ml @ 1 ml/h', llenado: 100, volumenReal: 100, ritmo: 1 },
    baxter_2c1009k: { id: 'baxter_2c1009k', nombre: 'Baxter 2C1009K · 100 ml @ 2 ml/h', llenado: 100, volumenReal: 100, ritmo: 2 },
    dia_48: { id: 'dia_48', nombre: 'Infusor 1 día · 48 ml @ 2 ml/h', llenado: 48, volumenReal: 48, ritmo: 2 },
    dia_60: { id: 'dia_60', nombre: 'Infusor 1 día · 60 ml @ 2,5 ml/h', llenado: 60, volumenReal: 60, ritmo: 2.5 },
    dia_7: { id: 'dia_7', nombre: 'Infusor 7 días · 250 ml @ 1,5 ml/h (168 h)', llenado: 250, volumenReal: 252, ritmo: 1.5 },
    custom: { id: 'custom', nombre: 'Personalizado', llenado: 100, volumenReal: 100, ritmo: 2 },
  };

  function resolverInfusor(sel) {
    if (typeof sel === 'string') sel = { id: sel };
    const base = INFUSORES[sel.id];
    if (!base) throw new Error('Infusor desconocido: ' + sel.id);
    const inf = Object.assign({}, base);
    if (sel.id === 'custom') {
      inf.llenado = Number(sel.llenado);
      inf.volumenReal = Number(sel.volumenReal != null && sel.volumenReal !== '' ? sel.volumenReal : sel.llenado);
      inf.ritmo = Number(sel.ritmo);
    }
    if (!(inf.llenado > 0) || !(inf.volumenReal > 0) || !(inf.ritmo > 0)) {
      throw new Error('Volumen y ritmo del infusor deben ser mayores que 0');
    }
    return inf;
  }

  function calcularDuracion(sel) {
    const inf = resolverInfusor(sel);
    const horas = inf.volumenReal / inf.ritmo;
    return { horas, dias: horas / 24, infusor: inf };
  }

  /* ───────────── Fármacos ─────────────
   * Presentaciones comerciales habituales en España (mg totales / ml por ampolla o vial). */
  const FARMACOS = {
    morfina: {
      id: 'morfina', nombre: 'Morfina clorhidrato', unidad: 'mg/día SC',
      presentaciones: [
        { id: 'morfina_1', label: 'Ampolla 1% · 10 mg/1 ml', mg: 10, ml: 1 },
        { id: 'morfina_2', label: 'Ampolla 2% · 40 mg/2 ml', mg: 40, ml: 2 },
        { id: 'morfina_vial', label: 'Vial 20 ml · 400 mg/20 ml', mg: 400, ml: 20 },
      ],
      rescate: { tipo: 'fraccion', fraccion: 1 / 6, intervaloH: 4, indicacion: 'si dolor o disnea' },
    },
    midazolam: {
      id: 'midazolam', nombre: 'Midazolam', unidad: 'mg/día',
      presentaciones: [
        { id: 'mida_5', label: 'Ampolla 5 mg/1 ml', mg: 5, ml: 1 },
        { id: 'mida_15', label: 'Ampolla 15 mg/3 ml', mg: 15, ml: 3 },
        { id: 'mida_50', label: 'Ampolla 50 mg/10 ml', mg: 50, ml: 10 },
      ],
      rescate: { tipo: 'fijo', mgMin: 2.5, mgMax: 5, intervaloH: 4, indicacion: 'si ansiedad, agitación o disnea con pánico' },
    },
    butilescopolamina: {
      id: 'butilescopolamina', nombre: 'Butilescopolamina (Buscapina)', unidad: 'mg/día',
      presentaciones: [{ id: 'busc_20', label: 'Ampolla 20 mg/1 ml', mg: 20, ml: 1 }],
      rescate: { tipo: 'fijo', mgMin: 20, mgMax: 20, intervaloH: 6, indicacion: 'si estertores/secreciones o cólico' },
    },
    haloperidol: {
      id: 'haloperidol', nombre: 'Haloperidol', unidad: 'mg/día',
      presentaciones: [{ id: 'halo_5', label: 'Ampolla 5 mg/1 ml', mg: 5, ml: 1 }],
      rescate: { tipo: 'fijo', mgMin: 1.5, mgMax: 2.5, intervaloH: 6, indicacion: 'si agitación/delirium o náuseas' },
    },
    levomepromazina: {
      id: 'levomepromazina', nombre: 'Levomepromazina (Sinogán)', unidad: 'mg/día',
      presentaciones: [{ id: 'levo_25', label: 'Ampolla 25 mg/1 ml', mg: 25, ml: 1 }],
      rescate: { tipo: 'fijo', mgMin: 6.25, mgMax: 12.5, intervaloH: 6, indicacion: 'si agitación/delirium' },
    },
    dexametasona: {
      id: 'dexametasona', nombre: 'Dexametasona', unidad: 'mg/día',
      presentaciones: [{ id: 'dexa_4', label: 'Ampolla 4 mg/1 ml', mg: 4, ml: 1 }],
      rescate: null,
    },
    metoclopramida: {
      id: 'metoclopramida', nombre: 'Metoclopramida', unidad: 'mg/día',
      presentaciones: [{ id: 'meto_10', label: 'Ampolla 10 mg/2 ml', mg: 10, ml: 2 }],
      rescate: { tipo: 'fijo', mgMin: 10, mgMax: 10, intervaloH: 8, indicacion: 'si náuseas/vómitos' },
    },
  };

  /* Cálculo por fármaco sobre días reales.
   * dosis total = dosis diaria × días; ampollas = ceil; sobrante = ampollas×ml − aspirado. */
  function calcularFarmaco({ farmaco, presentacion, dosisDiaria }, dias) {
    const def = FARMACOS[farmaco];
    if (!def) throw new Error('Fármaco desconocido: ' + farmaco);
    const pres = def.presentaciones.find((p) => p.id === presentacion) || def.presentaciones[0];
    const dosis = Number(dosisDiaria);
    if (!(dosis >= 0) || !isFinite(dosis)) throw new Error('Dosis diaria inválida');
    const totalMg = dosis * dias;
    const concentracion = pres.mg / pres.ml; // mg/ml
    const volumenAspirar = totalMg / concentracion;
    const ampollas = Math.ceil(totalMg / pres.mg - EPS);
    const volumenSobrante = Math.max(0, ampollas * pres.ml - volumenAspirar);
    return {
      farmaco: def.id, nombre: def.nombre, presentacion: pres, dosisDiaria: dosis,
      totalMg, volumenAspirar, ampollas: Math.max(0, ampollas), volumenSobrante,
      rescate: calcularRescate(def, dosis, pres),
    };
  }

  /* Rescate SC: morfina = 1/6 de la dosis diaria SC; resto según pauta habitual SECPAL. */
  function calcularRescate(def, dosisDiaria, pres) {
    const r = def.rescate;
    if (!r) return null;
    const conc = pres.mg / pres.ml;
    let mgMin, mgMax;
    if (r.tipo === 'fraccion') { mgMin = mgMax = dosisDiaria * r.fraccion; }
    else { mgMin = r.mgMin; mgMax = r.mgMax; }
    const mgTxt = mgMin === mgMax ? fmt(mgMin) + ' mg' : fmt(mgMin) + '–' + fmt(mgMax) + ' mg';
    const mlTxt = mgMin === mgMax ? fmt(mgMin / conc) + ' ml' : fmt(mgMin / conc) + '–' + fmt(mgMax / conc) + ' ml';
    const base = r.tipo === 'fraccion' ? '1/6 de la dosis diaria' : 'dosis fija habitual';
    const texto = mgTxt + ' SC (' + mlTxt + ') cada ' + r.intervaloH + ' h ' + r.indicacion +
      '; si precisa >3-4 rescates en 24 h, reevaluar pauta basal · ' + base;
    return { mgMin, mgMax, mlMin: mgMin / conc, mlMax: mgMax / conc, intervaloH: r.intervaloH, texto };
  }

  function fmt(n, d = 2) {
    return Number(round(n, d)).toLocaleString('es-ES', { maximumFractionDigits: d });
  }

  /* ───────────── Semáforo clínico ───────────── */
  const MENSAJE_METADONA =
    'BLOQUEO ÉTICO: la METADONA no se convierte ni se calcula en HYPNOS. Su farmacocinética es no lineal ' +
    '(vida media larga y variable 8–59 h, razón de equianalgesia dependiente de la dosis previa de morfina, ' +
    'tolerancia cruzada incompleta y riesgo de acumulación, depresión respiratoria tardía y prolongación del QTc). ' +
    'Toda conversión o rotación con metadona exige valoración presencial por una unidad de paliativos/dolor.';

  const MENSAJE_ERC =
    'Insuficiencia renal grave/terminal: EVITE la morfina (riesgo de neurotoxicidad por acumulación de los metabolitos M3G/M6G); ' +
    'considere fentanilo o hidromorfona con apoyo de paliativos. Reduzca la dosis de metoclopramida al 50 %.';
  const MENSAJE_OPIOIDE_PREVIO =
    'Paciente con opioides previos: NO inicie morfina naïve estándar. Convierta antes la dosis previa (pestaña 3) o contabilícela en la pauta.';

  function bloqueoMetadona() {
    return { bloqueado: true, nivel: 'rojo', codigo: 'METADONA', mensaje: MENSAJE_METADONA };
  }

  /* entrada: { farmacos:[ids], dias, volumenExcedido:bool, metadona:bool } */
  function evaluarSemaforo(entrada = {}) {
    const ids = entrada.farmacos || [];
    const tiene = (id) => ids.indexOf(id) !== -1;
    const alertas = [];
    if (entrada.metadona) alertas.push({ nivel: 'rojo', codigo: 'METADONA', mensaje: MENSAJE_METADONA });
    if (entrada.renalGrave) alertas.push({ nivel: 'ambar', codigo: 'ERC_GRAVE', mensaje: MENSAJE_ERC });
    if (entrada.volumenExcedido) {
      alertas.push({ nivel: 'rojo', codigo: 'VOLUMEN_EXCEDIDO', mensaje: 'El volumen de fármacos a aspirar supera la capacidad de llenado del infusor. Use presentaciones más concentradas, reduzca dosis o elija un infusor mayor.' });
    }
    if (tiene('dexametasona') && entrada.dias > 1 + EPS) {
      alertas.push({ nivel: 'ambar', codigo: 'DEXA_PROLONGADO', mensaje: 'Dexametasona en infusor prolongado (>24 h): riesgo de precipitación/incompatibilidad y pérdida de estabilidad. Preferible administrarla en bolo SC aparte, una vez al día.' });
    }
    if (tiene('haloperidol') && tiene('levomepromazina')) {
      alertas.push({ nivel: 'ambar', codigo: 'HALO_LEVOME', mensaje: 'Haloperidol + levomepromazina: duplicidad antidopaminérgica (riesgo extrapiramidal, QTc y sedación aditiva). Valore utilizar solo uno.' });
    }
    if (tiene('metoclopramida') && tiene('butilescopolamina')) {
      alertas.push({ nivel: 'ambar', codigo: 'METO_BUSC', mensaje: 'Metoclopramida + butilescopolamina: efectos farmacológicos opuestos (procinético vs. anticolinérgico). Se antagonizan.' });
    }
    const nivel = alertas.some((a) => a.nivel === 'rojo') ? 'rojo' : alertas.length ? 'ambar' : 'verde';
    return {
      nivel,
      alertas,
      apto: nivel === 'verde',
      resumen: nivel === 'rojo' ? 'Alerta roja: no exportar sin resolver' : nivel === 'ambar' ? 'Precaución: revise los avisos' : 'Sin alertas automáticas detectadas · Requiere validación del prescriptor',
    };
  }

  /* Cálculo completo de un infusor. entrada: { infusor: id|{id,llenado,...}, farmacos:[{farmaco,presentacion,dosisDiaria}] } */
  function calcularInfusor({ infusor, farmacos = [] }) {
    const d = calcularDuracion(infusor);
    const filas = farmacos.filter((f) => Number(f.dosisDiaria) > 0).map((f) => calcularFarmaco(f, d.dias));
    const aspirado = filas.reduce((s, f) => s + f.volumenAspirar, 0);
    const excedido = aspirado > d.infusor.llenado + EPS;
    const suero = Math.max(0, d.infusor.llenado - aspirado);
    const volumenFinal = aspirado + suero;
    const semaforo = evaluarSemaforo({ farmacos: filas.map((f) => f.farmaco), dias: d.dias, volumenExcedido: excedido });
    return {
      infusor: d.infusor, horas: d.horas, dias: d.dias, farmacos: filas,
      volumenAspirado: aspirado, volumenExcedido: excedido, suero, volumenFinal, semaforo,
    };
  }

  /* ───────────── Conversor de opioides ─────────────
   * Basado en la tabla de equianalgesia del Anexo 6 (Tabla 1) del Plan de Optimización del uso de
   * opioides (Ministerio de Sanidad, 2024). Factor = mg de morfina oral/día por unidad indicada.
   * Fentanilo TD: 12,5→30 · 25→60 · 50→120 · 75→180 · 100→240 mg/día (2,4 mg por mcg/h).
   * Oral→SC: 50 % (2:1). Verifique siempre contra el documento vigente. */
  const OPIOIDES = {
    // tabla: mg de morfina oral/día [mín, máx] por dosis de parche. Se usa el extremo inferior (criterio prudente).
    fentanilo_td: { id: 'fentanilo_td', nombre: 'Fentanilo transdérmico', unidad: 'mcg/h', factor: 2.4, valores: [12.5, 25, 50, 75, 100],
      tabla: { 12.5: [30, 30], 25: [60, 60], 50: [120, 120], 75: [180, 180], 100: [240, 240] } },
    // verificar:true = factor NO contrastado con el Anexo 6 (valor prudente de práctica habitual). Contrastar antes de uso clínico.
    oxicodona: { id: 'oxicodona', nombre: 'Oxicodona oral', unidad: 'mg/día', factor: 1.5, factorTexto: '1,5–2 (se aplica 1,5)',
      aviso: 'Oxicodona → morfina oral: factor 1,5–2 (se aplica 1,5). Titule con prudencia y reevalúe al paciente.' },
    tapentadol: { id: 'tapentadol', nombre: 'Tapentadol oral', unidad: 'mg/día', factor: 0.33, factorTexto: '0,33–0,4 (se aplica 0,33)',
      aviso: 'Tapentadol: 100 mg ≈ 33–40 mg de morfina oral (se aplica 0,33). Titule con prudencia.' },
    tramadol: { id: 'tramadol', nombre: 'Tramadol oral', unidad: 'mg/día', factor: 0.1, verificar: true },
    hidromorfona: { id: 'hidromorfona', nombre: 'Hidromorfona oral', unidad: 'mg/día', factor: 5, verificar: true },
    // Buprenorfina TD (mg/día de morfina oral): 35 → 60–70, 52,5 → 90–105, 70 → 120–140. Se usa el extremo inferior.
    buprenorfina_td: { id: 'buprenorfina_td', nombre: 'Buprenorfina transdérmica', unidad: 'mcg/h', factor: 60 / 35, verificar: true, valores: [35, 52.5, 70],
      tabla: { 35: [60, 70], 52.5: [90, 105], 70: [120, 140] } },
    morfina_oral: { id: 'morfina_oral', nombre: 'Morfina oral', unidad: 'mg/día', factor: 1 },
    morfina_sc: { id: 'morfina_sc', nombre: 'Morfina subcutánea', unidad: 'mg/día', factor: 2 },
    metadona: { id: 'metadona', nombre: 'Metadona (BLOQUEADA)', unidad: 'mg/día', bloqueado: true },
  };
  const RATIO_ORAL_SC = 0.5;

  /* opciones.reduccion: fracción (0–0,5) por tolerancia cruzada incompleta. */
  function convertirOpioide(id, dosis, opciones = {}) {
    const key = String(id || '').toLowerCase().trim();
    if (/metadon|methadon/.test(key)) return Object.assign({ opioide: 'metadona' }, bloqueoMetadona());
    const op = OPIOIDES[key];
    if (!op) return { error: 'Opioide desconocido: ' + id };
    const d = Number(dosis);
    if (!(d > 0) || !isFinite(d)) return { error: 'Introduzca una dosis mayor que 0' };
    if (op.valores && op.valores.indexOf(d) === -1) {
      return { error: 'Dosis de parche no comercializada. Valores válidos: ' + op.valores.join(', ') + ' ' + op.unidad };
    }
    const reduccion = Math.min(Math.max(Number(opciones.reduccion) || 0, 0), 0.5);
    const rango = op.tabla ? op.tabla[d] : [d * op.factor, d * op.factor];
    const equivalenteBruto = rango[0];
    const morfinaOral = equivalenteBruto * (1 - reduccion);
    const morfinaSC = morfinaOral * RATIO_ORAL_SC;
    return {
      bloqueado: false, verificar: !!op.verificar, opioide: op.id, nombre: op.nombre, dosis: d, unidad: op.unidad,
      reduccion, morfinaOralBruta: equivalenteBruto, morfinaOral, morfinaSC,
      rangoMorfinaOral: rango, factorTexto: op.factorTexto || null, aviso: op.aviso || null,
      rescateSC: morfinaSC / 6, rescateOral: morfinaOral / 6,
      fentaniloTD: fentaniloTDMasCercano(morfinaOral),
    };
  }

  /* Parche de fentanilo inmediatamente igual o inferior a la equivalencia (criterio prudente). */
  function fentaniloTDMasCercano(morfinaOral) {
    const teorico = morfinaOral / OPIOIDES.fentanilo_td.factor;
    const validos = OPIOIDES.fentanilo_td.valores.filter((v) => v <= teorico + EPS);
    return { teorico, parche: validos.length ? validos[validos.length - 1] : null };
  }

  /* ───────────── Modo Guiado SECPAL (5 pasos) ───────────── */
  const GUIA_PASOS = [
    { id: 'contexto', tipo: 'single', titulo: '1 · ¿Cuál es el contexto clínico?', opciones: [
      { valor: 'agonia', label: 'Agonía (últimas horas–días)', desc: 'Deterioro progresivo, somnolencia, oliguria, cambios respiratorios.' },
      { valor: 'refractario', label: 'Síntoma refractario / mal control', desc: 'Sin agonía clara, pero síntoma que no responde a tratamiento habitual.' },
      { valor: 'control', label: 'Control sintomático en situación avanzada', desc: 'Enfermedad avanzada estable o con síntomas nuevos.' },
    ] },
    { id: 'via', tipo: 'single', titulo: '2 · ¿Está disponible la vía oral?', opciones: [
      { valor: 'oral', label: 'Vía oral segura y eficaz', desc: 'Traga sin riesgo de aspiración y no vomita.' },
      { valor: 'sc', label: 'No: vía subcutánea necesaria', desc: 'Disfagia, vómitos, somnolencia o agonía.' },
    ] },
    { id: 'sintomas', tipo: 'multi', titulo: '3 · ¿Qué síntomas predominan? (varios posibles)', opciones: [
      { valor: 'dolor', label: 'Dolor' },
      { valor: 'disnea', label: 'Disnea' },
      { valor: 'agitacion', label: 'Agitación / delirium' },
      { valor: 'estertores', label: 'Estertores / secreciones' },
      { valor: 'nauseas', label: 'Náuseas / vómitos' },
      { valor: 'sedacion', label: 'Sufrimiento refractario que requiere sedación paliativa' },
    ] },
    { id: 'opioide', tipo: 'single', titulo: '4 · ¿Qué opioide toma actualmente?', opciones: [
      { valor: 'naive', label: 'Ninguno (naïve)' },
      { valor: 'previo', label: 'Opioide en tratamiento (no metadona)', desc: 'Convertir con el Conversor oficial (pestaña 3).' },
      { valor: 'metadona', label: 'Metadona', desc: 'Bloqueo ético: no se calcula en HYPNOS.' },
    ] },
    { id: 'renal', tipo: 'single', titulo: '5 · ¿Función renal?', opciones: [
      { valor: 'normal', label: 'Normal o levemente alterada' },
      { valor: 'grave', label: 'Insuficiencia renal grave (FG < 30 ml/min)', desc: 'Los metabolitos de la morfina se acumulan.' },
    ] },
  ];

  /* Devuelve plan orientativo: sugerencias de fármaco con dosis inicial diaria, medidas y bloqueos. */
  function planGuiado(r = {}) {
    const sintomas = r.sintomas || [];
    const sug = {};
    const notas = [];
    const add = (id, dosis, nota) => {
      if (!sug[id]) sug[id] = { farmaco: id, nombre: FARMACOS[id].nombre, dosisDiaria: dosis, notas: [] };
      sug[id].dosisDiaria = Math.max(sug[id].dosisDiaria, dosis);
      if (nota) sug[id].notas.push(nota);
    };
    const bloqueos = [];
    const advertencias = [];
    const metadona = r.opioide === 'metadona';
    const previo = r.opioide === 'previo';
    const destacadas = [];
    const renalGrave = r.renal === 'grave';
    if (metadona) bloqueos.push(bloqueoMetadona());
    if (renalGrave) destacadas.push({ nivel: 'ambar', codigo: 'ERC_GRAVE', mensaje: MENSAJE_ERC });
    if (previo) destacadas.push({ nivel: 'ambar', codigo: 'OPIOIDE_PREVIO', mensaje: MENSAJE_OPIOIDE_PREVIO });

    const morfinaOK = !metadona && !renalGrave;
    const naive = r.opioide === 'naive';

    if (sintomas.indexOf('dolor') !== -1) {
      if (metadona) advertencias.push('Dolor con metadona: no modificar la pauta; contacte con paliativos/unidad del dolor.');
      else if (renalGrave) advertencias.push('Dolor + ERC grave: evite morfina; valore fentanilo o hidromorfona con asesoramiento de la unidad de paliativos.');
      else if (naive) add('morfina', 15, 'Inicio naïve: 2,5 mg SC cada 4 h (15 mg/día) con rescates; titular cada 24 h.');
      else advertencias.push('Opioide previo: convierta a morfina SC en la pestaña 3 y use esa dosis diaria en el infusor.');
    }
    if (sintomas.indexOf('disnea') !== -1) {
      if (morfinaOK && naive) add('morfina', 10, 'Disnea en naïve: dosis bajas (2,5 mg SC/4–6 h) y reevaluar.');
      else if (morfinaOK) advertencias.push('Disnea con opioide previo: aumento gradual del 25–50 % de la dosis basal y reevaluar.');
      else if (renalGrave && !metadona) advertencias.push('Disnea + ERC grave: evite morfina; consulte alternativas.');
      if (r.midazolamDisnea === true) add('midazolam', 10, 'Reservado a disnea con ansiedad/pánico asociado (confirmado).');
    }
    if (sintomas.indexOf('agitacion') !== -1) {
      add('haloperidol', 5, 'Primera línea en delirium. Si no controla, SUSTITUIR por levomepromazina 12,5–25 mg/día (no asociar).');
    }
    if (sintomas.indexOf('estertores') !== -1) {
      add('butilescopolamina', 60, 'Estertores: pauta habitual 60–120 mg/día; medidas posturales y evitar aspiración profunda.');
    }
    if (sintomas.indexOf('nauseas') !== -1) {
      if (sintomas.indexOf('estertores') !== -1) add('haloperidol', 2.5, 'Antiemético elegido (metoclopramida se antagoniza con butilescopolamina).');
      else if (renalGrave) add('metoclopramida', 15, 'ERC grave: dosis reducida al 50 % (15 mg/día). En obstrucción intestinal evitar.');
      else add('metoclopramida', 30, 'Antiemético procinético; en obstrucción intestinal evitar.');
    }
    if (sintomas.indexOf('sedacion') !== -1) {
      add('midazolam', 15, 'Sedación paliativa: solo con síntoma refractario, consentimiento/decisión documentada y consenso de equipo. Inducción con bolos y titulación.');
    }

    const medidas = [];
    if (r.contexto === 'agonia') {
      medidas.push('Retirar fármacos no esenciales; suspender vía oral no segura.');
      medidas.push('Cuidados de boca, posición cómoda, retirar sondas o pruebas innecesarias.');
      medidas.push('Informar a la familia y ofrecer acompañamiento (pestaña 5).');
    }
    if (r.via === 'sc' || r.contexto === 'agonia') medidas.push('Vía subcutánea con palomita (mariposa) en zona torácica/abdominal/muslo; rotar cada 5–7 días o si hay reacción.');
    else medidas.push('Mantener vía oral mientras sea segura.');
    medidas.push('Pautar rescates SC para cada síntoma y reevaluar a las 24 h.');

    const sugerencias = Object.keys(sug).map((k) => sug[k]);
    const semaforo = evaluarSemaforo({ farmacos: sugerencias.map((s) => s.farmaco), dias: 1, metadona, renalGrave });
    return { sugerencias, bloqueos, advertencias, destacadas, medidas, semaforo, ofreceMidazolamDisnea: sintomas.indexOf('disnea') !== -1 };
  }

  /* ───────────── Nota clínica ───────────── */
  const SISTEMAS = {
    mambrino: 'Mambrino XXI (Hospital / SESCAM)',
    turriano: 'Turriano (Atención Primaria / ESAD / SESCAM)'
  };
  const CONTEXTOS = { agonia: 'Situación de agonía', refractario: 'Síntomas refractarios', control: 'Control sintomático en enfermedad avanzada' };

  /* Fecha/hora local del dispositivo (AAAA-MM-DD HH:MM), no UTC. */
  function fechaLocal(f = new Date()) {
    const p = (n) => String(n).padStart(2, '0');
    return f.getFullYear() + '-' + p(f.getMonth() + 1) + '-' + p(f.getDate()) + ' ' + p(f.getHours()) + ':' + p(f.getMinutes());
  }

  /* d.conversion: solo debe pasarse si la conversión fue aplicada/transferida al infusor. */
  function generarNota(d = {}) {
    const L = [];
    const sis = SISTEMAS[d.sistema] || SISTEMAS.mambrino;
    L.push('NOTA CLÍNICA · CUIDADOS PALIATIVOS (' + sis + ')');
    L.push('Fecha: ' + (d.fecha || fechaLocal()) + (d.ambito ? ' · Ámbito: ' + d.ambito : ''));
    if (d.paciente) L.push('Paciente (ident.): ' + d.paciente);
    L.push('');
    L.push('MOTIVO / SITUACIÓN: ' + (CONTEXTOS[d.contexto] || d.contexto || '—'));
    if (d.sintomas) L.push('SÍNTOMAS: ' + d.sintomas);
    if (d.tratamientoPrevio) L.push('TRATAMIENTO PREVIO: ' + d.tratamientoPrevio);
    const r = d.infusor;
    if (r) {
      L.push('');
      L.push('PLAN FARMACOLÓGICO — INFUSOR SC:');
      L.push('- Dispositivo: ' + r.infusor.nombre + ' · duración real ' + fmt(r.horas) + ' h (' + fmt(r.dias) + ' días).');
      r.farmacos.forEach((f) => {
        L.push('- ' + f.nombre + ': ' + fmt(f.dosisDiaria) + ' mg/día → total ' + fmt(f.totalMg) + ' mg = ' + fmt(f.volumenAspirar) + ' ml (' + f.ampollas + ' × ' + f.presentacion.label + '; desechar ' + fmt(f.volumenSobrante) + ' ml).');
      });
      L.push('- Volumen total de fármacos a aspirar: ' + fmt(r.volumenAspirado) + ' ml.');
      L.push('- Suero fisiológico 0,9 % a añadir: ' + fmt(r.suero) + ' ml · volumen final preparado: ' + fmt(r.volumenFinal) + ' ml.');
      L.push(d.conversion && !d.conversion.error && !d.conversion.bloqueado
        ? '- Procedencia de la dosis: conversión de opioides aplicada al infusor.'
        : '- Procedencia de la dosis: prescripción manual directa.');
      const resc = r.farmacos.filter((f) => f.rescate);
      if (resc.length) {
        L.push('RESCATES SC:');
        resc.forEach((f) => L.push('- ' + f.nombre + ': ' + f.rescate.texto));
      }
      L.push('SEMÁFORO DE SEGURIDAD: ' + r.semaforo.nivel.toUpperCase() + (r.semaforo.alertas.length ? ' — ' + r.semaforo.alertas.map((a) => a.codigo).join(', ') : ''));
    }
    if (d.conversion && !d.conversion.error && !d.conversion.bloqueado) {
      const c = d.conversion;
      L.push('');
      L.push('CONVERSIÓN DE OPIOIDES: ' + c.nombre + ' ' + fmt(c.dosis) + ' ' + c.unidad + ' → morfina oral ' + fmt(c.morfinaOral) + ' mg/día → morfina SC ' + fmt(c.morfinaSC) + ' mg/día (rescate ' + fmt(c.rescateSC) + ' mg SC).' + (c.reduccion ? ' Reducción por tolerancia cruzada incompleta: ' + fmt(c.reduccion * 100, 0) + ' %.' : ''));
      if (c.aviso) L.push('AVISO: ' + c.aviso);
    }
    // Dos avisos independientes: la dosis aplicada al infusor puede proceder de otro opioide distinto al de la conversión en pantalla.
    if (d.avisoFactor) L.push('AVISO: ' + d.avisoFactor);
    if (d.conversion && d.conversion.verificar) {
      const av = 'AVISO: factor de conversión de ' + d.conversion.nombre + ' pendiente de verificar frente al Anexo 6 (Ministerio de Sanidad 2024).';
      if (L.indexOf(av) === -1 && !(d.avisoFactor && d.avisoFactor.indexOf(d.conversion.nombre) !== -1)) L.push(av);
    }
    L.push('');
    if (d.informaFamilia) L.push('Se informa a familia/cuidadores de la situación, objetivos y pauta de rescate.');
    if (d.sedacion) L.push('Sedación paliativa: indicación, consentimiento/decisión compartida y consenso de equipo documentados.');
    L.push('Metadona: no prescrita/convertida mediante herramienta (bloqueo ético).');
    if (d.observaciones) L.push('OBSERVACIONES: ' + d.observaciones);
    L.push('Reevaluación en 24 h o antes si mal control. Herramienta de apoyo (HYPNOS v2.0); decisión clínica bajo responsabilidad del facultativo.');
    return L.join('\n');
  }

  /* ───────────── Apoyo a familias ───────────── */
  const FAMILIAS = [
    { pregunta: '¿La inyección lo matará?', respuesta: 'Entendemos que esta sea la mayor preocupación, y es una pregunta muy válida. Los medicamentos que usamos (morfina, midazolam…) se ajustan con cuidado a lo que su familiar necesita para no sufrir: se empieza con dosis bajas y se sube solo si hace falta. Cuando se usan así, no acortan la vida. Lo que está causando el final es la enfermedad, no la medicación. Nuestro objetivo es que esté tranquilo, sin dolor y sin angustia.' },
    { pregunta: '¿Se ahoga con el estertor?', respuesta: 'Ese ruido, como un burbujeo, lo producen las secreciones que ya no puede tragar ni toser. Suele ser más angustioso para quien lo oye que para quien lo tiene: en esta fase la persona está muy dormida y no siente ahogo. Podemos cambiarlo de postura y darle un medicamento que reduce las secreciones. Estamos aquí para ayudarles.' },
    { pregunta: '¿Por qué no come ni bebe?', respuesta: 'Es una parte natural del proceso: el cuerpo ya no necesita ni puede aprovechar la comida. No pasa hambre ni sed de la forma en que nosotros lo imaginamos. Forzar la comida o poner suero puede causarle molestias. Lo que sí le alivia es mantener la boca húmeda con una gasa o esponja y labios hidratados; es una forma preciosa de cuidarle.' },
    { pregunta: '¿Está sufriendo? Duerme mucho.', respuesta: 'Dormir más es normal en los últimos días. Observamos su gesto, su respiración y sus movimientos para saber si está cómodo. Si aparecen señales de dolor o inquietud, se lo diremos y ajustaremos el tratamiento. Puede que le oiga: háblele, tóquele la mano, dígale lo que necesite decirle.' },
    { pregunta: '¿Es lo mismo sedación que eutanasia?', respuesta: 'No. La sedación paliativa se usa solo cuando un síntoma no se controla con otros medios; se ajusta la dosis para aliviar el sufrimiento, no para provocar la muerte. La eutanasia busca terminar con la vida de forma intencionada. Nunca se sedará sin explicarles antes la situación y sin su acuerdo o el de su familiar cuando sea posible.' },
    { pregunta: '¿Qué pasa si se nota peor de madrugada?', respuesta: 'No están solos. Tienen un plan escrito con los pasos a seguir y un teléfono de contacto del equipo. Si su familiar tiene dolor, se agita o le falta el aire, pueden poner la dosis de rescate que les hemos dejado pautada y llamarnos. Pedir ayuda nunca es molestar.' },
  ];

  const RESCATE_SC_PASOS = [
    'Lávese las manos y compruebe en la hoja de pauta escrita por el equipo qué medicamento y qué dosis corresponden a ese síntoma. Solo la dosis pautada.',
    'Compruebe la hora de la última dosis de rescate; respete el intervalo indicado por el equipo.',
    'Prepare la jeringa con la dosis indicada (ml, no “mg”) y limpie con alcohol el conector de la palomita.',
    'Inyecte lentamente por el conector de goma de la palomita subcutánea. No necesita pinchar de nuevo al paciente.',
    'Anote la hora, el medicamento y la dosis.',
    'Reevalúe a los 20–30 minutos. Si el síntoma no mejora o se repite varias veces, llame al equipo.',
    'Llame al teléfono de guardia si: dolor intenso, ahogo, agitación que no cede, sangrado, la palomita se sale/enrojece o tiene dudas.',
  ];

  return {
    INFUSORES, FARMACOS, OPIOIDES, GUIA_PASOS, FAMILIAS, RESCATE_SC_PASOS, MENSAJE_METADONA,
    round, fmt, resolverInfusor, calcularDuracion, calcularFarmaco, calcularRescate, calcularInfusor,
    evaluarSemaforo, bloqueoMetadona, fechaLocal, convertirOpioide, fentaniloTDMasCercano, planGuiado, generarNota,
  };
});
