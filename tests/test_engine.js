'use strict';
// Ejecutar: node tests/test_engine.js
const assert = require('assert');
const H = require('../app.js');

let pasados = 0;
const fallos = [];
function test(nombre, fn) {
  try { fn(); pasados++; console.log('  ✓ ' + nombre); }
  catch (e) { fallos.push(nombre); console.log('  ✗ ' + nombre + '\n      ' + e.message); }
}
const cerca = (a, b, m) => assert.ok(Math.abs(a - b) < 1e-6, (m || '') + ' esperado ' + b + ', obtenido ' + a);

console.log('\nInfusores y catálogo verificado con fuentes del fabricante');
test('SFS-2-25P-EJ (sfs2_250) 250 ml @ 2 ml/h → 125 h / 5,21 d', () => {
  const d = H.calcularDuracion('sfs2_250');
  cerca(d.horas, 125); cerca(d.dias, 125 / 24); cerca(H.round(d.dias, 2), 5.21);
  assert.strictEqual(d.infusor.referenciaFabricante, 'SFS-2-25P-EJ');
  assert.strictEqual(d.infusor.llenado, 250);
  assert.strictEqual(d.infusor.volumenReal, 250);
});
test('Baxter Five Day Infusor LV2 (baxter_lv2_5d, ref. 2C1008KP) 240 ml @ 2 ml/h → 120 h / 5,00 d', () => {
  const d = H.calcularDuracion('baxter_lv2_5d');
  cerca(d.horas, 120); cerca(d.dias, 5);
  assert.strictEqual(d.infusor.referenciaFabricante, '2C1008KP');
  assert.strictEqual(d.infusor.llenado, 240);
  assert.strictEqual(d.infusor.llenadoMin, 216);
  assert.strictEqual(d.infusor.maxLlenado, 300);
  assert.strictEqual(d.infusor.volumenReal, 240);
});
test('SMA-123-10P-EJ (sfs1) 100 ml @ 1 ml/h → 100 h / 4,17 d', () => {
  const d = H.calcularDuracion('sfs1');
  cerca(d.horas, 100);
  assert.strictEqual(d.infusor.referenciaFabricante, 'SMA-123-10P-EJ');
});
test('Infusores 1 día: B. Braun Easypump II LT 60-30-S ref. 4540010 (llenado parcial 48 ml @ 2 ml/h = 24 h y nominal 60 ml @ 2 ml/h = 30 h)', () => {
  const d48 = H.calcularDuracion('dia_48');
  cerca(d48.horas, 24);
  assert.strictEqual(d48.infusor.referenciaFabricante, '4540010');
  assert.strictEqual(d48.infusor.llenadoMin, 20);
  assert.strictEqual(d48.infusor.maxLlenado, 60);

  const d60 = H.calcularDuracion('easypump_60_30');
  cerca(d60.horas, 30);
  assert.strictEqual(d60.infusor.referenciaFabricante, '4540010');
  assert.strictEqual(d60.infusor.llenado, 60);
  assert.strictEqual(d60.infusor.precisionPct, 15);
});
test('Infusores 2 días: B. Braun Easypump II LT 100-50-S ref. 4540016 (100 ml @ 2 ml/h = 50 h) y Baxter Folfusor SV2.5 ref. 2C4711K (120 ml @ 2,5 ml/h = 48 h)', () => {
  const d2 = H.calcularDuracion('dia_2');
  cerca(d2.horas, 50);
  assert.strictEqual(d2.infusor.referenciaFabricante, '4540016');
  assert.strictEqual(d2.infusor.precisionPct, 15);

  const b2 = H.calcularDuracion('baxter_sv2_5_2d');
  cerca(b2.horas, 48);
  assert.strictEqual(b2.infusor.referenciaFabricante, '2C4711K');
  assert.strictEqual(b2.infusor.llenado, 120);
});
test('Infusor 7 días Baxter Seven Day LV1.5 ref. 2C1087KP: 250 ml @ 1,5 ml/h → 166,67 h (~7 días) con coherencia llenado === volumenReal === 250 ml (Corrección 12)', () => {
  const d = H.calcularDuracion('dia_7');
  cerca(d.horas, 166.66666666666666); cerca(d.dias, 166.66666666666666 / 24);
  assert.strictEqual(d.infusor.referenciaFabricante, '2C1087KP');
  assert.strictEqual(d.infusor.llenado, 250);
  assert.strictEqual(d.infusor.llenadoMin, 227);
  assert.strictEqual(d.infusor.maxLlenado, 300);
  assert.strictEqual(d.infusor.volumenReal, 250);
});
test('Modelos heredados de v2.1 con catalogación errónea o incoherente están explícitamente bloqueados (baxter_2c1009k LV5, sfs2_252, dia_60)', () => {
  assert.ok(H.INFUSORES_BLOQUEADOS.baxter_2c1009k, 'baxter_2c1009k registrado en INFUSORES_BLOQUEADOS');
  assert.throws(() => H.calcularDuracion('baxter_2c1009k'), /5,0 ml\/h/i, 'baxter_2c1009k bloqueado por ser LV5 (5,0 ml/h, 20 h)');
  assert.throws(() => H.calcularDuracion('sfs2_252'), /SFS-2-25P-EJ/i, 'sfs2_252 bloqueado por incoherencia 252 vs 250 ml');
  assert.throws(() => H.calcularDuracion('dia_60'), /4540010/i, 'dia_60 bloqueado en favor de easypump_60_30 verificado');
});
test('Personalizado y validación de límites (incluyendo coherencia estricta volumenReal === llenado y alerta ámbar DISPOSITIVO_PERSONALIZADO_SIN_FICHA)', () => {
  cerca(H.calcularDuracion({ id: 'custom', llenado: 120, ritmo: 3 }).horas, 40);
  cerca(H.calcularDuracion({ id: 'custom', llenado: 250, volumenReal: 250, ritmo: 2 }).horas, 125);
  assert.throws(() => H.calcularDuracion({ id: 'custom', llenado: 100, ritmo: 0 }));
  assert.throws(() => H.calcularDuracion({ id: 'custom', llenado: 300, maxLlenado: 250, ritmo: 2 }));
  assert.throws(() => H.calcularDuracion({ id: 'custom', llenado: 20, llenadoMin: 40, ritmo: 2 }));
  assert.throws(() => H.calcularDuracion({ id: 'custom', llenado: 100, ritmo: 0.2, minRitmo: 0.5 }));
  assert.throws(() => H.calcularDuracion({ id: 'custom', llenado: 100, ritmo: 12, maxRitmo: 10 }));
  assert.throws(() => H.calcularDuracion({ id: 'custom', llenado: 250, volumenReal: 252, ritmo: 2 }), /incoherente con el volumen de llenado/i);
  assert.throws(() => H.calcularDuracion({ id: 'custom', llenado: 100, volumenReal: 90, ritmo: 2 }), /incoherente con el volumen de llenado/i);

  const rCustom = H.calcularInfusor({
    infusor: { id: 'custom', llenado: 100, ritmo: 2 },
    farmacos: [{ farmaco: 'morfina', presentacion: 'morfina_2', dosisDiaria: 60 }],
  });
  assert.strictEqual(rCustom.semaforo.nivel, 'ambar');
  assert.ok(rCustom.semaforo.alertas.some((a) => a.codigo === 'DISPOSITIVO_PERSONALIZADO_SIN_FICHA'));
});
test('Catálogo de infusores incluye metadatos verificables del fabricante y coherencia llenado === volumenReal', () => {
  Object.keys(H.INFUSORES).forEach((id) => {
    const inf = H.INFUSORES[id];
    assert.ok(typeof inf.fabricante === 'string' && inf.fabricante.length > 0, id + '.fabricante');
    if (id !== 'custom') {
      assert.ok(typeof inf.referenciaFabricante === 'string' && inf.referenciaFabricante.length > 0, id + '.referenciaFabricante');
      assert.strictEqual(inf.verificadoFabricante, true, id + '.verificadoFabricante');
    } else {
      assert.strictEqual(inf.verificadoFabricante, false, 'custom.verificadoFabricante');
    }
    assert.ok(inf.llenadoMin > 0 && inf.llenado >= inf.llenadoMin && inf.llenado <= inf.maxLlenado, id + ' límites volumen');
    assert.ok(inf.minRitmo > 0 && inf.ritmo >= inf.minRitmo && inf.ritmo <= inf.maxRitmo, id + ' límites caudal');
    assert.strictEqual(inf.volumenReal, inf.llenado, id + ' volumenReal === llenado para concentración exacta');
    assert.ok(typeof inf.fuente === 'string' && inf.fuente.length > 0, id + '.fuente');
  });
});

