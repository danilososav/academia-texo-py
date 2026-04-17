import {
  doc,
  getDoc,
  setDoc,
  addDoc,
  updateDoc,
  getDocs,
  collection,
  query,
  where,
  orderBy,
  serverTimestamp,
  writeBatch,
  documentId,
  Timestamp,
  increment,
  limit,
  startAfter,
  deleteDoc,
  deleteField,
} from "firebase/firestore";
import type { QueryDocumentSnapshot, DocumentData } from "firebase/firestore";

export type AuditCursor = QueryDocumentSnapshot<DocumentData>;
import { db, auth } from "@/lib/firebase";

/** Elimina recursivamente todos los campos undefined de un objeto antes de enviarlo a Firestore. */
function removeUndefined(obj: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(obj)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) =>
        v !== null && typeof v === "object" && !Array.isArray(v)
          ? [k, removeUndefined(v as Record<string, unknown>)]
          : [k, v]
      )
  );
}

import type {
  User,
  UserRole,
  Course,
  Chapter,
  Resource,
  ResourceContent,
  ResourceType,
  ResourceProgress,
  QuizAnswer,
  CourseEnrollment,
  AuditLogEntry,
  AllowedUser,
} from "@/types";

// ─── Auditoría silenciosa ──────────────────────────────────────────────────────

export async function addAuditLog(data: {
  type: string;
  userId: string;
  userEmail: string;
  action: string;
  resourceType: string;
  resourceTitle: string;
}): Promise<void> {
  await addDoc(collection(db, "auditLog"), { ...data, timestamp: serverTimestamp() });
}

function silentAudit(data: {
  userId: string;
  userEmail: string;
  action: string;
  resourceType: string;
  resourceTitle: string;
}): void {
  const run = async () => {
    const userEmail = data.userEmail || (data.userId?.includes("@") ? data.userId : "");
    await addAuditLog({ type: "content", ...data, userEmail });
  };
  run().catch(() => {});
}

export function recordLoginBackground(userId: string, userAgent: string): void {
  updateDoc(doc(db, "users", userId), {
    lastLoginAt: serverTimestamp(),
    loginCount: increment(1),
  }).catch(() => {});
  addDoc(collection(db, "loginHistory", userId, "sessions"), {
    loginAt: serverTimestamp(),
    userAgent,
  }).catch(() => {});
}

// ─── Tipos de retorno auxiliares ──────────────────────────────────────────────


// ─── Usuarios ─────────────────────────────────────────────────────────────────

export async function getOrCreateUser(
  uid: string,
  email: string,
  claimedRole?: UserRole
): Promise<User> {
  const userRef = doc(db, "users", uid);
  const userSnap = await getDoc(userRef);

  if (userSnap.exists()) {
    const existingUser = { id: userSnap.id, ...userSnap.data() } as User;
    // Si el rol del token difiere del almacenado, el token es autoritativo
    if (claimedRole && existingUser.role !== claimedRole) {
      await updateDoc(userRef, { role: claimedRole });
      existingUser.role = claimedRole;
    }
    return existingUser;
  }

  const newUser = {
    email,
    displayName: email.split("@")[0],
    role: claimedRole ?? ("participante" as UserRole),
    createdAt: serverTimestamp(),
  };

  await setDoc(userRef, newUser);
  return { id: uid, ...newUser } as User;
}

export async function getUserRole(uid: string): Promise<UserRole | null> {
  const userRef = doc(db, "users", uid);
  const userSnap = await getDoc(userRef);
  if (!userSnap.exists()) return null;
  return userSnap.data().role as UserRole;
}

// ─── Cursos ───────────────────────────────────────────────────────────────────

