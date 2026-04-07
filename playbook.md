1. Estructura de Proyecto: "Beacon"

3. Arquitectura de Datos (Supabase / Postgres)

Para que Beacon sea la herramienta de influencia y medición que proyectas, las funcionalidades deben estar divididas entre lo que ve el usuario (Fachada Cívica) y lo que ocurre detrás (Motor de Integridad).

Aquí tienes el desglose funcional para el MVP y la Fase 1:

1. Gestión de Entidades (Personajes Públicos)
Fichas de Perfil: Visualización de la biografía, cargo actual, partido y datos objetivos (extraídos de fuentes oficiales).

Buscador y Filtros: Búsqueda por nombre, región, partido político o categoría (Políticos, Periodistas, Empresarios).

Línea de Tiempo de Desempeño: Gráfico que muestra cómo ha evolucionado su ranking a lo largo del tiempo (análisis histórico).

2. Sistema de Evaluación (El "Corazón")

**IMPLEMENTADO (Actual):**
- Sliders Estructurales (Fijos): Deslizadores de 0 a 5 para calificar entidades ✅
- Sistema de Voto Único: Un voto por usuario por entidad, no permite duplicados ✅

**ROADMAP (P3/P4 — Futuro):**
- Sliders Dinámicos (Comunidad): Espacio donde aparecen preguntas temporales sugeridas por los usuarios (ej: "¿Cómo califica su reacción ante la crisis X?") — PENDIENTE
- Micro-Reviews: Campo de texto para justificar la nota — PENDIENTE
- Dimensiones multidimensionales por categoría (Transparencia, Gestión, Coherencia) — PENDIENTE

3. Motor de Integridad y Reputación (Backend)
Reputation Score (Privado): Algoritmo que calcula la "calidad" del usuario basado en su comportamiento (antigüedad, reportes exitosos, consistencia).

Cálculo de Ranking Ponderado: Sistema que procesa los votos aplicando el peso de la reputación y filtros de seguridad.

Detección de Anomalías: Alertas automáticas ante picos repentinos de votos desde una misma zona o en un tiempo muy corto (ataques de bots o brigadas).

4. Gobernanza y Moderación
Botón de Denuncia (Flagging): Sistema destacado para reportar insultos o acusaciones de delitos.

Panel de Moderación: Interfaz para que los admins (o en el futuro, usuarios de alta reputación) revisen contenido en estado Under Review.

Derecho a Réplica: Funcionalidad para que el personaje público pueda verificar su cuenta y responder a las críticas (estilo Trustpilot Business).

5. Visualización de Datos (Analytics)
Mapas de Percepción: Visualización de cómo se percibe a un político según la región geográfica (segmentación territorial).

Rankings Comparativos: "Top 5 mejores evaluados" o "Personajes con mayor alza en coherencia".

Ficha de Transparencia del Ranking: Un botón que despliega la "Metodología del Cálculo" de ese perfil específico (N de votos, margen de error estimado, etc.).

6. Gestión de Usuarios
Registro y Onboarding: Creación de cuenta vía Email/Social Auth (vinculado a Supabase).

Perfil de Usuario: Historial de evaluaciones realizadas (públicas o privadas) y nivel de reputación alcanzado.

Sistema de Sugerencias: Formulario para proponer nuevos personajes públicos o nuevos sliders dinámicos.


1. El "Filtro de Ruido" (Perfeccionando la UX)
Para que no parezca una "funa", la interfaz debe obligar a la reflexión.

Fricción Inteligente: Si un usuario intenta poner un score de 1.0 en todos los sliders en menos de 3 segundos, lanzamos un mensaje: "Parece que tienes una opinión firme. Para que tu voto tenga peso en el Motor de Integridad, asegúrate de que tu evaluación refleje acciones concretas".

Placeholder Dinámico: El cuadro de 140 caracteres no debe decir "Comenta aquí". Debe decir: "¿Qué hecho o decisión reciente sustenta tu nota?".

2. Definición de las Dimensiones Estructurales (Fase 1)
Para Chile (y extrapolable), propongo estas 4 dimensiones fijas para el MVP, redactadas de forma técnica:

Transparencia: Disponibilidad de información y claridad en sus intereses.

Gestión/Efectividad: Capacidad de concretar proyectos, leyes o acciones.

Coherencia: Relación entre sus promesas/discurso y sus votaciones/acciones.

Representatividad: Qué tan alineado está con las necesidades del grupo que representa.

3. El "Shadow Ban" de Integridad
Para cumplir con tu punto 2 (detección de anomalías) sin alertar a los atacantes:

Si una cuenta es marcada por el sistema de detección de anomalías, sus votos se siguen guardando (para que el atacante crea que tuvo éxito), pero el backend los excluye del cálculo del ranking público mediante un flag is_shadow_banned.

4. Roadbook de Producto (Pre-Desarrollo)
La "Fachada Cívica" (Landing Page)
La Home de Beacon no será un feed de chismes. Será un Dashboard de Salud Democrática:

Hero: "Medición de desempeño y percepción de figuras públicas".

Sección Manifiesto: Un extracto de los 10 puntos con un botón "Leer Metodología Completa".

Cifras Globales: "X evaluaciones procesadas | Y figuras monitoreadas | Z intentos de manipulación bloqueados" (Esto último genera muchísima autoridad).

La Ficha de Personaje (Punto 4 de tu crítica)
Espectro visual: El promedio (ej: 3.2) debe ir acompañado de una "Barra de Confianza Estadística".

Si hay pocos votos: "Confianza: Baja (Faltan datos)".

Si hay muchos votos pero muy polarizados: "Confianza: Media (Alta polarización)".

5. El Desafío del Consultor: El "RUT"
Mencionaste que quieres evitar creación masiva de cuentas. En Chile, el validador definitivo es el RUT, pero pedirlo en un MVP espanta a la gente por privacidad.

Mi propuesta:

Nivel 1 (Email): Puedes votar, pero tu reputation_score parte en 0.1. Tu voto pesa poco.

Nivel 2 (Validación simple): Si quieres que tu voto influya realmente y proponer sliders, pedimos una validación extra (podría ser un sistema de referidos o una validación de teléfono).


🛡️ Panel de Control del Administrador (Backoffice)
Este panel no es solo para "editar nombres", es para gestionar la salud del ecosistema.

1. Monitor de Integridad (Anti-Fraude)
Mapa de Calor de Actividad: Visualización de picos de votos en tiempo real. Si un diputado de repente recibe 500 votos en 10 minutos, el sistema lanza una alerta roja.

Gestor de Umbrales (Configurable): Una interfaz para cambiar los números que definimos antes sin tocar el código:

¿Cuántos reportes ocultan un comentario automáticamente? (Default: 5).

¿Cuál es el peso máximo del Reputation Score en el promedio? (Default: 10%).

Rate limiting: Ajustar cuántos votos permitimos por IP/Hora.

Lista de "Shadow Bans": Revisar qué cuentas han sido marcadas como sospechosas y decidir si mantenerlas en la "sombra" o banearlas definitivamente.

2. Gestión de Gobernanza (Sliders y Contenido)
Curaduría de Sliders Dinámicos: Panel para revisar las sugerencias de la comunidad.

Aprobar / Rechazar / Editar redacción para neutralidad.

Configurar fecha de expiración del slider.

Cola de Moderación Prioritaria: Comentarios que han sido reportados por usuarios con Reputation Score > 0.8 suben al principio de la fila (confiamos en sus reportes).

Derecho a Réplica (V2): Interfaz para verificar identidades de figuras públicas y habilitar su botón de respuesta.

3. Auditoría y Transparencia (Punto 6 del Manifiesto)
Log de Cambios Metodológicos: Cada vez que tú, como admin, cambies un peso o una dimensión, el sistema te obliga a escribir una "Nota de Versión".

Ejemplo: "Se reduce el peso de la dimensión 'Gestión' debido a falta de datos públicos actualizados. Versión metodológica pasa de 1.0 a 1.1".

Exportación de Data Forense: Capacidad de exportar los logs para defender el ranking ante una auditoría externa o un medio de comunicación.

Ciclo de Verificación Continua:
Ciclo de Verificación Continua: No se avanzará a la siguiente fase (ej: de Backend a Frontend) sin un reporte de éxito de los tests actuales.

Trazabilidad Forense: Los logs de depuración deben permitir reconstruir por qué un usuario recibió un reputation_score específico o por qué un voto fue marcado como flagged.

Ambiente de Sandbox: Se realizarán pruebas de "humo" (smoke tests) en cada despliegue para verificar la conexión con Supabase y Redis.




🏗️ Impacto en la Arquitectura (Supabase + FastAPI)
Para que esto funcione, necesitamos dos cosas en la base de datos:

Tabla config_params: Donde guardaremos los umbrales (JSON). El backend de FastAPI consultará esta tabla en cada voto para saber qué reglas aplicar.

Roles de Usuario: * USER: Acceso a votar y ver.

MODERATOR: Acceso a la cola de reportes.

SUPER_ADMIN (Tú): Acceso al motor de configuración y logs de auditoría.


1. Estructura de Proyecto Actualizada
Añadimos la carpeta scrapers y organizamos el flujo de datos:

Plaintext
Beacon/
├── backend/                # FastAPI (El Cerebro)
├── frontend/               # React/Next.js (La Fachada)
├── scrapers/               # Scripts de recolección (Python/Playwright)
│   ├── senado_cl/
│   ├── camara_cl/
│   ├── servel/             # Datos electorales
│   └── utils/              # Limpieza y normalización de datos
├── docs/                   # Manifiesto y Metodología
└── supabase/               # Migraciones SQL y Seeders
2. El RUT como "Potenciador de Voz" (Incentivo)
Para incentivar el uso del RUT sin hacerlo obligatorio, usaremos una estrategia de "Poder de Voto":