console.log('\nCaso clínico testigo: morfina 60 mg/día, Nipro Surefuser+ SFS-2-25P-EJ (250 ml @ 2 ml/h = 125 h)');
const testigo = H.calcularInfusor({
  infusor: 'sfs2_250',
  farmacos: [{ farmaco: 'morfina', presentacion: 'morfina_2', dosisDiaria: 60 }],
});
test('125 h / 5,21 días', () => { cerca(testigo.horas, 125); cerca(testigo.dias, 125 / 24); });
test('312,5 mg totales', () => cerca(testigo.farmacos[0].totalMg, 312.5));
test('8 ampollas 40 mg/2 ml', () => assert.strictEqual(testigo.farmacos[0].ampollas, 8));
test('15,625 ml a añadir (mostrado como 15,63 ml)', () => {
  cerca(testigo.farmacos[0].volumenAspirar, 15.625);
  assert.strictEqual(testigo.farmacos[0].textoAnadir, 'Añadir al infusor: 15,63 ml');
});
test('0,375 ml sobrantes', () => cerca(testigo.farmacos[0].volumenSobrante, 0.375));
test('234,375 ml de suero (volumenFinal = 250 ml exactos y caudal 2 ml/h entrega exactamente 60 mg/24 h)', () => {
  cerca(testigo.suero, 234.375);
  cerca(testigo.volumenFinal, 250);
  const concentracionMgMl = testigo.farmacos[0].totalMg / testigo.volumenFinal;
  const entregaDiariaMg = concentracionMgMl * testigo.infusor.ritmo * 24;
  cerca(entregaDiariaMg, 60, 'la concentración final × caudal × 24 h entrega exactamente la dosis diaria prescrita');
});
test('rescate = 1/6 de 60 mg = 10 mg (0.5 ml de ampolla 2%)', () => {
  cerca(testigo.farmacos[0].rescate.mgMin, 10);
  cerca(testigo.farmacos[0].rescate.mlMin, 0.5);
});
test('semáforo verde', () => assert.strictEqual(testigo.semaforo.nivel, 'verde'));

console.log('\nSelector de duración rápida: 1 día / 2 días / 5 días / 7 días (morfina 60 mg/día)');
test('1 día (dia_48, 48 ml @ 2 ml/h): 24 h, 60 mg totales, 3 ml a añadir, 45 ml de suero', () => {
  const r = H.calcularInfusor({ infusor: 'dia_48', farmacos: [{ farmaco: 'morfina', presentacion: 'morfina_2', dosisDiaria: 60 }] });
  cerca(r.horas, 24); cerca(r.dias, 1);
  cerca(r.farmacos[0].totalMg, 60); cerca(r.farmacos[0].volumenAspirar, 3);
  cerca(r.suero, 45);
});
test('5 días Baxter (baxter_lv2_5d, 240 ml @ 2 ml/h = 120 h exactas): 300 mg totales, 15 ml a añadir, 225 ml de suero', () => {
  const r = H.calcularInfusor({ infusor: 'baxter_lv2_5d', farmacos: [{ farmaco: 'morfina', presentacion: 'morfina_2', dosisDiaria: 60 }] });
  cerca(r.horas, 120); cerca(r.dias, 5);
  cerca(r.farmacos[0].totalMg, 300); cerca(r.farmacos[0].volumenAspirar, 15);
  cerca(r.suero, 225); cerca(r.volumenFinal, 240);
});
test('2 días (dia_2, 100 ml @ 2 ml/h = 50 h): 125 mg totales, 4 ampollas, 6,25 ml a añadir, 93,75 ml de suero, verde', () => {
  const r = H.calcularInfusor({ infusor: 'dia_2', farmacos: [{ farmaco: 'morfina', presentacion: 'morfina_2', dosisDiaria: 60 }] });
  const f = r.farmacos[0];
  cerca(r.horas, 50); cerca(r.dias, 50 / 24);
  cerca(f.totalMg, 125); assert.strictEqual(f.ampollas, 4);
  cerca(f.volumenAspirar, 6.25); cerca(f.volumenSobrante, 1.75);
  cerca(r.volumenAspirado, 6.25); cerca(r.suero, 93.75); cerca(r.volumenFinal, 100);
  assert.strictEqual(r.volumenExcedido, false);
  assert.strictEqual(r.semaforo.nivel, 'verde');
});
test('7 días (dia_7, 250 ml @ 1,5 ml/h = 166,67 h / ~7 días): 416,67 mg totales, 20,83 ml a añadir, 229,17 ml de suero, volumenFinal = 250 ml (Corrección 12)', () => {
  const r = H.calcularInfusor({ infusor: 'dia_7', farmacos: [{ farmaco: 'morfina', presentacion: 'morfina_2', dosisDiaria: 60 }] });
  cerca(r.horas, 166.66666666666666); cerca(r.dias, 166.66666666666666 / 24);
  cerca(r.farmacos[0].totalMg, 60 * (166.66666666666666 / 24));
  cerca(r.farmacos[0].volumenAspirar, (60 * (166.66666666666666 / 24)) / 20);
  cerca(r.suero, 250 - r.farmacos[0].volumenAspirar);
  cerca(r.volumenFinal, 250);
  const entregaDiaria = (r.farmacos[0].totalMg / r.volumenFinal) * r.infusor.ritmo * 24;
  cerca(entregaDiaria, 60, '7 días 250 ml @ 1,5 ml/h entrega exactamente 60 mg/24 h sin error de dilución');
});

