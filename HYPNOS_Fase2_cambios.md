# HYPNOS · Fase 2 — registro de cambios (v1.1 → v1.2)

Extracción del contenido clínico del conversor de opioides a una capa versionada con **fuente citada por regla** (`CLINICAL_SOURCES` + `src`/`srcRef` en cada entrada de `OPIOIDS_BASE`), ancladas al documento oficial vigente. El motor de cálculo del infusor (`Engine`) y las presentaciones inyectables (`DRUGS_BASE`) **no se han tocado** — eso queda fuera del alcance de esta fase.

Archivo entregado: `hypnos.html` (v1.2). Clave de almacenamiento `hypnos_v1` sin cambios: los datos guardados siguen funcionando.

---

## Fuente principal verificada

**Plan de Optimización de Opioides en Dolor Crónico No Oncológico — Documento de apoyo para profesionales sanitarios.** Ministerio de Sanidad (España).
[PDF oficial](https://www.sanidad.gob.es/areas/farmacia/publicaciones/planOptimizacion/docs/opioides/Documentos_de_apoyo_al_Plan._Uso_de_opioides_para_dolor_cronico_no_oncologico.pdf) — Tabla 1 del Anexo 6 (pág. 37) y Anexo 4 (pág. 33). Verificado extrayendo el texto del PDF oficial línea a línea y contrastando cada factor contra la tabla, el 2026-07-27.

No se localizó una fuente SECPAL numérica verificable online para las reglas de compatibilidad de midazolam/levomepromazina/dexametasona; esas siguen citando el **Manual ICO (4ª ed., cap. 15)**, como en Fase 1.

---

## Qué cambia y por qué

### Capa de fuentes por regla
Nuevo objeto `CLINICAL_SOURCES` (nombre, organismo, URL, fecha de verificación) y campos `src`/`srcRef` en cada entrada de `OPIOIDS_BASE`. La fuente se muestra ahora también **en la interfaz** (bajo el editor de factor/tabla de cada opioide), no solo en comentarios de código.

### Codeína: factor 0,083 → 0,1
La tabla oficial (Anexo 6, Tabla 1) da un único punto de referencia: 200 mg codeína oral = 20 mg morfina oral → factor 0,1. Sustituye al valor previo de consenso (1/12), tras confirmación explícita del usuario.

### Fentanilo transdérmico: tabla corregida
- Se **añade** el punto oficial 37 µg/h → 90 mg morfina oral/día, ausente en la tabla anterior.
- Se **sustituye** el punto no oficial 125 µg/h → 300 mg por el punto oficial 150 µg/h → 360 mg.
- Tabla resultante (µg/h → mg morfina oral/día): 12→30, 25→60, 37→90, 50→120, 75→180, 100→240, 150→360.

### Techos de dosis informativos (Anexo 6)
Nuevos avisos ámbar, no bloqueantes, cuando la dosis introducida del fármaco de origen supera el techo recomendado por el Anexo 6:
- Tapentadol retard: >500 mg/día.
- Tramadol: >400 mg/día.

### Aviso ≥90 DEM: contexto e informativo explícito
El aviso (ya era ámbar, nunca bloqueaba) ahora aclara textualmente que el techo de 90 mg DEM/día es una recomendación del Anexo 4 (manejo de tolerancia) **para dolor crónico NO oncológico**, no un límite establecido en cuidados paliativos, y que es puramente informativo.

### Confirmado sin cambios (mismo valor, ahora con fuente citada)
Morfina SC ×2, oxicodona oral ×1,5, oxicodona/naloxona ×1,5 (componente oxicodona), tapentadol ×0,4, tramadol ×0,1, hidromorfona oral ×5, tabla de buprenorfina transdérmica (35→60, 52,5→90, 70→120, 105→180, 140→240 µg/h→mg). Todos coinciden exactamente con la Tabla 1 del Anexo 6.

### Textos actualizados
Disclaimer principal, pie de la vista "Conversor opioide" y asunto del correo de sugerencias, para reflejar la nueva fuente y la versión v1.2.

---

## Pruebas ejecutadas

Se abrió `hypnos.html` en navegador y se comprobó consola (sin errores, casos dorados existentes OK) más los nuevos casos dorados añadidos al autochequeo:
- Codeína 200 mg → 20 mg morfina oral. ✔
- Fentanilo 37 µg/h → 90 mg morfina oral/día. ✔
- Fentanilo 150 µg/h → 360 mg morfina oral/día. ✔

Verificación manual en UI:
- Codeína 200 mg/día, rotación 25% → 15 mg/día morfina oral (20 × 0,75). Fuente visible en pantalla. ✔
- Fentanilo 37 µg/h, rotación 25% → 67,5 mg/día (90 × 0,75). ✔
- Tapentadol 600 mg/día → aviso ámbar de techo (500 mg/día) + aviso ámbar ≥90 DEM con el nuevo texto contextual; ambos no bloquean "Copiar para HC". ✔

---

## Lo que NO se ha tocado (intacto)
- Motor de cálculo del infusor (`Engine`) y duración real (Fase 1).
- Presentaciones inyectables (`DRUGS_BASE`) y sus alertas de compatibilidad (fuente ICO, sin cambios).
- Bloqueo de seguridad del infusor ante alertas rojas (Fase 1, sin cambios; el conversor de opioides nunca tuvo bloqueo, sigue igual).
- Diseño visual, navegación, exportar/importar, saneado de estado (T1/T2/T3 de Fase 1).

## Siguiente paso propuesto
Si se localiza una fuente SECPAL numérica verificable, anclar con ella las reglas de compatibilidad de midazolam/levomepromazina/dexametasona (hoy Manual ICO). Revisar si procede añadir buprenorfina sublingual al catálogo (factor ×75 según Anexo 6, no implementado por no estar en el catálogo actual de fármacos de origen).