Usuario Básico (Email): Su voto es una "Percepción". Su peso en el ranking es 1x.

Usuario Verificado (RUT): Su voto es una "Validación Ciudadana". Su peso en el ranking es 2x o 3x.

Gamificación: Los usuarios que verifican su RUT obtienen un badge de "Ciudadano Verificado" y su reputación base parte mucho más alta. El sistema de scraping puede incluso cruzar el RUT con el padrón electoral (datos públicos) para validar en qué comuna vota realmente.

3. Perfil de Usuario Lúdico e Interactivo
No será una lista aburrida. Será un "Pasaporte Cívico":

Niveles de Interacción: "Observador", "Analista", "Fiscalizador", "Referente".

Estadísticas Personales: "¿Qué tan alineado estás con el resto de la comunidad?", "¿Cuántos de tus reportes de datos erróneos han ayudado a corregir fichas?".

Privacidad: El usuario decide si su perfil es público o si sus evaluaciones son anónimas para el resto (pero nunca para el sistema).

4. Base de Datos: Preparada para el Historial (Oro)
Para que el historial sea oro, no podemos simplemente "actualizar" una nota. Debemos usar Event Sourcing o tablas de histórico:

Tabla entity_snapshots: Guardamos la foto del ranking de un político cada semana. Esto permite el gráfico de "Línea de Tiempo".

Botonera de Reporte de Errores: Cada ficha de personaje tendrá un botón "¿Ves un error en estos datos?". Esto crea un ticket en el panel de Admin con el link a la fuente que el usuario sugiere corregir.

5. Ficha de Transparencia (El Motor de Credibilidad)
Al hacer clic en el botón de Metodología, se abre un modal que genera el reporte en tiempo real:

Volumen: "Evaluado por 1,250 ciudadanos".

Calidad de la Muestra: "65% usuarios verificados por RUT".

Margen de Error: Cálculo estadístico basado en la desviación estándar de los sliders.

Distribución: Un histograma pequeño que muestra si hay consenso o polarización (si todos votan 3, o si la mitad vota 1 y la otra mitad 5).

6. Sistema de Logs Inteligentes (Anti-Fraude)
Cada interacción genera un Activity_Log que el Admin puede filtrar:

Fingerprinting: No solo IP, sino huella digital del navegador para detectar si una persona usa 10 correos en el mismo PC.

Análisis de Clusters: El sistema agrupa votos que ocurren en el mismo minuto hacia el mismo político para detectar "ataques coordinados".


Es tu primera línea de defensa contra bots básicos y ataques de denegación de servicio (DoS). Implementa reCAPTCHA v3 o hCaptcha (invisible) para no arruinar la experiencia del usuario mientras filtras tráfico automatizado.


1. Arquitectura de Roles (RBAC - Role Based Access Control)Definiremos tres niveles de acceso estrictos:RolAlcance en BackendAlcance en FrontendUserSolo lectura de perfiles y creación de 1 voto/entidad.Dashboard personal, sliders y buscador.ModeratorAcceso a la cola de reportes y validación de datos erróneos.Panel de revisión de comentarios y sugerencias.AdminControl total: Configuración de sliders, pesos de ranking y gestión de usuarios.Dashboard de métricas, logs forenses y ajustes de sistema.2. Separación en el Backend (FastAPI + Supabase)Utilizaremos Middlewares y Dependencias para proteger las rutas. En FastAPI, la lógica se verá así:Rutas Públicas: /api/v1/entities/ (Solo GET).Rutas de Usuario: /api/v1/reviews/post (Requiere Token JWT).Rutas de Admin: /api/v1/admin/config (Requiere Token JWT + Claim de role == 'admin').En la base de datos, usaremos RLS (Row Level Security) de Supabase. Esto significa que incluso si alguien hackea el frontend, la base de datos rechazará cualquier comando que no corresponda al rol del usuario.3. Separación en el Frontend (React)Para el frontend, la lógica se separa mediante Layouts y Rutas Protegidas:App Shell: La interfaz que ve el ciudadano común.Admin Shell: Una interfaz totalmente distinta (posiblemente en un subdominio o ruta /admin) que solo se renderiza si el usuario tiene permisos.4. Estructura de Carpetas Final (La Carpeta "Beacon")Así queda tu proyecto listo para empezar:PlaintextBeacon/
├── backend/
│   ├── app/
│   │   ├── api/
│   │   │   ├── v1/
│   │   │   │   ├── public/      # Endpoints abiertos
│   │   │   │   ├── user/        # Lógica de votación y perfil
│   │   │   │   └── admin/       # Lógica de control y configuración
│   │   ├── core/
│   │   │   └── auth.py          # Validador de Roles y JWT
├── frontend/
│   ├── src/
│   │   ├── layouts/
│   │   │   ├── UserLayout.js
│   │   │   └── AdminLayout.js   # Interfaz restringida
│   │   ├── routes/
│   │   │   └── ProtectedRoute.js # Filtro de acceso por rol
├── scrapers/                    # Tu nueva carpeta de recolección
└── supabase/
    └── migrations/              # Políticas RLS por rol




