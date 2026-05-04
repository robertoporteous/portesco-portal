# PORTESCO Parent Portal - Resumen del proyecto

## 1. Que es la aplicación

`portesco-portal` es una aplicacion web para PORTESCO Sports pensada como portal multi-colegio para actividades extracurriculares. La idea del producto es que padres, profesores/coordinadores y administracion puedan ver y gestionar informacion de estudiantes, actividades, asistencia, reportes mensuales, eventos y noticias.

El PRD existente define el objetivo como una aplicacion SaaS multi-tenant para PORTESCO Sports S.A., enfocada en colegios privados de Panama, con tres tipos de usuario:

- Padres: ven informacion de sus hijos, actividades, avances, calendario, noticias y perfil.
- Coordinadores/profesores: toman asistencia, llenan reportes mensuales y consultan estudiantes.
- Admin/Roberto: administra colegios, estudiantes, staff, reportes, eventos, noticias y configuracion general.

El objetivo de despliegue documentado es `app.portescosports.com`, usando Vercel para hosting y Supabase como backend.

## 2. Estado actual real del folder

El proyecto ya tiene una base tecnica montada, pero la mayoria de las pantallas aun son placeholders. Es decir: existe la estructura de rutas y la intencion funcional, pero todavia no hay logica conectada a base de datos ni flujos completos.

Ya existe:

- Proyecto Next.js con App Router.
- TypeScript.
- Tailwind CSS 4.
- Configuracion visual base con tokens de marca PORTESCO.
- Rutas separadas para padres, staff y admin.
- Pantalla de login con formulario visual para magic link.
- Layout movil para padres con navegacion inferior.
- Layout de staff con sidebar.
- Layout de admin con sidebar.
- Tipos TypeScript para las entidades principales de negocio.
- Constantes de negocio: grados, categorias, estados, metricas, colegios semilla, reglas de pago basicas.
- Manifest PWA en `public/manifest.json`.
- Endpoints API iniciales para auth, webhook y cron.
- PRD completo del producto: `PORTESCO_Parent_Portal_PRD.md`.

Todavia pendiente o incompleto:

- Supabase no esta implementado realmente en el codigo.
- No esta instalado `@supabase/supabase-js` ni `@supabase/ssr`.
- No hay migraciones SQL reales en `supabase/migrations`; solo existe `.gitkeep`.
- La autenticacion por magic link esta en stub.
- La proteccion de rutas por rol esta documentada, pero actualmente permite todo el trafico.
- Las pantallas de padres, staff y admin muestran textos de "Proximamente".
- No hay CRUD real para estudiantes, actividades, reportes, eventos o noticias.
- No hay conexion a datos reales.
- No hay subida de imagenes ni bucket de fotos.
- El PWA manifest referencia iconos `icon-192.png` e `icon-512.png`, pero no aparecen en `public/icons`.
- No hay pruebas automatizadas visibles.

## 3. Stack tecnico detectado

Segun `package.json`, el proyecto usa:

- Next.js `16.2.2`
- React `19.2.4`
- TypeScript
- Tailwind CSS `^4`
- shadcn `^4.1.2`
- `@base-ui/react`
- `lucide-react`
- `class-variance-authority`
- `clsx`
- `tailwind-merge`
- `tw-animate-css`

Scripts disponibles:

```bash
npm run dev
npm run build
npm run start
npm run lint
```

## 4. Estructura principal

La estructura importante del proyecto es:

```text
portesco-portal/
  app/
    (parent)/
      page.tsx
      progress/page.tsx
      calendar/page.tsx
      news/page.tsx
      profile/page.tsx
      layout.tsx
    (staff)/
      staff/page.tsx
      staff/attendance/page.tsx
      staff/reports/page.tsx
      staff/students/page.tsx
      layout.tsx
    (admin)/
      admin/page.tsx
      admin/schools/page.tsx
      admin/schools/[slug]/page.tsx
      admin/students/page.tsx
      admin/staff/page.tsx
      admin/reports/page.tsx
      admin/events/page.tsx
      admin/news/page.tsx
      admin/settings/page.tsx
      layout.tsx
    api/
      auth/route.ts
      webhook/route.ts
      cron/route.ts
    login/page.tsx
    globals.css
    layout.tsx
  lib/
    constants.ts
    types.ts
    supabase/
      client.ts
      server.ts
      middleware.ts
  public/
    manifest.json
    icons/
  supabase/
    migrations/
  PORTESCO_Parent_Portal_PRD.md
  package.json
  proxy.ts
```

