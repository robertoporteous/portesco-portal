# PORTESCO Parent Portal — Product Requirements Document

## Overview

Build a multi-tenant SaaS web application (PWA-ready) for PORTESCO Sports S.A., a Panama-based company that manages extracurricular activity (ECA) programs for 15+ private schools with 1,200+ students. The platform serves three user types: parents, coordinators/professors, and the admin (Roberto, Director Ejecutivo).

**Live URL target:** `app.portescosports.com`
**Deployment:** Vercel (Next.js)
**Backend:** Supabase (PostgreSQL + Auth + Storage + Realtime)
**Language:** Spanish (all UI text in Spanish). Code comments in English.

---

## Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| Framework | Next.js 14+ (App Router) | SSR, API routes, Vercel-native |
| UI | Tailwind CSS + shadcn/ui | Rapid, consistent design |
| Backend | Supabase | Auth, DB, Storage, Row Level Security |
| Auth | Supabase Auth (magic link email) | No passwords for parents |
| Hosting | Vercel | Auto-deploy from GitHub |
| PWA | next-pwa | Installable on home screen |
| State | Zustand or React Context | Lightweight client state |

---

## Brand & Design System

### Colors
| Token | Hex | Usage |
|-------|-----|-------|
| `--portesco-red` | `#E31E24` | Primary CTA, alerts, brand accent |
| `--portesco-blue` | `#1E3A8A` | Headers, navigation, secondary |
| `--portesco-black` | `#000000` | Text primary |
| `--portesco-white` | `#FFFFFF` | Backgrounds |
| `--portesco-gray-light` | `#F5F5F5` | Card backgrounds |
| `--portesco-gray-mid` | `#9CA3AF` | Secondary text |
| `--success` | `#10B981` | Positive metrics, attendance |
| `--warning` | `#F59E0B` | Medium metrics, alerts |
| `--danger` | `#EF4444` | Low metrics, overdue payments |

### Typography
- Font: Inter (Google Fonts) — clean, modern, great for Spanish characters
- Headings: 500 weight
- Body: 400 weight, 16px base

### Design Principles
- Mobile-first (90%+ of parents will use phone)
- Maximum 3 taps to any information
- Cards-based layout
- Minimal text, visual progress indicators (bars, badges)
- No clutter — parents are busy

---

## Database Schema (Supabase/PostgreSQL)

### Core Tables