console.log('\nFármacos, presentaciones y precisión de volúmenes pequeños (HYP-004)');
test('vial morfina 400 mg/20 ml: 1 vial, 4,25 ml sobrantes en 5,25 días, textoAbrir usa "vial"', () => {
  const f = H.calcularFarmaco({ farmaco: 'morfina', presentacion: 'morfina_vial', dosisDiaria: 60 }, 5.25);
  assert.strictEqual(f.ampollas, 1); cerca(f.volumenAspirar, 15.75); cerca(f.volumenSobrante, 4.25);
  assert.strictEqual(f.textoAnadir, 'Añadir al infusor: 15,75 ml');
  assert.strictEqual(f.textoAbrir, 'Abrir: 1 vial');
  assert.strictEqual(f.sobraContenido, true);
  assert.strictEqual(f.notaSobrante, 'Puede sobrar contenido');
});
test('fmt nunca muestra "0" para volúmenes positivos pequeños y calcularInfusor emite alerta ámbar VOLUMEN_NO_MEDIBLE cuando < 0,05 ml', () => {
  assert.strictEqual(H.fmt(0), '0');
  assert.strictEqual(H.fmt(0.002), '0,002');
  assert.strictEqual(H.fmt(0.0004), '0,0004');
  assert.notStrictEqual(H.fmt(0.001), '0');

  const rMicro = H.calcularInfusor({
    infusor: 'dia_48',
    farmacos: [{ farmaco: 'morfina', presentacion: 'morfina_2', dosisDiaria: 0.04 }],
  });
  // 0,04 mg en 40 mg/2 ml = 0,002 ml
  assert.strictEqual(rMicro.farmacos[0].textoAnadir, 'Añadir al infusor: 0,002 ml');
  assert.strictEqual(rMicro.semaforo.nivel, 'ambar');
  assert.ok(rMicro.semaforo.alertas.some((a) => a.codigo === 'VOLUMEN_NO_MEDIBLE'));
});
test('múltiplo exacto no añade ampolla extra (80 mg de morfina 40 mg → 2), pero exceso real de 1e-9 sí redondea hacia arriba', () => {
  const f = H.calcularFarmaco({ farmaco: 'morfina', presentacion: 'morfina_2', dosisDiaria: 80 }, 1);
  assert.strictEqual(f.ampollas, 2); cerca(f.volumenSobrante, 0);
  assert.strictEqual(f.sobraContenido, false);
  assert.strictEqual(f.notaSobrante, null);

  const fExceso = H.calcularFarmaco({ farmaco: 'morfina', presentacion: 'morfina_2', dosisDiaria: 40 + 4e-8 }, 1);
  assert.strictEqual(fExceso.ampollas, 2);
});
test('HYP-004 ejemplo 1: 10 ml con ampollas de 2 ml → añadir 10 ml, abrir 5 ampollas, sin sobrante', () => {
  const f = H.calcularFarmaco({ farmaco: 'morfina', presentacion: 'morfina_2', dosisDiaria: 200 }, 1);
  cerca(f.volumenAspirar, 10);
  assert.strictEqual(f.ampollas, 5);
  assert.strictEqual(f.textoAnadir, 'Añadir al infusor: 10 ml');
  assert.strictEqual(f.textoAbrir, 'Abrir: 5 ampollas');
  assert.strictEqual(f.sobraContenido, false);
  cerca(f.totalMg, 200, 'el redondeo de envases no modifica la dosis');
});
test('HYP-004 ejemplo 2: 13 ml con ampollas de 2 ml → añadir 13 ml, abrir 7 ampollas, con nota de sobrante', () => {
  const f = H.calcularFarmaco({ farmaco: 'morfina', presentacion: 'morfina_2', dosisDiaria: 260 }, 1);
  cerca(f.volumenAspirar, 13);
  assert.strictEqual(f.ampollas, 7);
  assert.strictEqual(f.textoAnadir, 'Añadir al infusor: 13 ml');
  assert.strictEqual(f.textoAbrir, 'Abrir: 7 ampollas');
  assert.strictEqual(f.sobraContenido, true);
  assert.strictEqual(f.notaSobrante, 'Puede sobrar contenido');
  cerca(f.totalMg, 260, 'el redondeo a 7 ampollas nunca aumenta el volumen ni la dosis a incorporar (sigue siendo 260 mg / 13 ml)');
});
test('HYP-004 generalización a todos los fármacos y presentaciones del catálogo (con números de registro CIMA verificados)', () => {
  Object.keys(H.FARMACOS).forEach((k) => {
    const def = H.FARMACOS[k];
    def.presentaciones.forEach((p) => {
      const dosisPrueba = 24;
      const f = H.calcularFarmaco({ farmaco: k, presentacion: p.id, dosisDiaria: dosisPrueba }, 2.5);
      const esperadoTotalMg = dosisPrueba * 2.5;
      const esperadoVol = (esperadoTotalMg / p.mg) * p.ml;
      const esperadoEnvases = Math.ceil(esperadoTotalMg / p.mg - Number.EPSILON * 16);
      cerca(f.totalMg, esperadoTotalMg, k + '/' + p.id + ' totalMg');
      cerca(f.volumenAspirar, esperadoVol, k + '/' + p.id + ' volumenAspirar');
      assert.strictEqual(f.ampollas, esperadoEnvases, k + '/' + p.id + ' ampollas');
      assert.ok(f.textoAnadir.startsWith('Añadir al infusor: '), k + '/' + p.id + ' textoAnadir');
      assert.ok(f.textoAbrir.startsWith('Abrir: ' + esperadoEnvases + ' '), k + '/' + p.id + ' textoAbrir');
      assert.ok(typeof p.cima === 'string' && /^\d+$/.test(p.cima), k + '/' + p.id + ' registro CIMA');
    });
  });
  const mida5 = H.FARMACOS.midazolam.presentaciones.find((p) => p.id === 'mida_5');
  const mida50 = H.FARMACOS.midazolam.presentaciones.find((p) => p.id === 'mida_50');
  const morfVial = H.FARMACOS.morfina.presentaciones.find((p) => p.id === 'morfina_vial');
  assert.strictEqual(mida5.cima, '65314', 'mida_5 (5 mg/1 ml) apunta al CIMA 65314');
  assert.strictEqual(mida50.cima, '65796', 'mida_50 (50 mg/10 ml Normon) apunta al CIMA 65796');
  assert.strictEqual(morfVial.cima, '82749', 'morfina_vial (400 mg/20 ml B. Braun) apunta al CIMA 82749');
});
test('midazolam 15 mg/3 ml, 30 mg/día 2 días → 12 ml, 4 ampollas', () => {
  const f = H.calcularFarmaco({ farmaco: 'midazolam', presentacion: 'mida_15', dosisDiaria: 30 }, 2);
  cerca(f.volumenAspirar, 12); assert.strictEqual(f.ampollas, 4);
});
test('catálogo completo presente', () => {
  ['morfina', 'midazolam', 'butilescopolamina', 'haloperidol', 'levomepromazina', 'dexametasona', 'metoclopramida']
    .forEach((k) => assert.ok(H.FARMACOS[k], k));
  assert.strictEqual(H.FARMACOS.morfina.presentaciones.length, 3);
  assert.strictEqual(H.FARMACOS.midazolam.presentaciones.length, 3);
});
test('calcularInfusor detecta filas incompletas mezcladas con filas válidas y emite alerta roja FILA_INCOMPLETA', () => {
  const r = H.calcularInfusor({
    infusor: 'sfs2_250',
    farmacos: [
      { farmaco: 'morfina', presentacion: 'morfina_2', dosisDiaria: 60 },
      { farmaco: 'midazolam', presentacion: 'mida_15', dosisDiaria: '' },
    ],
  });
  assert.strictEqual(r.filasIncompletas, 1);
  assert.strictEqual(r.semaforo.nivel, 'rojo');
  assert.ok(r.semaforo.alertas.some((a) => a.codigo === 'FILA_INCOMPLETA'));
});

console.log('\nBloqueo de metadona');
test('convertirOpioide("metadona") bloqueado con alerta roja', () => {
  const r = H.convertirOpioide('metadona', 30);
  assert.strictEqual(r.bloqueado, true); assert.strictEqual(r.nivel, 'rojo');
  assert.ok(/no lineal/i.test(r.mensaje));
  assert.strictEqual(r.morfinaOral, undefined);
});
test('variantes de nombre (Metadona / methadone) también bloqueadas', () => {
  assert.strictEqual(H.convertirOpioide('Metadona', 10).bloqueado, true);
  assert.strictEqual(H.convertirOpioide('methadone', 10).bloqueado, true);
});
test('planGuiado con metadona → bloqueo + semáforo rojo', () => {
  const p = H.planGuiado({ opioide: 'metadona', sintomas: ['dolor'] });
  assert.strictEqual(p.semaforo.nivel, 'rojo'); assert.strictEqual(p.bloqueos.length, 1);
  assert.strictEqual(p.sugerencias.filter((s) => s.farmaco === 'morfina').length, 0);
});

