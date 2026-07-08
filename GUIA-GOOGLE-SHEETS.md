# ☁️ Guía: conectar el Dashboard con Google Sheets (datos compartidos)

Esta guía te permite compartir los datos del dashboard entre **dos dispositivos**
usando una **Google Sheet** como base de datos y **Google Apps Script** como
capa de lectura/escritura. No necesitas backend ni frameworks.

> **Idea general:** el dashboard sigue funcionando 100% local (localStorage).
> Si configuras la nube, además **lee y guarda** los datos en la hoja compartida.
> Si la nube falla, sigue en **modo local** sin romperse.

---

## 1) Crea la Google Sheet

1. Ve a <https://sheets.google.com> y crea una hoja nueva (en blanco).
2. Ponle un nombre, por ejemplo **Presupuesto Demian & Ana**.
3. No necesitas crear columnas a mano: el script crea la pestaña **`Meses`** y
   los encabezados automáticamente la primera vez que se guarda.

> Si quieres verla desde el inicio, puedes crear una pestaña llamada `Meses`
> con estos encabezados en la fila 1 (opcional, el script también lo hace solo):
>
> ```
> mes | updatedAt | incomeDemian | incomeAna | rent | services | groceries |
> netflix | disney | ants | social | personalCare | investPct | pctDemian |
> pctAna | weeklyTarget | emergencyGoal | emergencyCurrent | emergencyDemian |
> emergencyAna | w1 | w2 | w3 | w4
> ```
>
> Cada **fila = un mes** (`2026-07`, `2026-08`, …). Cada **columna = un campo**.

---

## 2) Pega el Apps Script

1. En la hoja: menú **Extensiones → Apps Script**.
2. Borra el contenido de `Código.gs` y pega **todo** el archivo
   [`Code.gs`](./Code.gs) de este repositorio.
3. Guarda (💾).

### (Opcional pero recomendado) Token para proteger la escritura

1. En el editor de Apps Script: ⚙️ **Configuración del proyecto**
   (Project Settings) → **Propiedades del script** (Script properties)
   → **Agregar propiedad**.
2. Nombre: `ACCESS_TOKEN` · Valor: una frase secreta que compartirán los dos
   (ej. `pareja-2026-secreta`).
3. Guarda. A partir de ahora, **guardar** requiere ese token (leer no).
   Lo pondrás en el dashboard más adelante.

> Si no configuras `ACCESS_TOKEN`, cualquiera con la URL podría escribir.
> Para uso personal está bien, pero el token añade una capa simple de seguridad.

---

## 3) Publica el Web App

1. En el editor de Apps Script, arriba a la derecha: **Implementar → Nueva implementación**.
2. En "Tipo", elige **Aplicación web** (Web app).
3. Configura:
   - **Descripción:** `Budget API` (lo que quieras).
   - **Ejecutar como:** **Yo** (tu cuenta).
   - **Quién tiene acceso:** **Cualquier usuario** (Anyone).
4. Pulsa **Implementar**. Acepta los permisos que pida (es tu propia hoja).
5. Copia la **URL del Web App**. Debe terminar en **`/exec`**, algo como:

   ```
   https://script.google.com/macros/s/AKfycb....../exec
   ```

> Si más adelante editas `Code.gs`, usa **Implementar → Gestionar implementaciones
> → (editar) → Nueva versión** para publicar los cambios en la misma URL.

---

## 4) Conecta el dashboard

1. Abre `index.html` (el dashboard) en tu navegador.
2. En la barra superior pulsa **☁️ Nube**.
3. Pega la **URL** que termina en `/exec`.
4. Si configuraste token, pégalo en **Token de acceso** (debe ser idéntico al de
   Script properties).
5. Pulsa **Probar conexión** → debe decir *"Conexión correcta ✓"*.
6. Pulsa **Guardar y conectar**. El estado de la barra cambiará a
   *"Sincronizando…"* y luego *"Sincronizado ✓"*.

> La URL y el token se guardan **solo en tu navegador** (localStorage),
> nunca en el código. Por eso cada dispositivo se configura una vez.

### Subir tus datos locales por primera vez

Si ya tenías meses guardados localmente, en el modal **☁️ Nube** pulsa
**"Subir datos locales"** una vez para copiarlos a la hoja compartida.

---

## 5) Conecta el segundo dispositivo

1. Abre la **misma** `index.html` (mismo archivo o misma URL si lo publicas).
2. **☁️ Nube** → pega la **misma URL** y el **mismo token** → **Guardar y conectar**.
3. Verás los mismos datos que en el primer dispositivo. 🎉

> **Publicar el dashboard (opcional):** puedes subir `index.html` a GitHub Pages,
> Netlify, etc., para abrirlo desde una URL en ambos teléfonos. Como la URL/token
> se guardan en cada navegador, **no** quedan expuestos en el repositorio.

---

## 6) Cómo funciona la sincronización (UX)

- **Autosave con debounce:** al editar valores, el estado muestra
  *"● Cambios sin guardar…"* y ~1.6 s después *"Guardando…"* → *"Guardado ✓ hh:mm"*.
  Así no se escribe en cada tecla.
- **🔄 Sincronizar:** trae los últimos datos de la hoja (útil cuando tu pareja
  actualizó algo desde el otro dispositivo). Primero envía tus cambios pendientes
  y luego baja todo.
- **Estados posibles:** `Modo local (sin nube)`, `Cargando datos compartidos…`,
  `Sincronizando…`, `Guardando en la nube…`, `Guardado ✓`, `Sincronizado ✓`,
  `Sin conexión (modo local)`, `Error al guardar (modo local)`.
