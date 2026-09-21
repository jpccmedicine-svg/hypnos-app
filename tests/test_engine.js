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

console.log('\nInfusores');
test('SFS-2 250 ml @ 2 ml/h → 125 h / 5.21 d', () => {
  const d = H.calcularDuracion('sfs2_250');
  cerca(d.horas, 125); cerca(d.dias, 125 / 24); cerca(H.round(d.dias, 2), 5.21);
});
test('SFS-2 252 ml → 126 h / 5.25 d', () => {
  const d = H.calcularDuracion('sfs2_252');
  cerca(d.horas, 126); cerca(d.dias, 5.25);
});
test('SFS-1 100 ml @ 1 ml/h → 100 h', () => cerca(H.calcularDuracion('sfs1').horas, 100));
test('Baxter 2C1009K 100 ml @ 2 ml/h → 50 h', () => cerca(H.calcularDuracion('baxter_2c1009k').horas, 50));
test('Infusores 1 día (48 y 60 ml) → 24 h', () => {
  cerca(H.calcularDuracion('dia_48').horas, 24);
  cerca(H.calcularDuracion('dia_60').horas, 24);
});
test('Personalizado y validación', () => {
  cerca(H.calcularDuracion({ id: 'custom', llenado: 120, ritmo: 3 }).horas, 40);
  assert.throws(() => H.calcularDuracion({ id: 'custom', llenado: 100, ritmo: 0 }));
});

console.log('\nCaso clínico testigo: morfina 60 mg/día, Surefuser 252 ml reales (llenado 250 ml) @ 2 ml/h');
const testigo = H.calcularInfusor({
  infusor: 'sfs2_252',
  farmacos: [{ farmaco: 'morfina', presentacion: 'morfina_2', dosisDiaria: 60 }],
});
test('5.25 días', () => cerca(testigo.dias, 5.25));
test('315 mg totales', () => cerca(testigo.farmacos[0].totalMg, 315));
test('8 ampollas 40 mg/2 ml', () => assert.strictEqual(testigo.farmacos[0].ampollas, 8));
test('15.75 ml a aspirar', () => cerca(testigo.farmacos[0].volumenAspirar, 15.75));
test('0.25 ml a desechar', () => cerca(testigo.farmacos[0].volumenSobrante, 0.25));
test('234.25 ml de suero', () => cerca(testigo.suero, 234.25));
test('rescate = 1/6 de 60 mg = 10 mg (0.5 ml de ampolla 2%)', () => {
  cerca(testigo.farmacos[0].rescate.mgMin, 10);
  cerca(testigo.farmacos[0].rescate.mlMin, 0.5);
});
test('semáforo verde', () => assert.strictEqual(testigo.semaforo.nivel, 'verde'));