console.log('\nHYP-001 — Combinaciones de parches de fentanilo y conversor de opioides');
test('fentanilo 50 mcg/h → 120 mg oral → 60 mg SC y rango de rotación Anexo 5 (25–50 % reducción: 30–45 mg SC)', () => {
  const r = H.convertirOpioide('fentanilo_td', 50);
  cerca(r.morfinaOral, 120); cerca(r.morfinaSC, 60); cerca(r.rescateSC, 10);
  cerca(r.rangoRotacionSC[0], 30); cerca(r.rangoRotacionSC[1], 45);
});
test('parches individuales 12.5/25/50/75/100 → 30/60/120/180/240 mg oral', () => {
  [[12.5, 30], [25, 60], [50, 120], [75, 180], [100, 240]].forEach(([p, o]) => cerca(H.convertirOpioide('fentanilo_td', p).morfinaOral, o));
});
test('HYP-001: combinación 100 + 25 = 125 µg/h sin inventar presentación comercial de 125', () => {
  assert.ok(!H.PRESENTACIONES_FENTANILO_TD.some((p) => p.liberacion === 125), 'no existe presentación comercial de 125 µg/h');
  assert.ok(H.convertirOpioide('fentanilo_td', 125).error, '125 como parche único es rechazado por no existir presentación comercial');
  const comb = H.convertirOpioide('fentanilo_td', [
    { parche: 100, cantidad: 1 },
    { parche: 25, cantidad: 1 },
  ]);
  assert.ok(!comb.error, 'la combinación 100 + 25 es válida');
  cerca(comb.dosis, 125, 'total 125 µg/h');
  assert.strictEqual(comb.desgloseTexto, '100 + 25 = 125 µg/h');
  cerca(comb.morfinaOral, 300, '240 + 60 = 300 mg morfina oral/24 h');
  cerca(comb.morfinaSC, 150, '150 mg morfina SC/24 h');
  cerca(comb.rescateSC, 25, 'rescate 1/6 = 25 mg SC');
  assert.strictEqual(comb.extrapoladoFueraTablaAnexo6, false, '125 µg/h está dentro del límite tabulado de 150 µg/h');
  assert.strictEqual(comb.transferibleAInfusor, true);
  assert.ok(/AEMPS\/CIMA/.test(comb.aviso) && /no demuestra por sí sola/.test(comb.aviso), 'incluye advertencia fundamentada en fuentes oficiales');
});
test('HYP-001: combinación > 150 µg/h conserva desglose y total µg/h pero NO extrapola morfina ni permite transferencia automática al infusor', () => {
  const r200 = H.convertirOpioide('fentanilo_td', [{ parche: 100, cantidad: 2 }]);
  cerca(r200.dosis, 200);
  assert.strictEqual(r200.desgloseTexto, '100 + 100 = 200 µg/h');
  assert.strictEqual(r200.extrapoladoFueraTablaAnexo6, true);
  assert.strictEqual(r200.transferibleAInfusor, false);
  assert.strictEqual(r200.morfinaOral, null);
  assert.strictEqual(r200.morfinaSC, null);
  assert.ok(r200.advertenciasEspecificas.some((m) => /Fuera de rango tabulado \(> 150 µg\/h\)/.test(m)));
});
test('HYP-001: límite superior de seguridad para cantidad de parches simultáneos (previene cuelgue con enteros gigantes)', () => {
  const t0 = Date.now();
  const rGigante = H.calcularParchesFentanilo([{ parche: 25, cantidad: 1000000000 }]);
  const elapsed = Date.now() - t0;
  assert.ok(rGigante.error && /superior al límite admitido/i.test(rGigante.error));
  assert.ok(elapsed < 50, 'validación inmediata O(1) sin bloqueo del hilo');
});
test('HYP-001: distinción inequívoca entre 12/12,5 µg/h y 125 µg/h', () => {
  const p12 = H.convertirOpioide('fentanilo_td', [{ parche: 12.5, cantidad: 1 }]);
  const p12Alias = H.convertirOpioide('fentanilo_td', [{ parche: 12, cantidad: 1 }]);
  const p125 = H.convertirOpioide('fentanilo_td', [{ parche: 100, cantidad: 1 }, { parche: 25, cantidad: 1 }]);
  cerca(p12.dosis, 12.5);
  cerca(p12Alias.dosis, 12.5);
  cerca(p12.morfinaOral, 30);
  cerca(p125.dosis, 125);
  cerca(p125.morfinaOral, 300);
  assert.strictEqual(p125.dosis / p12.dosis, 10, '125 µg/h es exactamente 10 veces 12,5 µg/h');
  assert.ok(/12 \(12,5\) µg\/h/.test(p12.desgloseTexto));
  assert.strictEqual(p125.desgloseTexto, '100 + 25 = 125 µg/h');
});
test('HYP-001: múltiples parches de igual potencia (p. ej. 2 × 75 = 150 µg/h) y validación de cantidades enteras', () => {
  const r = H.convertirOpioide('fentanilo_td', [{ parche: 75, cantidad: 2 }]);
  cerca(r.dosis, 150);
  assert.strictEqual(r.desgloseTexto, '75 + 75 = 150 µg/h');
  cerca(r.morfinaOral, 360);
  cerca(r.morfinaSC, 180);
  assert.ok(H.calcularParchesFentanilo([]).error, 'lista vacía → error');
  assert.ok(H.calcularParchesFentanilo([{ parche: 50, cantidad: 0 }]).error, 'cantidad 0 → error');
  assert.ok(H.calcularParchesFentanilo([{ parche: 50, cantidad: 1.5 }]).error, 'cantidad decimal → error');
  assert.ok(H.calcularParchesFentanilo([{ parche: 50, cantidad: -1 }]).error, 'cantidad negativa → error');
  assert.ok(H.calcularParchesFentanilo([{ parche: 125, cantidad: 1 }]).error, 'presentación 125 inexistente → error');
});
test('parche no comercializado → error', () => assert.ok(H.convertirOpioide('fentanilo_td', 40).error));
test('oxicodona 40 mg → 60 mg oral (factor 1,5–2, se aplica 1,5) con aviso de titulación', () => {
  const r = H.convertirOpioide('oxicodona', 40);
  cerca(r.morfinaOral, 60); assert.ok(/1,5–2/.test(r.factorTexto)); assert.ok(/seguridad|prudencia/.test(r.aviso));
});
test('tapentadol 100 mg → 33 mg oral (factor 0,33, NO 250)', () => {
  const r = H.convertirOpioide('tapentadol', 100);
  cerca(r.morfinaOral, 33); assert.ok(r.morfinaOral < 40 + 1e-6); assert.ok(/0,33/.test(r.factorTexto));
});
test('buprenorfina TD: rangos 35→60–70, 52.5→90–105, 70→120–140', () => {
  [[35, 60, 70], [52.5, 90, 105], [70, 120, 140]].forEach(([p, a, b]) => {
    const r = H.convertirOpioide('buprenorfina_td', p);
    cerca(r.rangoMorfinaOral[0], a); cerca(r.rangoMorfinaOral[1], b);
  });
});
test('morfina oral 60 → SC 30 (50 %) y Tabla 2 oficial FT AEMPS 69733 (§4.2, ~150:1) para inicio de fentanilo TD', () => {
  const r60 = H.convertirOpioide('morfina_oral', 60);
  cerca(r60.morfinaSC, 30);
  assert.strictEqual(r60.fentaniloTD.parcheTabla2Rotacion, 12.5, '60 mg/24 h morfina oral (< 90 mg) → 12,5 µg/h en Tabla 2 FT AEMPS 69733');
  assert.strictEqual(H.fentaniloTDMasCercano(89).parcheTabla2Rotacion, 12.5);
  assert.strictEqual(H.fentaniloTDMasCercano(90).parcheTabla2Rotacion, 25);
  assert.strictEqual(H.fentaniloTDMasCercano(134).parcheTabla2Rotacion, 25);
  assert.strictEqual(H.fentaniloTDMasCercano(135).parcheTabla2Rotacion, 50);
  assert.strictEqual(H.fentaniloTDMasCercano(210).parcheTabla2Rotacion, 50, '210 mg/24 h morfina oral (135–224 mg) → 50 µg/h en Tabla 2 FT AEMPS 69733');
  assert.strictEqual(H.fentaniloTDMasCercano(224).parcheTabla2Rotacion, 50);
  assert.strictEqual(H.fentaniloTDMasCercano(225).parcheTabla2Rotacion, 75);
  assert.strictEqual(H.fentaniloTDMasCercano(314).parcheTabla2Rotacion, 75);
  assert.strictEqual(H.fentaniloTDMasCercano(315).parcheTabla2Rotacion, 100);
  assert.strictEqual(H.fentaniloTDMasCercano(404).parcheTabla2Rotacion, 100);
  assert.strictEqual(H.fentaniloTDMasCercano(405).parcheTabla2Rotacion, 125);
});
test('reducción por tolerancia cruzada 25 % (incluyendo combinación de parches)', () => {
  cerca(H.convertirOpioide('fentanilo_td', 50, { reduccion: 0.25 }).morfinaOral, 90);
  cerca(H.convertirOpioide('fentanilo_td', [{ parche: 100, cantidad: 1 }, { parche: 25, cantidad: 1 }], { reduccion: 0.25 }).morfinaOral, 225);
});
test('buprenorfina TD 35/52.5/70 → 60/90/120 mg oral, marcada "verificar"', () => {
  [[35, 60], [52.5, 90], [70, 120]].forEach(([p, o]) => cerca(H.convertirOpioide('buprenorfina_td', p).morfinaOral, o));
  assert.strictEqual(H.convertirOpioide('buprenorfina_td', 35).verificar, true);
});
test('tramadol 300 mg → 30 mg oral (prudente); fentanilo no requiere verificar', () => {
  cerca(H.convertirOpioide('tramadol', 300).morfinaOral, 30);
  assert.strictEqual(H.convertirOpioide('fentanilo_td', 50).verificar, false);
});
test('dosis inválida → error', () => assert.ok(H.convertirOpioide('oxicodona', 0).error));
test('opioides del catálogo presentes', () => {
  ['fentanilo_td', 'oxicodona', 'tapentadol', 'tramadol', 'hidromorfona', 'buprenorfina_td', 'morfina_oral', 'morfina_sc']
    .forEach((k) => assert.ok(H.OPIOIDES[k], k));
});