```sql
-- Organizations (schools)
CREATE TABLE schools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL, -- e.g. 'york', 'cidmi', 'cpm'
  logo_url TEXT,
  primary_color TEXT DEFAULT '#1E3A8A',
  secondary_color TEXT DEFAULT '#E31E24',
  bank_account TEXT,
  yappy_handle TEXT DEFAULT '@Portescosports',
  contact_phone TEXT,
  coordination_phone TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Activities offered per school
CREATE TABLE activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID REFERENCES schools(id),
  name TEXT NOT NULL, -- 'Fútbol', 'Basketball', etc.
  category TEXT NOT NULL CHECK (category IN ('deporte', 'arte', 'academico', 'cuidado')),
  monthly_price DECIMAL(10,2) NOT NULL,
  school_payment DECIMAL(10,2) DEFAULT 0, -- what school earns per student
  schedule TEXT, -- 'Lun y Mié 3:00-4:00 PM'
  days_of_week TEXT[], -- ['monday', 'wednesday']
  start_time TIME,
  end_time TIME,
  min_students INT DEFAULT 8,
  max_students INT,
  icon TEXT, -- emoji or icon identifier
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Users (all types)
CREATE TABLE users (
  id UUID PRIMARY KEY REFERENCES auth.users(id),
  email TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  phone TEXT,
  role TEXT NOT NULL CHECK (role IN ('parent', 'coordinator', 'professor', 'admin')),
  avatar_url TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Link coordinators/professors to schools
CREATE TABLE staff_schools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  school_id UUID REFERENCES schools(id),
  role TEXT CHECK (role IN ('coordinator', 'professor')),
  UNIQUE(user_id, school_id)
);

-- Link professors to specific activities
CREATE TABLE staff_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  activity_id UUID REFERENCES activities(id),
  UNIQUE(user_id, activity_id)
);

-- Students
CREATE TABLE students (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID REFERENCES schools(id),
  parent_id UUID REFERENCES users(id),
  full_name TEXT NOT NULL,
  grade TEXT NOT NULL, -- 'PK', 'K', '1ro', '2do', ... '12vo'
  date_of_birth DATE,
  avatar_url TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Student enrollments in activities
CREATE TABLE enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID REFERENCES students(id),
  activity_id UUID REFERENCES activities(id),
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'trial', 'withdrawn', 'suspended')),
  enrolled_at TIMESTAMPTZ DEFAULT now(),
  withdrawn_at TIMESTAMPTZ,
  UNIQUE(student_id, activity_id)
);

-- Attendance records
CREATE TABLE attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id UUID REFERENCES enrollments(id),
  session_date DATE NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('present', 'absent', 'excused', 'late')),
  marked_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(enrollment_id, session_date)
);

-- Monthly performance reports (filled by professors)
CREATE TABLE monthly_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id UUID REFERENCES enrollments(id),
  month INT NOT NULL CHECK (month BETWEEN 1 AND 12),
  year INT NOT NULL,
  metrics JSONB NOT NULL, -- flexible per activity type
  -- Example sports: {"tecnica": 4, "trabajo_equipo": 5, "actitud": 4, "condicion_fisica": 3}
  -- Example arts: {"creatividad": 5, "tecnica": 4, "participacion": 5}
  overall_rating TEXT CHECK (overall_rating IN ('excelente', 'buen_progreso', 'en_desarrollo', 'necesita_apoyo')),
  comment TEXT, -- free-form professor comment
  reported_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(enrollment_id, month, year)
);

-- Events and calendar
CREATE TABLE events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID REFERENCES schools(id),
  activity_id UUID REFERENCES activities(id), -- NULL = school-wide event
  title TEXT NOT NULL,
  description TEXT,
  event_date DATE NOT NULL,
  start_time TIME,
  end_time TIME,
  location TEXT,
  event_type TEXT CHECK (event_type IN ('match', 'tournament', 'practice', 'festival', 'meeting', 'deadline')),
  is_published BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- News / announcements
CREATE TABLE news (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID REFERENCES schools(id),
  activity_id UUID REFERENCES activities(id), -- NULL = school-wide
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  image_url TEXT,
  news_type TEXT CHECK (news_type IN ('result', 'announcement', 'gallery', 'promotion', 'reminder')),
  is_published BOOLEAN DEFAULT true,
  published_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Photo galleries (attached to news)
CREATE TABLE photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  news_id UUID REFERENCES news(id),
  url TEXT NOT NULL,
  caption TEXT,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### Row Level Security (RLS) Policies

```sql
-- Parents can only see their own students and their students' data
-- Coordinators can see all students in their assigned schools
-- Professors can see students in their assigned activities
-- Admin (Roberto) can see everything

-- Example: parents see only their students
CREATE POLICY "Parents see own students"
  ON students FOR SELECT
  USING (parent_id = auth.uid());

-- Example: coordinators see their school's students
CREATE POLICY "Coordinators see school students"
  ON students FOR SELECT
  USING (
    school_id IN (
      SELECT school_id FROM staff_schools
      WHERE user_id = auth.uid()
    )
  );

-- Admin sees all
CREATE POLICY "Admin sees all"
  ON students FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );
```

### Metric Templates per Activity Category

```json
{
  "deporte_futbol": {
    "label": "Fútbol",
    "metrics": [
      {"key": "tecnica", "label": "Técnica", "max": 5},
      {"key": "trabajo_equipo", "label": "Trabajo en equipo", "max": 5},
      {"key": "actitud", "label": "Actitud y disciplina", "max": 5},
      {"key": "condicion_fisica", "label": "Condición física", "max": 5}
    ]
  },
  "deporte_basketball": {
    "label": "Basketball",
    "metrics": [
      {"key": "tiro", "label": "Tiro", "max": 5},
      {"key": "dribling", "label": "Dribling", "max": 5},
      {"key": "defensa", "label": "Defensa", "max": 5},
      {"key": "trabajo_equipo", "label": "Trabajo en equipo", "max": 5}
    ]
  },
  "deporte_voleibol": {
    "label": "Voleibol",
    "metrics": [
      {"key": "servicio", "label": "Servicio", "max": 5},
      {"key": "recepcion", "label": "Recepción", "max": 5},
      {"key": "remate", "label": "Remate", "max": 5},
      {"key": "juego_equipo", "label": "Juego en equipo", "max": 5}
    ]
  },
  "deporte_flag_football": {
    "label": "Flag Football",
    "metrics": [
      {"key": "tecnica", "label": "Técnica", "max": 5},
      {"key": "velocidad", "label": "Velocidad/Agilidad", "max": 5},
      {"key": "estrategia", "label": "Comprensión de juego", "max": 5},
      {"key": "actitud", "label": "Actitud", "max": 5}
    ]
  },
  "deporte_atletismo": {
    "label": "Atletismo",
    "metrics": [
      {"key": "tecnica", "label": "Técnica", "max": 5},
      {"key": "resistencia", "label": "Resistencia", "max": 5},
      {"key": "esfuerzo", "label": "Esfuerzo", "max": 5},
      {"key": "mejora", "label": "Mejora personal", "max": 5}
    ]
  },
  "deporte_ajedrez": {
    "label": "Ajedrez",
    "metrics": [
      {"key": "estrategia", "label": "Pensamiento estratégico", "max": 5},
      {"key": "concentracion", "label": "Concentración", "max": 5},
      {"key": "progreso", "label": "Progreso técnico", "max": 5}
    ]
  },
  "arte_teatro": {
    "label": "Teatro",
    "metrics": [
      {"key": "expresion", "label": "Expresión", "max": 5},
      {"key": "creatividad", "label": "Creatividad", "max": 5},
      {"key": "participacion", "label": "Participación", "max": 5},
      {"key": "memorizacion", "label": "Memorización", "max": 5}
    ]
  },
  "arte_baile": {
    "label": "Baile Urbano",
    "metrics": [
      {"key": "ritmo", "label": "Ritmo", "max": 5},
      {"key": "coordinacion", "label": "Coordinación", "max": 5},
      {"key": "expresion", "label": "Expresión corporal", "max": 5},
      {"key": "esfuerzo", "label": "Esfuerzo", "max": 5}
    ]
  },
  "arte_musica": {
    "label": "Piano / Guitarra / Ukulele",
    "metrics": [
      {"key": "tecnica", "label": "Técnica instrumental", "max": 5},
      {"key": "lectura", "label": "Lectura musical", "max": 5},
      {"key": "practica", "label": "Práctica en casa", "max": 5},
      {"key": "progreso", "label": "Progreso general", "max": 5}
    ]
  },
  "arte_visual": {
    "label": "Arte Creativo / Fotografía",
    "metrics": [
      {"key": "creatividad", "label": "Creatividad", "max": 5},
      {"key": "tecnica", "label": "Técnica", "max": 5},
      {"key": "participacion", "label": "Participación", "max": 5}
    ]
  },
  "academico": {
    "label": "Reforzamiento Académico / Estudio Dirigido",
    "metrics": [
      {"key": "compromiso", "label": "Compromiso", "max": 5},
      {"key": "organizacion", "label": "Organización", "max": 5},
      {"key": "progreso", "label": "Progreso académico", "max": 5},
      {"key": "autonomia", "label": "Autonomía", "max": 5}
    ]
  },
  "cuidado": {
    "label": "Extended Care / Cuidado Extendido",
    "metrics": [
      {"key": "comportamiento", "label": "Comportamiento", "max": 5},
      {"key": "socializacion", "label": "Socialización", "max": 5},
      {"key": "autonomia", "label": "Autonomía", "max": 5}
    ]
  },
  "deporte_porrismo": {
    "label": "Porrismo / Cheerleading",
    "metrics": [
      {"key": "tecnica", "label": "Técnica", "max": 5},
      {"key": "coordinacion", "label": "Coordinación grupal", "max": 5},
      {"key": "energia", "label": "Energía y actitud", "max": 5},
      {"key": "flexibilidad", "label": "Flexibilidad", "max": 5}
    ]
  }
}
```

---

## Application Structure

```
portesco-portal/
├── app/
│   ├── layout.tsx                    # Root layout with Supabase provider
│   ├── page.tsx                      # Landing/login page
│   ├── login/
│   │   └── page.tsx                  # Magic link login
│   ├── (parent)/                     # Parent portal (after auth)
│   │   ├── layout.tsx                # Parent layout with bottom nav
│   │   ├── page.tsx                  # Home/dashboard
│   │   ├── progress/
│   │   │   └── page.tsx              # Student progress/metrics
│   │   ├── calendar/
│   │   │   └── page.tsx              # Events calendar
│   │   ├── news/
│   │   │   └── page.tsx              # News feed
│   │   └── profile/
│   │       └── page.tsx              # Parent profile & settings
│   ├── (staff)/                      # Coordinator/Professor panel
│   │   ├── layout.tsx                # Staff layout with sidebar
│   │   ├── page.tsx                  # Staff dashboard
│   │   ├── attendance/
│   │   │   └── page.tsx              # Take attendance
│   │   ├── reports/
│   │   │   └── page.tsx              # Fill monthly reports
│   │   └── students/
│   │       └── page.tsx              # Student roster
│   ├── (admin)/                      # Admin dashboard (Roberto)
│   │   ├── layout.tsx                # Admin layout with full nav
│   │   ├── page.tsx                  # Global dashboard
│   │   ├── schools/
│   │   │   ├── page.tsx              # All schools overview
│   │   │   └── [slug]/
│   │   │       └── page.tsx          # Single school detail
│   │   ├── students/
│   │   │   └── page.tsx              # All students
│   │   ├── staff/
│   │   │   └── page.tsx              # Manage coordinators/professors
│   │   ├── reports/
│   │   │   └── page.tsx              # Report completion tracking
│   │   ├── events/
│   │   │   └── page.tsx              # Manage events
│   │   ├── news/
│   │   │   └── page.tsx              # Manage news/announcements
│   │   └── settings/
│   │       └── page.tsx              # System settings
│   └── api/                          # API routes
│       ├── auth/
│       ├── webhook/
│       └── cron/
├── components/
│   ├── ui/                           # shadcn components
│   ├── parent/                       # Parent-specific components
│   ├── staff/                        # Staff-specific components
│   ├── admin/                        # Admin-specific components
│   └── shared/                       # Shared components
├── lib/
│   ├── supabase/
│   │   ├── client.ts                 # Browser client
│   │   ├── server.ts                 # Server client
│   │   └── middleware.ts             # Auth middleware
│   ├── types.ts                      # TypeScript types
│   ├── constants.ts                  # Metric templates, categories
│   └── utils.ts                      # Helper functions
├── public/
│   ├── manifest.json                 # PWA manifest
│   └── icons/                        # App icons
├── supabase/
│   └── migrations/                   # SQL migrations
└── middleware.ts                      # Route protection
```

---

## Module A: Parent Portal

### A1. Login Flow
- Landing page shows PORTESCO logo + "Ingresa tu correo electrónico"
- Magic link via Supabase Auth (no password needed)
- Parent clicks link in email → redirected to portal
- If parent has students in multiple schools → school selector
- Session persists (refresh token)

### A2. Home Screen
- **Student card** at top: avatar (initials), name, grade
- If parent has multiple children → horizontal scroll to switch
- **Quick stats**: number of activities, attendance % this month
- **Activity cards**: list of enrolled activities with schedule, tap to see progress
- **Next event**: highlighted card with date, title, location
- **Promotions**: small card with current offers (discount for 2+ activities, etc.)

### A3. Progress Screen (Avance)
- **Monthly report selector** at top (dropdown: "Marzo 2026", "Febrero 2026", etc.)
- For each activity the student is enrolled in:
  - Activity name + icon + overall rating badge
  - Progress bars for each metric (1-5 scale, color-coded)
  - Attendance bar (sessions attended / total sessions)
  - Professor comment card with name and date
- If no report exists for selected month → "Reporte pendiente" message

### A4. Calendar Screen
- **Upcoming events** list (chronological, next 30 days)
  - Each event: date badge, title, location, time
  - Color-coded by type (match=red, tournament=blue, practice=gray, festival=gold)
- **Weekly schedule** section: fixed schedule showing recurring activity times (Mon-Fri)

### A5. News Screen
- **Feed of announcements** (newest first)
  - Result cards (with score display for matches)
  - Announcements with optional "Inscribir ahora →" link (external Google Form URL)
  - Photo galleries (grid of thumbnails, tap to view)
  - Payment reminders
  - Promotions
- Each card shows relative time ("Hace 2 días")

### A6. Profile Screen
- Parent name, email, phone
- List of children with school and grade
- Language preference (future)
- Logout button

---

## Module B: Coordinator/Professor Panel

### B1. Dashboard
- **Today's sessions**: list of activities the professor teaches today
- **Pending reports**: count of monthly reports not yet filled
- **Quick actions**: "Tomar asistencia" and "Llenar reporte mensual"

### B2. Attendance (Tomar Asistencia)
- **Step 1**: Select activity (show only assigned activities)
- **Step 2**: Select date (defaults to today)
- **Step 3**: Student list with swipe or tap to mark: Present (green) / Absent (red) / Excused (yellow) / Late (orange)
- **Bulk actions**: "Marcar todos presentes" button
- **Submit**: saves all records, shows confirmation
- **Design priority**: must work fast — 3 taps maximum to start marking

### B3. Monthly Reports (Llenar Reporte Mensual)
- **Step 1**: Select activity
- **Step 2**: Select month/year
- **Step 3**: Student list — tap student to open report form
- **Report form per student**:
  - Activity-specific metrics (loaded from metric templates) — slider or star rating (1-5)
  - Overall rating dropdown: Excelente / Buen progreso / En desarrollo / Necesita apoyo
  - Free-text comment (max 500 chars)
  - Save & Next button (auto-advances to next student)
- **Progress indicator**: "5 de 18 estudiantes completados"
- **Batch submit**: option to copy comment to multiple students (common feedback)

### B4. Student Roster
- List of all students in assigned activities
- Search by name
- Tap student → see enrollment details, attendance history, past reports

---

## Module C: Admin Dashboard (Roberto)

### C1. Global Overview
- **Metric cards row**:
  - Total students (across all schools)
  - Total active schools
  - Reports completed this month (% with progress ring)
  - Attendance rate this month
- **School cards grid**: each school with student count, activity count, report completion %
- Tap any school → drill into school detail

### C2. School Detail View
- School name + logo
- **Activities table**: name, enrolled count, price, professor assigned
- **Student enrollment chart**: bar chart by activity
- **Report completion**: which professors have submitted, which haven't
- **Attendance heatmap**: by activity, last 4 weeks

### C3. Students Management
- **Global student search** across all schools
- Filters: by school, by activity, by grade, by enrollment status
- Export to CSV
- Tap student → full profile with enrollment history, attendance, reports

### C4. Staff Management
- List of all coordinators and professors
- Which schools and activities they're assigned to
- Add/remove staff, assign to schools/activities

### C5. Reports Tracking
- **Monthly completion board**: matrix of professors × months
- Green = submitted, Yellow = partial, Red = missing
- Filter by school
- Nudge button → sends reminder email to professor

### C6. Events Management
- Create/edit/delete events
- Assign to specific school or activity
- Publish/unpublish toggle

### C7. News Management
- Create/edit/delete news items
- Rich text editor for body
- Upload images (Supabase Storage)
- Publish/unpublish toggle
- Assign to specific school or all schools

---

## Seed Data for Development

### Schools
```json
[
  {"name": "York International School", "slug": "york", "coordination_phone": "6943-7565", "bank_account": "04-05-96-700405-1"},
  {"name": "Colegio María Inmaculada", "slug": "cidmi", "coordination_phone": "6600-1333", "bank_account": "04-05-96-700422-6"},
  {"name": "Pureza de María", "slug": "cpm", "bank_account": "04-05-96-700435-0"},
  {"name": "Las Esclavas - Hummingbirds", "slug": "cle", "coordination_phone": "6600-1333", "bank_account": "04-05-96-700405-1"},
  {"name": "Oxford International School", "slug": "ois"},
  {"name": "The Oxford School", "slug": "tos"},
  {"name": "Colegio Real", "slug": "crp"},
  {"name": "ECP", "slug": "ecp"},
  {"name": "IC Falcons", "slug": "ic-falcons"},
  {"name": "AIP", "slug": "aip"}
]
```

### Sample Activities (York)
```json
[
  {"name": "Fútbol", "category": "deporte", "monthly_price": 80, "school_payment": 5, "schedule": "Lun y Mié 3:00-4:30 PM", "icon": "⚽"},
  {"name": "Flag Football", "category": "deporte", "monthly_price": 80, "school_payment": 5, "schedule": "Mar y Jue 3:00-4:00 PM", "icon": "🏈"},
  {"name": "Basketball", "category": "deporte", "monthly_price": 55, "school_payment": 10, "schedule": "Mar y Jue 3:00-4:00 PM", "icon": "🏀"},
  {"name": "Voleibol", "category": "deporte", "monthly_price": 60, "school_payment": 10, "schedule": "Lun y Mié 3:00-4:00 PM", "icon": "🏐"},
  {"name": "Atletismo", "category": "deporte", "monthly_price": 57.50, "school_payment": 7.50, "schedule": "Mar y Jue 3:00-4:00 PM", "icon": "🏃"},
  {"name": "Ajedrez", "category": "deporte", "monthly_price": 52.50, "school_payment": 7.50, "schedule": "Vie 3:00-4:00 PM", "icon": "♟️"},
  {"name": "Porrismo", "category": "deporte", "monthly_price": 65, "school_payment": 5, "schedule": "Lun y Mié 3:00-4:00 PM", "icon": "📣"},
  {"name": "Baile Urbano", "category": "arte", "monthly_price": 65, "school_payment": 10, "schedule": "Mar y Jue 3:00-4:00 PM", "icon": "💃"},
  {"name": "Teatro", "category": "arte", "monthly_price": 52.50, "school_payment": 7.50, "schedule": "Vie 3:00-4:30 PM", "icon": "🎭"},
  {"name": "Arte Creativo", "category": "arte", "monthly_price": 57.50, "school_payment": 7.50, "schedule": "Lun 3:00-4:00 PM", "icon": "🎨"},
  {"name": "Piano", "category": "arte", "monthly_price": 67.50, "school_payment": 7.50, "schedule": "Mié 3:00-4:00 PM", "icon": "🎹"},
  {"name": "Guitarra/Ukulele", "category": "arte", "monthly_price": 67.50, "school_payment": 7.50, "schedule": "Jue 3:00-4:00 PM", "icon": "🎸"},
  {"name": "Reforzamiento Académico", "category": "academico", "monthly_price": 75, "school_payment": 10, "schedule": "Lun y Mié 3:00-4:30 PM", "icon": "📖"},
  {"name": "Extended Care", "category": "cuidado", "monthly_price": 130, "school_payment": 20, "schedule": "Lun-Vie hasta 6:00 PM", "icon": "🏫"},
  {"name": "Estudio Dirigido", "category": "cuidado", "monthly_price": 130, "school_payment": 20, "schedule": "Lun-Vie hasta 6:00 PM", "icon": "📚"}
]
```

---

## PWA Configuration

```json
{
  "name": "PORTESCO Sports",
  "short_name": "PORTESCO",
  "description": "Portal de padres - Actividades extracurriculares",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#FFFFFF",
  "theme_color": "#1E3A8A",
  "icons": [
    {"src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png"},
    {"src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png"}
  ]
}
```

---

## Multi-Tenant Routing

The app uses slug-based routing. After login, the parent's school is determined by their student's enrollment. The URL structure is:

- Parent: `app.portescosports.com/` (school context inferred from student data)
- Staff: `app.portescosports.com/staff`
- Admin: `app.portescosports.com/admin`

If a parent has children in multiple schools, show a school selector on login.

---

## API Routes Needed

```
POST /api/auth/login          — Send magic link
GET  /api/students            — Get parent's students (RLS filtered)
GET  /api/activities/:id      — Get activity details
GET  /api/reports/:studentId  — Get monthly reports for student
POST /api/attendance          — Submit attendance (staff)
POST /api/reports             — Submit monthly report (staff)
GET  /api/events              — Get events (filtered by school)
GET  /api/news                — Get news feed (filtered by school)
GET  /api/admin/overview      — Admin global stats
GET  /api/admin/schools       — Admin school list with metrics
```

---

## Implementation Order

### Sprint 1 (Week 1): Foundation
1. Initialize Next.js project with TypeScript, Tailwind, shadcn/ui
2. Set up Supabase project, create all tables and RLS policies
3. Implement Supabase Auth with magic link
4. Create middleware for route protection (parent/staff/admin)
5. Seed database with schools, sample activities, sample students
6. Deploy skeleton to Vercel

### Sprint 2 (Week 2): Parent Portal
1. Build parent layout with bottom navigation
2. Home screen with student card + activity list
3. Progress screen with metric bars and comments
4. Calendar screen with events + weekly schedule
5. News feed with different card types
6. PWA manifest and service worker

### Sprint 3 (Week 3): Staff Panel
1. Staff layout with sidebar
2. Attendance screen (select activity → mark students)
3. Monthly report form with metric sliders + comment
4. Student roster with search

### Sprint 4 (Week 4): Admin Dashboard
1. Admin layout with full navigation
2. Global overview with metric cards
3. School detail view
4. Student search and management
5. Report completion tracking board
6. Events and news CRUD

---

## Key Business Rules

1. **Matrícula**: $10 one-time per student regardless of number of activities
2. **Discounts (York)**: $5 off per additional activity; $5 off per sibling
3. **Min students to open**: 8 per activity (except Entrepreneurs at 6)
4. **Payment deadline**: 10th of each month
5. **Trial week**: varies by school (York: March 9-13, $30 non-refundable)
6. **Monthly reports**: due by last day of each month
7. **Attendance counting**: 3+ attendances beyond trial/tryout weeks = enrolled
8. **Payment info**: Banco General accounts vary by school; Yappy always @Portescosports

---

## Environment Variables

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_APP_URL=https://app.portescosports.com
```

---

## Notes for Claude Code

- All UI text must be in Spanish
- Use Supabase's built-in auth — do not build custom auth
- Prioritize mobile-first responsive design
- Use shadcn/ui components (Button, Card, Input, Select, Badge, Progress, etc.)
- For the staff attendance screen, optimize for speed — bulk operations, minimal taps
- The monthly report form should auto-save drafts to prevent data loss
- Use Supabase Realtime for live attendance updates in admin dashboard
- Image uploads go to Supabase Storage bucket "photos"
- All timestamps in Panama timezone (America/Panama, UTC-5)
- Use next-intl or similar only if i18n is needed later; for now hardcode Spanish strings
