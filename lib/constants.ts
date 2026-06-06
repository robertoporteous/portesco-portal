// App-wide constants — metric templates, categories, grades, etc.

import type { ActivityCategory } from "./types";

// Panama timezone used for all timestamps
export const PANAMA_TIMEZONE = "America/Panama";

// Grades offered
export const GRADES = [
  "PK",
  "K",
  "1ro",
  "2do",
  "3ro",
  "4to",
  "5to",
  "6to",
  "7mo",
  "8vo",
  "9no",
  "10mo",
  "11vo",
  "12vo",
];

// Activity category labels in Spanish
export const CATEGORY_LABELS: Record<ActivityCategory, string> = {
  deporte: "Deporte",
  arte: "Arte",
  academico: "Académico",
  cuidado: "Cuidado extendido",
};

// Overall rating labels
export const RATING_LABELS = {
  excelente: "Excelente",
  buen_progreso: "Buen progreso",
  en_desarrollo: "En desarrollo",
  necesita_apoyo: "Necesita apoyo",
} as const;

// Rating colors (Tailwind-compatible hex)
export const RATING_COLORS = {
  excelente: "#10B981",
  buen_progreso: "#10B981",
  en_desarrollo: "#F59E0B",
  necesita_apoyo: "#EF4444",
} as const;

// Event type labels and colors
export const EVENT_TYPE_CONFIG = {
  match: { label: "Partido", color: "#E31E24" },
  tournament: { label: "Torneo", color: "#1E3A8A" },
  practice: { label: "Práctica", color: "#9CA3AF" },
  festival: { label: "Festival", color: "#F59E0B" },
  meeting: { label: "Reunión", color: "#6366F1" },
  deadline: { label: "Fecha límite", color: "#EF4444" },
} as const;

// Attendance status labels — keys mirror the attendance_status enum (0006).
export const ATTENDANCE_LABELS = {
  present: "Presente",
  absent: "Ausente",
  justified: "Justificado",
  late: "Tarde",
  not_marked: "Sin marcar",
} as const;

export const ATTENDANCE_COLORS = {
  present: "#10B981",
  absent: "#EF4444",
  justified: "#F59E0B",
  late: "#F97316",
  not_marked: "#9CA3AF",
} as const;

// Payment config
export const MATRICULA_PRICE = 10; // one-time enrollment fee
export const PAYMENT_DEADLINE_DAY = 10; // 10th of each month
export const YAPPY_HANDLE = "@Portescosports";

// Metric templates per activity type
export interface MetricTemplate {
  key: string;
  label: string;
  max: number;
}

export interface ActivityMetricConfig {
  label: string;
  metrics: MetricTemplate[];
}