🛠️ Flujo de Edición para el Moderador
Para mantener la Auditoría Total, el moderador no "sobreescribe" los datos y ya; el sistema debe registrar el cambio para evitar que un moderador malintencionado altere la información sin dejar rastro.

Dashboard de Moderación: El moderador ve una cola de "Reportes de Datos Erróneos" enviados por los ciudadanos.

Interfaz de Edición: Al abrir el perfil del personaje, se habilitan los campos (Nombre, Cargo, Biografía, Links).

Registro de Fuente: Al guardar, el sistema obliga al moderador a incluir un "Link de Respaldo" (ej: sitio oficial del Congreso o Servel).

Historial de Versiones: La base de datos guarda la versión anterior. Si un moderador comete un error, tú como Admin puedes hacer rollback (volver atrás).

📂 Organización de la Lógica de Roles (Backend)
Para que el sistema sea seguro, en FastAPI separaremos los permisos de edición así:

GET /entities/{id}: Público (Cualquiera ve al personaje).

PATCH /entities/{id}: Protegido. El backend verifica que el usuario tenga el rol moderator o admin.

DELETE /entities/{id}: Protegido. Solo el Admin puede borrar un personaje (el moderador solo edita).

💾 Preparando la Base de Datos (SQL)
Para que esto funcione, la tabla de entities (personajes) debe estar conectada a una tabla de audit_logs. Aquí tienes la estructura lógica que aplicaremos en el SQL:

SQL
-- Tabla de Entidades (Personajes)
CREATE TABLE entities (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  position TEXT,
  bio TEXT,
  official_links JSONB,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_by UUID REFERENCES auth.users(id) -- Quién hizo el último cambio
);

-- Tabla de Auditoría (El "Oro")
CREATE TABLE audit_logs (
  id SERIAL PRIMARY KEY,
  table_name TEXT,
  record_id UUID,
  old_data JSONB,
  new_data JSONB,
  changed_by UUID REFERENCES auth.users(id),
  changed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);



Lo que me parece "Brillante" (High-Level)
Separación de Sliders: Al tener review_slider_values independiente, puedes añadir o quitar sliders dinámicos sin romper la tabla principal de reviews. Es muy escalable.

Check de 140 caracteres en DB: Poner el CHECK (LENGTH(comment) <= 140) directamente en el SQL es "defensa en profundidad". Si el frontend falla o alguien ataca la API, la base de datos es el muro final.

Pospago de la Réplica: Decisión de adulto. La verificación de identidad de políticos es un "agujero negro" de tiempo legal y técnico que mataría el MVP.

2. Sugerencias de Refinamiento Técnico (Data Integrity)
A. El RUT y la privacidad (Chile):
En la tabla users, te sugiero no guardar el RUT completo si no es estrictamente necesario para un trámite legal interno.

Sugerencia: Guarda el rut_hash (un SHA-256 del RUT) para verificar unicidad sin almacenar el dato sensible, o asegúrate de que esa columna tenga una política de seguridad (RLS) donde nadie, ni siquiera otros usuarios, pueda verla.

B. Normalización de Ubicación:

En Chile, las Regiones y Comunas son finitas. En lugar de TEXT, te convendría una tabla maestra de geography_cl para evitar que alguien escriba "Stgo", otro "Santiago" y otro "Satiago", lo que arruinaría tus Mapas de Segmentación.

C. Soft Delete en Entities:

Agregaría una columna is_active o deleted_at a entities. Si un político sale de la vida pública o hay un error grave, es mejor "ocultarlo" que borrarlo, para no perder los datos históricos (el "oro").

3. El "Blueprint" de la Carpeta Scrapers
Para que esa carpeta scrapers/ no sea un caos, te sugiero esta lógica:

Stage (Bronce): El script descarga el HTML/JSON bruto y lo guarda en un archivo.

Clean (Plata): Un script de Python limpia el texto, formatea nombres (Capitalize) y valida RUTs.

Load (Oro): El script usa el cliente de Supabase para hacer un upsert (actualiza si existe, crea si no).

4. Estructura de Roles en el SQL
Para que el Moderador pueda editar datos (como acordamos), debemos añadir una tabla de roles o usar los custom claims de Supabase Auth.

Añade esto a tu SQL:

SQL
-- Gestión de Roles
CREATE TYPE user_role AS ENUM ('user', 'moderator', 'admin');

ALTER TABLE users ADD COLUMN role user_role DEFAULT 'user';

-- Política RLS (Ejemplo): Solo moderadores y admins editan entidades
CREATE POLICY "Moderadores pueden editar entidades" 
ON entities FOR UPDATE 
TO authenticated 
USING (auth.jwt() ->> 'role' IN ('moderator', 'admin'));