console.log('\nHYP-002 — Filtrado de infusores compatibles en modo Experto');
test('1 día → muestra dia_48 (B. Braun 4540010 a 48 ml) y easypump_60_30 (B. Braun 4540010 a 60 ml) con etiquetas breves de volumen y caudal', () => {
  const f1 = H.filtrarInfusoresCompatibles({ dias: 1 });
  assert.strictEqual(f1.ninguno, false);
  assert.strictEqual(f1.unico, false);
  assert.strictEqual(f1.autoseleccionado, null);
  assert.deepStrictEqual(f1.compatibles.map((c) => c.id), ['dia_48', 'easypump_60_30']);
  assert.strictEqual(f1.compatibles[0].etiquetaCorta, 'Volumen: 48 ml · Caudal: 2 ml/h (24 h)');
  assert.strictEqual(f1.compatibles[1].etiquetaCorta, 'Volumen: 60 ml · Caudal: 2 ml/h (30 h)');
});
test('1 día con volumen de fármacos de 52 ml → descarta dia_48 (llenado 48 ml) y selecciona automáticamente easypump_60_30 (único inequívoco)', () => {
  const f1Vol = H.filtrarInfusoresCompatibles({ dias: 1, volumenMinimo: 52 });
  assert.strictEqual(f1Vol.ninguno, false);
  assert.strictEqual(f1Vol.unico, true);
  assert.strictEqual(f1Vol.compatibles.length, 1);
  assert.strictEqual(f1Vol.autoseleccionado.id, 'easypump_60_30');
});
test('2 días → muestra dia_2 (100 ml @ 2 ml/h) y baxter_sv2_5_2d (120 ml @ 2,5 ml/h)', () => {
  const f2 = H.filtrarInfusoresCompatibles({ dias: 2 });
  assert.deepStrictEqual(f2.compatibles.map((c) => c.id), ['dia_2', 'baxter_sv2_5_2d']);
  assert.strictEqual(f2.unico, false);
  assert.strictEqual(f2.autoseleccionado, null);
});
test('4 días → único modelo (sfs1, Nipro SMA-123-10P-EJ), autoseleccionado inequívocamente', () => {
  const f4 = H.filtrarInfusoresCompatibles({ dias: 4 });
  assert.deepStrictEqual(f4.compatibles.map((c) => c.id), ['sfs1']);
  assert.strictEqual(f4.unico, true);
  assert.strictEqual(f4.autoseleccionado.id, 'sfs1');
});
test('5 días → muestra sfs2_250 (250 ml @ 2 ml/h) y baxter_lv2_5d (240 ml @ 2 ml/h) con etiquetas cortas diferenciadas', () => {
  const f5 = H.filtrarInfusoresCompatibles({ dias: 5 });
  assert.deepStrictEqual(f5.compatibles.map((c) => c.id), ['sfs2_250', 'baxter_lv2_5d']);
  assert.strictEqual(f5.unico, false);
  assert.strictEqual(f5.compatibles[0].etiquetaCorta, 'Volumen: 250 ml · Caudal: 2 ml/h (125 h)');
  assert.strictEqual(f5.compatibles[1].etiquetaCorta, 'Volumen: 240 ml · Caudal: 2 ml/h (120 h)');
});
test('7 días → único dispositivo compatible (dia_7, Baxter 2C1087KP), selección automática inequívoca', () => {
  const f7 = H.filtrarInfusoresCompatibles({ dias: 7 });
  assert.strictEqual(f7.compatibles.length, 1);
  assert.strictEqual(f7.unico, true);
  assert.strictEqual(f7.autoseleccionado.id, 'dia_7');
  assert.strictEqual(f7.ninguno, false);
});
test('duración sin dispositivo compatible (p. ej. 3 días) o volumen excesivo → ninguno = true, sin asignar dispositivo', () => {
  const f3 = H.filtrarInfusoresCompatibles({ dias: 3 });
  assert.strictEqual(f3.compatibles.length, 0);
  assert.strictEqual(f3.unico, false);
  assert.strictEqual(f3.autoseleccionado, null);
  assert.strictEqual(f3.ninguno, true);
  assert.ok(/No hay dispositivos verificados en catálogo/.test(f3.motivoIncompatibilidad));

  const fExceso = H.filtrarInfusoresCompatibles({ dias: 7, volumenMinimo: 280 });
  assert.strictEqual(fExceso.compatibles.length, 0);
  assert.strictEqual(fExceso.ninguno, true);
  assert.strictEqual(fExceso.autoseleccionado, null);
});

