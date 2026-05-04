"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import toast from "react-hot-toast";
import {
  getCourse,
  getChaptersByCourse,
  getResourcesByChapter,
  getResourceProgress,
  markResourceCompleted,
  enrollParticipant,
} from "@/lib/firestore";
import { useAuth } from "@/lib/auth-context";
import type { Course, Chapter, Resource, ResourceType, QuizAnswer } from "@/types";
import ResourceViewer from "@/components/participante/ResourceViewer";
import CertificateModal from "@/components/participante/CertificateModal";

interface ChapterData {
  chapter: Chapter;
  resources: Resource[];
}

const TYPE_LABELS: Record<ResourceType, string> = {
  video: "Video",
  presentation: "Presentación",
  document: "Documento",
  pdf: "PDF",
  quiz: "Cuestionario",
  text: "Texto",
  file: "Archivo",
};

const TYPE_ICONS: Record<ResourceType, string> = {
  video: "🎬",
  presentation: "📊",
  document: "📄",
  pdf: "📋",
  quiz: "❓",
  text: "📝",
  file: "📄",
};

export default function CourseViewPage() {
  const { courseId } = useParams<{ courseId: string }>();
  const router = useRouter();
  const { firebaseUser } = useAuth();

  const [course, setCourse] = useState<Course | null>(null);
  const [chaptersData, setChaptersData] = useState<ChapterData[]>([]);
  const [progress, setProgress] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [showIntro, setShowIntro] = useState(false);
  const [showCertificate, setShowCertificate] = useState(false);
  const [completedAt, setCompletedAt] = useState<Date>(new Date());
  const [activeChapterIdx, setActiveChapterIdx] = useState(0);
  const [activeResourceId, setActiveResourceId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const loadData = useCallback(async () => {
    if (!firebaseUser) return;
    setLoading(true);
    try {
      const [courseData, chaptersRaw, progressMap] = await Promise.all([
        getCourse(courseId),
        getChaptersByCourse(courseId),
        getResourceProgress(firebaseUser.uid, courseId),
      ]);

      if (!courseData) {
        router.replace("/participante/dashboard");
        return;
      }

      const chaptersWithResources = await Promise.all(
        chaptersRaw.map(async (chapter) => ({
          chapter,
          resources: await getResourcesByChapter(courseId, chapter.id),
        }))
      );

      await enrollParticipant(firebaseUser.uid, courseId);

      setShowIntro(true);

      setCourse(courseData);
      setChaptersData(chaptersWithResources);
      setProgress(progressMap);
    } finally {
      setLoading(false);
    }
  }, [courseId, firebaseUser, router]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ── Helpers de desbloqueo ────────────────────────────────────────────────

  function isChapterUnlocked(idx: number): boolean {
    if (idx === 0) return true;
    const prev = chaptersData[idx - 1];
    return (
      prev.resources.length > 0 &&
      prev.resources.every((r) => progress[r.id] === true)
    );
  }

  function isResourceUnlocked(chapterIdx: number, resourceIdx: number): boolean {
    if (chapterIdx === 0 && resourceIdx === 0) return true;
    if (!isChapterUnlocked(chapterIdx)) return false;
    if (resourceIdx === 0) return true;
    const prevResource = chaptersData[chapterIdx].resources[resourceIdx - 1];
    return progress[prevResource.id] === true;
  }

  function isChapterCompleted(idx: number): boolean {
    const { resources } = chaptersData[idx];
    return (
      resources.length > 0 && resources.every((r) => progress[r.id] === true)
    );
  }

  // ── Stats de progreso ────────────────────────────────────────────────────

  const completedChapters = chaptersData.filter((_, i) => isChapterCompleted(i)).length;
  const totalChapters = chaptersData.length;
  const totalResources = chaptersData.reduce((sum, { resources }) => sum + resources.length, 0);
  const completedResources = chaptersData.flatMap(({ resources }) => resources).filter((r) => progress[r.id] === true).length;
  const coursePct = totalResources > 0 ? Math.round((completedResources / totalResources) * 100) : 0;

  const activeChapterData = chaptersData[activeChapterIdx] ?? null;
  const activeResource =
    activeChapterData?.resources.find((r) => r.id === activeResourceId) ?? null;

  // ── Acción "Siguiente" para ResourceViewer ───────────────────────────────

  function getNextAction(): { label: string; onClick: () => void } | null | undefined {
    if (!activeChapterData || !activeResource) return undefined;

    const resourceIdx = activeChapterData.resources.findIndex(
      (r) => r.id === activeResource.id
    );

    // Hay recurso siguiente en el mismo capítulo
    if (resourceIdx < activeChapterData.resources.length - 1) {
      const nextResource = activeChapterData.resources[resourceIdx + 1];
      return {
        label: "Siguiente →",
        onClick: () => setActiveResourceId(nextResource.id),
      };
    }

    // Último recurso del capítulo — hay capítulo siguiente
    const nextChapterIdx = activeChapterIdx + 1;
    if (nextChapterIdx < chaptersData.length) {
      const nextChapter = chaptersData[nextChapterIdx];
      return {
        label: "Siguiente cápsula →",
        onClick: () => {
          setActiveChapterIdx(nextChapterIdx);
          setActiveResourceId(nextChapter.resources[0]?.id ?? null);
        },
      };
    }

    // Último recurso del último capítulo → celebración
    return null;
  }

  // ── Handlers ─────────────────────────────────────────────────────────────

  async function handleCompleteResource(resourceId: string, score?: number, answers?: QuizAnswer[]) {
    if (!firebaseUser) return;
    const allResources = chaptersData.flatMap((cd) => cd.resources);
    const resourceTitle = allResources.find((r) => r.id === resourceId)?.title;
    await markResourceCompleted(firebaseUser.uid, courseId, resourceId, score, answers, resourceTitle);
    const newProgress = { ...progress, [resourceId]: true };
    setProgress(newProgress);

    // Verificar si el curso quedó 100% completado
    const allDone = allResources.length > 0 && allResources.every((r) => newProgress[r.id] === true);

    if (allDone) {
      setCompletedAt(new Date());
      setShowCertificate(true);
    } else if (score === undefined) {
      // Solo para recursos que no son quiz (quiz tiene su propio toast en QuizViewer)
      toast.success("¡Recurso completado! Siguiente desbloqueado 🎉");
    }
  }

  function selectChapter(idx: number) {
    if (!isChapterUnlocked(idx)) return;
    setActiveChapterIdx(idx);
    setActiveResourceId(null);
    setSidebarOpen(false);
  }

  function selectResource(resourceId: string, chapterIdx: number, resourceIdx: number) {
    if (!isResourceUnlocked(chapterIdx, resourceIdx)) return;
    setActiveResourceId(resourceId);
  }

  function handleStartCourse() {
    setShowIntro(false);
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-texo-verde/30 border-t-texo-verde rounded-full animate-spin" />
      </div>
    );
  }
  if (!course) return null;

  // ── Pantalla de introducción ──────────────────────────────────────────────
  if (showIntro) {
    const totalResources = chaptersData.reduce((sum, { resources }) => sum + resources.length, 0);
    const estimatedMin = totalResources * 5;

    return (
      <div className="min-h-[calc(100vh-56px)] flex items-center justify-center p-6 bg-gray-50 dark:bg-texo-dark">
        <div className="w-full max-w-lg">
          {/* Portada */}
          {course.coverImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={course.coverImageUrl}
              alt={course.title}
              className="w-full h-48 object-cover rounded-2xl mb-6"
            />
          ) : (
            <div className="w-full h-48 rounded-2xl mb-6 bg-gradient-to-br from-texo-azul to-texo-verde flex items-center justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/texo-logo.jpg" alt="TEXO" className="h-20 w-auto object-contain" />
            </div>
          )}

          {/* Contenido */}
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-3">
            {course.title}
          </h1>
          {/* Mensaje de bienvenida */}
          {course.welcomeMessage && (
            <div className="bg-texo-azul/5 dark:bg-white/5 border border-texo-azul/20 dark:border-white/10 rounded-xl p-4 mb-6">
              <p className="text-xs font-semibold text-texo-azul dark:text-texo-amarillo uppercase tracking-wide mb-2">
                Mensaje de bienvenida
              </p>
              <p className="text-sm text-gray-700 dark:text-gray-200 leading-relaxed whitespace-pre-wrap">
                {course.welcomeMessage}
              </p>
            </div>
          )}

          {/* Stats */}
          <div className="flex gap-6 mb-8">
            <div className="text-center">
              <p className="text-2xl font-bold text-texo-azul dark:text-texo-amarillo">
                {chaptersData.length}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">
                {chaptersData.length === 1 ? "cápsula" : "cápsulas"}
              </p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-texo-azul dark:text-texo-amarillo">
                {estimatedMin}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">min estimados</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-texo-azul dark:text-texo-amarillo">
                {totalResources}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">
                {totalResources === 1 ? "recurso" : "recursos"}
              </p>
            </div>
          </div>

          <button
            onClick={handleStartCourse}
            className="w-full bg-texo-amarillo text-texo-azul font-bold py-3 px-6 rounded-xl text-base hover:bg-texo-amarillo/90 transition-colors"
          >
            Comenzar propedéutico →
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col" style={{ height: "calc(100vh - 56px)" }}>

      {showCertificate && course && firebaseUser && (
        <CertificateModal
          participantName={firebaseUser.displayName || firebaseUser.email?.split("@")[0] || "Participante"}
          courseTitle={course.title}
          completedAt={completedAt}
          onClose={() => setShowCertificate(false)}
          isCelebration
        />
      )}

      {/* ── Header con doble barra de progreso ─────────────────────────── */}
      <header className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-6 py-3 shrink-0">
        <div className="max-w-6xl mx-auto">
          <Link
            href="/participante/dashboard"
            className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            ← Propedéuticos
          </Link>
          {course.courseNumber !== undefined && (
            <p className="text-sm font-semibold text-texo-amarillo mt-0.5">
              Propedéutico TEXO  {/* {course.courseNumber} */}
            </p>
          )}
          <h1 className="text-base font-bold text-gray-900 dark:text-white">
            {course.title.replace(/^Propedéutico TEXO \s*\d+\s*[—–-]\s*/i, "")}
          </h1>

          {/* Barra de progreso general del curso */}
          <div className="mt-2 flex items-center gap-3">
            <span className="text-xs text-gray-500 whitespace-nowrap shrink-0">Tu progreso:</span>
            <div className="flex-1 h-2.5 bg-gray-300 dark:bg-gray-600 rounded-full overflow-hidden">
              <div
                className="h-full bg-texo-verde rounded-full transition-all duration-500"
                style={{ width: `${coursePct}%` }}
              />
            </div>
            <span className="text-sm font-bold text-texo-verde whitespace-nowrap shrink-0">
              {coursePct}%
            </span>
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden max-w-6xl w-full mx-auto">

        {/* Mobile FAB */}
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="md:hidden fixed bottom-4 right-4 z-50 bg-texo-azul text-white px-4 py-2 rounded-full shadow-lg text-sm font-medium"
        >
          {sidebarOpen ? "✕ Cerrar" : "☰ Cápsulas"}
        </button>

        {/* ── Sidebar mejorado ──────────────────────────────────────────── */}
        <aside
          className={`${
            sidebarOpen ? "flex" : "hidden"
          } md:flex flex-col w-full md:w-72 border-r border-gray-200 dark:border-gray-700 overflow-y-auto shrink-0 fixed md:static inset-0 md:inset-auto bg-[#f8f9fa] dark:bg-texo-dark z-40`}
        >
          <p className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400" style={{ fontSize: "13px", fontWeight: 500 }}>
            Cápsulas
          </p>
          <nav className="flex flex-col gap-1 p-2 pb-4">
            {chaptersData.map(({ chapter, resources }, idx) => {
              const unlocked = isChapterUnlocked(idx);
              const completed = isChapterCompleted(idx);
              const active = activeChapterIdx === idx;

              // Íconos únicos de tipos de recursos del capítulo
              const uniqueTypes = Array.from(new Set(resources.map((r) => r.type))) as ResourceType[];
              const estimatedMin = resources.length * 5;

              // Número del capítulo en círculo
              const numLabel = String(idx + 1).padStart(2, "0");
              const circleClass = completed
                ? "bg-texo-verde text-white"
                : active
                ? "bg-texo-amarillo text-texo-azul"
                : unlocked
                ? "bg-texo-azul/20 text-texo-azul dark:bg-white/10 dark:text-white"
                : "bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500";

              return (
                <button
                  key={chapter.id}
                  onClick={() => selectChapter(idx)}
                  disabled={!unlocked}
                  className={`w-full text-left px-3 py-3 rounded-xl border-l-[3px] transition-all ${
                    active
                      ? "border-texo-amarillo bg-texo-amarillo/10 dark:bg-texo-amarillo/5"
                      : "border-transparent hover:bg-gray-200/60 dark:hover:bg-white/5"
                  } ${!unlocked ? "cursor-not-allowed opacity-50" : ""}`}
                >
                  <div className="flex items-start gap-3">
                    {/* Círculo con número */}
                    <span
                      className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold mt-0.5 ${circleClass}`}
                    >
                      {completed ? "✓" : numLabel}
                    </span>

                    <div className="flex-1 min-w-0">
                      {/* Título */}
                      <p className={`text-sm truncate ${active ? "font-bold text-gray-900 dark:text-white" : "font-medium text-gray-700 dark:text-gray-300"}`}>
                        {chapter.title}
                      </p>

                      {/* Íconos de tipos + tiempo */}
                      <div className="flex items-center gap-1.5 mt-1">
                        {uniqueTypes.map((t) => (
                          <span key={t} title={TYPE_LABELS[t]} className="text-xs">
                            {TYPE_ICONS[t]}
                          </span>
                        ))}
                        {resources.length > 0 && (
                          <span className="text-xs text-gray-400 ml-1">
                            {estimatedMin} min
                          </span>
                        )}
                      </div>

                      {/* Estado */}
                      <p className={`text-xs mt-0.5 ${
                        completed
                          ? "text-texo-verde"
                          : !unlocked
                          ? "text-gray-400"
                          : "text-gray-400"
                      }`}>
                        {completed
                          ? "Completado ✓"
                          : !unlocked
                          ? "Bloqueado 🔒"
                          : active
                          ? `${resources.length} recurso${resources.length !== 1 ? "s" : ""}`
                          : "Disponible"}
                      </p>
                    </div>
                  </div>
                </button>
              );
            })}
          </nav>
        </aside>

        {/* ── Contenido principal ──────────────────────────────────────── */}
        <main className="flex-1 p-6 overflow-y-auto">
          {!activeChapterData ? (
            <p className="text-gray-500">Seleccioná una cápsula para comenzar.</p>
          ) : activeResource ? (
            <div>
              <button
                onClick={() => setActiveResourceId(null)}
                className="text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 mb-4 block transition-colors"
              >
                ← Volver a los recursos
              </button>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                {activeResource.title}
              </h2>
              <ResourceViewer
                resource={activeResource}
                isCompleted={progress[activeResource.id] === true}
                onComplete={(score, answers) => handleCompleteResource(activeResource.id, score, answers)}
                nextAction={getNextAction()}
                userId={firebaseUser?.uid}
                courseId={courseId}
              />
            </div>
          ) : (
            <div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-1">
                {activeChapterData.chapter.title}
              </h2>
              {activeChapterData.chapter.description && (
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                  {activeChapterData.chapter.description}
                </p>
              )}
              {activeChapterData.resources.length === 0 ? (
                <p className="text-gray-400 text-sm mt-4">
                  Esta cápsula no tiene recursos todavía.
                </p>
              ) : (
                <ul className="flex flex-col gap-2 mt-4">
                  {activeChapterData.resources.map((resource, resourceIdx) => {
                    const unlocked = isResourceUnlocked(activeChapterIdx, resourceIdx);
                    const completed = progress[resource.id] === true;
                    // Próximo recurso: primer recurso no completado y desbloqueado
                    const isNext = !completed && unlocked && activeChapterData.resources
                      .slice(0, resourceIdx)
                      .every((r) => progress[r.id] === true);

                    return (
                      <li key={resource.id}>
                        <button
                          onClick={() =>
                            selectResource(resource.id, activeChapterIdx, resourceIdx)
                          }
                          disabled={!unlocked}
                          className="w-full text-left px-4 py-3 rounded-xl border flex items-center gap-3 transition-colors"
                          style={{
                            background: completed
                              ? "color-mix(in srgb, #3A9688 8%, transparent)"
                              : isNext
                              ? "color-mix(in srgb, #E8B84B 8%, transparent)"
                              : !unlocked
                              ? "rgba(0,0,0,0.03)"
                              : undefined,
                            borderLeft: completed
                              ? "3px solid #3A9688"
                              : isNext
                              ? "3px solid #E8B84B"
                              : undefined,
                            borderColor: completed
                              ? undefined
                              : isNext
                              ? undefined
                              : !unlocked
                              ? "rgb(229 231 235)"
                              : undefined,
                            cursor: !unlocked ? "not-allowed" : undefined,
                          }}
                        >
                          <span className="shrink-0" style={{ fontSize: !unlocked ? "20px" : "18px" }}>
                            {completed ? (
                              <span className="w-6 h-6 rounded-full bg-texo-verde/15 text-texo-verde flex items-center justify-center text-sm font-bold">✓</span>
                            ) : !unlocked ? (
                              "🔒"
                            ) : (
                              TYPE_ICONS[resource.type]
                            )}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm truncate" style={{ opacity: !unlocked ? 0.4 : 1, color: !unlocked ? undefined : undefined }} >
                              <span className={!unlocked ? "text-gray-500 dark:text-gray-400" : "text-gray-900 dark:text-white"}>
                                {resource.title}
                              </span>
                            </p>
                            <p className="text-xs text-gray-400">
                              {TYPE_LABELS[resource.type]}
                            </p>
                          </div>
                          {completed && (
                            <span className="text-xs text-texo-verde shrink-0 font-medium">
                              Completado
                            </span>
                          )}
                          {isNext && (
                            <span className="text-xs bg-texo-amarillo text-texo-azul font-semibold px-2 py-0.5 rounded-full shrink-0">
                              Continuar aquí
                            </span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