- **Si la nube falla**, el dashboard sigue funcionando con los datos locales.

> No hay tiempo real: los cambios del otro dispositivo aparecen al recargar o al
> pulsar **🔄 Sincronizar**.

---

## 7) Probar que ambos ven lo mismo

1. En el **dispositivo A**, cambia un valor (p. ej. la renta) y espera
   *"Guardado ✓"*.
2. En el **dispositivo B**, pulsa **🔄 Sincronizar** (o recarga).
3. Debe aparecer el nuevo valor. Repite en sentido contrario para confirmar.

---

## Estructura de datos (resumen)

| Concepto | Dónde |
|---|---|
| Un mes | Una **fila** en la pestaña `Meses` (columna `mes` = `2026-07`) |
| Cada dato del dashboard | Una **columna** (mismos nombres que los `id` de los inputs) |
| Marca de tiempo | Columna `updatedAt` (ISO, la pone el script) |
| Historial | Cada mes es su propia fila; se conservan todos |

Campos que se guardan por mes: `incomeDemian`, `incomeAna`, `rent`, `services`,
`groceries`, `netflix`, `disney`, `ants`, `social`, `personalCare`, `investPct`,
`pctDemian`, `pctAna`, `weeklyTarget`, `emergencyGoal`, `emergencyCurrent`,
`emergencyDemian`, `emergencyAna`, `w1`, `w2`, `w3`, `w4`.
Si en el futuro se agrega un campo nuevo, el script **crea la columna solo**.

---

## Decisiones de diseño (breve)

- **Apps Script como micro‑API**: `doGet` (leer) y `doPost` (escribir) sobre la
  hoja, sin servidores ni credenciales en el frontend.
- **POST con cuerpo de texto plano**: evita el *preflight* CORS de Apps Script
  (petición "simple"), que suele romper los `POST` con `application/json`.
- **URL/token en localStorage**, no en el código → no expones secretos en el repo.
- **Local primero, nube después**: arranque instantáneo y offline; la nube
  sincroniza en segundo plano y es el respaldo compartido.
- **Última escritura gana** por mes (`updatedAt`): simple y suficiente para dos
  personas. Si ambos editan el mismo mes a la vez, gana quien guarda al final.

---

## Solución de problemas

| Síntoma | Causa probable | Solución |
|---|---|---|
| *"No se pudo conectar"* al probar | La URL no termina en `/exec` o el acceso no es "Cualquier usuario" | Revisa la implementación (paso 3) |
| Lee pero no guarda (`unauthorized`) | El token del dashboard ≠ `ACCESS_TOKEN` de Script properties | Iguala ambos o borra el token en ambos lados |
| Cambié `Code.gs` y no aplica | No publicaste una versión nueva | *Implementar → Gestionar implementaciones → ✏️ → Versión: Nueva versión* (misma URL) |
| `"Missing month parameter"` u otro error viejo | El Web App sirve una versión antigua del script | Vuelve a pegar `Code.gs` y publica **versión nueva** |
| Aparecía **"Invalid Date"** o un mes raro | Google Sheets convirtió `2026-07` en fecha | Ya resuelto: el frontend normaliza y el nuevo `Code.gs` guarda la columna `mes` como texto |
| ⚠️ *"La nube tiene una versión más reciente"* | Tu pareja guardó el mismo mes desde otro dispositivo | Pulsa **Recargar desde la nube** (traer lo suyo) o **Guardar de todos modos** (que ganen tus cambios) |
| Error CORS en consola | Deploy con acceso restringido | Debe ser **Cualquier usuario** |
| No veo cambios del otro equipo | No hay tiempo real | Pulsa **🔄 Sincronizar** o recarga |

---

## Protección contra conflictos (recomendado: republicar)

La versión actual de `Code.gs` añade **detección de conflictos** (compara `updatedAt`)
y guarda la columna `mes` como **texto** (evita el bug de "Invalid Date").

Para activarlo:
1. Pega la versión actual de `Code.gs` en el editor de Apps Script y guarda.
2. **Implementar → Gestionar implementaciones → ✏️ → Versión: «Nueva versión» → Implementar.**

> El dashboard funciona **aunque no republiques** (hace *fallback* elegante), pero
> sin republicar no tendrás la advertencia de conflicto entre dispositivos.

Cómo se ve un conflicto: si tú y tu pareja editan **el mismo mes** y guardan casi a la
vez, quien guarde después verá un aviso amarillo con dos opciones: **Recargar desde la
nube** (descarta lo tuyo y trae lo de tu pareja) o **Guardar de todos modos** (tus
cambios sobrescriben). Así nadie pierde datos "en silencio".

### Filas duplicadas y datos borrados

- **Duplicados por mes:** si por error quedan dos filas con el mismo `mes`, el script
  usa siempre la de **`updatedAt` más reciente** y, al guardar ese mes, **borra las
  filas sobrantes** automáticamente. El dashboard te avisa: *"Sincronizado ⚠ — N mes(es)
  con filas duplicadas (usé la más reciente)"*.
- **Celdas vacías / borradas a mano:** si alguien borra valores en la hoja, el dashboard
  **rellena con valores por defecto** por campo (nunca muestra NaN ni se rompe) y avisa:
  *"N con datos recuperados por defecto"*.
- **Columnas nuevas (presupuesto planeado):** los campos `planRent`, `planServices`,
  `planGroceries`, `planSubs`, `planFun`, `planPersonal` se agregan como **columnas
  nuevas automáticamente** la primera vez que guardas; no tienes que crearlas.