console.log('\nSemáforo clínico');
test('ROJO: volumen excedido', () => {
  const r = H.calcularInfusor({ infusor: 'dia_48', farmacos: [{ farmaco: 'morfina', presentacion: 'morfina_1', dosisDiaria: 1200 }] });
  assert.strictEqual(r.volumenExcedido, true); assert.strictEqual(r.semaforo.nivel, 'rojo');
  assert.ok(r.semaforo.alertas.some((a) => a.codigo === 'VOLUMEN_EXCEDIDO')); cerca(r.suero, 0);
});
test('ROJO: metadona', () => assert.strictEqual(H.evaluarSemaforo({ metadona: true }).nivel, 'rojo'));
test('ÁMBAR: dexametasona en infusor prolongado', () => {
  const r = H.calcularInfusor({ infusor: 'sfs2_250', farmacos: [{ farmaco: 'dexametasona', dosisDiaria: 8 }] });
  assert.strictEqual(r.semaforo.nivel, 'ambar'); assert.strictEqual(r.semaforo.alertas[0].codigo, 'DEXA_PROLONGADO');
});
test('dexametasona en infusor de 24 h no alerta', () => {
  const r = H.calcularInfusor({ infusor: 'dia_48', farmacos: [{ farmaco: 'dexametasona', dosisDiaria: 8 }] });
  assert.strictEqual(r.semaforo.nivel, 'verde');
});
test('ÁMBAR: haloperidol + levomepromazina', () => {
  const s = H.evaluarSemaforo({ farmacos: ['haloperidol', 'levomepromazina'], dias: 1 });
  assert.strictEqual(s.nivel, 'ambar'); assert.strictEqual(s.alertas[0].codigo, 'HALO_LEVOME');
});
test('ÁMBAR: metoclopramida + butilescopolamina', () => {
  assert.strictEqual(H.evaluarSemaforo({ farmacos: ['metoclopramida', 'butilescopolamina'], dias: 1 }).nivel, 'ambar');
});
test('rojo prevalece sobre ámbar', () => {
  const s = H.evaluarSemaforo({ farmacos: ['haloperidol', 'levomepromazina'], dias: 1, metadona: true });
  assert.strictEqual(s.nivel, 'rojo'); assert.strictEqual(s.alertas.length, 2);
});
test('VERDE: combinación segura y apto', () => {
  const s = H.evaluarSemaforo({ farmacos: ['morfina', 'midazolam', 'butilescopolamina'], dias: 5 });
  assert.strictEqual(s.nivel, 'verde'); assert.strictEqual(s.apto, true);
});

console.log('\nModo guiado y Nota clínica (HYP-005)');
test('5 pasos definidos', () => assert.strictEqual(H.GUIA_PASOS.length, 5));
test('agonía naïve con estertores y dolor → morfina + butilescopolamina', () => {
  const p = H.planGuiado({ contexto: 'agonia', via: 'sc', sintomas: ['dolor', 'estertores'], opioide: 'naive', renal: 'normal' });
  assert.deepStrictEqual(p.sugerencias.map((s) => s.farmaco).sort(), ['butilescopolamina', 'morfina']);
  assert.strictEqual(p.semaforo.nivel, 'verde');
});
test('ERC grave no sugiere morfina', () => {
  const p = H.planGuiado({ sintomas: ['dolor'], opioide: 'naive', renal: 'grave' });
  assert.strictEqual(p.sugerencias.length, 0); assert.ok(p.advertencias.length);
});
test('HYP-005: nota clínica incluye resumen del infusor actual (fármacos, dosis/base temporal, volúmenes, diluyente, volumen final, duración, caudal/dispositivo)', () => {
  const n = H.generarNota({ infusor: testigo });
  assert.ok(/NOTA CLÍNICA · INFUSOR ACTUAL \(Hypnos (2\.2|2\.3)\)/.test(n));
  assert.ok(/Dispositivo: Surefuser™\+ SFS-2-25P-EJ · 250 ml @ 2 ml\/h \(125 h\)/.test(n));
  assert.ok(/Duración: 125 h \(5,21 días\) · Caudal: 2 ml\/h/.test(n));
  assert.ok(/Llenado nominal: 250 ml/.test(n));
  assert.ok(/Morfina clorhidrato \(Ampolla 2% · 40 mg\/2 ml\): 60 mg\/24 h \(total 312,5 mg en 5,21 días\) · Añadir al infusor: 15,63 ml · Abrir: 8 ampollas/.test(n));
  assert.ok(/Diluyente \(Suero fisiológico 0,9 %\): 234,38 ml/.test(n));
  assert.ok(/Volumen final preparado: 250 ml/.test(n));
  assert.ok(/cada 4 h si dolor o disnea/.test(n));
});
test('HYP-005: nota clínica retira el semáforo clínico y no genera afirmaciones ficticias sobre consentimiento, familia ni contexto', () => {
  const n = H.generarNota({
    sistema: 'mambrino',
    contexto: 'agonia',
    informaFamilia: true,
    sedacion: true,
    infusor: testigo,
    alertas: [H.bloqueoMetadona()],
  });
  assert.ok(!/SEMÁFORO/i.test(n), 'sin semáforo en la nota');
  assert.ok(!/familia/i.test(n), 'sin afirmación sobre información a la familia');
  assert.ok(!/consentimiento/i.test(n), 'sin afirmación sobre consentimiento');
  assert.ok(!/mambrino/i.test(n), 'sin campos administrativos');
});
test('HYP-005: cuando hay bloqueo rojo activo o volumen excedido, generarNota no emite la receta de preparación', () => {
  const nBloq = H.generarNota({ infusor: testigo, bloqueoActivo: true, motivoBloqueo: 'Metadona bloqueada.' });
  assert.ok(/PREPARACIÓN BLOQUEADA/.test(nBloq));
  assert.ok(!/Añadir al infusor/.test(nBloq), 'no incluye instrucciones de preparación cuando hay bloqueo activo');

  const rExceso = H.calcularInfusor({ infusor: 'dia_48', farmacos: [{ farmaco: 'morfina', presentacion: 'morfina_1', dosisDiaria: 1200 }] });
  const nExceso = H.generarNota({ infusor: rExceso });
  assert.ok(/PREPARACIÓN BLOQUEADA/.test(nExceso));
  assert.ok(!/Añadir al infusor/.test(nExceso), 'no incluye receta copiable cuando el volumen excede la capacidad del infusor');
});
test('HYP-005: nota conserva avisos de conversión de opioides (incluyendo rotación sin reducción) cuando aplica', () => {
  const conv = H.convertirOpioide('tramadol', 300);
  const n = H.generarNota({ infusor: testigo, conversion: conv, avisoFactor: 'Dosis procedente de Oxicodona oral sin verificar.' });
  assert.ok(/Oxicodona oral sin verificar/.test(n));
  assert.ok(/Tramadol oral pendiente de verificar/.test(n));
  assert.ok(/Sin reducción por tolerancia cruzada aplicada \(0 %\)/.test(n));
});
test('fechaLocal formatea sin T/Z', () => {
  const f = new Date(2026, 0, 5, 3, 7);
  assert.strictEqual(H.fechaLocal(f), '2026-01-05 03:07');
});
test('semáforo verde: texto sin promesa de seguridad', () => {
  assert.ok(/Requiere validación del prescriptor/.test(testigo.semaforo.resumen));
  assert.ok(!/apto para exportar/i.test(testigo.semaforo.resumen));
});
test('rescates de todos los fármacos incluyen intervalo mínimo', () => {
  Object.keys(H.FARMACOS).filter((k) => H.FARMACOS[k].rescate).forEach((k) => {
    const f = H.calcularFarmaco({ farmaco: k, presentacion: H.FARMACOS[k].presentaciones[0].id, dosisDiaria: 12 }, 1);
    assert.ok(f.rescate.intervaloH > 0 && /cada \d+ h/.test(f.rescate.texto), k);
  });
});
test('ERC grave: alerta ámbar ERC_GRAVE, sin morfina, metoclopramida al 50 %', () => {
  const p = H.planGuiado({ sintomas: ['dolor', 'nauseas'], opioide: 'naive', renal: 'grave' });
  assert.strictEqual(p.semaforo.nivel, 'ambar');
  assert.ok(p.semaforo.alertas.some((a) => a.codigo === 'ERC_GRAVE'));
  assert.ok(p.destacadas.some((a) => /M3G\/M6G/.test(a.mensaje) && /fentanilo o hidromorfona/.test(a.mensaje)));
  assert.strictEqual(p.sugerencias.filter((s) => s.farmaco === 'morfina').length, 0);
  assert.strictEqual(p.sugerencias.find((s) => s.farmaco === 'metoclopramida').dosisDiaria, 15);
  assert.strictEqual(H.planGuiado({ sintomas: ['nauseas'], opioide: 'naive', renal: 'normal' }).sugerencias[0].dosisDiaria, 30);
});
test('disnea: midazolam solo si se confirma', () => {
  const base = { sintomas: ['disnea'], opioide: 'naive', renal: 'normal' };
  assert.ok(!H.planGuiado(base).sugerencias.some((s) => s.farmaco === 'midazolam'));
  assert.ok(H.planGuiado(Object.assign({ midazolamDisnea: true }, base)).sugerencias.some((s) => s.farmaco === 'midazolam'));
  assert.strictEqual(H.planGuiado(base).ofreceMidazolamDisnea, true);
});
test('opioide previo: advertencia de no iniciar morfina naïve', () => {
  const p = H.planGuiado({ sintomas: ['dolor'], opioide: 'naive', renal: 'normal' });
  const pPrev = H.planGuiado({ sintomas: ['dolor'], opioide: 'previo', renal: 'normal' });
  assert.ok(p.sugerencias.length > 0);
  assert.ok(pPrev.destacadas.some((a) => /NO inicie morfina naïve/.test(a.mensaje)));
  assert.strictEqual(pPrev.sugerencias.length, 0);
});
test('apoyo a familias', () => {
  assert.ok(H.FAMILIAS.some((f) => /matar/.test(f.pregunta)));
  assert.ok(H.FAMILIAS.some((f) => /ahoga/.test(f.pregunta)));
});

