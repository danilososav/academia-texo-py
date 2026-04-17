import { Timestamp } from "firebase/firestore";

// ─── User ────────────────────────────────────────────────────────────────────

export type UserRole = "participante" | "artesano";

export interface User {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
  createdAt: Timestamp;
}

// ─── Course ───────────────────────────────────────────────────────────────────

export interface Course {
  id: string;
  title: string;
  description: string;
  coverImageUrl?: string;
  createdBy: string; // userId
  createdAt: Timestamp;
  published: boolean;
  courseNumber?: number; // asignado automáticamente al crear — undefined en cursos previos
  welcomeMessage?: string; // Mensaje de bienvenida/introducción
  deleted?: boolean;
  deletedAt?: Timestamp;
  deletedBy?: string;
}

// ─── Chapter ──────────────────────────────────────────────────────────────────

export interface Chapter {
  id: string;
  title: string;
  description: string;
  orderIndex: number;
  createdAt: Timestamp;
  deleted?: boolean;
}

// ─── Resource content variants ────────────────────────────────────────────────

export interface VideoContent {
  driveUrl: string;
}

export interface PresentationContent {
  driveUrl: string;
  totalSlides?: number;
  pdfFileId?: string; // PDF generado automáticamente al subir PPT/PPTX
}

/** Documento: texto escrito, archivo DOC/DOCX/TXT o link de Drive */
export interface DocumentContent {
  body?: string;        // texto escrito directamente
  driveUrl?: string;    // archivo subido a Drive o link externo
  fileName?: string;    // nombre original del archivo (si se subió)
  totalPages?: number;  // para navegación manual en iframe (opcional)
  pdfFileId?: string;   // PDF generado automáticamente al subir DOCX/DOC
}

/** PDF: subido a Drive o link externo, con navegación de páginas */
export interface PdfContent {
  driveUrl: string;
  fileName?: string;
  totalPages?: number;  // para fallback de navegación manual si la conversión falla
}

// ── Legado (backward compat — no se pueden crear nuevos) ─────────────────────

/** @deprecated Usar DocumentContent */
export interface TextContent {
  body: string;
}

/** @deprecated Eliminado — mantener solo para mostrar recursos existentes */
export interface FileContent {
  cloudinaryUrl: string;
  fileName: string;
}

// ─── Quiz ─────────────────────────────────────────────────────────────────────

export interface QuizQuestion {
  questionText: string;
  options: string[];
  correctIndex?: number;
  multipleChoice?: boolean;
  correctIndexes?: number[];
}

export interface QuizContent {
  questions: QuizQuestion[];
  allowObservations?: boolean;
  observationsLabel?: string;
}

// ─── Resource ─────────────────────────────────────────────────────────────────

/**
 * Tipos activos: video | presentation | document | pdf | quiz
 * Tipos legados (solo lectura): text | file
 */
export type ResourceType =
  | "video"
  | "presentation"
  | "document"
  | "pdf"
  | "quiz"
  | "text"   // legacy
  | "file";  // legacy

export type ResourceContent =
  | VideoContent
  | PresentationContent
  | DocumentContent
  | PdfContent
  | QuizContent
  | TextContent
  | FileContent;

export interface Resource {
  id: string;
  title: string;
  type: ResourceType;
  orderIndex: number;
  content: ResourceContent;
  createdAt: Timestamp;
  deleted?: boolean;
}

// Typed resource variants

export interface VideoResource extends Omit<Resource, "type" | "content"> {
  type: "video";
  content: VideoContent;
}

export interface PresentationResource extends Omit<Resource, "type" | "content"> {
  type: "presentation";
  content: PresentationContent;
}

export interface DocumentResource extends Omit<Resource, "type" | "content"> {
  type: "document";
  content: DocumentContent;
}

export interface PdfResource extends Omit<Resource, "type" | "content"> {
  type: "pdf";
  content: PdfContent;
}

export interface QuizResource extends Omit<Resource, "type" | "content"> {
  type: "quiz";
  content: QuizContent;
}

export interface TextResource extends Omit<Resource, "type" | "content"> {
  type: "text";
  content: TextContent;
}

export interface FileResource extends Omit<Resource, "type" | "content"> {
  type: "file";
  content: FileContent;
}

export type TypedResource =
  | VideoResource
  | PresentationResource
  | DocumentResource
  | PdfResource
  | QuizResource
  | TextResource
  | FileResource;

// ─── Admin ────────────────────────────────────────────────────────────────────

export interface AuditLogEntry {
  id: string;
  type: string;
  userId: string;
  userEmail: string;
  role?: string;
  action: string;
  resourceType: string;
  resourceTitle: string;
  timestamp: Timestamp;
  ip?: string;
}

export interface AllowedUser {
  id: string; // document ID = email (uid para custom tokens)
  name: string;
  role: UserRole;
  createdAt?: Timestamp;
}

// ─── Progress ─────────────────────────────────────────────────────────────────

export interface CourseEnrollment {
  enrolledAt: Timestamp;
}

export interface QuizAnswer {
  questionIndex: number;
  selectedOptions: number[];
}

export interface ResourceProgress {
  completed: boolean;
  completedAt: Timestamp;
  score?: number;
  answers?: QuizAnswer[];
}