export const METRIC_TEMPLATES: Record<string, ActivityMetricConfig> = {
  deporte_futbol: {
    label: "Fútbol",
    metrics: [
      { key: "tecnica", label: "Técnica", max: 5 },
      { key: "trabajo_equipo", label: "Trabajo en equipo", max: 5 },
      { key: "actitud", label: "Actitud y disciplina", max: 5 },
      { key: "condicion_fisica", label: "Condición física", max: 5 },
    ],
  },
  deporte_basketball: {
    label: "Basketball",
    metrics: [
      { key: "tiro", label: "Tiro", max: 5 },
      { key: "dribling", label: "Dribling", max: 5 },
      { key: "defensa", label: "Defensa", max: 5 },
      { key: "trabajo_equipo", label: "Trabajo en equipo", max: 5 },
    ],
  },
  deporte_voleibol: {
    label: "Voleibol",
    metrics: [
      { key: "servicio", label: "Servicio", max: 5 },
      { key: "recepcion", label: "Recepción", max: 5 },
      { key: "remate", label: "Remate", max: 5 },
      { key: "juego_equipo", label: "Juego en equipo", max: 5 },
    ],
  },
  deporte_flag_football: {
    label: "Flag Football",
    metrics: [
      { key: "tecnica", label: "Técnica", max: 5 },
      { key: "velocidad", label: "Velocidad/Agilidad", max: 5 },
      { key: "estrategia", label: "Comprensión de juego", max: 5 },
      { key: "actitud", label: "Actitud", max: 5 },
    ],
  },
  deporte_atletismo: {
    label: "Atletismo",
    metrics: [
      { key: "tecnica", label: "Técnica", max: 5 },
      { key: "resistencia", label: "Resistencia", max: 5 },
      { key: "esfuerzo", label: "Esfuerzo", max: 5 },
      { key: "mejora", label: "Mejora personal", max: 5 },
    ],
  },
  deporte_ajedrez: {
    label: "Ajedrez",
    metrics: [
      { key: "estrategia", label: "Pensamiento estratégico", max: 5 },
      { key: "concentracion", label: "Concentración", max: 5 },
      { key: "progreso", label: "Progreso técnico", max: 5 },
    ],
  },
  deporte_porrismo: {
    label: "Porrismo / Cheerleading",
    metrics: [
      { key: "tecnica", label: "Técnica", max: 5 },
      { key: "coordinacion", label: "Coordinación grupal", max: 5 },
      { key: "energia", label: "Energía y actitud", max: 5 },
      { key: "flexibilidad", label: "Flexibilidad", max: 5 },
    ],
  },
  arte_teatro: {
    label: "Teatro",
    metrics: [
      { key: "expresion", label: "Expresión", max: 5 },
      { key: "creatividad", label: "Creatividad", max: 5 },
      { key: "participacion", label: "Participación", max: 5 },
      { key: "memorizacion", label: "Memorización", max: 5 },
    ],
  },
  arte_baile: {
    label: "Baile Urbano",
    metrics: [
      { key: "ritmo", label: "Ritmo", max: 5 },
      { key: "coordinacion", label: "Coordinación", max: 5 },
      { key: "expresion", label: "Expresión corporal", max: 5 },
      { key: "esfuerzo", label: "Esfuerzo", max: 5 },
    ],
  },
  arte_musica: {
    label: "Piano / Guitarra / Ukulele",
    metrics: [
      { key: "tecnica", label: "Técnica instrumental", max: 5 },
      { key: "lectura", label: "Lectura musical", max: 5 },
      { key: "practica", label: "Práctica en casa", max: 5 },
      { key: "progreso", label: "Progreso general", max: 5 },
    ],
  },
  arte_visual: {
    label: "Arte Creativo / Fotografía",
    metrics: [
      { key: "creatividad", label: "Creatividad", max: 5 },
      { key: "tecnica", label: "Técnica", max: 5 },
      { key: "participacion", label: "Participación", max: 5 },
    ],
  },
  academico: {
    label: "Reforzamiento Académico / Estudio Dirigido",
    metrics: [
      { key: "compromiso", label: "Compromiso", max: 5 },
      { key: "organizacion", label: "Organización", max: 5 },
      { key: "progreso", label: "Progreso académico", max: 5 },
      { key: "autonomia", label: "Autonomía", max: 5 },
    ],
  },
  cuidado: {
    label: "Extended Care / Cuidado Extendido",
    metrics: [
      { key: "comportamiento", label: "Comportamiento", max: 5 },
      { key: "socializacion", label: "Socialización", max: 5 },
      { key: "autonomia", label: "Autonomía", max: 5 },
    ],
  },
};

// Seed data: schools
export const SEED_SCHOOLS = [
  { name: "York International School", slug: "york", coordination_phone: "6943-7565", bank_account: "04-05-96-700405-1" },
  { name: "Colegio María Inmaculada", slug: "cidmi", coordination_phone: "6600-1333", bank_account: "04-05-96-700422-6" },
  { name: "Pureza de María", slug: "cpm", bank_account: "04-05-96-700435-0" },
  { name: "Las Esclavas - Hummingbirds", slug: "cle", coordination_phone: "6600-1333", bank_account: "04-05-96-700405-1" },
  { name: "Oxford International School", slug: "ois" },
  { name: "The Oxford School", slug: "tos" },
  { name: "Colegio Real", slug: "crp" },
  { name: "ECP", slug: "ecp" },
  { name: "IC Falcons", slug: "ic-falcons" },
  { name: "AIP", slug: "aip" },
];