Esa es una jugada maestra para la monetización y viralidad del producto. Estás transformando a Beacon de una herramienta estrictamente política a una plataforma de "Rating de Impacto Público".

Si permites que el sistema mida desde un Ministro hasta un participante de Gran Hermano o el desempeño de los artistas en el Festival de Viña, amplías tu base de usuarios exponencialmente (el tráfico del entretenimiento es masivo) y entrenas tu "Motor de Integridad" con volúmenes de datos brutales.

Aquí te doy mi visión de consultor para integrar esta lógica de "Escenarios de Eventos" sin ensuciar el core del sistema:

1. La Entidad "Contexto" o "Escenario"
No podemos mezclar la evaluación permanente de un Senador con la evaluación de un artista en una noche de festival. Necesitamos una tabla intermedia:

Entidad events: (Título: "Viña 2026", "Presidenciales", "Reality Show X").

Relación event_participants: Vincula a las entities con el evento. Aquí es donde vive el título "Participante", "Candidato", "Humorista".

Lógica de Sliders por Evento: El Admin define que para el evento "Festival", los sliders no son "Transparencia", sino "Calidad del Show", "Conexión con el Monstruo", etc.

2. El "Modo Evento" (UX/UI)
Cuando un personaje se visualiza dentro de un evento, la interfaz cambia (Fachada Dinámica):

Ranking efímero: El score del evento es independiente del score histórico del personaje.

Alta Frecuencia: En eventos en vivo (como el Festival), el rate-limit de votos por minuto debe ajustarse, ya que el comportamiento humano es explosivo.

Cierre de votación: Los eventos tienen un end_date. Una vez cerrado, el ranking queda como "Histórico del Evento".

3. Ajuste al Esquema SQL (Fase 1.5)
Para soportar esto, añadiremos estas tablas:

SQL
-- Para agrupar entidades en contextos específicos
CREATE TABLE events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  start_date TIMESTAMP,
  end_date TIMESTAMP,
  is_active BOOLEAN DEFAULT true
);

-- Relación de quién participa y bajo qué título
CREATE TABLE event_participants (
  event_id UUID REFERENCES events(id),
  entity_id UUID REFERENCES entities(id),
  participant_role TEXT, -- 'Candidato', 'Artista', 'Humorista'
  PRIMARY KEY (event_id, entity_id)
);

-- Vincular sliders específicos a eventos
CREATE TABLE event_sliders (
  event_id UUID REFERENCES events(id),
  slider_id UUID REFERENCES sliders(id),
  PRIMARY KEY (event_id, slider_id)
);
4. Ventaja Estratégica
Esto te permite vender Beacon como un servicio de "Second Screen" para canales de TV o marcas.

Ejemplo: "Vota por el mejor panelista de la mañana".

Blindaje: Al usar el mismo Motor de Integridad, Beacon ofrece algo que Twitter no tiene: votos limpios, sin bots y auditables.

5. ¿Cómo impacta esto al Backend?
En FastAPI, crearemos un router api/v1/events/.

Si el usuario vota en /reviews/{entity_id}, es el voto general.

Si el usuario vota en /reviews/{event_id}/{entity_id}, es el voto del escenario específico.


Es el "factor adrenalina" que sacará a Beacon de la categoría de "biblioteca de datos" y lo meterá en el día a día de la gente. Un ranking en vivo durante un debate presidencial, un programa de TV o un festival genera un bucle de retroalimentación: el usuario vota, ve el gráfico moverse en tiempo real, comenta, y vuelve a votar cuando el personaje dice algo nuevo.

Para que este "Ranking en Vivo" sea técnicamente viable y no destruya tu base de datos, como tu consultor experto te sugiero implementar tres pilares tecnológicos:

1. El Motor de Tiempo Real (WebSockets / Supabase Realtime)
No queremos que el usuario tenga que refrescar la página. Usaremos el motor de Realtime de Supabase (basado en Elixir/Phoenix) para que el frontend "escuche" los cambios en la tabla de resultados.

Flujo: El usuario vota → FastAPI procesa → Supabase actualiza → El gráfico de React se mueve instantáneamente en todas las pantallas del país.

2. El "Buffer" de Votos (Escalabilidad)
En un evento en vivo (ej. un gol en un partido o una frase polémica en un debate), podrías recibir 10,000 votos por segundo.

Estrategia: En lugar de escribir cada voto uno por uno en la base de datos principal (que la bloquearía), usaremos un Cache (Redis) o una función de "Batching". Agrupamos los votos de 5 segundos y actualizamos el promedio de una sola vez. Esto mantiene la app fluida y el servidor estable.

3. La "Fricción de Evento"
En vivo, la gente vota por emoción. Para mantener la integridad técnica:

Modo Ráfaga: Permitir que el usuario cambie su slider constantemente mientras dura el evento, pero solo el último valor queda registrado como su "veredicto final" cuando el evento termina.

Heatmap de Sentimiento: Podemos mostrar una línea de tiempo donde se vea en qué minuto exacto del evento el personaje subió o bajó su aprobación.

