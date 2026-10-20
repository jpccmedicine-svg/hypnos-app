/* HYPNOS 2.2 — Motor algorítmico y de lógica clínica.
 * Sin dependencias. Funciona en navegador (window.HypnosEngine) y Node (require).
 * Herramienta de apoyo a la decisión: NO sustituye el juicio clínico. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.HypnosEngine = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const VERSION = '2.2';
  const AUTOR = 'JP';
  const CONTACTO_EMAIL = 'jpccmedicine@gmail.com';
  const EPS = 1e-9;
  const FLOAT_TOL = Number.EPSILON * 16;
  const MAX_PARCHES_SIMULTANEOS = 10;
  const round = (n, d = 2) => Math.round((n + Number.EPSILON) * Math.pow(10, d)) / Math.pow(10, d);

  function fmt(n, dec = 2) {
    if (!Number.isFinite(n)) return '—';
    if (n === 0) return '0';
    let d = dec;
    let r = round(n, d);
    if (r === 0 && Math.abs(n) > 0) {
      d = Math.min(6, Math.max(dec, Math.ceil(-Math.log10(Math.abs(n))) + 1));
      r = round(n, d);
      if (r === 0) return n > 0 ? '< 0,000001' : '> -0,000001';
    }
    return r.toLocaleString('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: d });
  }

  /* ───────────── Fuentes clínicas y técnicas registradas ───────────── */
  const FUENTES_CLINICAS = {
    aemps_fentanilo_69733: {
      organismo: 'AEMPS / CIMA',
      titulo: 'Ficha Técnica Fentanilo Matrix Sandoz 12/25/50/75/100 µg/h parches transdérmicos EFG (reg. 69733)',
      secciones: 'Secciones 1, 2 y 4.2 (Posología, conversión y discontinuación)',
      fechaRevision: 'Mayo 2025',
      fechaConsulta: '2026-10-20',
      url: 'https://cima.aemps.es/cima/dochtml/ft/69733/FichaTecnica_69733.html',
      ambito: 'España — presentaciones verificadas 12 (liberación real 12,5), 25, 50, 75 y 100 µg/h; combinación de varios parches para >100 µg/h; Tabla 1/Tabla 2 unidireccionales (hacia fentanilo TD) que NO deben invertirse para rotar desde fentanilo TD hacia otros opioides; caída sérica lenta tras retirada (≥20 h para caer un 50 %).',
    },
    minsanidad_opioides_2024: {
      organismo: 'Ministerio de Sanidad (SNS, España)',
      titulo: 'Documentos de apoyo al Plan de optimización de la utilización de analgésicos opioides — Anexos 4, 5 y 6 (Tabla 1 de equivalencia orientativa a morfina oral)',
      fechaRevision: '2024',
      fechaConsulta: '2026-10-20',
      url: 'https://www.sanidad.gob.es/areas/farmacia/publicaciones/planOptimizacion/docs/opioides/Documentos_de_apoyo_al_Plan._Uso_de_opioides_para_dolor_cronico_no_oncologico.pdf',
      ambito: 'España — equivalencia descriptiva orientativa a morfina oral (fentanilo TD: 2,4 mg morfina oral/24 h por cada 1 µg/h, tabulada hasta 150 µg/h = 360 mg/24 h) y recomendación en rotación clínica de reducir un 25–50 % por tolerancia cruzada incompleta (Anexo 5).',
    },
    secpal_guia_paliativos: {
      organismo: 'Ministerio de Sanidad (SNS, España) — GuíaSalud',
      titulo: 'Guía de Práctica Clínica sobre Atención Paliativa al Adulto en Situación de Últimos Días (Avalia-t, 2021) y Guía de Práctica Clínica sobre Cuidados Paliativos en el SNS (OSTEBA Nº 2006/08, 2008)',
      secciones: 'GPC OSTEBA 2008: §6.2 Tratamiento del dolor, §6.4.1 Disnea, §6.5.1 Delirium, §6.5.3 Ansiedad, §6.6.6 Náuseas y vómitos, §9.3.6 Estertores premortem, §10.2.4 Sedación paliativa, Anexo 5 (Vademécum), Anexo 6 (Administración de fármacos por vía subcutánea en cuidados paliativos, p. 271) y Anexo 7 (Dosificación de opioides en el dolor, p. 275); complementada por GPC Avalia-t 2021 sobre atención paliativa en situación de últimos días',
      fechaRevision: 'GPC OSTEBA 2008 (más de 5 años desde publicación; pendiente de actualización en GuíaSalud) / GPC Avalia-t 2021 (vigente)',
      fechaConsulta: '2026-10-20',
      url: 'https://portal.guiasalud.es/wp-content/uploads/2018/12/GPC_428_Paliativos_Osteba_compl.pdf',
      urlComplementaria: 'https://portal.guiasalud.es/wp-content/uploads/2022/01/gpc_612_atencion_paliativa_avaliat_compl_.pdf',
      ambito: 'España — perfusión subcutánea continua mediante infusor elastomérico (Anexo 6), ratio morfina oral:SC = 2:1 (50 %, Anexo 7), dosis de rescate 1/6 de la dosis diaria total cada 4 h y educación a familias en mililitros (ml).',
    },
    bbraun_easypump_ii: {
      organismo: 'B. Braun',
      titulo: 'Easypump® II ST/LT Elastomeric Infusion Pump — Order Sheet, Over- and Underfilling & Delivery Times',
      fechaRevision: 'Vigente',
      fechaConsulta: '2026-10-20',
      url: 'https://cloud-bbraun-com.dispatcher.dev.cw.bbraun.com/content/dam/catalog/bbraun/bbraunProductCatalog/S/AEM2015/en-01/b5/easypump-ii-ordersheet.pdf',
      ambito: 'Parámetros verificados en hojas técnicas B. Braun (Order Sheet y Over- and Underfilling): LT 60-30-S (ref. 4540010: nominal 60 ml, 2,0 ml/h, 30 h, rango de llenado admitido 20–60 ml, precisión ±15 %; preparado a 48 ml proporciona 24 h) y LT 100-50-S (ref. 4540016: nominal 100 ml, 2,0 ml/h, 50 h, rango de llenado admitido 40–125 ml, precisión ±15 %).',
    },
    nipro_surefuser: {
      organismo: 'Nipro',
      titulo: 'Surefuser™+ Variable and Continuous Elastomeric Infusion System Brochure (MM-1654, pp. 3–4)',
      fechaRevision: 'Febrero 2025 (MM-1654)',
      fechaConsulta: '2026-10-20',
      url: 'https://nipro-group.picturepark.com/v/QpF3WHTQ/B4F1A04743A21B8B22B5F5CF6983179BE5CD0CD0.pdf',
      ambito: 'Parámetros verificados en catálogo oficial Nipro Surefuser™+: SFS-2-25P-EJ (p. 3, Long-term Continuous Infusion: 250 ml nominales @ 2,0 ml/h, 5 días 5 h = 125 h, regulador amarillo, precisión ±10 %) y SMA-123-10P-EJ (p. 4, Variable Infusion: 100 ml nominales con selector regulado a 1,0 ml/h → 4 días 4 h = 100 h, regulador verde, precisión ±15 %).',
    },
    baxter_infusor: {
      organismo: 'Baxter',
      titulo: 'Baxter Elastomeric Products Healthcare Professional Guide (pp. 15–16, ANZ/35/17-0006)',
      fechaRevision: 'Vigente',
      fechaConsulta: '2026-10-20',
      url: 'https://www.baxterprofessional.com.au/system/files/2018-03/ElastomericProducts_ProfessionalGuide.pdf',
      ambito: 'Parámetros verificados en guía oficial Baxter (pp. 15–16): Small Volume Infusor (Folfusor) SV2.5 ref. 2C4711K (p. 16: 120 ml nominales, mín. 108 ml, máx. 121 ml, 2,5 ml/h, 2 días = 48 h, ±10 %), Large Volume Infusor LV2 ref. 2C1008KP (p. 15: 240 ml nominales, mín. 216 ml, máx. 300 ml, 2,0 ml/h, 5 días = 120 h, ±10 %) y Large Volume Infusor LV1.5 ref. 2C1087KP (p. 15: 252 ml nominales, mín. 227 ml, máx. 300 ml, 1,5 ml/h, 7 días = 168 h, ±10 %). El código 2C1009KP es LV5 (5,0 ml/h, 2 días = 48 h con 240 ml).',
    },
  };

  /* ───────────── Infusores ─────────────
   * Todos los modelos activos del catálogo tienen:
   * - Referencia comercial y límites verificados en la documentación oficial del fabricante (Baxter, B. Braun, Nipro).
   * - Coherencia física estricta entre volumen preparado y administrado: `volumenReal === llenado`
   *   (no se calcula dosis ni duración para un volumen distinto del que realmente se prepara). */
  const INFUSORES = {
    dia_48: {
      id: 'dia_48',
      nombre: 'Easypump® II LT 60-30-S (llenado 48 ml · 24 h) · 48 ml @ 2 ml/h',
      fabricante: 'B. Braun (Easypump® II LT 60-30-S · ref. 4540010, llenado parcial 48 ml en rango 20–60 ml)',
      referenciaFabricante: '4540010',
      verificadoFabricante: true,
      llenado: 48,
      llenadoMin: 20,
      maxLlenado: 60,
      volumenReal: 48,
      ritmo: 2,
      minRitmo: 2,
      maxRitmo: 2,
      precisionPct: 15,
      diasCategoria: 1,
      etiquetaCorta: 'Volumen: 48 ml · Caudal: 2 ml/h (24 h)',
      fuente: 'B. Braun Easypump® II Order Sheet & Over-/Underfilling (ref. 4540010): modelo LT 60-30-S con rango de llenado admitido por el fabricante de 20 a 60 ml y caudal nominal 2,0 ml/h (±15 %); preparado a 48 ml proporciona 24 h (1,00 día).',
    },
    easypump_60_30: {
      id: 'easypump_60_30',
      nombre: 'Easypump® II LT 60-30-S · 60 ml @ 2 ml/h (30 h)',
      fabricante: 'B. Braun (Easypump® II LT 60-30-S · ref. 4540010)',
      referenciaFabricante: '4540010',
      verificadoFabricante: true,
      llenado: 60,
      llenadoMin: 20,
      maxLlenado: 60,
      volumenReal: 60,
      ritmo: 2,
      minRitmo: 2,
      maxRitmo: 2,
      precisionPct: 15,
      diasCategoria: 1,
      etiquetaCorta: 'Volumen: 60 ml · Caudal: 2 ml/h (30 h)',
      fuente: 'B. Braun Easypump® II Order Sheet & Over-/Underfilling (ref. 4540010): llenado nominal 60 ml (rango 20–60 ml), caudal nominal 2,0 ml/h, duración nominal 30 h (1,25 d), precisión ±15 %.',
    },
    dia_2: {
      id: 'dia_2',
      nombre: 'Easypump® II LT 100-50-S · 100 ml @ 2 ml/h (50 h)',
      fabricante: 'B. Braun (Easypump® II LT 100-50-S · ref. 4540016)',
      referenciaFabricante: '4540016',
      verificadoFabricante: true,
      llenado: 100,
      llenadoMin: 40,
      maxLlenado: 125,
      volumenReal: 100,
      ritmo: 2,
      minRitmo: 2,
      maxRitmo: 2,
      precisionPct: 15,
      diasCategoria: 2,
      etiquetaCorta: 'Volumen: 100 ml · Caudal: 2 ml/h (50 h)',
      fuente: 'B. Braun Easypump® II Order Sheet & Over-/Underfilling (ref. 4540016): llenado nominal 100 ml (rango admitido 40–125 ml; esta pauta prepara 100 ml nominales), caudal 2,0 ml/h, duración 50 h, precisión ±15 %.',
    },
    baxter_sv2_5_2d: {
      id: 'baxter_sv2_5_2d',
      nombre: 'Baxter Folfusor SV2.5 2 días · 120 ml @ 2,5 ml/h (48 h)',
      fabricante: 'Baxter (Small Volume Infusor / Folfusor SV2.5 · ref. 2C4711K)',
      referenciaFabricante: '2C4711K',
      verificadoFabricante: true,
      llenado: 120,
      llenadoMin: 108,
      maxLlenado: 121,
      volumenReal: 120,
      ritmo: 2.5,
      minRitmo: 2.5,
      maxRitmo: 2.5,
      precisionPct: 10,
      diasCategoria: 2,
      etiquetaCorta: 'Volumen: 120 ml · Caudal: 2,5 ml/h (48 h)',
      fuente: 'Baxter Elastomeric Products Professional Guide (p. 16, Small Volume Infusor / Folfusor SV2.5, ref. 2C4711K): llenado nominal 120 ml (mín. 108 ml, máx. 121 ml), caudal 2,5 ml/h, duración 48 h (2,00 días, rango aceptable 43,4–53,2 h), precisión ±10 %.',
    },
    sfs1: {
      id: 'sfs1',
      nombre: 'Surefuser™+ SMA-123-10P-EJ (a 1 ml/h) · 100 ml @ 1 ml/h (100 h)',
      fabricante: 'Nipro (Surefuser™+ Variable SMA-123-10P-EJ regulado a 1,0 ml/h)',
      referenciaFabricante: 'SMA-123-10P-EJ',
      verificadoFabricante: true,
      llenado: 100,
      llenadoMin: 100,
      maxLlenado: 100,
      volumenReal: 100,
      ritmo: 1,
      minRitmo: 1,
      maxRitmo: 3,
      precisionPct: 15,
      diasCategoria: 4,
      etiquetaCorta: 'Volumen: 100 ml · Caudal: 1 ml/h (100 h)',
      fuente: 'Catálogo Nipro Surefuser™+ (p. 4, Variable Infusion, ref. SMA-123-10P-EJ): llenado nominal 100 ml, selector de caudal regulado a 1,0 ml/h (rango del dispositivo 1–3 ml/h), duración máxima 4 días 4 h (100 h / 4,17 días), regulador verde, precisión ±15 %.',
    },
    sfs2_250: {
      id: 'sfs2_250',
      nombre: 'Surefuser™+ SFS-2-25P-EJ · 250 ml @ 2 ml/h (125 h)',
      fabricante: 'Nipro (Surefuser™+ SFS-2-25P-EJ)',
      referenciaFabricante: 'SFS-2-25P-EJ',
      verificadoFabricante: true,
      llenado: 250,
      llenadoMin: 250,
      maxLlenado: 250,
      volumenReal: 250,
      ritmo: 2,
      minRitmo: 2,
      maxRitmo: 2,
      precisionPct: 10,
      diasCategoria: 5,
      etiquetaCorta: 'Volumen: 250 ml · Caudal: 2 ml/h (125 h)',
      fuente: 'Catálogo Nipro Surefuser™+ (p. 3, Long-term Continuous Infusion, ref. SFS-2-25P-EJ): llenado nominal 250 ml, caudal medio 2,0 ml/h, duración 5 días 5 h (125 h / 5,21 días), regulador amarillo, precisión ±10 %.',
    },
    baxter_lv2_5d: {
      id: 'baxter_lv2_5d',
      nombre: 'Baxter Infusor LV2 5 días · 240 ml @ 2 ml/h (120 h)',
      fabricante: 'Baxter (Large Volume Infusor LV2 · ref. 2C1008KP)',
      referenciaFabricante: '2C1008KP',
      verificadoFabricante: true,
      llenado: 240,
      llenadoMin: 216,
      maxLlenado: 300,
      volumenReal: 240,
      ritmo: 2,
      minRitmo: 2,
      maxRitmo: 2,
      precisionPct: 10,
      diasCategoria: 5,
      etiquetaCorta: 'Volumen: 240 ml · Caudal: 2 ml/h (120 h)',
      fuente: 'Baxter Elastomeric Products Professional Guide (p. 15, Large Volume Infusor LV2, ref. 2C1008KP): llenado nominal 240 ml (mín. 216 ml, máx. 300 ml; esta pauta prepara 240 ml nominales), caudal 2,0 ml/h, duración 5 días (120 h, rango aceptable 109,1–133,3 h), precisión ±10 %.',
    },
    dia_7: {
      id: 'dia_7',
      nombre: 'Baxter Infusor LV1.5 7 días · 252 ml @ 1,5 ml/h (168 h)',
      fabricante: 'Baxter (Large Volume Infusor LV1.5 · ref. 2C1087KP)',
      referenciaFabricante: '2C1087KP',
      verificadoFabricante: true,
      llenado: 252,
      llenadoMin: 227,
      maxLlenado: 300,
      volumenReal: 252,
      ritmo: 1.5,
      minRitmo: 1.5,
      maxRitmo: 1.5,
      precisionPct: 10,
      diasCategoria: 7,
      etiquetaCorta: 'Volumen: 252 ml · Caudal: 1,5 ml/h (168 h)',
      fuente: 'Baxter Elastomeric Products Professional Guide (p. 15, Large Volume Infusor LV1.5, ref. 2C1087KP): llenado nominal 252 ml (mín. 227 ml, máx. 300 ml; esta pauta prepara 252 ml nominales), caudal 1,5 ml/h, duración 7 días (168 h, rango aceptable 152,7–186,7 h), precisión ±10 %.',
    },
    custom: {
      id: 'custom',
      nombre: 'Personalizado (verificar ficha del fabricante)',
      fabricante: 'Definido manualmente por el usuario (sin ficha de fabricante vinculada)',
      referenciaFabricante: null,
      verificadoFabricante: false,
      llenado: 100,
      llenadoMin: 10,
      maxLlenado: 300,
      volumenReal: 100,
      ritmo: 2,
      minRitmo: 0.5,
      maxRitmo: 10,
      precisionPct: 15,
      diasCategoria: null,
      etiquetaCorta: 'Personalizado',
      fuente: 'Parámetros manuales: el motor solo comprueba coherencia aritmética general y NO acredita compatibilidad con un modelo comercial concreto.',
    },
  };

  /* IDs heredados de versiones previas retirados por discrepancia con catálogos oficiales o incoherencia de volumen */
  const INFUSORES_BLOQUEADOS = {
    baxter_2c1009k:
      'Referencia Baxter 2C1009K/2C1009KP bloqueada por seguridad: en la guía oficial de Baxter (Elastomeric Products Professional Guide, p. 15) corresponde al modelo LV5 de 5,0 ml/h (240 ml / 48 h), NO a un infusor de 2,0 ml/h. Prepararla como 2 ml/h multiplicaría por 2,5 la velocidad de administración. Para 2 días seleccione Easypump® II LT 100-50-S (dia_2, ref. 4540016) o Baxter Folfusor SV2.5 (baxter_sv2_5_2d, ref. 2C4711K).',
    sfs2_252:
      'Perfil heredado sfs2_252 retirado por seguridad: calculaba dosis para 252 ml (126 h) diluyendo hasta 250 ml (125 h). En el catálogo oficial Nipro Surefuser™+ (p. 3), el modelo SFS-2-25P-EJ es de 250 ml @ 2,0 ml/h (125 h, id "sfs2_250").',
    dia_60:
      'Perfil heredado dia_60 (60 ml @ 2,5 ml/h) retirado por no contar con referencia respaldada en los catálogos verificados (B. Braun enumera LT 60-12-S a 5 ml/h y LT 60-30-S a 2 ml/h). Utilice B. Braun Easypump® II LT 60-30-S (ref. 4540010) a 48 ml (dia_48, 24 h) o a 60 ml nominales (easypump_60_30, 30 h).',
  };

  /* Límites operativos para validación de dispositivos y entradas personalizadas */
  const LIMITES_INFUSOR_FABRICANTE = {
    llenadoMin: 10,
    llenadoMax: 300,
    ritmoMin: 0.5,
    ritmoMax: 10,
  };

  function resolverInfusor(sel) {
    if (typeof sel === 'string') sel = { id: sel };
    if (!sel || typeof sel !== 'object') throw new Error('Infusor inválido');
    const idKey = String(sel.id || '').trim();
    if (INFUSORES_BLOQUEADOS[idKey]) {
      throw new Error(INFUSORES_BLOQUEADOS[idKey]);
    }
    const base = INFUSORES[idKey];
    if (!base) throw new Error('Infusor desconocido: ' + sel.id);
    const inf = Object.assign({}, base);
    if (sel.id === 'custom') {
      inf.llenado = Number(sel.llenado);
      const tieneVolReal = sel.volumenReal != null && sel.volumenReal !== '';
      inf.volumenReal = tieneVolReal ? Number(sel.volumenReal) : inf.llenado;
      inf.ritmo = Number(sel.ritmo);
      if (sel.llenadoMin != null) inf.llenadoMin = Number(sel.llenadoMin);
      if (sel.maxLlenado != null) inf.maxLlenado = Number(sel.maxLlenado);
      if (sel.minRitmo != null) inf.minRitmo = Number(sel.minRitmo);
      if (sel.maxRitmo != null) inf.maxRitmo = Number(sel.maxRitmo);
    }
    if (!Number.isFinite(inf.llenado) || !(inf.llenado > 0) ||
        !Number.isFinite(inf.volumenReal) || !(inf.volumenReal > 0) ||
        !Number.isFinite(inf.ritmo) || !(inf.ritmo > 0)) {
      throw new Error('Volumen y ritmo del infusor deben ser mayores que 0');
    }
    const minLlenado = inf.llenadoMin != null ? inf.llenadoMin : LIMITES_INFUSOR_FABRICANTE.llenadoMin;
    const maxLlenado = inf.maxLlenado != null ? inf.maxLlenado : LIMITES_INFUSOR_FABRICANTE.llenadoMax;
    const minRitmo = inf.minRitmo != null ? inf.minRitmo : LIMITES_INFUSOR_FABRICANTE.ritmoMin;
    const maxRitmo = inf.maxRitmo != null ? inf.maxRitmo : LIMITES_INFUSOR_FABRICANTE.ritmoMax;

    if (inf.llenado < minLlenado - EPS || inf.llenado > maxLlenado + EPS) {
      throw new Error(`Volumen de llenado (${fmt(inf.llenado)} ml) fuera de los límites admitidos (${fmt(minLlenado)}–${fmt(maxLlenado)} ml).`);
    }
    if (inf.ritmo < minRitmo - EPS || inf.ritmo > maxRitmo + EPS) {
      throw new Error(`Caudal (${fmt(inf.ritmo)} ml/h) fuera de los límites admitidos (${fmt(minRitmo)}–${fmt(maxRitmo)} ml/h).`);
    }
    if (Math.abs(inf.volumenReal - inf.llenado) > EPS) {
      throw new Error(
        `Volumen real (${fmt(inf.volumenReal)} ml) incoherente con el volumen de llenado a preparar (${fmt(inf.llenado)} ml): ` +
        'deben coincidir para no calcular dosis y duración sobre un volumen distinto del que se prepara.'
      );
    }
    return inf;
  }

  function calcularDuracion(sel) {
    const inf = resolverInfusor(sel);
    const horas = inf.volumenReal / inf.ritmo;
    return { horas, dias: horas / 24, infusor: inf };
  }

  /* ───────────── Fármacos ─────────────
   * Presentaciones comerciales verificadas en España (AEMPS/CIMA):
   * - Morfina B. Braun 10 mg/1 ml (reg. 42221), 40 mg/2 ml (reg. 42592), Morfina B. Braun 20 mg/ml solución inyectable en vial de 20 ml · 400 mg/20 ml (reg. 82749).
   * - Midazolam Serraclinics 5 mg/1 ml (reg. 65314), Midazolam Normon 15 mg/3 ml y 50 mg/10 ml (reg. 65796).
   * - Butilescopolamina Kalceks 20 mg/1 ml (reg. 86236).
   * - Haloperidol Esteve 5 mg/1 ml (reg. 58345).
   * - Levomepromazina Sinogan 25 mg/1 ml (reg. 32262).
   * - Dexametasona Fortecortín 4 mg/1 ml (reg. 36225).
   * - Metoclopramida Primperan 10 mg/2 ml (reg. 40256). */
  const FARMACOS = {
    morfina: {
      id: 'morfina', nombre: 'Morfina clorhidrato', unidad: 'mg/día SC',
      presentaciones: [
        { id: 'morfina_1', label: 'Ampolla 1% · 10 mg/1 ml', mg: 10, ml: 1, envase: 'ampolla', cima: '42221' },
        { id: 'morfina_2', label: 'Ampolla 2% · 40 mg/2 ml', mg: 40, ml: 2, envase: 'ampolla', cima: '42592' },
        { id: 'morfina_vial', label: 'Vial 2% · 400 mg/20 ml', mg: 400, ml: 20, envase: 'vial', cima: '82749' },
      ],
      rescate: { tipo: 'fraccion', fraccion: 1 / 6, intervaloH: 4, indicacion: 'si dolor o disnea' },
    },
    midazolam: {
      id: 'midazolam', nombre: 'Midazolam', unidad: 'mg/día',
      presentaciones: [
        { id: 'mida_5', label: 'Ampolla 5 mg/1 ml', mg: 5, ml: 1, envase: 'ampolla', cima: '65314' },
        { id: 'mida_15', label: 'Ampolla 15 mg/3 ml', mg: 15, ml: 3, envase: 'ampolla', cima: '65796' },
        { id: 'mida_50', label: 'Ampolla 50 mg/10 ml', mg: 50, ml: 10, envase: 'ampolla', cima: '65796' },
      ],
      rescate: { tipo: 'fijo', mgMin: 2.5, mgMax: 5, intervaloH: 4, indicacion: 'si ansiedad, agitación o disnea con pánico' },
    },
    butilescopolamina: {
      id: 'butilescopolamina', nombre: 'Butilescopolamina (Buscapina)', unidad: 'mg/día',
      presentaciones: [{ id: 'busc_20', label: 'Ampolla 20 mg/1 ml', mg: 20, ml: 1, envase: 'ampolla', cima: '86236' }],
      rescate: { tipo: 'fijo', mgMin: 20, mgMax: 20, intervaloH: 6, indicacion: 'si estertores/secreciones o cólico' },
    },
    haloperidol: {
      id: 'haloperidol', nombre: 'Haloperidol', unidad: 'mg/día',
      presentaciones: [{ id: 'halo_5', label: 'Ampolla 5 mg/1 ml', mg: 5, ml: 1, envase: 'ampolla', cima: '58345' }],
      rescate: { tipo: 'fijo', mgMin: 1.5, mgMax: 2.5, intervaloH: 6, indicacion: 'si agitación/delirium o náuseas' },
    },
    levomepromazina: {
      id: 'levomepromazina', nombre: 'Levomepromazina (Sinogán)', unidad: 'mg/día',
      presentaciones: [{ id: 'levo_25', label: 'Ampolla 25 mg/1 ml', mg: 25, ml: 1, envase: 'ampolla', cima: '32262' }],
      rescate: { tipo: 'fijo', mgMin: 6.25, mgMax: 12.5, intervaloH: 6, indicacion: 'si agitación/delirium' },
    },
    dexametasona: {
      id: 'dexametasona', nombre: 'Dexametasona', unidad: 'mg/día',
      presentaciones: [{ id: 'dexa_4', label: 'Ampolla 4 mg/1 ml', mg: 4, ml: 1, envase: 'ampolla', cima: '36225' }],
      rescate: null,
    },
    metoclopramida: {
      id: 'metoclopramida', nombre: 'Metoclopramida', unidad: 'mg/día',
      presentaciones: [{ id: 'meto_10', label: 'Ampolla 10 mg/2 ml', mg: 10, ml: 2, envase: 'ampolla', cima: '40256' }],
      rescate: { tipo: 'fijo', mgMin: 10, mgMax: 10, intervaloH: 8, indicacion: 'si náuseas/vómitos' },
    },
  };

  function resolverPresentacion(farmacoId, presId) {
    const f = FARMACOS[farmacoId];
    if (!f) throw new Error('Fármaco desconocido: ' + farmacoId);
    const p = presId ? f.presentaciones.find((x) => x.id === presId) : f.presentaciones[0];
    if (!p) throw new Error('Presentación desconocida: ' + presId);
    return { farmaco: f, presentacion: p };
  }

  /* Calcula para un fármaco: mg totales, ml a incorporar al infusor, envases enteros a abrir y sobrante.
   * Redondear envases hacia arriba NUNCA modifica el volumen ni la dosis a incorporar. */
  function calcularFarmaco(item, dias) {
    const { farmaco, presentacion } = resolverPresentacion(item.farmaco, item.presentacion);
    const dosisDiaria = Number(item.dosisDiaria);
    if (!(dosisDiaria > 0) || !Number.isFinite(dosisDiaria)) {
      throw new Error('Dosis diaria inválida para ' + farmaco.nombre);
    }
    if (!(dias > 0) || !Number.isFinite(dias)) {
      throw new Error('Duración en días inválida');
    }
    const concentracion = presentacion.mg / presentacion.ml; // mg/ml
    const totalMg = dosisDiaria * dias;
    const volumenAspirar = totalMg / concentracion;
    // Envases enteros hacia arriba usando el volumen exacto requerido frente al volumen utilizable del envase.
    // Se resta únicamente FLOAT_TOL (16 * Number.EPSILON) para evitar que un múltiplo exacto en IEEE-754 sume un envase extra.
    const ratioEnvases = volumenAspirar / presentacion.ml;
    const ampollas = Math.max(1, Math.ceil(ratioEnvases - FLOAT_TOL));
    const volumenTotalAmpollas = ampollas * presentacion.ml;
    const volumenSobrante = Math.max(0, round(volumenTotalAmpollas - volumenAspirar, 4));
    const sobraContenido = volumenSobrante > 1e-6;
    const tipoEnvase = presentacion.envase || (/vial/i.test(presentacion.label) ? 'vial' : 'ampolla');
    const etiquetaEnvases = tipoEnvase === 'vial'
      ? (ampollas === 1 ? '1 vial' : ampollas + ' viales')
      : (ampollas === 1 ? '1 ampolla' : ampollas + ' ampollas');

    let rescate = null;
    if (farmaco.rescate) {
      const r = farmaco.rescate;
      const h = r.intervaloH;
      if (r.tipo === 'fraccion') {
        const mg = dosisDiaria * r.fraccion;
        const ml = mg / concentracion;
        rescate = {
          mgMin: mg, mgMax: mg, mlMin: ml, mlMax: ml, intervaloH: h,
          texto: `${fmt(mg)} mg SC (${fmt(ml)} ml) cada ${h} h ${r.indicacion}; si precisa >3-4 rescates en 24 h, reevaluar pauta basal · 1/6 de la dosis diaria`,
        };
      } else {
        const mlMin = r.mgMin / concentracion;
        const mlMax = r.mgMax / concentracion;
        const rangoMg = r.mgMin === r.mgMax ? `${fmt(r.mgMin)} mg` : `${fmt(r.mgMin)}–${fmt(r.mgMax)} mg`;
        const rangoMl = r.mgMin === r.mgMax ? `${fmt(mlMin)} ml` : `${fmt(mlMin)}–${fmt(mlMax)} ml`;
        rescate = {
          mgMin: r.mgMin, mgMax: r.mgMax, mlMin, mlMax, intervaloH: h,
          texto: `${rangoMg} SC (${rangoMl}) cada ${h} h ${r.indicacion}`,
        };
      }
    }

    return {
      farmaco: farmaco.id,
      nombre: farmaco.nombre,
      presentacion,
      tipoEnvase,
      concentracion,
      dosisDiaria,
      totalMg,
      volumenAspirar,
      volumenIncorporar: volumenAspirar,
      ampollas,
      envases: ampollas,
      etiquetaEnvases,
      textoAnadir: `Añadir al infusor: ${fmt(volumenAspirar)} ml`,
      textoAbrir: `Abrir: ${ampollas} ${tipoEnvase === 'vial' ? (ampollas === 1 ? 'vial' : 'viales') : 'ampollas'}`,
      sobraContenido,
      notaSobrante: sobraContenido ? 'Puede sobrar contenido' : null,
      volumenTotalAmpollas,
      volumenSobrante,
      rescate,
    };
  }

  /* ───────────── Filtrado de infusores compatibles (HYP-002) ─────────────
   * Filtra los modelos registrados en INFUSORES según:
   * 1. Duración seleccionada en días (`dias`, p. ej. 1, 2, 4, 5, 7).
   * 2. Límites de volumen nominal y caudal del fabricante.
   * 3. Volumen total de fármacos requerido (`volumenMinimo` o calculado desde `farmacos`),
   *    descartando dispositivos cuyo volumen de llenado sea insuficiente (`volumenFarmacos > inf.llenado`).
   * Devuelve:
   * - `compatibles`: lista de modelos compatibles con etiquetas breves (`etiquetaCorta`).
   * - `unico`: true si queda exactamente 1 modelo compatible inequívoco.
   * - `autoseleccionado`: el modelo cuando `unico === true`, o `null` en caso contrario.
   * - `ninguno`: true si no queda ningún dispositivo compatible. */
  function filtrarInfusoresCompatibles(opciones = {}) {
    const diasObjetivo = Number(opciones.dias);
    if (!Number.isFinite(diasObjetivo) || !(diasObjetivo > 0)) {
      return {
        dias: opciones.dias,
        compatibles: [],
        unico: false,
        autoseleccionado: null,
        ninguno: true,
        motivoIncompatibilidad: 'Seleccione una duración en días válida.',
      };
    }

    const candidatosPorDuracion = Object.keys(INFUSORES)
      .map((k) => INFUSORES[k])
      .filter((inf) => {
        if (inf.id === 'custom' || inf.ocultoSelector) return false;
        if (!inf.verificadoFabricante) return false;
        if (inf.llenado < (inf.llenadoMin || LIMITES_INFUSOR_FABRICANTE.llenadoMin) ||
            inf.llenado > (inf.maxLlenado || LIMITES_INFUSOR_FABRICANTE.llenadoMax)) return false;
        if (inf.ritmo < (inf.minRitmo || LIMITES_INFUSOR_FABRICANTE.ritmoMin) ||
            inf.ritmo > (inf.maxRitmo || LIMITES_INFUSOR_FABRICANTE.ritmoMax)) return false;
        if (Math.abs(inf.volumenReal - inf.llenado) > EPS) return false;
        const horas = inf.volumenReal / inf.ritmo;
        const diasRedondeados = inf.diasCategoria != null ? inf.diasCategoria : Math.round(horas / 24);
        return diasRedondeados === Math.round(diasObjetivo);
      });

    if (candidatosPorDuracion.length === 0) {
      return {
        dias: diasObjetivo,
        compatibles: [],
        unico: false,
        autoseleccionado: null,
        ninguno: true,
        motivoIncompatibilidad: `No hay dispositivos verificados en catálogo para ${fmt(diasObjetivo)} días.`,
      };
    }

    const farmacosValidos = (opciones.farmacos || []).filter((x) => x && Number(x.dosisDiaria) > 0);
    const volumenMinimoExplicito = Number(opciones.volumenMinimo) > 0 ? Number(opciones.volumenMinimo) : 0;

    const compatibles = [];
    const descartadosPorVolumen = [];

    candidatosPorDuracion.forEach((inf) => {
      const horas = inf.volumenReal / inf.ritmo;
      const diasReales = horas / 24;
      let volRequerido = volumenMinimoExplicito;
      if (farmacosValidos.length > 0) {
        const volFarmacos = farmacosValidos.reduce((s, item) => {
          const calc = calcularFarmaco(item, diasReales);
          return s + calc.volumenAspirar;
        }, 0);
        volRequerido = Math.max(volRequerido, volFarmacos);
      }
      const detalle = Object.assign({}, inf, {
        horas: round(horas, 2),
        dias: round(diasReales, 2),
        volumenRequerido: round(volRequerido, 2),
        etiquetaCorta: inf.etiquetaCorta || `Volumen: ${fmt(inf.llenado)} ml · Caudal: ${fmt(inf.ritmo)} ml/h`,
      });
      if (volRequerido <= inf.llenado + EPS) {
        compatibles.push(detalle);
      } else {
        descartadosPorVolumen.push(detalle);
      }
    });

    if (compatibles.length === 0) {
      const maxCapacidad = Math.max(...candidatosPorDuracion.map((c) => c.llenado));
      const minVolReq = Math.min(...descartadosPorVolumen.map((c) => c.volumenRequerido));
      return {
        dias: diasObjetivo,
        compatibles: [],
        unico: false,
        autoseleccionado: null,
        ninguno: true,
        motivoIncompatibilidad: `Volumen de fármacos (${fmt(minVolReq)} ml) superior a la capacidad máxima para ${fmt(diasObjetivo)} ${diasObjetivo === 1 ? 'día' : 'días'} (${fmt(maxCapacidad)} ml).`,
      };
    }

    return {
      dias: diasObjetivo,
      compatibles,
      unico: compatibles.length === 1,
      autoseleccionado: compatibles.length === 1 ? compatibles[0] : null,
      ninguno: false,
      motivoIncompatibilidad: null,
    };
  }

  /* ───────────── Semáforo clínico de seguridad ───────────── */
  const MENSAJE_METADONA =
    'La metadona tiene una vida media larga y variable (15–60 h), acumulación tisular y potencia equianalgésica NO lineal dependiente de la dosis previa. ' +
    'Una conversión automática puede causar depresión respiratoria diferida mortal. ' +
    'Consulte siempre con la unidad de cuidados paliativos o unidad del dolor.';

  const MENSAJE_ERC =
    'En insuficiencia renal grave (FG < 30 ml/min) la morfina acumula metabolitos activos neurotóxicos (M3G/M6G: mioclonías, delirium, depresión respiratoria). ' +
    'Valore fentanilo o hidromorfona como opioide de elección y consulte con la unidad de cuidados paliativos.';

  const MENSAJE_OPIOIDE_PREVIO =
    'El paciente ya recibe un opioide: NO inicie morfina naïve. ' +
    'Calcule primero la dosis basal equivalente en la pestaña «Opioides» (Anexo 6 del Ministerio de Sanidad) y trasládela al infusor.';

  function bloqueoMetadona() {
    return {
      bloqueado: true,
      nivel: 'rojo',
      codigo: 'METADONA',
      titulo: 'Rotación con metadona bloqueada por seguridad',
      mensaje: MENSAJE_METADONA,
    };
  }

  /* Une las alertas activas de varios módulos (infusor, conversor, modo guiado)
   * para el indicador global de cabecera. Deduplica por código conservando el orden. */
  function semaforoGlobal(...listas) {
    const vistas = new Set();
    const alertas = [];
    listas.forEach((l) => (l || []).forEach((a) => {
      if (a && !vistas.has(a.codigo)) { vistas.add(a.codigo); alertas.push(a); }
    }));
    let nivel = 'verde';
    if (alertas.some((a) => a.nivel === 'rojo')) nivel = 'rojo';
    else if (alertas.some((a) => a.nivel === 'ambar')) nivel = 'ambar';
    return { nivel, alertas };
  }

  function evaluarSemaforo(ctx) {
    const alertas = [];
    const ids = ctx.farmacos || [];

    if (ctx.metadona) {
      alertas.push(bloqueoMetadona());
    }
    if (ctx.volumenExcedido) {
      alertas.push({
        nivel: 'rojo',
        codigo: 'VOLUMEN_EXCEDIDO',
        mensaje: `El volumen de fármacos (${fmt(ctx.volumenAspirado)} ml) supera la capacidad de llenado del infusor (${fmt(ctx.llenado)} ml). Use presentaciones más concentradas, divida en dos infusores o elija mayor capacidad.`,
      });
    }
    if (ctx.caudalFueraRango) {
      alertas.push({
        nivel: 'rojo',
        codigo: 'CAUDAL_FUERA_RANGO',
        mensaje: `El caudal configurado (${fmt(ctx.ritmo)} ml/h) está fuera de los límites seguros del fabricante.`,
      });
    }
    if (ctx.volumenFueraRango) {
      alertas.push({
        nivel: 'rojo',
        codigo: 'VOLUMEN_FUERA_RANGO',
        mensaje: `El volumen de llenado (${fmt(ctx.llenado)} ml) está fuera de los límites del fabricante.`,
      });
    }
    if (ctx.filasIncompletas > 0) {
      alertas.push({
        nivel: 'rojo',
        codigo: 'FILA_INCOMPLETA',
        mensaje: `Hay ${ctx.filasIncompletas} ${ctx.filasIncompletas === 1 ? 'fármaco añadido sin dosis válida' : 'fármacos añadidos sin dosis válida'}. Introduzca su dosis diaria o elimine la fila antes de finalizar el infusor.`,
      });
    }
    if (ctx.dispositivoSinFicha) {
      alertas.push({
        nivel: 'ambar',
        codigo: 'DISPOSITIVO_PERSONALIZADO_SIN_FICHA',
        mensaje: 'Infusor en modo personalizado: el motor solo comprueba coherencia aritmética general y NO acredita compatibilidad con un modelo comercial concreto. Verifique el rango de llenado y caudal en las instrucciones del fabricante.',
      });
    }
    if (ctx.volumenNoMedible) {
      alertas.push({
        nivel: 'ambar',
        codigo: 'VOLUMEN_NO_MEDIBLE',
        mensaje: 'Uno o más fármacos requieren un volumen inferior a 0,05 ml, difícil de medir con precisión en jeringa convencional. Valore usar una presentación menos concentrada.',
      });
    }
    if (ctx.renalGrave) {
      alertas.push({ nivel: 'ambar', codigo: 'ERC_GRAVE', mensaje: MENSAJE_ERC });
    }
    if (ids.indexOf('dexametasona') !== -1 && (ctx.dias > 1.05 || ids.length > 1)) {
      alertas.push({
        nivel: 'ambar',
        codigo: 'DEXA_PROLONGADO',
        mensaje: 'La dexametasona es alcalina y precipita con facilidad al mezclarse (especialmente con haloperidol, midazolam o levomepromazina) y en infusiones > 24 h. Se recomienda administrarla en bolo SC matutino independiente en lugar de incluirla en el infusor.',
      });
    }
    if (ids.indexOf('haloperidol') !== -1 && ids.indexOf('levomepromazina') !== -1) {
      alertas.push({
        nivel: 'ambar',
        codigo: 'HALO_LEVOME',
        mensaje: 'Haloperidol + levomepromazina: duplicidad antidopaminérgica. Aumenta el riesgo de sedación excesiva, hipotensión y efectos extrapiramidales. Si el haloperidol no controla el delirium, sustitúyalo por levomepromazina en lugar de asociarlos.',
      });
    }
    if (ids.indexOf('metoclopramida') !== -1 && ids.indexOf('butilescopolamina') !== -1) {
      alertas.push({
        nivel: 'ambar',
        codigo: 'METOCLO_BUSCAPINA',
        mensaje: 'Metoclopramida + butilescopolamina: antagonismo farmacodinámico sobre la motilidad gastrointestinal (procinético vs. anticolinérgico). Evite combinarlos.',
      });
    }

    let nivel = 'verde';
    if (alertas.some((a) => a.nivel === 'rojo')) nivel = 'rojo';
    else if (alertas.some((a) => a.nivel === 'ambar')) nivel = 'ambar';

    const resumen = {
      verde: 'Sin alertas automáticas detectadas · Requiere validación del prescriptor',
      ambar: 'Precaución clínica: revise las advertencias antes de preparar',
      rojo: 'Bloqueo de seguridad: no preparar en estas condiciones',
    }[nivel];

    return { nivel, apto: nivel !== 'rojo', resumen, alertas };
  }

  /* ───────────── Cálculo completo de infusor ───────────── */
  function calcularInfusor(entrada) {
    const { horas, dias, infusor: inf } = calcularDuracion(entrada.infusor);
    const todasLasFilas = Array.isArray(entrada.farmacos) ? entrada.farmacos : [];
    let filasIncompletas = 0;
    const filasValidas = [];
    todasLasFilas.forEach((f) => {
      if (!f || typeof f !== 'object') return;
      const raw = f.dosisDiaria;
      if (raw === '' || raw === null || raw === undefined) {
        filasIncompletas++;
        return;
      }
      const num = Number(raw);
      if (!Number.isFinite(num) || !(num > 0)) {
        filasIncompletas++;
        return;
      }
      filasValidas.push(f);
    });

    const farmacos = filasValidas.map((item) => calcularFarmaco(item, dias));
    const volumenAspirado = farmacos.reduce((s, f) => s + f.volumenAspirar, 0);
    const volumenExcedido = volumenAspirado > inf.llenado + EPS;
    const suero = volumenExcedido ? 0 : inf.llenado - volumenAspirado;
    const volumenFinal = volumenExcedido ? volumenAspirado : inf.llenado;
    const caudalFueraRango = inf.ritmo < (inf.minRitmo || LIMITES_INFUSOR_FABRICANTE.ritmoMin) - EPS ||
                             inf.ritmo > (inf.maxRitmo || LIMITES_INFUSOR_FABRICANTE.ritmoMax) + EPS;
    const volumenFueraRango = inf.llenado < (inf.llenadoMin || LIMITES_INFUSOR_FABRICANTE.llenadoMin) - EPS ||
                              inf.llenado > (inf.maxLlenado || LIMITES_INFUSOR_FABRICANTE.llenadoMax) + EPS;
    const volumenNoMedible = farmacos.some((f) => f.volumenAspirar > 0 && f.volumenAspirar < 0.05 - EPS);

    const semaforo = evaluarSemaforo({
      farmacos: farmacos.map((f) => f.farmaco),
      dias,
      volumenAspirado,
      llenado: inf.llenado,
      ritmo: inf.ritmo,
      volumenExcedido,
      caudalFueraRango,
      volumenFueraRango,
      dispositivoSinFicha: !inf.verificadoFabricante,
      volumenNoMedible,
      filasIncompletas: farmacos.length > 0 ? filasIncompletas : 0,
      metadona: Boolean(entrada.metadona),
    });

    return {
      infusor: inf,
      horas,
      dias,
      farmacos,
      filasIncompletas,
      volumenAspirado,
      suero,
      volumenFinal,
      volumenExcedido,
      semaforo,
    };
  }

  /* ───────────── Conversor de opioides (HYP-001) ─────────────
   * Basado en Anexo 6, Tabla 1 del «Plan de optimización de la utilización de analgésicos
   * opioides en dolor crónico no oncológico en el SNS» (Ministerio de Sanidad, 2024) y
   * Ficha Técnica AEMPS/CIMA de Fentanilo Matrix Sandoz (reg. 69733):
   * - Presentaciones comerciales verificadas de fentanilo TD:
   *   12 (liberación real 12,5 µg/h), 25, 50, 75 y 100 µg/h.
   * - Para dosis > 100 µg/h se utiliza más de un parche simultáneo (FT CIMA 69733, §4.2).
   * - NO existe presentación comercial de 120 ni de 125 µg/h.
   * - La Tabla 1 del Anexo 6 tabula equivalencias descriptivas hasta 150 µg/h (360 mg/24 h morfina oral).
   *   Por encima de 150 µg/h se registra el desglose y la suma en µg/h, pero NO se extrapola ni transfiere
   *   automáticamente una dosis de morfina no validada en la tabla oficial. */
  const PRESENTACIONES_FENTANILO_TD = [
    { id: 'fent_12_5', denominacion: '12', liberacion: 12.5, label: '12 µg/h (liberación real 12,5 µg/h)', morfinaOralTabulada: 30 },
    { id: 'fent_25', denominacion: '25', liberacion: 25, label: '25 µg/h', morfinaOralTabulada: 60 },
    { id: 'fent_50', denominacion: '50', liberacion: 50, label: '50 µg/h', morfinaOralTabulada: 120 },
    { id: 'fent_75', denominacion: '75', liberacion: 75, label: '75 µg/h', morfinaOralTabulada: 180 },
    { id: 'fent_100', denominacion: '100', liberacion: 100, label: '100 µg/h', morfinaOralTabulada: 240 },
  ];

  const OPIOIDES = {
    fentanilo_td: {
      id: 'fentanilo_td',
      nombre: 'Fentanilo transdérmico (parche)',
      unidad: 'mcg/h',
      unidadMostrar: 'µg/h',
      factor: 2.4,
      maxTabuladoAnexo6: 150,
      valores: [12.5, 25, 50, 75, 100],
      presentaciones: PRESENTACIONES_FENTANILO_TD,
      fuentes: ['aemps_fentanilo_69733', 'minsanidad_opioides_2024'],
    },
    oxicodona: {
      id: 'oxicodona', nombre: 'Oxicodona oral', unidad: 'mg/día', factor: 1.5,
      factorTexto: '1,5–2 (Anexo 6, Tabla 1); se aplica 1,5 por prudencia al convertir hacia morfina',
      aviso: 'Rango oficial 1,5–2: se aplica el límite inferior (1,5) por seguridad; vigile respuesta y titule con rescates.',
      fuentes: ['minsanidad_opioides_2024'],
    },
    tapentadol: {
      id: 'tapentadol', nombre: 'Tapentadol oral', unidad: 'mg/día', factor: 0.33,
      factorTexto: '0,33–0,4 (100 mg tapentadol ≈ 33–40 mg morfina oral; Anexo 6, Tabla 1)',
      aviso: 'Factor 0,33–0,4: se aplica 0,33 por prudencia.',
      fuentes: ['minsanidad_opioides_2024'],
    },
    tramadol: {
      id: 'tramadol', nombre: 'Tramadol oral', unidad: 'mg/día', factor: 0.1, verificar: true,
      factorTexto: '0,1–0,2 (100 mg tramadol ≈ 10–20 mg morfina oral); se aplica 0,1 por prudencia',
      fuentes: ['minsanidad_opioides_2024'],
    },
    hidromorfona: {
      id: 'hidromorfona', nombre: 'Hidromorfona oral', unidad: 'mg/día', factor: 5, verificar: true,
      factorTexto: '5 (4 mg hidromorfona ≈ 20 mg morfina oral)',
      fuentes: ['minsanidad_opioides_2024'],
    },
    buprenorfina_td: {
      id: 'buprenorfina_td', nombre: 'Buprenorfina transdérmica', unidad: 'mcg/h', factor: 60 / 35, verificar: true, valores: [35, 52.5, 70],
      tabla: { 35: [60, 70], 52.5: [90, 105], 70: [120, 140] },
      fuentes: ['minsanidad_opioides_2024'],
    },
    morfina_oral: { id: 'morfina_oral', nombre: 'Morfina oral', unidad: 'mg/día', factor: 1, fuentes: ['minsanidad_opioides_2024'] },
    morfina_sc: { id: 'morfina_sc', nombre: 'Morfina subcutánea', unidad: 'mg/día', factor: 2, fuentes: ['minsanidad_opioides_2024'] },
    metadona: { id: 'metadona', nombre: 'Metadona (BLOQUEADA)', unidad: 'mg/día', bloqueado: true },
  };
  const RATIO_ORAL_SC = 0.5;

  /* Valida y suma una combinación de parches de fentanilo transdérmico.
   * Entrada: array de filas [{ parche: 100, cantidad: 1 }, { parche: 25, cantidad: 1 }].
   * Rechaza presentaciones no comercializadas (ej. 120, 125, 40), cantidades no enteras o <= 0
   * y cantidades desproporcionadas (> MAX_PARCHES_SIMULTANEOS) para evitar bloqueos y errores. */
  function calcularParchesFentanilo(filas) {
    if (!Array.isArray(filas) || filas.length === 0) {
      return { error: 'Añada al menos un parche de fentanilo.' };
    }
    if (filas.length > MAX_PARCHES_SIMULTANEOS) {
      return { error: `Número de filas de parches excesivo (máximo ${MAX_PARCHES_SIMULTANEOS}).` };
    }
    const validos = OPIOIDES.fentanilo_td.valores;
    const desglose = [];
    let totalParches = 0;
    for (let i = 0; i < filas.length; i++) {
      const f = filas[i];
      if (!f || typeof f !== 'object') {
        return { error: 'Fila de parche inválida en la posición ' + (i + 1) + '.' };
      }
      const rawParche = f.parche !== undefined ? f.parche : (f.mcgH !== undefined ? f.mcgH : (f.presentacion !== undefined ? f.presentacion : f.liberacion));
      if (rawParche === '' || rawParche === null || rawParche === undefined || typeof rawParche === 'boolean') {
        return { error: 'Seleccione una presentación válida de parche en la fila ' + (i + 1) + '.' };
      }
      const numParche = Number(rawParche);
      const p = numParche === 12 ? 12.5 : numParche;
      if (!Number.isFinite(p) || validos.indexOf(p) === -1) {
        return {
          error: 'Dosis de parche no comercializada (' + String(rawParche) + ' µg/h). Presentaciones individuales verificadas: 12 (12,5), 25, 50, 75 y 100 µg/h.',
        };
      }
      const rawCant = f.cantidad;
      if (rawCant === '' || rawCant === null || rawCant === undefined || typeof rawCant === 'boolean') {
        return { error: 'Introduzca una cantidad entera positiva de parches en la fila ' + (i + 1) + '.' };
      }
      if (typeof rawCant === 'string' && !/^\s*\d+\s*$/.test(rawCant)) {
        return { error: 'La cantidad de parches debe ser un número entero positivo sin decimales (fila ' + (i + 1) + ').' };
      }
      const cant = Number(rawCant);
      if (!Number.isSafeInteger(cant) || cant < 1) {
        return { error: 'La cantidad de parches debe ser un número entero mayor o igual a 1 (fila ' + (i + 1) + ').' };
      }
      if (cant > MAX_PARCHES_SIMULTANEOS) {
        return { error: `Cantidad de parches en la fila ${i + 1} (${cant}) superior al límite admitido (máximo ${MAX_PARCHES_SIMULTANEOS} parches).` };
      }
      totalParches += cant;
      if (totalParches > MAX_PARCHES_SIMULTANEOS) {
        return { error: `El número total de parches simultáneos (${totalParches}) supera el límite admitido (máximo ${MAX_PARCHES_SIMULTANEOS} parches).` };
      }
      const pres = PRESENTACIONES_FENTANILO_TD.find((x) => x.liberacion === p);
      const subtotal = round(p * cant, 4);
      desglose.push({
        parche: p,
        mcgH: p,
        denominacion: pres.denominacion,
        label: pres.label,
        cantidad: cant,
        subtotal,
      });
    }
    const dosisTotal = round(desglose.reduce((s, x) => s + x.subtotal, 0), 4);
    const partes = [];
    desglose.forEach((x) => {
      const potTxt = x.parche === 12.5 ? '12 (12,5)' : fmt(x.parche);
      for (let c = 0; c < x.cantidad; c++) partes.push(potTxt);
    });
    const desgloseTexto = partes.length === 1
      ? partes[0] + ' µg/h'
      : partes.join(' + ') + ' = ' + fmt(dosisTotal) + ' µg/h';
    return {
      valido: true,
      parches: desglose,
      totalParches,
      dosisTotal,
      totalMcgH: dosisTotal,
      unidad: 'µg/h',
      desgloseTexto,
    };
  }

  /* opciones.reduccion: fracción (0–0,5) por tolerancia cruzada incompleta.
   * Para 'fentanilo_td', `dosis` puede ser un número de presentación única (12.5, 25, 50, 75, 100)
   * o un array de parches [{ parche: 100, cantidad: 1 }, { parche: 25, cantidad: 1 }]. */
  function convertirOpioide(id, dosis, opciones = {}) {
    const key = String(id || '').toLowerCase().trim();
    if (/metadon|methadon/.test(key)) return Object.assign({ opioide: 'metadona' }, bloqueoMetadona());
    const op = OPIOIDES[key];
    if (!op) return { error: 'Opioide desconocido: ' + id };

    if (opciones.reduccion !== undefined && opciones.reduccion !== null && opciones.reduccion !== '') {
      const redRaw = Number(opciones.reduccion);
      if (!Number.isFinite(redRaw) || redRaw < 0 || redRaw > 0.5) {
        return { error: 'Reducción por tolerancia cruzada fuera de rango (0–50 %).' };
      }
    }
    const reduccion = Math.min(Math.max(Number(opciones.reduccion) || 0, 0), 0.5);

    if (key === 'fentanilo_td') {
      let filasParches = null;
      if (Array.isArray(dosis)) {
        filasParches = dosis;
      } else if (Array.isArray(opciones.parches)) {
        filasParches = opciones.parches;
      } else {
        if (dosis === '' || dosis === null || dosis === undefined || typeof dosis === 'boolean') {
          return { error: 'Introduzca una dosis mayor que 0' };
        }
        const numUnica = Number(dosis);
        const dUnica = numUnica === 12 ? 12.5 : numUnica;
        if (!(dUnica > 0) || !Number.isFinite(dUnica)) return { error: 'Introduzca una dosis mayor que 0' };
        if (op.valores.indexOf(dUnica) === -1) {
          return {
            error: 'Dosis de parche individual no comercializada (' + String(dosis) + ' µg/h). Valores válidos por parche: ' +
              op.valores.join(', ') + ' ' + op.unidad + '. Para dosis combinadas (p. ej. 125 µg/h = 100 + 25), registre varios parches.',
          };
        }
        filasParches = [{ parche: dUnica, cantidad: 1 }];
      }

      const comb = calcularParchesFentanilo(filasParches);
      if (comb.error) return { error: comb.error };

      const dTotal = comb.dosisTotal;
      const extrapoladoFueraTablaAnexo6 = dTotal > op.maxTabuladoAnexo6 + EPS;
      const notaRegistro =
        'La suma registrada (' + fmt(dTotal) + ' µg/h) describe el tratamiento actual; no valida por sí sola idoneidad, tolerancia ni seguridad individual.';

      // Si supera los 150 µg/h tabulados en el Anexo 6, se conserva el registro de parches y la suma en µg/h (HYP-001),
      // pero NO se ofrece ni transfiere una dosis de morfina por extrapolación lineal no validada.
      if (extrapoladoFueraTablaAnexo6) {
        const advertenciasEspecificas = [
          'Fuera de rango tabulado (> ' + op.maxTabuladoAnexo6 + ' µg/h): la Tabla 1 del Anexo 6 (Ministerio de Sanidad 2024) tabula equivalencias de fentanilo transdérmico únicamente hasta 150 µg/h (360 mg/24 h de morfina oral). ' +
          'Para ' + fmt(dTotal) + ' µg/h no se calcula ni aplica automáticamente una conversión lineal no validada; la rotación desde estas dosis exige ajuste individualizado por una unidad especializada.',
        ];
        if (dTotal > 300) {
          advertenciasEspecificas.push(
            'Dosis > 300 µg/h: según la ficha técnica oficial (AEMPS CIMA reg. 69733, §4.2), algunos pacientes pueden requerir métodos adicionales o alternativos de administración de opioides.'
          );
        }
        return {
          bloqueado: false,
          verificar: true,
          extrapoladoFueraTablaAnexo6: true,
          fueraRangoTabuladoAnexo6: true,
          transferibleAInfusor: false,
          opioide: op.id,
          nombre: op.nombre,
          dosis: dTotal,
          dosisOrigen: dTotal,
          unidad: op.unidad,
          unidadMostrar: op.unidadMostrar,
          parches: comb.parches,
          totalParches: comb.totalParches,
          desgloseParches: comb.desgloseTexto,
          desgloseTexto: comb.desgloseTexto,
          reduccion,
          morfinaOralBruta: null,
          morfinaSCBruta: null,
          morfinaOral: null,
          morfinaSC: null,
          rangoMorfinaOral: [null, null],
          rangoRotacionOral: null,
          rangoRotacionSC: null,
          factorTexto: 'Tabla 1 del Anexo 6 (Ministerio de Sanidad 2024) tabulada hasta 150 µg/h (360 mg/24 h morfina oral)',
          aviso: 'No se aplica extrapolación automática fuera de la tabla oficial (> 150 µg/h). Al retirar los parches de fentanilo, las concentraciones séricas decaen lentamente (≥20 h en disminuir al 50 %, FT AEMPS/CIMA §4.2).',
          notaRegistro,
          advertenciasEspecificas,
          rescateSC: null,
          rescateOral: null,
          fentaniloTD: null,
          fuentes: [FUENTES_CLINICAS.aemps_fentanilo_69733, FUENTES_CLINICAS.minsanidad_opioides_2024],
        };
      }

      const equivalenteBruto = round(dTotal * op.factor, 4);
      const morfinaSCBruta = round(equivalenteBruto * RATIO_ORAL_SC, 4);
      const rango = [equivalenteBruto, equivalenteBruto];
      const morfinaOral = round(equivalenteBruto * (1 - reduccion), 4);
      const morfinaSC = round(morfinaOral * RATIO_ORAL_SC, 4);
      const rangoRotacionOral = [round(equivalenteBruto * 0.5, 2), round(equivalenteBruto * 0.75, 2)];
      const rangoRotacionSC = [round(morfinaSCBruta * 0.5, 2), round(morfinaSCBruta * 0.75, 2)];

      const advertenciasEspecificas = [];
      if (reduccion === 0) {
        advertenciasEspecificas.push(
          'Equivalencia descriptiva sin reducción (0 %): el valor calculado (' + fmt(morfinaOral) + ' mg/24 h oral; ' + fmt(morfinaSC) +
          ' mg/24 h SC) describe la potencia teórica equivalente (Anexo 6), NO una dosis directa de inicio en rotación. ' +
          'Según el Anexo 5 del Ministerio de Sanidad (2024), al rotar de opioide se recomienda aplicar una reducción del 25–50 % (' +
          fmt(rangoRotacionSC[0]) + '–' + fmt(rangoRotacionSC[1]) + ' mg/24 h SC) por tolerancia cruzada incompleta e individualizar.'
        );
      }
      const avisoFentanilo =
        'Equivalencia orientativa (Anexo 6 Min. Sanidad 2024: 2,4 mg morfina oral/24 h por µg/h, cambio cada 72 h). ' +
        'Al retirar el parche de fentanilo, las concentraciones séricas decaen lentamente (≥20 h en disminuir al 50 %, FT AEMPS/CIMA §4.2): ' +
        'la sustitución por otro opioide debe ser gradual, comenzando con dosis bajas y valorando reducción del 25–50 % por tolerancia cruzada incompleta (Anexo 5). ' +
        'La suma registrada describe el tratamiento actual y no demuestra por sí sola que sea apropiado para cualquier paciente.';

      return {
        bloqueado: false,
        verificar: false,
        extrapoladoFueraTablaAnexo6: false,
        fueraRangoTabuladoAnexo6: false,
        transferibleAInfusor: true,
        opioide: op.id,
        nombre: op.nombre,
        dosis: dTotal,
        dosisOrigen: dTotal,
        unidad: op.unidad,
        unidadMostrar: op.unidadMostrar,
        parches: comb.parches,
        totalParches: comb.totalParches,
        desgloseParches: comb.desgloseTexto,
        desgloseTexto: comb.desgloseTexto,
        reduccion,
        morfinaOralBruta: equivalenteBruto,
        morfinaSCBruta,
        morfinaOral,
        morfinaSC,
        rangoMorfinaOral: rango,
        rangoRotacionOral,
        rangoRotacionSC,
        factorTexto: '2,4 mg de morfina oral/24 h por cada 1 µg/h (Anexo 6, Tabla 1, Ministerio de Sanidad 2024; tabulado hasta 150 µg/h)',
        aviso: avisoFentanilo,
        notaRegistro,
        advertenciasEspecificas,
        rescateSC: morfinaSC / 6,
        rescateOral: morfinaOral / 6,
        fentaniloTD: fentaniloTDMasCercano(morfinaOral),
        fuentes: [FUENTES_CLINICAS.aemps_fentanilo_69733, FUENTES_CLINICAS.minsanidad_opioides_2024],
      };
    }

    if (dosis === '' || dosis === null || dosis === undefined || typeof dosis === 'boolean') {
      return { error: 'Introduzca una dosis mayor que 0' };
    }
    const d = Number(dosis);
    if (!(d > 0) || !Number.isFinite(d)) return { error: 'Introduzca una dosis mayor que 0' };
    if (op.valores && op.valores.indexOf(d) === -1) {
      return { error: 'Dosis de parche no comercializada. Valores válidos: ' + op.valores.join(', ') + ' ' + op.unidad };
    }
    const rango = op.tabla ? op.tabla[d] : [d * op.factor, d * op.factor];
    const equivalenteBruto = rango[0];
    const morfinaSCBruta = equivalenteBruto * RATIO_ORAL_SC;
    const morfinaOral = equivalenteBruto * (1 - reduccion);
    const morfinaSC = morfinaOral * RATIO_ORAL_SC;
    const rangoRotacionOral = [round(equivalenteBruto * 0.5, 2), round(equivalenteBruto * 0.75, 2)];
    const rangoRotacionSC = [round(morfinaSCBruta * 0.5, 2), round(morfinaSCBruta * 0.75, 2)];
    return {
      bloqueado: false, verificar: !!op.verificar, transferibleAInfusor: true,
      opioide: op.id, nombre: op.nombre, dosis: d, dosisOrigen: d, unidad: op.unidad,
      reduccion, morfinaOralBruta: equivalenteBruto, morfinaSCBruta, morfinaOral, morfinaSC,
      rangoMorfinaOral: rango, rangoRotacionOral, rangoRotacionSC,
      factorTexto: op.factorTexto || null, aviso: op.aviso || null,
      rescateSC: morfinaSC / 6, rescateOral: morfinaOral / 6,
      fentaniloTD: fentaniloTDMasCercano(morfinaOral),
    };
  }

  /* Orienta sobre equivalencia a fentanilo TD desde morfina oral:
   * - Proporción teórica del Anexo 6 (Ministerio de Sanidad 2024): 1 µg/h ≈ 2,4 mg morfina oral/24 h.
   * - Nota explícita: en rotación hacia fentanilo TD, la Tabla 1 / Tabla 2 de la Ficha Técnica AEMPS/CIMA (reg. 69733)
   *   emplea rangos conservadores (~150:1 en Tabla 2) y no debe invertirse. */
  /* Tabla 2 oficial de la Ficha Técnica AEMPS/CIMA (reg. 69733, §4.2):
   * Dosis de inicio recomendada de Fentanilo Matrix basada en la dosis diaria de morfina oral
   * (para pacientes con necesidad de rotación de opioides o clínicamente menos estables, ratio ~150:1):
   * < 90 mg/día → 12,5 µg/h; 90–134 → 25; 135–224 → 50; 225–314 → 75; 315–404 → 100;
   * 405–494 → 125; 495–584 → 150; 585–674 → 175; 675–764 → 200; 765–854 → 225;
   * 855–944 → 250; 945–1034 → 275; 1035–1124 → 300 µg/h. */
  function fentaniloTDMasCercano(morfinaOral) {
    const teorico = morfinaOral / 2.4;
    const parches = OPIOIDES.fentanilo_td.valores;
    const masCercano = parches.reduce((a, b) => (Math.abs(b - teorico) < Math.abs(a - teorico) ? b : a));
    let parcheTabla2Rotacion = null;
    if (morfinaOral < 90) parcheTabla2Rotacion = 12.5;
    else if (morfinaOral < 135) parcheTabla2Rotacion = 25;
    else if (morfinaOral < 225) parcheTabla2Rotacion = 50;
    else if (morfinaOral < 315) parcheTabla2Rotacion = 75;
    else if (morfinaOral < 405) parcheTabla2Rotacion = 100;
    else if (morfinaOral < 495) parcheTabla2Rotacion = 125;
    else if (morfinaOral < 585) parcheTabla2Rotacion = 150;
    else if (morfinaOral < 675) parcheTabla2Rotacion = 175;
    else if (morfinaOral < 765) parcheTabla2Rotacion = 200;
    else if (morfinaOral < 855) parcheTabla2Rotacion = 225;
    else if (morfinaOral < 945) parcheTabla2Rotacion = 250;
    else if (morfinaOral < 1035) parcheTabla2Rotacion = 275;
    else if (morfinaOral <= 1124) parcheTabla2Rotacion = 300;
    return {
      teorico,
      parcheMasCercano: masCercano,
      parcheTabla2Rotacion,
      notaUnidireccional: 'En rotación hacia fentanilo TD, consulte las Tablas 1 y 2 de la Ficha Técnica AEMPS/CIMA (reg. 69733, §4.2); dichas tablas son unidireccionales y no deben invertirse.',
    };
  }

  /* ───────────── Modo Guiado SECPAL (5 preguntas) ───────────── */
  const GUIA_PASOS = [
    { id: 'contexto', tipo: 'single', titulo: '1 · ¿En qué situación clínica se encuentra el paciente?', opciones: [
      { valor: 'agonia', label: 'Situación de últimos días / agonía', desc: 'Deterioro irreversible, horas o pocos días.' },
      { valor: 'control', label: 'Control de síntomas en domicilio / planta', desc: 'Necesita ajuste sintomático sin signos de agonía inmediata.' },
    ] },
    { id: 'via', tipo: 'single', titulo: '2 · ¿Dispone de vía oral efectiva y segura?', opciones: [
      { valor: 'sc', label: 'No → usar vía subcutánea (infusor / palomita)', desc: 'Disfagia, vómitos, bajo nivel de consciencia o agonía.' },
      { valor: 'oral', label: 'Sí → vía oral conservada', desc: 'Puede tragar con seguridad.' },
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

  /* ───────────── Nota clínica (HYP-005: resumen de Infusor actual) ───────────── */
  /* Fecha/hora local del dispositivo (AAAA-MM-DD HH:MM), no UTC. */
  function fechaLocal(f = new Date()) {
    const p = (n) => String(n).padStart(2, '0');
    return f.getFullYear() + '-' + p(f.getMonth() + 1) + '-' + p(f.getDate()) + ' ' + p(f.getHours()) + ':' + p(f.getMinutes());
  }

  /* Genera el resumen técnico del infusor actual en texto plano listo para copiar.
   * No incluye el semáforo clínico ni genera afirmaciones sobre consentimiento o actuaciones clínicas.
   * Si existe un bloqueo de seguridad en el infusor (volumen excedido, fila incompleta o bloqueo activo),
   * no genera una receta utilizable hasta que se resuelva. */
  function generarNota(d = {}) {
    const L = [];
    L.push('NOTA CLÍNICA · INFUSOR ACTUAL (Hypnos ' + VERSION + ')');
    L.push('Fecha: ' + (d.fecha || fechaLocal()));
    const r = d.infusor;
    const bloqueosInfusor = r && r.semaforo && Array.isArray(r.semaforo.alertas)
      ? r.semaforo.alertas.filter((a) => a.nivel === 'rojo')
      : [];
    if (d.bloqueoActivo || (r && r.volumenExcedido) || bloqueosInfusor.length > 0) {
      L.push('');
      L.push('PREPARACIÓN BLOQUEADA: existen alertas críticas de seguridad sin resolver.');
      if (d.motivoBloqueo) {
        L.push('- ' + d.motivoBloqueo);
      } else {
        bloqueosInfusor.forEach((b) => L.push('- ' + b.mensaje));
      }
      L.push('Resuelva los bloqueos antes de finalizar o copiar el infusor.');
      return L.join('\n');
    }
    if (r && Array.isArray(r.farmacos) && r.farmacos.length > 0) {
      L.push('');
      L.push('DISPOSITIVO Y DURACIÓN:');
      L.push('- Dispositivo: ' + r.infusor.nombre);
      L.push('- Duración: ' + fmt(r.horas) + ' h (' + fmt(r.dias) + ' días) · Caudal: ' + fmt(r.infusor.ritmo) + ' ml/h');
      L.push('- Llenado nominal: ' + fmt(r.infusor.llenado) + ' ml' +
        (r.infusor.volumenReal !== r.infusor.llenado ? ' · Volumen real: ' + fmt(r.infusor.volumenReal) + ' ml' : ''));
      L.push('');
      L.push('FÁRMACOS:');
      r.farmacos.forEach((f) => {
        const envTxt = f.tipoEnvase === 'vial' ? (f.ampollas === 1 ? 'vial' : 'viales') : 'ampollas';
        L.push('- ' + f.nombre + ' (' + f.presentacion.label + '): ' +
          fmt(f.dosisDiaria) + ' mg/24 h (total ' + fmt(f.totalMg) + ' mg en ' + fmt(r.dias) + ' días) · ' +
          'Añadir al infusor: ' + fmt(f.volumenAspirar) + ' ml · Abrir: ' + f.ampollas + ' ' + envTxt);
      });
      L.push('');
      L.push('DILUYENTE Y VOLUMEN FINAL:');
      L.push('- Volumen total de fármacos: ' + fmt(r.volumenAspirado) + ' ml');
      L.push('- Diluyente (Suero fisiológico 0,9 %): ' + fmt(r.suero) + ' ml');
      L.push('- Volumen final preparado: ' + fmt(r.volumenFinal) + ' ml');
      const resc = r.farmacos.filter((f) => f.rescate);
      if (resc.length) {
        L.push('');
        L.push('RESCATES SC:');
        resc.forEach((f) => L.push('- ' + f.nombre + ': ' + f.rescate.texto));
      }
    } else {
      L.push('');
      L.push('Sin infusor activo configurado. Introduzca al menos un fármaco con dosis diaria válida en la pestaña Infusor.');
    }
    if (d.conversion && !d.conversion.error && !d.conversion.bloqueado && d.conversion.morfinaOral != null) {
      const c = d.conversion;
      const origenTxt = c.desgloseParches ? c.desgloseParches : (fmt(c.dosis) + ' ' + (c.unidadMostrar || c.unidad));
      L.push('');
      L.push('CONVERSIÓN DE OPIOIDES APLICADA: ' + c.nombre + ' (' + origenTxt + ') → morfina oral ' +
        fmt(c.morfinaOral) + ' mg/24 h → morfina SC ' + fmt(c.morfinaSC) + ' mg/24 h (rescate ' + fmt(c.rescateSC) + ' mg SC).' +
        (c.reduccion ? ' Reducción por tolerancia cruzada: ' + fmt(c.reduccion * 100, 0) + ' %.' : ' Sin reducción por tolerancia cruzada aplicada (0 %).'));
      if (c.aviso) L.push('AVISO: ' + c.aviso);
      if (Array.isArray(c.advertenciasEspecificas)) {
        c.advertenciasEspecificas.forEach((adv) => L.push('AVISO: ' + adv));
      }
    }
    if (d.avisoFactor) L.push('AVISO: ' + d.avisoFactor);
    if (d.conversion && d.conversion.verificar) {
      const av = 'AVISO: factor de conversión de ' + d.conversion.nombre + ' pendiente de verificar frente al Anexo 6 (Ministerio de Sanidad 2024).';
      if (L.indexOf(av) === -1 && !(d.avisoFactor && d.avisoFactor.indexOf(d.conversion.nombre) !== -1)) L.push(av);
    }
    return L.join('\n');
  }

  /* ───────────── Apoyo a familias ───────────── */
  const FAMILIAS = [
    {
      pregunta: '«¿La morfina o la sedación van a adelantar la muerte (van a matar a mi familiar)?»',
      respuesta:
        'No. Las dosis se ajustan al síntoma (dolor, falta de aire, angustia), no para acortar la vida. ' +
        'Los estudios en cuidados paliativos muestran que un buen control del sufrimiento no adelanta el fallecimiento; ' +
        'lo que acorta la vida es la enfermedad avanzada que ya está presente. Nuestro objetivo es que esté tranquilo y sin dolor.',
    },
    {
      pregunta: '«Respira con ruido (estertores), ¿se está ahogando?»',
      respuesta:
        'Ese ruido se produce por pequeñas secreciones en la garganta que ya no traga ni tose porque está muy profundamente dormido o débil. ' +
        'Aunque a quienes estamos al lado nos impresiona mucho, para él o ella no suele ser una sensación de ahogo. ' +
        'Colocarle de lado, cuidar la boca y la medicación para secar secreciones ayudan más que aspirar con sonda, que resulta molesta.',
    },
    {
      pregunta: '«No come ni bebe, ¿no habría que ponerle sueros?»',
      respuesta:
        'En los últimos días el cuerpo ya no aprovecha los alimentos ni los líquidos igual. ' +
        'Forzar comida o poner mucho suero puede aumentar el líquido en los pulmones, los edemas y las secreciones, empeorando el confort. ' +
        'La sequedad de boca se alivia mucho mejor humedeciendo los labios y la boca con frecuencia.',
    },
    {
      pregunta: '«¿Me oye aunque esté dormido o sedado?»',
      respuesta:
        'El oído y el tacto suelen ser de los últimos sentidos en apagarse. ' +
        'Hablarle con voz suave, cogerle de la mano y mantener un ambiente tranquilo le transmite compañía y seguridad.',
    },
  ];

  const RESCATE_SC_PASOS = [
    'Lávese las manos y compruebe en la hoja escrita qué jeringa o medicación corresponde al síntoma (dolor/ahogo, nerviosismo, secreciones o náuseas).',
    'Revise que la palomita subcutánea no esté roja, dura, dolorosa ni desconectada. Si lo está, avise al equipo antes de administrar.',
    'Limpie el tapón o puerto de la palomita con una gasa con alcohol y deje secar unos segundos.',
    'Conecte la jeringa cargada (o pinche en el tapón según el modelo) e introduzca el líquido despacio, sin prisa.',
    'Si el equipo le dejó una jeringa de suero fisiológico para lavar la vía después, administre el volumen indicado.',
    'Anote la hora y el motivo del rescate. Si a los 30–45 minutos no ha aliviado o necesita más de 3 rescates en el día, llame al equipo.',
  ];

  /* ───────────── Guías imprimibles para familias y cuidadores (SECPAL) ─────────────
   * Seguridad para cuidadores: NUNCA expresar dosis en mg; la familia administra solo el
   * volumen en mililitros (ml) que su equipo médico haya dejado anotado en su hoja de pauta. */
  const AVISO_DOSIS_ML =
    'Administre siempre el volumen en mililitros (ml) exactamente como figura en la hoja escrita por su equipo médico; nunca administre una dosis expresada solo en mg ni modifique la cantidad por su cuenta.';

  const TELEFONOS_GUIA = [
    { servicio: 'Equipo de Cuidados Paliativos / Atención Domiciliaria', numero: '', nota: 'Anote aquí el teléfono y horario de su equipo de referencia.' },
    { servicio: 'Centro de Salud / Urgencias de Atención Primaria', numero: '', nota: 'Anote aquí el teléfono de su centro o servicio de continuidad asistencial.' },
    { servicio: 'Emergencias Sanitarias', numero: '112', nota: 'Disponible las 24 horas en toda España / UE.' },
  ];

  const GUIAS_FAMILIA = [
    {
      id: 'rescate_sc',
      titulo: 'Guía práctica · Cómo administrar un rescate por la palomita subcutánea',
      subtitulo: 'Pasos sencillos para la familia y cuidadores en domicilio',
      introduccion:
        'La «palomita» es un tubito fino colocado bajo la piel que permite dar medicación para aliviar el dolor, el ahogo o la inquietud sin tener que pinchar cada vez y cuando tragar ya no es seguro. ' +
        'Use esta guía junto con la hoja de pauta que le ha entregado su equipo.',
      secciones: [
        {
          titulo: '1. ¿Cuándo dar un rescate?',
          contenido: 'Cuando aparezca o empeore el síntoma para el que su equipo le dejó indicada una jeringa de rescate:',
          items: [
            'Dolor que no cede con el reposo o gesto de dolor al moverle.',
            'Sensación de falta de aire (respiración rápida o angustiosa).',
            'Inquietud importante, angustia o agitación.',
            'Ruidos de secreciones en la garganta o náuseas, si tiene medicación pautada para ello.',
          ],
        },
        {
          titulo: '2. Comprobación obligatoria antes de administrar',
          destacado: 'Use únicamente la jeringa rotulada para ese síntoma con los mililitros (ml) indicados en su hoja de pauta, y compruebe que el nombre y la concentración de la ampolla o vial coinciden exactamente con la pauta escrita.',
          items: [
            'Lávese las manos con agua y jabón.',
            'Compruebe en la hoja escrita qué medicación corresponde al síntoma y cuántos mililitros (ml) debe administrar.',
            'Si usted carga la jeringa, compruebe siempre que la presentación y la concentración de la ampolla o vial coinciden exactamente con la hoja de pauta; si en casa hay otra presentación o tiene cualquier duda, NO la administre y llame al equipo.',
            'Respete el tiempo mínimo entre rescates que figure en su hoja de pauta.',
          ],
        },
        {
          titulo: '3. Paso a paso en la palomita',
          numerada: true,
          items: RESCATE_SC_PASOS,
        },
        {
          titulo: '4. Cuidados diarios de la zona de punción',
          items: [
            'Vigile una vez al día la piel alrededor del apósito transparente.',
            'No moje el apósito ni tire del tubito al vestir o asear a su familiar.',
            'Si el infusor está conectado a la misma palomita, no cierre las pinzas del tubo del infusor.',
          ],
        },
      ],
      advertencias: [
        AVISO_DOSIS_ML,
        'No inyecte por la palomita si la zona está muy roja, caliente, hinchada, dura, duele al tocar o sale líquido por fuera del apósito: llame al equipo para cambiar el punto.',
        'Si tras 30–45 minutos el síntoma no mejora, o si ha necesitado 3 o más rescates en 24 horas, contacte con su equipo para ajustar la medicación continua.',
      ],
      telefonos: TELEFONOS_GUIA,
      fuente: 'Elaborado conforme a las recomendaciones de educación a cuidadores de SECPAL (Sociedad Española de Cuidados Paliativos) y la Guía de Práctica Clínica sobre Cuidados Paliativos del SNS.',
    },
    {
      id: 'sintomas_domicilio',
      titulo: 'Guía para cuidadores · Cómo aliviar los síntomas frecuentes en casa',
      subtitulo: 'Medidas de confort y uso seguro de la medicación pautada',
      introduccion:
        'El cuidado en casa combina medidas sencillas de confort con la medicación que su equipo deja preparada. ' +
        'Estas orientaciones le ayudarán a saber qué hacer ante cada síntoma.',
      secciones: [
        {
          titulo: 'Dolor',
          items: [
            'Favorezca una postura cómoda con almohadas bajo las zonas de apoyo; movilice con suavidad.',
            'Si aparece dolor pese a la medicación continua, administre los mililitros (ml) de la jeringa de rescate para el dolor indicados en su hoja y anote la hora.',
            'Avise antes de realizar un aseo o cambio postural doloroso: su equipo puede indicarle dar el rescate 20–30 minutos antes.',
          ],
        },
        {
          titulo: 'Falta de aire (disnea)',
          items: [
            'Incorpore el cabecero o coloque a su familiar semisentado o de lado con almohadas.',
            'Abra ligeramente una ventana o use un abanico suave dirigido hacia la cara (el aire fresco en las mejillas alivia la sensación de ahogo).',
            'Acompáñele con voz tranquila y administre el rescate en mililitros (ml) pautado para el ahogo.',
          ],
        },
        {
          titulo: 'Ruidos al respirar (estertores)',
          destacado: 'Cuando la persona está profundamente dormida en situación de agonía, ese ruido por secreciones en la garganta habitualmente no le produce sensación de ahogo; vigile siempre su expresión y gestos por si mostrara signos de incomodidad.',
          items: [
            'Colóquele de lado (postura lateral) con la cabeza ligeramente inclinada para que las secreciones no se acumulen en la garganta.',
            'Limpie suavemente la boca y los labios con una gasa húmeda; evite aspirar el fondo de la garganta porque resulta molesto.',
            'Observe la cara, el ceño y los gestos respiratorios: si percibe expresión facial o signos de incomodidad, administre los mililitros (ml) del rescate pautado para secreciones o confort y consulte con el equipo.',
          ],
        },
        {
          titulo: 'Inquietud, confusión o desorientación (delirium)',
          items: [
            'Mantenga un ambiente sereno, con luz suave, sin ruidos fuertes y con pocas personas a la vez.',
            'Háblele despacio, recuérdele con cariño que está en casa y acompañado; no discuta si dice frases confusas.',
            'Si está agitado o angustiado, administre los mililitros (ml) del rescate pautado para la inquietud.',
          ],
        },
      ],
      advertencias: [
        AVISO_DOSIS_ML,
        'No dé pastillas, agua ni alimentos por la boca si su familiar está adormecido, se atraganta o tose al tragar: existe riesgo de que pasen al pulmón.',
        'Consulte con su equipo si aparece un síntoma nuevo, fiebre alta con malestar, sangrado o dolor que no cede tras los rescates pautados.',
      ],
      telefonos: TELEFONOS_GUIA,
      fuente: 'Basado en las guías para pacientes y familiares de SECPAL (Sociedad Española de Cuidados Paliativos).',
    },
    {
      id: 'ultimos_dias',
      titulo: 'Guía de acompañamiento · Qué esperar en los últimos días de vida',
      subtitulo: 'Orientación cálida para comprender los cambios naturales y cuidar el confort',
      introduccion:
        'En los últimos días de vida el cuerpo se va apagando poco a poco de forma natural. ' +
        'Conocer estos cambios ayuda a perder el miedo, centrar los esfuerzos en el bienestar y acompañar con serenidad.',
      secciones: [
        {
          titulo: '1. Menor necesidad de comer y beber',
          items: [
            'Es normal que deje de tener hambre y sed; el cuerpo ya no necesita ni aprovecha los alimentos.',
            'No fuerce la comida ni los líquidos: en esta etapa no fortalecen y pueden causar náuseas, atragantamiento o más secreciones.',
            'El mejor alivio para la sequedad es cuidar la boca cada pocas horas: humedezca labios y lengua con una gasa mojada en agua o manzanilla y aplique vaselina o cacao puro en los labios.',
          ],
        },
        {
          titulo: '2. Más horas de sueño y menor respuesta',
          destacado: 'Aunque duerma casi todo el tiempo o no pueda hablar, el oído y el tacto suelen conservarse hasta el final.',
          items: [
            'Háblele con voz suave, dígale quién está a su lado y cójale de la mano sin zarandearle para despertarle.',
            'Evite conversaciones angustiosas junto a la cama; mantenga la habitación tranquila y ventilada.',
          ],
        },
        {
          titulo: '3. Cambios en la respiración y en la piel',
          items: [
            'La respiración puede volverse irregular, con ratos más rápidos y pausas de varios segundos sin respirar: forma parte del proceso natural y no significa que esté sufriendo si su cara está relajada.',
            'Las manos, los pies o las rodillas pueden notarse más fríos o tomar un tono violáceo o pálido: abríguele con una manta ligera sin usar bolsas de agua muy calientes.',
            'Puede disminuir mucho la cantidad de orina.',
          ],
        },
        {
          titulo: '4. La medicación y el confort',
          items: [
            'El infusor subcutáneo mantiene la medicación de forma continua para prevenir el dolor, el ahogo o la angustia.',
            'La medicación paliativa y, cuando es necesaria, la sedación paliativa tienen como único fin aliviar el sufrimiento; no adelantan la muerte.',
            'Si observa ceño fruncido, quejido o intranquilidad, utilice el rescate en mililitros (ml) indicado en su hoja de pauta.',
          ],
        },
      ],
      advertencias: [
        AVISO_DOSIS_ML,
        'Llame a su equipo si nota signos de malestar que no ceden tras el rescate, si el infusor se desconecta o si la familia necesita apoyo.',
        'Cuando llegue el momento del fallecimiento, no hay prisa: pueden permanecer junto a su familiar con calma antes de avisar a los teléfonos indicados por su equipo.',
      ],
      telefonos: TELEFONOS_GUIA,
      fuente: 'Basado en las guías de atención en los últimos días de SECPAL (Sociedad Española de Cuidados Paliativos) y del Sistema Nacional de Salud.',
    },
  ];

  return {
    VERSION,
    AUTOR,
    CONTACTO_EMAIL,
    FUENTES_CLINICAS,
    INFUSORES,
    INFUSORES_BLOQUEADOS,
    LIMITES_INFUSOR_FABRICANTE,
    FARMACOS,
    OPIOIDES,
    PRESENTACIONES_FENTANILO_TD,
    GUIA_PASOS,
    FAMILIAS,
    RESCATE_SC_PASOS,
    GUIAS_FAMILIA,
    fmt,
    round,
    resolverInfusor,
    calcularDuracion,
    resolverPresentacion,
    calcularFarmaco,
    filtrarInfusoresCompatibles,
    calcularInfusor,
    calcularParchesFentanilo,
    convertirOpioide,
    fentaniloTDMasCercano,
    bloqueoMetadona,
    evaluarSemaforo,
    semaforoGlobal,
    planGuiado,
    fechaLocal,
    generarNota,
  };
});