console.log('\nHYP-006 y Guías imprimibles para familias (SECPAL)');
test('HYP-006 / HYPNOS 2.3: versión 2.3, autoría "JP" (mostrada como "by JP") y contacto jpccmedicine@gmail.com', () => {
  assert.strictEqual(H.VERSION, '2.3');
  assert.strictEqual(H.AUTOR, 'JP');
  assert.strictEqual(H.CONTACTO_EMAIL, 'jpccmedicine@gmail.com');
  assert.ok(H.FUENTES_CLINICAS && H.FUENTES_CLINICAS.aemps_fentanilo_69733);
});
test('3 guías con los IDs esperados', () => {
  assert.ok(Array.isArray(H.GUIAS_FAMILIA));
  assert.deepStrictEqual(H.GUIAS_FAMILIA.map((g) => g.id), ['rescate_sc', 'sintomas_domicilio', 'ultimos_dias']);
});
test('cada guía tiene título, subtítulo, introducción, secciones, advertencias, teléfonos y fuente', () => {
  const texto = (v) => typeof v === 'string' && v.trim().length > 0;
  H.GUIAS_FAMILIA.forEach((g) => {
    ['titulo', 'subtitulo', 'introduccion', 'fuente'].forEach((k) => assert.ok(texto(g[k]), g.id + '.' + k));
    assert.ok(Array.isArray(g.secciones) && g.secciones.length >= 3, g.id + '.secciones');
    g.secciones.forEach((s, i) => {
      assert.ok(texto(s.titulo), g.id + ' sección ' + i + ' sin título');
      assert.ok(texto(s.contenido) || texto(s.destacado) || (Array.isArray(s.items) && s.items.length), g.id + ' sección ' + i + ' vacía');
    });
    assert.ok(Array.isArray(g.advertencias) && g.advertencias.length && g.advertencias.every(texto), g.id + '.advertencias');
    assert.ok(Array.isArray(g.telefonos) && g.telefonos.length && g.telefonos.every((t) => texto(t.servicio)), g.id + '.telefonos');
    assert.ok(g.telefonos.some((t) => t.numero === '112'), g.id + ' sin 112');
    assert.ok(/SECPAL/.test(g.fuente), g.id + ' sin referencia SECPAL');
  });
});
test('advertencias incluyen el aviso obligatorio: dosis en ml, nunca en mg', () => {
  H.GUIAS_FAMILIA.forEach((g) => {
    assert.ok(g.advertencias.some((a) => /\bml\b/.test(a) && /mililitros/i.test(a) && /nunca administre una dosis expresada solo en mg/i.test(a)), g.id);
  });
});
test('las guías no indican dosis en mg a la familia', () => {
  H.GUIAS_FAMILIA.forEach((g) => assert.ok(!/\d\s*mg\b/i.test(JSON.stringify(g)), g.id));
});
const seccionGuia = (id, re) => H.GUIAS_FAMILIA.find((g) => g.id === id).secciones.find((s) => re.test(s.titulo));
test('rescate SC: comprobación obligatoria de presentación y concentración de la ampolla/vial frente a la pauta', () => {
  const s = seccionGuia('rescate_sc', /Comprobación obligatoria/);
  assert.ok(s, 'sección de comprobación obligatoria');
  assert.ok(/concentración/i.test(s.destacado) && /hoja de pauta/.test(s.destacado), 'destacado');
  assert.ok(s.items.some((i) => /presentación/i.test(i) && /concentración/i.test(i) && /ampolla/.test(i) && /vial/.test(i) &&
    /coincid/.test(i) && /hoja de pauta/.test(i) && /llame al equipo/i.test(i)), 'ítem de presentación/concentración');
});
test('estertores: matizado (habitualmente sin ahogo en agonía) y vigilancia de signos de incomodidad', () => {
  const s = seccionGuia('sintomas_domicilio', /estertores/i);
  assert.ok(/habitualmente no/i.test(s.destacado) && /agonía/.test(s.destacado), 'matización SECPAL/NICE');
  assert.ok(!/no le provocan asfixia ni sufrimiento/.test(s.destacado), 'sin afirmación absoluta');
  const texto = [s.destacado].concat(s.items).join(' ');
  assert.ok(/expresión facial|cara/.test(texto) && /gestos/.test(texto) && /incomodidad/.test(texto), 'vigilar expresión y gestos');
  assert.ok(s.items.some((i) => /expresión facial/.test(i) && /consulte con el equipo/.test(i)), 'consultar al equipo');
});

console.log('\nSemáforo global (mantenido durante construcción del infusor)');
const ALERTA_METADONA = H.bloqueoMetadona();
const ALERTA_ERC = H.planGuiado({ renal: 'grave' }).semaforo.alertas.find((a) => a.codigo === 'ERC_GRAVE');
test('semaforoGlobal: une módulos, deduplica por código y rojo prevalece', () => {
  const s = H.semaforoGlobal([ALERTA_ERC], [ALERTA_METADONA], [ALERTA_METADONA], null);
  assert.strictEqual(s.nivel, 'rojo'); assert.deepStrictEqual(s.alertas.map((a) => a.codigo), ['ERC_GRAVE', 'METADONA']);
  assert.strictEqual(H.semaforoGlobal([ALERTA_ERC]).nivel, 'ambar');
  assert.strictEqual(H.semaforoGlobal([], []).nivel, 'verde');
});