## 5. Modulos que tiene la aplicacion

### Portal de padres

Rutas existentes:

- `/`
- `/progress`
- `/calendar`
- `/news`
- `/profile`

Lo que ya se ve en codigo:

- Layout con navegacion inferior: Inicio, Avance, Calendario, Noticias, Perfil.
- Pagina de inicio placeholder.
- Pagina de avance placeholder.
- Pagina de calendario placeholder.
- Pagina de noticias placeholder.
- Pagina de perfil placeholder.

Lo que el PRD espera que tenga:

- Tarjeta del estudiante.
- Selector si hay varios hijos.
- Actividades inscritas.
- Estadisticas rapidas, como cantidad de actividades y asistencia mensual.
- Proximo evento.
- Promociones.
- Reportes mensuales por actividad.
- Barras de metricas 1-5.
- Comentario del profesor.
- Calendario de eventos y horario semanal.
- Feed de noticias, resultados, galerias, promociones y recordatorios.
- Perfil del padre, hijos, colegio, grado y logout.

### Panel de staff / profesores / coordinadores

Rutas existentes:

- `/staff`
- `/staff/attendance`
- `/staff/reports`
- `/staff/students`

Lo que ya se ve en codigo:

- Layout con sidebar: Dashboard, Asistencia, Reportes, Estudiantes.
- Dashboard placeholder.
- Pantalla para tomar asistencia placeholder.
- Pantalla de reportes mensuales placeholder.
- Lista de estudiantes placeholder.

Lo que el PRD espera que tenga:

- Sesiones del dia.
- Reportes pendientes.
- Acciones rapidas.
- Flujo para tomar asistencia: seleccionar actividad, fecha y marcar estudiante como presente, ausente, excusado o tarde.
- Accion masiva para marcar todos presentes.
- Formulario de reporte mensual por estudiante.
- Metricas por tipo de actividad.
- Comentarios del profesor.
- Guardar y avanzar al siguiente estudiante.
- Lista de estudiantes con busqueda e historial.

### Panel admin

Rutas existentes:

- `/admin`
- `/admin/schools`
- `/admin/schools/[slug]`
- `/admin/students`
- `/admin/staff`
- `/admin/reports`
- `/admin/events`
- `/admin/news`
- `/admin/settings`

Lo que ya se ve en codigo:

- Layout con sidebar: Dashboard, Colegios, Estudiantes, Staff, Reportes, Eventos, Noticias, Configuracion.
- Todas las paginas son placeholders.

Lo que el PRD espera que tenga:

- Metricas globales: total de estudiantes, colegios activos, reportes completados y asistencia.
- Tarjetas por colegio.
- Vista detalle de colegio.
- Tabla de actividades.
- Conteos de inscritos.
- Graficas de inscripcion por actividad.
- Seguimiento de reportes por profesor y mes.
- Gestion de estudiantes.
- Gestion de staff.
- Gestion de eventos.
- Gestion de noticias y galerias.
- Configuracion general.

## 6. Modelo de datos planeado

El PRD y los tipos TypeScript contemplan estas entidades:

- `schools`: colegios.
- `activities`: actividades por colegio.
- `users`: padres, coordinadores, profesores y admin.
- `staff_schools`: relacion staff-colegio.
- `staff_activities`: relacion staff-actividad.
- `students`: estudiantes.
- `enrollments`: inscripciones de estudiantes en actividades.
- `attendance`: asistencia.
- `monthly_reports`: reportes mensuales.
- `events`: eventos y calendario.
- `news`: noticias/anuncios.
- `photos`: fotos asociadas a noticias.

Los roles definidos son:

- `parent`
- `coordinator`
- `professor`
- `admin`

Los estados de asistencia definidos son:

- `present`
- `absent`
- `excused`
- `late`

Los estados de inscripcion definidos son:

- `active`
- `trial`
- `withdrawn`
- `suspended`

## 7. Reglas de negocio ya documentadas

El PRD incluye estas reglas:

- Matricula: USD 10 una sola vez por estudiante.
- Descuentos York: USD 5 por actividad adicional y USD 5 por hermano.
- Minimo de estudiantes para abrir actividad: 8, excepto Entrepreneurs con 6.
- Fecha limite de pago: dia 10 de cada mes.
- Semana de prueba: varia por colegio. York esta documentado como marzo 9-13 con USD 30 no reembolsables.
- Reportes mensuales: deben estar listos el ultimo dia de cada mes.
- Asistencia: 3 o mas asistencias despues de trial/tryout cuentan como inscrito.
- Pago: cuentas de Banco General varian por colegio; Yappy siempre `@Portescosports`.

## 8. Colegios semilla detectados

En `lib/constants.ts` aparecen estos colegios:

- York International School (`york`)
- Colegio Maria Inmaculada (`cidmi`)
- Pureza de Maria (`cpm`)
- Las Esclavas - Hummingbirds (`cle`)
- Oxford International School (`ois`)
- The Oxford School (`tos`)
- Colegio Real (`crp`)
- ECP (`ecp`)
- IC Falcons (`ic-falcons`)
- AIP (`aip`)
- Smart Academy Of Panama (`SAP`)
- Academia Hebrea de Panamá (`AHP`)


## 9. Actividades y metricas planeadas

Hay plantillas de metricas para:

- Futbol.
- Basketball.
- Voleibol.
- Flag Football.
- Atletismo.
- Ajedrez.
- Porrismo / Cheerleading.
- Teatro.
- Baile Urbano.
- Piano / Guitarra / Ukulele.
- Arte creativo / fotografia.
- Reforzamiento academico / estudio dirigido.
- Extended Care / cuidado extendido.

Cada actividad tiene metricas de evaluacion con escala maxima de 5.

Ejemplos:

- Futbol: tecnica, trabajo en equipo, actitud/disciplina, condicion fisica.
- Basketball: tiro, dribling, defensa, trabajo en equipo.
- Teatro: expresion, creatividad, participacion, memorizacion.
- Academico: compromiso, organizacion, progreso academico, autonomia.

## 10. Autenticacion y permisos

La intencion documentada es usar Supabase Auth con magic link, sin password para padres.

Estado actual:

- La pantalla visual de login existe.
- El endpoint `POST /api/auth/login` valida si hay email y responde que el enlace fue enviado.
- Todavia no llama a Supabase.
- `proxy.ts` documenta la proteccion por rol, pero por ahora permite todo.

Reglas esperadas:

- Usuario no autenticado que entra al portal debe ir a `/login`.
- Padre no debe entrar a `/staff` ni `/admin`.
- Staff no debe entrar a `/admin`.
- Admin puede entrar a todo.
- RLS en Supabase debe asegurar que cada usuario solo vea lo que le corresponde.

## 11. APIs actuales y APIs faltantes

APIs actuales:

- `POST /api/auth/login`: stub para enviar magic link.
- `POST /api/webhook`: stub que responde `{ received: true }`.
- `GET /api/cron`: stub que responde `{ ok: true }`.

APIs que el PRD pide construir:

- `GET /api/students`
- `GET /api/activities/:id`
- `GET /api/reports/:studentId`
- `POST /api/attendance`
- `POST /api/reports`
- `GET /api/events`
- `GET /api/news`
- `GET /api/admin/overview`
- `GET /api/admin/schools`

## 12. Que tienes que detallar para poder terminar la aplicacion

### Datos reales por colegio

Hay que definir para cada colegio:

- Nombre oficial.
- Slug definitivo.
- Logo.
- Colores si varian por colegio.
- Cuenta bancaria.
- Yappy.
- Telefono de contacto.
- Telefono de coordinacion.
- Colegio activo o inactivo.

### Actividades reales

Para cada actividad:

- Colegio.
- Nombre.
- Categoria: deporte, arte, academico o cuidado.
- Precio mensual.
- Pago que corresponde al colegio.
- Dias y horarios.
- Hora de inicio y fin.
- Profesor asignado.
- Coordinador asignado.
- Minimo y maximo de estudiantes.
- Si permite semana de prueba.
- Si aplica descuento.
- Icono o imagen.

### Estudiantes y padres

Hay que definir:

- Como se importan estudiantes inicialmente: CSV, Excel, formulario, carga manual o integracion.
- Campos obligatorios del estudiante.
- Campos obligatorios del padre.
- Si un estudiante puede tener mas de un padre/tutor con acceso.
- Si un padre puede ver hijos de varios colegios.
- Politica para estudiantes retirados o suspendidos.

### Inscripciones

Hay que decidir:

- Como se crea una inscripcion.
- Quien puede editarla.
- Cuando una asistencia de prueba se convierte en inscripcion activa.
- Como se registra retiro.
- Como se maneja cambio de actividad.
- Como se registran descuentos por hermano o actividad adicional.

### Asistencia

Hay que detallar:

- Si se toma asistencia por cada clase, por dia o por sesion.
- Si el profesor puede editar asistencia pasada.
- Hasta cuantos dias atras puede corregir.
- Que pasa con feriados, cancelaciones o lluvias.
- Si los padres ven ausencias en tiempo real.
- Si se notifican ausencias.

### Reportes mensuales

Hay que definir:

- Fecha exacta de apertura y cierre de reportes.
- Si hay aprobacion de coordinador antes de que el padre lo vea.
- Plantillas finales de metricas por actividad.
- Escala visual: estrellas, sliders, barras o numeros.
- Longitud maxima del comentario.
- Si se permite copiar comentarios.
- Si hay borradores/autoguardado.
- Si el padre puede responder o solo leer.

### Noticias, eventos y fotos

Hay que definir:

- Quien puede publicar noticias.
- Si noticias son por colegio, actividad o globales.
- Si hay aprobacion antes de publicar.
- Tipos de noticias permitidas.
- Si los resultados deportivos tienen formato especial.
- Donde se guardan fotos.
- Limites de peso/cantidad de imagenes.
- Si se permiten enlaces externos a Google Forms.

### Pagos

El PRD menciona matricula, descuentos, fecha limite y cuentas, pero no hay modulo de pagos implementado.

Hay que decidir:

- Si el portal solo muestra informacion de pago o tambien registra pagos.
- Si habra estado de cuenta por estudiante.
- Si se sube comprobante de transferencia/Yappy.
- Quien valida pagos.
- Si hay alertas por pagos vencidos.
- Si se integra con alguna pasarela o se mantiene manual.

### Roles y permisos

Hay que confirmar:

- Diferencia exacta entre coordinador y profesor.
- Si un coordinador puede editar reportes de profesores.
- Si staff puede ver datos de estudiantes fuera de su actividad.
- Si admin puede impersonar usuarios.
- Si colegios tendran usuarios administrativos propios.

### Notificaciones

Hay que decidir:

- Emails para magic link.
- Recordatorios de reportes pendientes.
- Recordatorios de pago.
- Notificaciones de noticias nuevas.
- Notificaciones de eventos.
- Canal: email, WhatsApp, push PWA o solo dentro del portal.

### PWA y mobile

Hay que definir:

- Iconos finales de la app.
- Nombre corto visible en home screen.
- Si se requiere modo offline.
- Si staff debe poder tomar asistencia con mala conexion.
- Si se quiere push notifications.

### Admin y reportes de negocio

Hay que detallar:

- Metricas que Roberto necesita ver diariamente.
- Exportaciones necesarias: CSV, Excel o PDF.
- Filtros clave por colegio, actividad, grado y mes.
- Reportes financieros deseados.
- Reportes de asistencia deseados.
- Reportes de avance por estudiante o por grupo.

## 13. Prioridad sugerida para avanzar

1. Cerrar el modelo de datos real y crear migraciones Supabase.
2. Implementar Supabase Auth con magic link.
3. Activar proteccion de rutas por rol.
4. Crear carga inicial de colegios, actividades, estudiantes, padres y staff.
5. Construir portal de padres con datos reales: hijos, actividades, avance, calendario, noticias.
6. Construir asistencia de staff, porque alimenta reportes y metricas.
7. Construir reportes mensuales.
8. Construir admin para monitorear colegios, reportes, eventos y noticias.
9. Agregar pagos o comprobantes si se confirma que estaran dentro del portal.
10. Completar PWA: iconos, service worker, instalable y eventual offline.

## 14. Resumen ejecutivo

Tienes un proyecto bien encaminado como esqueleto: la arquitectura, los modulos, las rutas y la vision de producto estan claras. Lo que falta es convertir ese esqueleto en aplicacion funcional conectada a Supabase.

Lo mas importante ahora no es agregar mas pantallas placeholder, sino definir datos reales, permisos, flujo de inscripcion, asistencia, reportes mensuales y pagos. Con eso claro, el desarrollo puede avanzar de forma ordenada: primero autenticacion y base de datos; luego portal de padres; despues staff; finalmente admin y reportes de negocio.