export async function createCourse(
  data: Pick<Course, "title" | "description" | "coverImageUrl" | "welcomeMessage">,
  artesanoId: string
): Promise<Course> {
  // Contar los cursos existentes del artesano para asignar el número correlativo
  const existingSnap = await getDocs(
    query(collection(db, "courses"), where("createdBy", "==", artesanoId))
  );
  const courseNumber = existingSnap.size + 1;

  const payload: Record<string, unknown> = {
    title: data.title,
    description: data.description,
    coverImageUrl: data.coverImageUrl ?? null,
    createdBy: artesanoId,
    createdAt: serverTimestamp(),
    published: false,
    courseNumber,
  };
  if (data.welcomeMessage) payload.welcomeMessage = data.welcomeMessage;

  const ref = await addDoc(collection(db, "courses"), payload);
  silentAudit({
    userId: artesanoId,
    userEmail: auth.currentUser?.email ?? "",
    action: `Creó propedéutico: ${data.title}`,
    resourceType: "course",
    resourceTitle: data.title,
  });
  return { id: ref.id, ...payload } as unknown as Course;
}

export async function getCourse(courseId: string): Promise<Course | null> {
  const snap = await getDoc(doc(db, "courses", courseId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as Course;
}

export async function getChapter(
  courseId: string,
  chapterId: string
): Promise<Chapter | null> {
  const snap = await getDoc(
    doc(db, "courses", courseId, "chapters", chapterId)
  );
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as Chapter;
}

export async function getCoursesByArtesano(
  artesanoId: string
): Promise<Course[]> {
  const q = query(
    collection(db, "courses"),
    where("createdBy", "==", artesanoId),
    orderBy("createdAt", "desc")
  );
  const snap = await getDocs(q);
  return snap.docs
    .filter((d) => d.data().deleted !== true)
    .map((d) => ({ id: d.id, ...d.data() } as Course));
}

export async function getAllPublishedCourses(): Promise<Course[]> {
  const q = query(
    collection(db, "courses"),
    where("published", "==", true),
    orderBy("createdAt", "desc")
  );
  const snap = await getDocs(q);
  return snap.docs
    .filter((d) => d.data().deleted !== true)
    .map((d) => ({ id: d.id, ...d.data() } as Course));
}

export async function getAllCourses(): Promise<Course[]> {
  const snap = await getDocs(collection(db, "courses"));
  return snap.docs
    .filter((d) => d.data().deleted !== true)
    .map((d) => ({ id: d.id, ...d.data() } as Course))
    .sort((a, b) => {
      const dateA = (a.createdAt as { toDate?: () => Date } | undefined)?.toDate?.() ?? new Date(0);
      const dateB = (b.createdAt as { toDate?: () => Date } | undefined)?.toDate?.() ?? new Date(0);
      return dateB.getTime() - dateA.getTime();
    });
}

export async function updateCourse(
  courseId: string,
  data: Partial<Pick<Course, "title" | "description" | "coverImageUrl" | "welcomeMessage">>
): Promise<void> {
  await updateDoc(doc(db, "courses", courseId), data);
  silentAudit({
    userId: auth.currentUser?.uid ?? "",
    userEmail: auth.currentUser?.email ?? "",
    action: `Editó propedéutico: ${data.title ?? courseId}`,
    resourceType: "course",
    resourceTitle: data.title ?? courseId,
  });
}

export async function toggleCoursePublished(courseId: string): Promise<void> {
  const ref = doc(db, "courses", courseId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error(`Curso ${courseId} no encontrado`);
  await updateDoc(ref, { published: !snap.data().published });
}

export async function deleteCourse(courseId: string): Promise<void> {
  const deletedAt = serverTimestamp();
  const courseSnap = await getDoc(doc(db, "courses", courseId));
  const courseTitle = courseSnap.exists() ? (courseSnap.data().title as string) : courseId;
  const batch = writeBatch(db);

  const chaptersSnap = await getDocs(
    collection(db, "courses", courseId, "chapters")
  );

  for (const chapterDoc of chaptersSnap.docs) {
    const resourcesSnap = await getDocs(
      collection(db, "courses", courseId, "chapters", chapterDoc.id, "resources")
    );
    for (const resourceDoc of resourcesSnap.docs) {
      batch.update(resourceDoc.ref, { deleted: true, deletedAt });
    }
    batch.update(chapterDoc.ref, { deleted: true, deletedAt });
  }

  batch.update(doc(db, "courses", courseId), { deleted: true, deletedAt });
  await batch.commit();
  silentAudit({
    userId: auth.currentUser?.uid ?? "",
    userEmail: auth.currentUser?.email ?? "",
    action: `Archivó propedéutico: ${courseTitle}`,
    resourceType: "course",
    resourceTitle: courseTitle,
  });
}

// ─── Capítulos ────────────────────────────────────────────────────────────────

export async function createChapter(
  courseId: string,
  data: Pick<Chapter, "title" | "description">
): Promise<Chapter> {
  // Determinar el siguiente orderIndex
  const existing = await getDocs(
    collection(db, "courses", courseId, "chapters")
  );
  const nextIndex = existing.size;

  const payload = {
    title: data.title,
    description: data.description,
    orderIndex: nextIndex,
    createdAt: serverTimestamp(),
  };

  const ref = await addDoc(
    collection(db, "courses", courseId, "chapters"),
    payload
  );
  silentAudit({
    userId: auth.currentUser?.uid ?? "",
    userEmail: auth.currentUser?.email ?? "",
    action: `Creó capítulo: ${data.title}`,
    resourceType: "chapter",
    resourceTitle: data.title,
  });
  return { id: ref.id, ...payload } as unknown as Chapter;
}

export async function getChaptersByCourse(
  courseId: string
): Promise<Chapter[]> {
  const q = query(
    collection(db, "courses", courseId, "chapters"),
    orderBy("orderIndex", "asc")
  );
  const snap = await getDocs(q);
  return snap.docs
    .filter((d) => d.data().deleted !== true)
    .map((d) => ({ id: d.id, ...d.data() } as Chapter));
}

export async function updateChapter(
  courseId: string,
  chapterId: string,
  data: Partial<Pick<Chapter, "title" | "description">>
): Promise<void> {
  await updateDoc(
    doc(db, "courses", courseId, "chapters", chapterId),
    data
  );
  silentAudit({
    userId: auth.currentUser?.uid ?? "",
    userEmail: auth.currentUser?.email ?? "",
    action: `Editó capítulo: ${data.title ?? chapterId}`,
    resourceType: "chapter",
    resourceTitle: data.title ?? chapterId,
  });
}

export async function deleteChapter(
  courseId: string,
  chapterId: string
): Promise<void> {
  const deletedAt = serverTimestamp();
  const chapterRef = doc(db, "courses", courseId, "chapters", chapterId);
  const snap = await getDoc(chapterRef);
  const chapterTitle = snap.exists() ? (snap.data().title as string) : chapterId;

  const resourcesSnap = await getDocs(
    collection(db, "courses", courseId, "chapters", chapterId, "resources")
  );
  const batch = writeBatch(db);
  for (const resourceDoc of resourcesSnap.docs) {
    batch.update(resourceDoc.ref, { deleted: true, deletedAt });
  }
  batch.update(chapterRef, { deleted: true, deletedAt });
  await batch.commit();

  silentAudit({
    userId: auth.currentUser?.uid ?? "",
    userEmail: auth.currentUser?.email ?? "",
    action: `Archivó capítulo: ${chapterTitle}`,
    resourceType: "chapter",
    resourceTitle: chapterTitle,
  });
}

export async function reorderChapters(
  courseId: string,
  orderedIds: string[]
): Promise<void> {
  const batch = writeBatch(db);
  orderedIds.forEach((chapterId, index) => {
    batch.update(doc(db, "courses", courseId, "chapters", chapterId), {
      orderIndex: index,
    });
  });
  await batch.commit();
}

// ─── Recursos ─────────────────────────────────────────────────────────────────

export async function createResource(
  courseId: string,
  chapterId: string,
  data: Pick<Resource, "title" | "type"> & { content: ResourceContent }
): Promise<Resource> {
  const existing = await getDocs(
    collection(db, "courses", courseId, "chapters", chapterId, "resources")
  );
  const nextIndex = existing.size;

  const payload = {
    title: data.title,
    type: data.type as ResourceType,
    orderIndex: nextIndex,
    content: data.content,
    createdAt: serverTimestamp(),
  };

  const ref = await addDoc(
    collection(db, "courses", courseId, "chapters", chapterId, "resources"),
    removeUndefined(payload as Record<string, unknown>)
  );
  silentAudit({
    userId: auth.currentUser?.uid ?? "",
    userEmail: auth.currentUser?.email ?? "",
    action: `Creó recurso: ${data.title} (${data.type})`,
    resourceType: data.type,
    resourceTitle: data.title,
  });
  return { id: ref.id, ...payload } as unknown as Resource;
}

export async function getResourcesByChapter(
  courseId: string,
  chapterId: string
): Promise<Resource[]> {
  const q = query(
    collection(db, "courses", courseId, "chapters", chapterId, "resources"),
    orderBy("orderIndex", "asc")
  );
  const snap = await getDocs(q);
  return snap.docs
    .filter((d) => d.data().deleted !== true)
    .map((d) => ({ id: d.id, ...d.data() } as Resource));
}

export async function updateResource(
  courseId: string,
  chapterId: string,
  resourceId: string,
  data: Partial<Pick<Resource, "title" | "type" | "content">>
): Promise<void> {
  await updateDoc(
    doc(db, "courses", courseId, "chapters", chapterId, "resources", resourceId),
    removeUndefined(data as Record<string, unknown>)
  );
  silentAudit({
    userId: auth.currentUser?.uid ?? "",
    userEmail: auth.currentUser?.email ?? "",
    action: `Editó recurso: ${data.title ?? resourceId}`,
    resourceType: data.type ?? "resource",
    resourceTitle: data.title ?? resourceId,
  });
}

export async function deleteResource(
  courseId: string,
  chapterId: string,
  resourceId: string
): Promise<void> {
  const resourceRef = doc(db, "courses", courseId, "chapters", chapterId, "resources", resourceId);
  const snap = await getDoc(resourceRef);
  const resourceTitle = snap.exists() ? (snap.data().title as string) : resourceId;
  const resourceType = snap.exists() ? (snap.data().type as string) : "resource";
  await updateDoc(resourceRef, { deleted: true, deletedAt: serverTimestamp() });
  silentAudit({
    userId: auth.currentUser?.uid ?? "",
    userEmail: auth.currentUser?.email ?? "",
    action: `Archivó recurso: ${resourceTitle}`,
    resourceType,
    resourceTitle,
  });
}

export async function reorderResources(
  courseId: string,
  chapterId: string,
  orderedIds: string[]
): Promise<void> {
  const batch = writeBatch(db);
  orderedIds.forEach((resourceId, index) => {
    batch.update(
      doc(
        db,
        "courses",
        courseId,
        "chapters",
        chapterId,
        "resources",
        resourceId
      ),
      { orderIndex: index }
    );
  });
  await batch.commit();
}

// ─── Progreso ─────────────────────────────────────────────────────────────────

export async function enrollParticipant(
  userId: string,
  courseId: string
): Promise<void> {
  const enrollRef = doc(db, "progress", userId, "courses", courseId);
  const snap = await getDoc(enrollRef);
  if (snap.exists()) return; // ya inscripto

  await setDoc(enrollRef, {
    enrolledAt: serverTimestamp(),
    // Campos indexables para getCourseProgressSummary
    courseId,
    userId,
  });

  await updateDoc(doc(db, "courses", courseId), {
    enrolledCount: increment(1),
  });

  const courseSnap = await getDoc(doc(db, "courses", courseId));
  const courseTitle = courseSnap.exists() ? (courseSnap.data().title as string) : courseId;
  silentAudit({
    userId,
    userEmail: auth.currentUser?.email ?? "",
    action: `Participante inscripto en: ${courseTitle}`,
    resourceType: "course",
    resourceTitle: courseTitle,
  });
}

export async function markResourceCompleted(
  userId: string,
  courseId: string,
  resourceId: string,
  score?: number,
  answers?: QuizAnswer[],
  resourceTitle?: string
): Promise<void> {
  const progressRef = doc(
    db,
    "progress",
    userId,
    "courses",
    courseId,
    "resources",
    resourceId
  );

  const payload: Omit<ResourceProgress, "completedAt"> & {
    completedAt: ReturnType<typeof serverTimestamp>;
  } = {
    completed: true,
    completedAt: serverTimestamp(),
    ...(score !== undefined && { score }),
    ...(answers !== undefined && { answers }),
  };

  await setDoc(progressRef, payload);

  silentAudit({
    userId,
    userEmail: auth.currentUser?.email ?? "",
    action: `Completó recurso: ${resourceTitle ?? resourceId}`,
    resourceType: "resource",
    resourceTitle: resourceTitle ?? resourceId,
  });
}

export async function getResourceProgress(
  userId: string,
  courseId: string
): Promise<Record<string, boolean>> {
  const snap = await getDocs(
    collection(db, "progress", userId, "courses", courseId, "resources")
  );

  const result: Record<string, boolean> = {};
  snap.docs.forEach((d) => {
    result[d.id] = d.data().completed === true;
  });
  return result;
}

export async function getCourseProgressStats(
  userId: string,
  courseId: string
): Promise<{ completed: number; total: number; enrolled: boolean }> {
  const enrollSnap = await getDoc(doc(db, "progress", userId, "courses", courseId));

  if (!enrollSnap.exists()) {
    return { completed: 0, total: 0, enrolled: false };
  }

  const chaptersSnap = await getDocs(
    collection(db, "courses", courseId, "chapters")
  );

  const resourceCounts = await Promise.all(
    chaptersSnap.docs.map((chapterDoc) =>
      getDocs(
        collection(db, "courses", courseId, "chapters", chapterDoc.id, "resources")
      ).then((snap) => snap.size)
    )
  );

  const total = resourceCounts.reduce((acc, n) => acc + n, 0);

  const progressSnap = await getDocs(
    collection(db, "progress", userId, "courses", courseId, "resources")
  );
  const completed = progressSnap.docs.filter(
    (d) => d.data().completed === true
  ).length;

  return { completed, total, enrolled: true };
}


// ─── Dashboard global de Participantes ──────────────────────────────────────────────

export async function getAllParticipants(): Promise<User[]> {
  const q = query(collection(db, "users"), where("role", "==", "participante"));
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => {
      const data = d.data();
      return {
        id: d.id,
        email: (data.email as string | undefined) ?? "",
        displayName: (data.displayName as string | undefined) ?? (data.email as string | undefined) ?? d.id,
        role: data.role as UserRole,
        createdAt: data.createdAt,
      } as User;
    })
    .filter((u) => u.email.trim() !== "");
}

/** Elimina de Firestore los docs de usuarios con role:'participante' que no tienen email.
 *  Retorna la cantidad de documentos eliminados. */
export async function cleanOrphanedUsers(): Promise<number> {
  const q = query(collection(db, "users"), where("role", "==", "participante"));
  const snap = await getDocs(q);
  const orphans = snap.docs.filter((d) => {
    const email = d.data().email as string | undefined;
    return !email || email.trim() === "";
  });
  if (orphans.length === 0) return 0;
  const batch = writeBatch(db);
  for (const d of orphans) batch.delete(d.ref);
  await batch.commit();
  return orphans.length;
}

export interface ParticipantCourseStat {
  courseId: string;
  completed: number;
  total: number;
  enrolledAt: CourseEnrollment["enrolledAt"];
}

export async function getParticipantProgress(
  userId: string
): Promise<ParticipantCourseStat[]> {
  const enrollmentsSnap = await getDocs(
    collection(db, "progress", userId, "courses")
  );

  return Promise.all(
    enrollmentsSnap.docs.map(async (enrollDoc) => {
      const courseId = enrollDoc.id;
      const enrolledAt = enrollDoc.data().enrolledAt as CourseEnrollment["enrolledAt"];

      const chaptersSnap = await getDocs(collection(db, "courses", courseId, "chapters"));
      const resourceCounts = await Promise.all(
        chaptersSnap.docs.map((ch) =>
          getDocs(collection(db, "courses", courseId, "chapters", ch.id, "resources")).then(
            (s) => s.size
          )
        )
      );
      const total = resourceCounts.reduce((acc, n) => acc + n, 0);

      const progressSnap = await getDocs(
        collection(db, "progress", userId, "courses", courseId, "resources")
      );
      const completedSet = new Set(
        progressSnap.docs.filter((d) => d.data().completed === true).map((d) => d.id)
      );

      return { courseId, completed: completedSet.size, total, enrolledAt };
    })
  );
}


// ─── Engagement tracking ───────────────────────────────────────────────────────

export interface EngagementData {
  timeSpent?: number;
  pagesViewed?: number[];
  videoWatchedSeconds?: number;
  readingComplete?: boolean;
}

export async function updateResourceEngagement(
  userId: string,
  courseId: string,
  resourceId: string,
  data: EngagementData
): Promise<void> {
  const ref = doc(db, "progress", userId, "courses", courseId, "resources", resourceId);
  await setDoc(ref, { ...data, updatedAt: serverTimestamp() }, { merge: true });
  if (data.timeSpent && data.timeSpent > 0) {
    updateDoc(doc(db, "progress", userId, "courses", courseId), {
      totalTimeSpent: increment(data.timeSpent),
    }).catch(() => {});
  }
}

// ─── Admin ─────────────────────────────────────────────────────────────────────

export async function getAuditLogs(
  pageSize: number,
  cursor?: AuditCursor
): Promise<{ logs: AuditLogEntry[]; nextCursor: AuditCursor | null }> {
  const q = cursor
    ? query(collection(db, "auditLog"), orderBy("timestamp", "desc"), startAfter(cursor), limit(pageSize))
    : query(collection(db, "auditLog"), orderBy("timestamp", "desc"), limit(pageSize));
  const snap = await getDocs(q);
  const logs = snap.docs.map((d) => ({ id: d.id, ...d.data() } as AuditLogEntry));
  const nextCursor = snap.docs.length > 0 ? snap.docs[snap.docs.length - 1] : null;
  return { logs, nextCursor };
}

export async function getArchivedCourses(): Promise<Course[]> {
  const q = query(collection(db, "courses"), where("deleted", "==", true), orderBy("createdAt", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Course));
}

export async function restoreCourse(courseId: string): Promise<void> {
  await updateDoc(doc(db, "courses", courseId), {
    deleted: false,
    deletedAt: deleteField(),
  });
}

export type DeletedItem = {
  id: string;
  type: "course";
  title: string;
  deletedAt?: import("firebase/firestore").Timestamp;
  deletedBy?: string;
  courseId?: never;
};

export async function getDeletedContent(): Promise<DeletedItem[]> {
  const snap = await getDocs(collection(db, "courses"));
  const deletedCourses: DeletedItem[] = snap.docs
    .filter((d) => d.data().deleted === true)
    .map((d) => ({
      id: d.id,
      type: "course" as const,
      title: d.data().title as string,
      deletedAt: d.data().deletedAt,
      deletedBy: d.data().deletedBy,
    }));
  // TODO: También buscar capítulos y recursos eliminados
  return deletedCourses;
}

export async function restoreContent(
  type: "course",
  id: string
): Promise<void> {
  if (type === "course") {
    await updateDoc(doc(db, "courses", id), {
      deleted: false,
      deletedAt: deleteField(),
    });
  }
}

export async function getAllowedUsers(): Promise<AllowedUser[]> {
  const snap = await getDocs(collection(db, "allowedUsers"));
  return snap.docs.map((d) => ({
    id: d.id,
    name: (d.data().name as string) ?? "",
    role: ((d.data().role as string) ?? "participante") as UserRole,
    createdAt: d.data().createdAt as Timestamp | undefined,
  }));
}

export async function addAllowedUser(email: string, name: string, role: UserRole): Promise<void> {
  await setDoc(doc(db, "allowedUsers", email), { name, role, createdAt: serverTimestamp() });
}

export async function removeAllowedUser(uid: string): Promise<void> {
  await deleteDoc(doc(db, "allowedUsers", uid));
}