console.log('\nPruebas específicas de las 12 Correcciones (HYPNOS 2.3)');

test('Corrección 1: Desglose matemático explícito de operaciones en fármaco e infusor', () => {
  const r = H.calcularInfusor({
    infusor: 'dia_2',
    farmacos: [{ farmaco: 'morfina', presentacion: 'morfina_2', dosisDiaria: 60 }],
  });
  const f = r.farmacos[0];
  assert.ok(f.operaciones, 'f.operaciones presente');
  assert.ok(/40 mg \/ 2 ml = 20 mg\/ml/.test(f.operaciones.concentracion));
  assert.ok(/60 mg\/día × 2,08 días = 125 mg/.test(f.operaciones.dosisAcumulada));
  assert.ok(/125 mg ÷ 20 mg\/ml = 6,25 ml/.test(f.operaciones.volumenAspirar));
  assert.ok(/ceil\(6,25 ml ÷ 2 ml\) = 4 ampollas/.test(f.operaciones.ampollas));
  assert.ok(/4 × 2 ml = 8 ml/.test(f.operaciones.volumenEnvases));
  assert.ok(/8 ml - 6,25 ml = 1,75 ml/.test(f.operaciones.sobrante));

  assert.ok(r.operaciones, 'r.operaciones presente');
  assert.ok(/100 ml ÷ 2 ml\/h = 50 h/.test(r.operaciones.duracion));
  assert.ok(/Σ volúmenes de fármacos = 6,25 ml/.test(r.operaciones.volumenFarmacos));
  assert.ok(/100 ml \(llenado\) - 6,25 ml \(fármacos\) = 93,75 ml/.test(r.operaciones.diluyente));
  assert.ok(/6,25 ml \(fármacos\) \+ 93,75 ml \(suero\) = 100 ml/.test(r.operaciones.volumenFinal));
});

test('Corrección 3: Constructor vacío calcula correctamente estado sin fármacos precargados', () => {
  const vacio = H.calcularInfusor({ infusor: 'dia_48', farmacos: [] });
  assert.strictEqual(vacio.farmacos.length, 0);
  assert.strictEqual(vacio.volumenAspirado, 0);
  assert.strictEqual(vacio.suero, 48);
  assert.strictEqual(vacio.volumenFinal, 48);
  assert.strictEqual(vacio.volumenExcedido, false);
  assert.strictEqual(vacio.semaforo.nivel, 'verde');
  assert.ok(/0 ml/.test(vacio.operaciones.volumenFarmacos));
});

test('Corrección 6: Modo Guiado incluye opción «refractario» con recomendaciones SECPAL', () => {
  const p1 = H.GUIA_PASOS.find((p) => p.id === 'contexto');
  assert.ok(p1.opciones.some((o) => o.valor === 'refractario'), 'opción refractario en paso 1');
  const plan = H.planGuiado({ contexto: 'refractario', via: 'sc', sintomas: ['dolor'] });
  assert.ok(plan.medidas.some((m) => /refractariedad/i.test(m)), 'medida sobre refractariedad presente');
  assert.ok(plan.medidas.some((m) => /Paliativos/i.test(m)), 'recomendación de interconsulta');
});

test('Corrección 8: Catálogo farmacológico auditado y ketorolaco trometamol CIMA 70102 bloqueado', () => {
  assert.ok(H.CATALOGO_FARMACOLOGICO_AUDITADO, 'CATALOGO_FARMACOLOGICO_AUDITADO definido');
  const keto = H.CATALOGO_FARMACOLOGICO_AUDITADO.ketorolaco;
  assert.ok(keto, 'ketorolaco presente en auditoría');
  assert.strictEqual(keto.cima[0], '70102');
  assert.deepStrictEqual(keto.viasAprobadas, ['IV', 'IM']);
  assert.strictEqual(keto.viaSubcutaneaAprobada, false);
  assert.strictEqual(keto.duracionMaximaParenteralDias, 2);
  assert.strictEqual(keto.estadoInfusor, 'bloqueado_sc_offlabel');
  assert.strictEqual(keto.pendienteValidacionClinica, true);
  assert.ok(/off-label/i.test(keto.motivoBloqueo));
  assert.strictEqual(H.FARMACOS.ketorolaco, undefined, 'ketorolaco NO debe estar en FARMACOS activos');
});

test('Corrección 9: Escala de Sedación de Ramsay (6 niveles y evaluación clínica sin prescripción automática)', () => {
  assert.ok(H.ESCALA_RAMSAY, 'ESCALA_RAMSAY definida');
  assert.strictEqual(H.ESCALA_RAMSAY.niveles.length, 6, '6 niveles en Ramsay');
  assert.ok(/BMJ 1974/i.test(H.ESCALA_RAMSAY.fuente), 'cita original BMJ 1974');
  assert.ok(/NO determina por sí sola la indicación/i.test(H.ESCALA_RAMSAY.advertenciaClinica), 'advertencia clínica obligatoria');

  const rEnObj = H.evaluarRamsay({ nivelObservado: 3, nivelObjetivo: 3 });
  assert.strictEqual(rEnObj.valido, true);
  assert.strictEqual(rEnObj.concordancia, 'en_objetivo');
  assert.strictEqual(rEnObj.itemObservado.titulo, 'Nivel 3: Dormido; responde solo a órdenes verbales simples');

  const rInfra = H.evaluarRamsay({ nivelObservado: 2, nivelObjetivo: 4 });
  assert.strictEqual(rInfra.concordancia, 'infrasedacion');
  const rSobre = H.evaluarRamsay({ nivelObservado: 6, nivelObjetivo: 4 });
  assert.strictEqual(rSobre.concordancia, 'sobresedacion');

  assert.strictEqual(H.evaluarRamsay({ nivelObservado: 0 }).valido, false);
  assert.strictEqual(H.evaluarRamsay({ nivelObservado: 7 }).valido, false);
  assert.strictEqual(H.evaluarRamsay({ nivelObservado: 3, nivelObjetivo: 8 }).valido, false);

  const rDoc = H.evaluarRamsay({
    nivelObservado: 4,
    nivelObjetivo: 4,
    preferenciasPaciente: 'Prioriza confort y estar libre de dolor sobre lucidez continua',
    voluntadesAnticipadas: true,
    representanteLegal: true,
    consentimientoDocumentado: true,
  });
  assert.strictEqual(rDoc.voluntadesAnticipadas, true);
  assert.strictEqual(rDoc.representanteLegal, true);
  assert.strictEqual(rDoc.consentimientoDocumentado, true);
  assert.ok(/libre de dolor/i.test(rDoc.preferenciasPaciente));
});

test('Corrección 12: Eliminación total de capacidad 252 ml y bloqueo en catálogo', () => {
  Object.keys(H.INFUSORES).forEach((k) => {
    assert.notStrictEqual(H.INFUSORES[k].llenado, 252, `${k} llenado != 252`);
    assert.notStrictEqual(H.INFUSORES[k].volumenReal, 252, `${k} volumenReal != 252`);
  });
  assert.ok(H.INFUSORES_BLOQUEADOS.capacidad_252, 'capacidad_252 en INFUSORES_BLOQUEADOS');
  const d7 = H.INFUSORES.dia_7;
  assert.strictEqual(d7.llenado, 250);
  assert.strictEqual(d7.volumenReal, 250);
  assert.strictEqual(d7.ritmo, 1.5);
  cerca(d7.volumenReal / d7.ritmo, 166.66666666666666);
});

console.log('\n' + pasados + ' pasados, ' + fallos.length + ' fallidos');
if (fallos.length) process.exit(1);