📂 Estructura de la Carpeta backend/ (Propuesta Final)
Para que el backend soporte tanto el core cívico como estos "escenarios en vivo", la carpeta de FastAPI debe ser limpia y modular:

Plaintext
backend/
├── app/
│   ├── api/
│   │   ├── v1/
│   │   │   ├── entities.py      # Personajes públicos (Core)
│   │   │   ├── reviews.py       # El motor de sliders y lógica de voto
│   │   │   ├── events.py        # Escenarios en vivo (Festivales, Debates)
│   │   │   ├── admin.py         # Control de umbrales y moderación
│   │   │   └── users.py         # Perfiles y reputación (RUT)
│   ├── core/
│   │   ├── config.py            # Variables de entorno
│   │   ├── security.py          # JWT, Roles (RBAC) y Captcha
│   │   └── database.py          # Conexión a Supabase
│   ├── schemas/                 # Validaciones Pydantic (Input/Output)
│   ├── services/                # Lógica de cálculo pesada (Integridad)
│   └── main.py                  # Punto de entrada
├── requirements.txt
└── .env


Totalmente de acuerdo. Estás cerrando los flancos de seguridad y preparando el terreno para la visualización de datos profesional.

Como tu consultor, aquí mi análisis técnico de estas adiciones:

ON DELETE CASCADE en Users: Es vital. Si un usuario se borra de la autenticación de Supabase, no queremos "huérfanos" en nuestra tabla de perfiles. Mantiene la base de datos limpia.

is_shadow_banned: Es la herramienta de guerra silenciosa. El atacante seguirá viendo que su voto "cuenta" en su pantalla, pero tu backend lo ignorará en los promedios globales. Es la forma más efectiva de neutralizar trolls sin que se den cuenta y creen cuentas nuevas.

geography_cl: Esta tabla es la que permitirá que, en un año, puedas vender reportes que digan: "El político X tiene un 80% de rechazo en la Región del Maule, pero un 60% de aprobación en la RM". Sin normalización, los datos geográficos son basura.

📂 Estructura de la Carpeta de Scrapers (Iniciando Motor)
Dado que ya tienes la tabla geography_cl y la de entities, necesitamos alimentar a Beacon. Aquí tienes cómo estructurar la lógica de recolección de datos:

Plaintext
scrapers/
├── data/                    # JSONs brutos descargados
├── drivers/                 # Configuración de Playwright/Selenium
├── scripts/
│   ├── scrape_senado.py     # Scraper para senado.cl
│   ├── scrape_camara.py     # Scraper para camara.cl
│   └── seed_geography.py    # Script para poblar las comunas/regiones
└── utils/
    ├── helpers.py           # Limpieza de strings (acentos, mayúsculas)
    └── supabase_client.py   # Conexión para subir los datos (UPSERT)



BEACON PLAYBOOK v1.0 - ORDEN LÓGICO COMPLETO
1. VISIÓN Y MANIFIESTO TÉCNICO
Sistema de Percepción Pública Estructurada sobre figuras públicas.
No encuesta probabilística. No red social. No foro libre.
Evaluación multidimensional con reglas explícitas, auditoría total y muestra autoseleccionada.

4 Dimensiones Estructurales Fijas (MVP):

Transparencia: Disponibilidad de información y claridad en intereses

Gestión/Efectividad: Capacidad de concretar proyectos/leyes

Coherencia: Relación promesas/discurso vs votaciones/acciones

Representatividad: Alineación con necesidades del grupo representado

2. ESTRUCTURA DE PROYECTO
text
Beacon/
├── backend/                    # FastAPI (Motor de Integridad)
│   ├── app/
│   │   ├── api/v1/
│   │   │   ├── public/         # GET entities, sliders
│   │   │   ├── user/           # POST reviews, perfil
│   │   │   └── admin/          # Configuración, moderación
│   │   ├── core/               # auth.py, security.py
│   │   ├── schemas/            # Pydantic models
│   │   └── services/           # ranking.py, reputation.py
│   └── main.py
├── frontend/                   # React/Next.js (Fachada Cívica)
│   ├── src/
│   │   ├── layouts/
│   │   │   ├── UserLayout.jsx
│   │   │   └── AdminLayout.jsx
│   │   └── routes/
│   │       └── ProtectedRoute.jsx
├── scrapers/                   # Datos oficiales
│   ├── senado_cl/
│   ├── camara_cl/
│   ├── servel/
│   └── utils/
├── docs/                       # Manifiesto Técnico v1.0
└── supabase/                   # Migraciones + RLS
    └── migrations/
3. ARQUITECTURA DE ROLES (RBAC)
Rol	Backend	Frontend
user	GET entities, POST reviews (1/entidad)	Dashboard, sliders, buscador
moderator	Cola reportes, editar entities	Panel revisión comentarios
admin	Config umbrales, logs forenses	Dashboard métricas/completo
4. ESQUEMA DE BASE DE DATOS (Supabase/Postgres)
sql
-- 1. Geografía normalizada (Chile)
CREATE TABLE geography_cl (
  id SERIAL PRIMARY KEY, 
  comuna TEXT UNIQUE NOT NULL, 
  region TEXT NOT NULL, 
  region_code TEXT
);