console.log('\nFármacos y presentaciones');
test('vial morfina 400 mg/20 ml: 1 vial, 4.25 ml sobrantes', () => {
  const f = H.calcularFarmaco({ farmaco: 'morfina', presentacion: 'morfina_vial', dosisDiaria: 60 }, 5.25);
  assert.strictEqual(f.ampollas, 1); cerca(f.volumenAspirar, 15.75); cerca(f.volumenSobrante, 4.25);
});
test('múltiplo exacto no añade ampolla extra (80 mg de morfina 40 mg → 2)', () => {
  const f = H.calcularFarmaco({ farmaco: 'morfina', presentacion: 'morfina_2', dosisDiaria: 80 }, 1);
  assert.strictEqual(f.ampollas, 2); cerca(f.volumenSobrante, 0);
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

console.log('\nConversor de opioides (Ministerio de Sanidad 2024)');
test('fentanilo 50 mcg/h → 120 mg oral → 60 mg SC', () => {
  const r = H.convertirOpioide('fentanilo_td', 50);
  cerca(r.morfinaOral, 120); cerca(r.morfinaSC, 60); cerca(r.rescateSC, 10);
});
test('parches 12.5/25/75/100 → 30/60/180/240 mg oral', () => {
  [[12.5, 30], [25, 60], [75, 180], [100, 240]].forEach(([p, o]) => cerca(H.convertirOpioide('fentanilo_td', p).morfinaOral, o));
});
test('parche no comercializado → error', () => assert.ok(H.convertirOpioide('fentanilo_td', 40).error));
test('oxicodona 40 mg → 60 mg oral (factor 1,5–2, se aplica 1,5) con aviso de titulación', () => {
  const r = H.convertirOpioide('oxicodona', 40);
  cerca(r.morfinaOral, 60); assert.ok(/1,5–2/.test(r.factorTexto)); assert.ok(/prudencia/.test(r.aviso));
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
test('morfina oral 60 → SC 30 (50 %)', () => cerca(H.convertirOpioide('morfina_oral', 60).morfinaSC, 30));
test('reducción por tolerancia cruzada 25 %', () => cerca(H.convertirOpioide('fentanilo_td', 50, { reduccion: 0.25 }).morfinaOral, 90));
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

console.log('\nModo guiado y nota');
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
test('nota clínica incluye pauta y semáforo', () => {
  const n = H.generarNota({ sistema: 'mambrino', contexto: 'agonia', infusor: testigo, fecha: '2026-01-01 03:00' });
  assert.ok(/234,25 ml/.test(n)); assert.ok(/8 × Ampolla 2% · 40 mg\/2 ml/.test(n)); assert.ok(/VERDE/.test(n));
});
test('nota conserva el aviso de la dosis aplicada aunque la conversión en pantalla sea otra', () => {
  const conv = H.convertirOpioide('tramadol', 300);
  const n = H.generarNota({ infusor: testigo, conversion: conv, avisoFactor: 'Dosis procedente de Oxicodona oral sin verificar.' });
  assert.ok(/Oxicodona oral sin verificar/.test(n)); assert.ok(/Tramadol oral pendiente de verificar/.test(n));
});
test('nota sin conversión aplicada → prescripción manual directa, sin bloque de conversión', () => {
  const n = H.generarNota({ infusor: testigo, fecha: '2026-01-01 03:00' });
  assert.ok(/prescripción manual directa/.test(n)); assert.ok(!/CONVERSIÓN DE OPIOIDES/.test(n));
});
test('nota con conversión aplicada refleja procedencia y aviso de oxicodona', () => {
  const n = H.generarNota({ infusor: testigo, conversion: H.convertirOpioide('oxicodona', 40) });
  assert.ok(/CONVERSIÓN DE OPIOIDES/.test(n)); assert.ok(/conversión de opioides aplicada al infusor/.test(n));
  assert.ok(!/manual directa/.test(n)); assert.ok(/Titule con prudencia/.test(n));
});
test('nota: desglose de volúmenes y rescate con intervalo', () => {
  const n = H.generarNota({ infusor: testigo });
  assert.ok(/fármacos a aspirar: 15,75 ml/.test(n)); assert.ok(/desechar 0,25 ml/.test(n));
  assert.ok(/a añadir: 234,25 ml/.test(n)); assert.ok(/volumen final preparado: 250 ml/.test(n));
  assert.ok(/cada 4 h si dolor o disnea; si precisa >3-4 rescates en 24 h, reevaluar pauta basal/.test(n));
  cerca(testigo.volumenFinal, 250);
});
test('nota: informa familia solo si se marca y fecha local (sin T/Z)', () => {
  assert.ok(!/Se informa a familia/.test(H.generarNota({})));
  assert.ok(/Se informa a familia/.test(H.generarNota({ informaFamilia: true })));
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
  const p = H.planGuiado({ sintomas: ['dolor'], opioide: 'previo', renal: 'normal' });
  assert.ok(p.destacadas.some((a) => /NO inicie morfina naïve/.test(a.mensaje)));
  assert.strictEqual(p.sugerencias.length, 0);
});
test('apoyo a familias', () => {
  assert.ok(H.FAMILIAS.some((f) => /matar/.test(f.pregunta)));
  assert.ok(H.FAMILIAS.some((f) => /ahoga/.test(f.pregunta)));
});

console.log('\n' + pasados + ' pasados, ' + fallos.length + ' fallidos');
if (fallos.length) process.exit(1);
