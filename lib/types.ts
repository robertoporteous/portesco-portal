// TypeScript types derived from the Supabase database schema

export type UserRole = "parent" | "coordinator" | "professor" | "admin";

export type ActivityCategory = "deporte" | "arte" | "academico" | "cuidado";

export type EnrollmentStatus = "active" | "trial" | "withdrawn" | "suspended";

// Mirrors the Postgres enum attendance_status (migration 0006).
export type AttendanceStatus =
  | "present"
  | "absent"
  | "justified"
  | "late"
  | "not_marked";

export type OverallRating =
  | "excelente"
  | "buen_progreso"
  | "en_desarrollo"
  | "necesita_apoyo";

export type EventType =
  | "match"
  | "tournament"
  | "practice"
  | "festival"
  | "meeting"
  | "deadline";

export type NewsType =
  | "result"
  | "announcement"
  | "gallery"
  | "promotion"
  | "reminder";

// ---- Tables ----

export interface School {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  primary_color: string;
  secondary_color: string;
  bank_account: string | null;
  yappy_handle: string;
  contact_phone: string | null;
  coordination_phone: string | null;
  is_active: boolean;
  created_at: string;
}

export interface Activity {
  id: string;
  school_id: string;
  name: string;
  category: ActivityCategory;
  monthly_price: number;
  school_payment: number;
  schedule: string | null;
  days_of_week: string[] | null;
  start_time: string | null;
  end_time: string | null;
  min_students: number;
  max_students: number | null;
  icon: string | null;
  is_active: boolean;
  created_at: string;
}

export interface User {
  id: string;
  email: string;
  full_name: string;
  phone: string | null;
  role: UserRole;
  avatar_url: string | null;
  is_active: boolean;
  created_at: string;
}

export interface StaffSchool {
  id: string;
  user_id: string;
  school_id: string;
  role: "coordinator" | "professor";
}

export interface StaffActivity {
  id: string;
  user_id: string;
  activity_id: string;
}

export interface Student {
  id: string;
  school_id: string;
  parent_id: string;
  full_name: string;
  grade: string;
  date_of_birth: string | null;
  avatar_url: string | null;
  is_active: boolean;
  created_at: string;
}

export interface Enrollment {
  id: string;
  student_id: string;
  activity_id: string;
  status: EnrollmentStatus;
  enrolled_at: string;
  withdrawn_at: string | null;
}

// Mirrors the class_attendance table (migration 0006): one row per
// (session_id, student_id), upserted when a coordinator marks attendance.
export interface Attendance {
  id: string;
  session_id: string;
  student_id: string;
  status: AttendanceStatus;
  marked_at: string | null;
  marked_by: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface MetricValues {
  [key: string]: number;
}

export interface MonthlyReport {
  id: string;
  enrollment_id: string;
  month: number;
  year: number;
  metrics: MetricValues;
  overall_rating: OverallRating | null;
  comment: string | null;
  reported_by: string;
  created_at: string;
}

export interface Event {
  id: string;
  school_id: string;
  activity_id: string | null;
  title: string;
  description: string | null;
  event_date: string;
  start_time: string | null;
  end_time: string | null;
  location: string | null;
  event_type: EventType | null;
  is_published: boolean;
  created_at: string;
}

export interface News {
  id: string;
  school_id: string;
  activity_id: string | null;
  title: string;
  body: string;
  image_url: string | null;
  news_type: NewsType | null;
  is_published: boolean;
  published_at: string;
  created_at: string;
}

export interface Photo {
  id: string;
  news_id: string;
  url: string;
  caption: string | null;
  sort_order: number;
  created_at: string;
}

// ---- Joined / view types ----

export interface StudentWithSchool extends Student {
  school: School;
}

export interface EnrollmentWithActivity extends Enrollment {
  activity: Activity;
}

export interface EnrollmentWithDetails extends Enrollment {
  activity: Activity;
  student: Student;
}