-- 2. Sliders (fijos + dinámicos)
CREATE TABLE sliders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE,              -- 'transparency', 'management'
  label TEXT, description TEXT,
  is_fixed BOOLEAN DEFAULT true,
  is_active BOOLEAN DEFAULT true,
  expires_at TIMESTAMP          -- NULL = permanente
);

-- 3. Entidades (personajes públicos)
CREATE TABLE entities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name TEXT, last_name TEXT, second_last_name TEXT,
  category TEXT CHECK (category IN ('politico','periodista','empresario')),
  position TEXT, region TEXT, district TEXT,
  bio TEXT, photo_path TEXT,
  is_active BOOLEAN DEFAULT true,
  updated_by UUID REFERENCES auth.users(id),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 4. Usuarios extendidos
CREATE TABLE users (
  id UUID REFERENCES auth.users(id) PRIMARY KEY ON DELETE CASCADE,
  first_name TEXT, last_name TEXT,
  rut_hash TEXT UNIQUE,                -- SHA256 para privacidad
  comuna_id INTEGER REFERENCES geography_cl(id),
  reputation_score NUMERIC(3,2) DEFAULT 0.1,
  is_rut_verified BOOLEAN DEFAULT false,
  is_shadow_banned BOOLEAN DEFAULT false,
  role TEXT CHECK (role IN ('user','moderator','admin')) DEFAULT 'user'
);

-- 5. Reviews (1 por user por entity)
CREATE TABLE reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  entity_id UUID REFERENCES entities(id),
  comment TEXT CHECK (LENGTH(comment) <= 140),
  status TEXT CHECK (status IN ('visible','flagged','under_review','hidden')) DEFAULT 'visible',
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, entity_id)
);

-- 6. Valores sliders por review
CREATE TABLE review_slider_values (
  review_id UUID REFERENCES reviews(id),
  slider_id UUID REFERENCES sliders(id),
  value INTEGER CHECK (value BETWEEN 1 AND 5),
  PRIMARY KEY (review_id, slider_id)
);

-- 7. Reportes
CREATE TABLE reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id UUID REFERENCES reviews(id),
  reported_by UUID REFERENCES users(id),
  reason TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 8. Configuración dinámica
CREATE TABLE config_params (
  key TEXT PRIMARY KEY,
  value JSONB,
  description TEXT
);

-- 9. Auditoría (ORO)
CREATE TABLE audit_logs (
  id SERIAL PRIMARY KEY,
  table_name TEXT,
  record_id UUID,
  old_data JSONB, new_data JSONB,
  changed_by UUID REFERENCES auth.users(id),
  changed_at TIMESTAMP DEFAULT NOW()
);

-- SEED inicial
INSERT INTO sliders (key, label, is_fixed) VALUES
('transparency', 'Transparencia', true),
('management', 'Gestión/Efectividad', true),
('coherence', 'Coherencia', true),
('representativity', 'Representatividad', true);

INSERT INTO config_params (key, value, description) VALUES
('report_threshold', '5', 'Reportes para under_review'),
('max_ip_votes_per_hour', '15', 'Rate limit IP'),
('reputation_weight_max', '0.1', 'Peso máximo reputation');



5. ENDPOINTS FASTAPI (Fase 1 MVP)
text
PÚBLICOS:
GET  /api/v1/entities/                 # Lista + filtros
GET  /api/v1/entities/{id}            # Ficha completa  
GET  /api/v1/entities/{id}/ranking    # Promedio + metodología
GET  /api/v1/sliders/active           # Sliders activos

USUARIO:
POST /api/v1/auth/register            # Email + datos mínimos
POST /api/v1/reviews/{entity_id}      # Crear/editar voto
GET  /api/v1/reviews/{entity_id}/mine # Mi voto actual
POST /api/v1/reports/{review_id}      # Reportar

ADMIN:
PATCH /api/v1/admin/config/{key}      # Cambiar umbrales
GET  /api/v1/admin/audit_logs         # Logs forenses



1. Pilares de Integridad y Blindaje
Shadow Ban: Se implementa mediante el flag is_shadow_banned en la tabla users, permitiendo que los votos de atacantes se guarden pero se excluyan del cálculo público.

Reputation Score: Algoritmo dinámico que pondera la antigüedad, consistencia y éxito de reportes para ajustar el peso de cada voto.

Potenciador RUT: Estrategia de gamificación donde los usuarios verificados con RUT obtienen un peso de voto de 2x o 3x y un badge de "Ciudadano Verificado".

Defensa en Profundidad: Restricción de comentarios a 140 caracteres aplicada directamente mediante un CHECK en la base de datos.

