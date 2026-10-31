# 🏠 Mis Arriendos

Aplicación muy sencilla para administrar arriendos, pensada para que una persona mayor la use sola:
letra grande, botones grandes, todo en español y sin palabras técnicas.

Viene preparada con **dos edificios: uno de 6 apartamentos y otro de 5** (se pueden renombrar,
agregar o quitar en *Configuración*).

## ¿Qué hace?

| Necesidad | Cómo se hace |
|---|---|
| Ver quién pagó este mes | La pantalla de inicio muestra cada apartamento en verde (pagado), amarillo (pendiente) o rojo (atrasado), y el total recibido. |
| Registrar un pago | Tocar el apartamento → **Registrar un pago** → (opcional) tomar foto del recibo → **Guardar**. El mes y el valor ya vienen escritos. |
| Guardar los recibos | La foto o PDF del recibo queda guardada con el pago. Las fotos se achican solas para no ocupar espacio. |
| Dar comprobante al arrendatario | Después de guardar un pago aparece el comprobante numerado, con el valor en letras, para **imprimir** o **enviar por WhatsApp**. |
| Recordar un pago atrasado | Botón **Recordar por WhatsApp**: abre WhatsApp con el mensaje ya escrito. |
| Contrato nuevo | Apartamento desocupado → **Nuevo arrendatario** → escribir nombre, cédula y teléfono. Las condiciones (valor, depósito, duración, día de pago) se copian del contrato anterior. El contrato se arma solo. |
| Renovar | **Renovar contrato**: todo queda escrito, solo se revisa el valor y la fecha. |
| Imprimir el contrato | **Imprimir o guardar como PDF**, o **Descargar para Word** si se quiere modificar algo a mano. |
| Guardar el contrato firmado | **Documentos** → tomar foto o subir PDF del contrato firmado, la cédula, el inventario… |
| Avisos | Al inicio aparecen los pagos atrasados, los contratos que vencen en menos de 60 días y el recordatorio de copia de seguridad. |
| Cambiar el texto del contrato | *Configuración → Texto del contrato*. Las palabras entre `{{ }}` se reemplazan solas con los datos de cada arrendatario. |

## Cómo se usa (para quien la instala)

No necesita servidor, internet ni cuentas. Es una página web que guarda todo **en el propio aparato**.

**Opción recomendada — publicarla en internet y "instalarla" en la tablet o celular:**

1. Publicar esta carpeta en cualquier hosting de páginas estáticas (GitHub Pages, Netlify, Vercel…).
   En GitHub Pages: *Settings → Pages → Deploy from a branch → main / (root)*.
2. Abrir la dirección en la tablet o celular (Chrome en Android, Safari en iPhone/iPad).
3. Menú del navegador → **Agregar a la pantalla de inicio**. Queda un ícono como cualquier aplicación,
   y funciona aunque no haya internet.

**Opción sin internet (computador):** abrir `index.html` con doble clic en Chrome o Edge.
Funciona, pero no se puede "instalar" como aplicación.

### Primeros pasos

1. Ir a **Configuración** y escribir los datos del dueño (nombre, cédula, dirección, ciudad)
   y el código de país para WhatsApp (57 Colombia, 56 Chile, etc.).
2. En la misma pantalla, escribir el nombre y la dirección de cada edificio y los nombres de los apartamentos.
3. Revisar el **Texto del contrato** y ajustarlo a su país. ⚠️ El texto que viene es una base general:
   conviene que un abogado lo revise una vez.
4. Por cada apartamento ocupado, tocar **Nuevo arrendatario** y escribir los datos.
   Los meses anteriores a empezar a usar la aplicación aparecen como "Sin registro", no como deuda.

## ⚠️ Copia de seguridad

Toda la información vive en el aparato. Si se pierde, se daña o se borran los datos del navegador, se pierde todo.
La aplicación recuerda hacer una copia **cada mes**: *Copia de seguridad → Enviar copia por correo o WhatsApp*.
El archivo (`respaldo-arriendos-AAAA-MM-DD.json`) se recupera en cualquier aparato con *Cargar una copia guardada*.

## Archivos

```
index.html            Página principal
css/styles.css        Diseño (letra grande, colores, impresión)
js/util.js            Formato de dinero, fechas y números en letras
js/db.js              Almacenamiento en el navegador (IndexedDB)
js/templates.js       Texto del contrato y del comprobante
js/app.js             Pantallas y lógica
sw.js                 Funcionamiento sin internet
manifest.webmanifest  Ícono y nombre al instalarla
```

Sin dependencias ni compilación: se edita y se publica tal cual.
Al cambiar archivos, subir el número `VERSION` en `sw.js` para que los aparatos reciban la mejora.
