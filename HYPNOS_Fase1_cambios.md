# HYPNOS · Fase 1 — registro de cambios (v1 → v1.1)

Correcciones de seguridad y la decisión clínica de dosificación por duración real del dispositivo. **No se ha tocado ningún factor, equivalencia, umbral ni compatibilidad clínica.** El motor de cálculo (`Engine`) es idéntico. Todos los cambios están comentados en el código con la etiqueta `[Fase 1 · …]`.

Archivo entregado: `hypnos.html` (v1.1). La clave de almacenamiento sigue siendo `hypnos_v1`, así que **tus datos guardados y tus copias exportadas anteriores siguen funcionando** (se sanean al cargarse).

---

## Qué cambia y por qué

### C2 · Dosificación por duración real del dispositivo *(decisión clínica tuya)*
Antes la dosis se calculaba sobre días redondeados (`txDays` = 5 / 7 / 2). Ahora se calcula sobre la duración real: **volumen ÷ ritmo**. Con ello, lo que el infusor entrega cada 24 h coincide con la dosis diaria que introduces, y desaparece el desfase de −4,8 % que tenían los dispositivos de 5 y 2 días.
- Ejemplo: SFS-2 (2 ml/h) cargado a 252 ml dura 5,25 días → la dosis se calcula para 5,25 días, no para 5.
- Los campos `days`/`txDays` del catálogo de infusores quedan solo como etiqueta comercial; ya no intervienen en el cálculo.
- La línea informativa y la copia para HC muestran ahora la duración real con dos decimales.

### T1 · Inyección de HTML (XSS)
Todo texto introducido por el usuario (nombres y presentaciones propias, nombres de opioides propios) y el texto de las alertas se **escapan** antes de insertarse en pantalla (`esc()`). Un nombre con `<img onerror=…>` ya no se ejecuta, ni escrito a mano ni traído en una copia importada.

### T2 · Importación/carga sin validar
Se elimina el `Object.assign` ciego de un JSON arbitrario. Ahora `sanitizeState()` copia **solo claves conocidas**, valida tipos e identificadores, descarta lo desconocido y **protege tus factores clínicos** de ser sobrescritos por una copia manipulada o corrupta. Se aplica tanto al importar como al cargar de `localStorage`.

### T3 · Robustez ante datos incoherentes
Si una copia importada referencia un fármaco u opioide que ya no existe, la app **lo ignora** en vez de romperse (`filter(Boolean)` y guardas `if(!d)`/`if(!op)`). Antes, ese caso podía dejar la pantalla en blanco.

### Nuevo · Bloqueo de seguridad
Se formaliza el tercer nivel de alerta que faltaba. Cualquier **alerta roja** (volumen imposible, supera el máximo del infusor, fármaco IV en infusor SC, fármaco no mezclable junto a otros…) **deshabilita “Copiar para HC”** —con la casilla de validación marcada o sin ella— hasta que se resuelva. No inventa umbrales: usa exactamente las condiciones rojas que ya existían.

---

## Pruebas ejecutadas (todas OK)

Se cargó la aplicación completa en un DOM simulado (Node) y se ejecutaron:

- **Motor:** casos dorados existentes + morfina 60 mg/día × 5 días = 300 mg, 30 amp. ✔
- **Duración real (C2):** SFS-2 @252 ml = 5,25 días; 60 mg/día × 5,25 d = 315 mg → 31,5 ml → 32 ampollas. ✔
- **Escapado (T1):** `esc('<img …>')` neutraliza el HTML. ✔
- **Saneado hostil (T2/T3):** un JSON con `infuserId` inválido, volumen negativo, fármaco inexistente, dosis negativa, id con caracteres raros, override de factor para un opioide inexistente y claves basura → queda depurado a un estado válido, sin contaminación de prototipo. ✔

---

## Lo que NO se ha tocado (intacto)
- Motor de cálculo (`Engine`).
- Factores de equivalencia, tablas transdérmicas, umbral ≥90 DEM, reglas de compatibilidad. *(Eso es Fase 2.)*
- Diseño visual, navegación, exportar/importar, feedback.

---

## Cómo revisarlo
1. Abre `hypnos.html` en el móvil o navegador y comprueba que todo funciona igual que antes (infusor, conversor, ajustes, exportar/importar).
2. Fíjate en la línea del infusor: ahora dice la duración real (p. ej. “5,25 días”).
3. Prueba a forzar una alerta roja (p. ej. volumen 300 ml en un infusor de 252) y verifica que “Copiar para HC” se bloquea.
4. Si algo no te cuadra, es el momento de decirlo: esto es un candidato a revisar antes de integrarlo como tu versión de trabajo.

## Siguiente paso propuesto
**Fase 2:** extraer el contenido clínico a una capa versionada con fuente por regla, anclando las equivalencias a la tabla del Plan de Optimización de Opioides del Ministerio de Sanidad (Anexo 6, 2024/2025) y la sedación/protocolos a SECPAL, con el aviso ≥90 DEM como informativo (no bloqueo) por ser un tope de dolor crónico no oncológico, no paliativo.