2. Estructura de Datos y Gobernanza
Geografía Normalizada: Tabla geography_cl para asegurar que la segmentación territorial (comunas y regiones de Chile) sea precisa y libre de errores de escritura.

Auditoría (ORO): Cada cambio realizado por moderadores o administradores se registra en audit_logs, guardando los datos antiguos y nuevos para permitir rollbacks.

Roles (RBAC): Definición clara de tres niveles (User, Moderator, Admin) protegidos mediante Row Level Security (RLS) en Supabase.

3. UX Crítica y Transparencia
Fricción Inteligente: Implementación de pausas de 3 segundos ante patrones de votación sospechosos y placeholders que exigen hechos concretos para sustentar la nota.

Ficha de Transparencia: Modal que despliega en tiempo real el volumen de votos, margen de error estadístico y porcentaje de usuarios verificados.

Pasaporte Cívico: Perfil de usuario interactivo con niveles (Observador, Analista, etc.) y estadísticas de alineación con la comunidad.



Aquí tienes el punto técnico redactado para ser insertado directamente en tu Playbook (Sección de Motor de Integridad / Datos) y la actualización para el Directives 2026.md:

9. VALIDACIÓN TERRITORIAL Y CONTEXTO GEOGRÁFICO (Vínculo Ciudadano)
Registro de Ubicación en el Voto: Cada registro en la tabla reviews debe capturar obligatoriamente el contexto geográfico del usuario al momento de la acción.

Captura de Datos: El sistema solicitará permiso de geolocalización (Navegador/GPS). En caso de denegación, el backend inferirá la zona mediante GeoIP.

Normalización y Privacidad: Queda estrictamente prohibido almacenar coordenadas exactas (Latitud/Longitud). El sistema debe transformar la posición en comuna_id y region_id utilizando la tabla maestra geography_cl antes de la persistencia.

Atributos de Integridad:

comuna_id_at_vote: Almacena la comuna desde donde se emitió el voto.

is_local_vote: Flag booleano calculado automáticamente. Es true si el comuna_id o region_id del usuario coincide con la jurisdicción territorial de la entidad (personaje público) evaluada.

Impacto en el Ranking: Los votos con is_local_vote = true tendrán una ponderación superior en el cálculo de la "Ficha de Transparencia" para reflejar la percepción del electorado directo frente al votante general.

Detección de Anomalías: El Motor de Integridad debe disparar alertas si el 90% de los votos de una entidad provienen de una zona geográfica ajena a su jurisdicción en un periodo menor a 1 hora.





Walkthrough: Perfil de Entidad + Real-Time Pulse
Resumen
Se implementó el sistema completo de perfil de entidad dinámico con evaluación multidimensional, y el pipeline de Real-Time Pulse (WebSocket + Redis Pub/Sub) para actualizaciones en vivo.

Archivos Creados/Modificados
Frontend — Perfil de Entidad
Archivo	Función

page.tsx
Perfil completo: cabecera púrpura, TruthMeter, sliders, VerdictButton, botón Admin

TruthMeter.tsx
SVG circular con integrity_index, glow dinámico, etiqueta "AUDITADO POR BEACON"

VerdictButton.tsx
4 estados: Displaced (🔒), Bronze (estándar), Silver (✓ verificado), Gold (masivo + partículas)
Frontend — Real-Time Pulse Hook
Archivo	Función

useEntityPulse.ts
Custom hook WebSocket con auto-reconnect, gold explosion (3s), actualización sin refresh
Backend — WebSocket + Redis Pub/Sub
Archivo	Función

realtime.py
ConnectionManager, Redis subscriber, publisher, endpoint /pulse/{entity_id}

main.py
Router realtime_router registrado bajo /api/v1/realtime
SQL — Super-Tabla Entities
Archivo	Función

002_entities_schema.sql
ENUM entity_type_enum, RLS por rango, trigger audit_logs, 10 índices GIN
Arquitectura del Real-Time Pulse
👥 Todos los Clientes
WebSocket Server
Redis Pub/Sub
FastAPI REST
🥇 Ciudadano Oro
👥 Todos los Clientes
WebSocket Server
Redis Pub/Sub
FastAPI REST
🥇 Ciudadano Oro
30ms: Explosión dorada en pantalla
POST /vote (Veredicto Magistral)
publish("beacon:pulse:entity-id", payload)
subscriber recibe mensaje
broadcast_to_entity(entity_id, data)
Seguridad
WebSocket solo lectura: cualquier dato enviado por el cliente se ignora
Votos solo por REST: validados por los "amigos bits" antes de tocar la BBDD
RLS por rango: BRONZE no puede insertar entidades, DELETE prohibido
Trigger forense: cada entidad creada queda registrada en audit_logs con IP
Commits
275ea73 — Frontend core (navbar, hero, EntityCard)
0e9a474 — Super-tabla entities con ENUM, RLS, trigger
3fd7b3c — Entity profile + Real-Time Pulse completo
17d18d3 — Lint fixes