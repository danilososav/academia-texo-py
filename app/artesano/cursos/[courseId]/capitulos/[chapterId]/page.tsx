"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import toast from "react-hot-toast";
import { confirmToast } from "@/components/shared/ConfirmToast";
import {
  getResourcesByChapter,
  createResource,
  updateResource,
  deleteResource,
  reorderResources,
  getChapter,
  getCourse,
} from "@/lib/firestore";
import type { Resource, ResourceType, ResourceContent, QuizContent } from "@/types";
import ResourceForm from "@/components/artesano/ResourceForm";
import Button from "@/components/shared/Button";

const RESOURCE_TYPE_LABELS: Record<ResourceType, string> = {
  video: "Video",
  presentation: "Presentación",
  document: "Documento",
  pdf: "PDF",
  quiz: "Cuestionario",
  text: "Texto",
  file: "Archivo",
};

const RESOURCE_TYPE_ICONS: Record<ResourceType, string> = {
  video: "🎬",
  presentation: "📊",
  document: "📄",
  pdf: "📋",
  quiz: "❓",
  text: "📝",
  file: "📄",
};

const RESOURCE_TYPE_BADGE: Record<ResourceType, { bg: string; color: string }> = {
  video:        { bg: "#1e3a5f", color: "#60a5fa" },
  presentation: { bg: "#2d1b69", color: "#a78bfa" },
  document:     { bg: "#1f2937", color: "#9ca3af" },
  pdf:          { bg: "#450a0a", color: "#fca5a5" },
  quiz:         { bg: "#451a03", color: "#fcd34d" },
  text:         { bg: "#1f2937", color: "#9ca3af" },
  file:         { bg: "#1f2937", color: "#9ca3af" },
};

export default function ChapterResourcesPage() {
  const { courseId, chapterId } = useParams<{ courseId: string; chapterId: string }>();

  const [chapterTitle, setChapterTitle] = useState<string>("");
  const [courseTitle, setCourseTitle] = useState<string>("General");
  const [resources, setResources] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingResource, setEditingResource] = useState<Resource | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [course, chapter, resourcesData] = await Promise.all([
        getCourse(courseId),
        getChapter(courseId, chapterId),
        getResourcesByChapter(courseId, chapterId),
      ]);
      if (course) setCourseTitle(course.title);
      if (chapter) setChapterTitle(chapter.title);
      setResources(resourcesData);
    } finally {
      setLoading(false);
    }
  }, [courseId, chapterId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function handleCreateResource(title: string, type: ResourceType, content: ResourceContent) {
    try {
      await createResource(courseId, chapterId, { title, type, content });
      toast.success("Recurso agregado");
    } catch {
      toast.error("Ocurrió un error. Intentá de nuevo.");
    }
    setShowCreateForm(false);
    loadData();
  }

  async function handleEditResource(title: string, type: ResourceType, content: ResourceContent) {
    if (!editingResource) return;
    try {
      await updateResource(courseId, chapterId, editingResource.id, { title, type, content });
      toast.success("Recurso actualizado");
    } catch {
      toast.error("Ocurrió un error. Intentá de nuevo.");
    }
    setEditingResource(null);
    loadData();
  }

  function handleDeleteResource(resourceId: string) {
    confirmToast(
      "⚠️ ¿Eliminar este recurso?",
      () => doDeleteResource(resourceId)
    );
  }

  async function doDeleteResource(resourceId: string) {
    setDeletingId(resourceId);
    try {
      await deleteResource(courseId, chapterId, resourceId);
      toast.success("Recurso eliminado");
      loadData();
    } catch {
      toast.error("Ocurrió un error. Intentá de nuevo.");
    } finally {
      setDeletingId(null);
    }
  }

  async function handleMove(index: number, direction: "up" | "down") {
    const newResources = [...resources];
    const swapIndex = direction === "up" ? index - 1 : index + 1;
    [newResources[index], newResources[swapIndex]] = [newResources[swapIndex], newResources[index]];
    setResources(newResources);
    await reorderResources(courseId, chapterId, newResources.map((r) => r.id));
    toast.success("Orden guardado");
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <Link
        href={`/artesano/cursos/${courseId}`}
        className="text-sm text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
      >
        ← Volver al curso
      </Link>

      <div className="mt-4 mb-6 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl p-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white pb-2 border-b-[3px] border-texo-amarillo inline-block">
            {chapterTitle || "Cápsula"}
          </h1>
          <p className="text-sm text-gray-400 mt-2">Recursos de la cápsula</p>
        </div>
        <Button onClick={() => setShowCreateForm(true)} variant="primary">
          + Agregar recurso
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-32">
          <div className="w-8 h-8 border-2 border-texo-verde/30 border-t-texo-verde rounded-full animate-spin" />
        </div>
      ) : resources.length === 0 ? (
        <div className="text-center py-12 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl">
          <p className="text-gray-400 text-sm">
            No hay recursos todavía. ¡Agregá el primero!
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {resources.map((resource, index) => (
            <li
              key={resource.id}
              className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-3 flex items-center gap-3 hover:shadow-sm transition-shadow"
            >
              {/* Botones de reorden */}
              <div className="flex flex-col gap-0.5">
                <button
                  onClick={() => handleMove(index, "up")}
                  disabled={index === 0}
                  className="text-xs px-1 disabled:opacity-30 hover:text-texo-amarillo transition-colors"
                  title="Subir"
                >▲</button>
                <button
                  onClick={() => handleMove(index, "down")}
                  disabled={index === resources.length - 1}
                  className="text-xs px-1 disabled:opacity-30 hover:text-texo-amarillo transition-colors"
                  title="Bajar"
                >▼</button>
              </div>

              <span className="text-sm text-gray-400 w-6 shrink-0 text-center font-mono">
                {index + 1}
              </span>

              <span className="text-base shrink-0" aria-hidden="true">
                {RESOURCE_TYPE_ICONS[resource.type]}
              </span>

              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-900 dark:text-white truncate">
                  {resource.title}
                </p>
                <span
                  className="text-xs px-2 py-0.5 rounded-full font-medium"
                  style={{
                    backgroundColor: RESOURCE_TYPE_BADGE[resource.type].bg,
                    color: RESOURCE_TYPE_BADGE[resource.type].color,
                  }}
                >
                  {RESOURCE_TYPE_LABELS[resource.type]}
                  {resource.type === "quiz"
                    ? (() => { const n = (resource.content as QuizContent).questions.length; return ` · ${n} ${n === 1 ? "pregunta" : "preguntas"}`; })()
                    : ""}
                </span>
              </div>

              {/* Acciones */}
              <div className="flex gap-2 shrink-0">
                <button
                  onClick={() => setEditingResource(resource)}
                  className="text-sm px-3 py-1.5 border border-gray-200 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-gray-600 dark:text-gray-300"
                  title="Editar"
                >
                  ✏️ Editar
                </button>
                <button
                  onClick={() => handleDeleteResource(resource.id)}
                  disabled={deletingId === resource.id}
                  className="text-sm px-3 py-1.5 border border-texo-rojo/30 rounded-lg hover:bg-texo-rojo/10 transition-colors text-texo-rojo disabled:opacity-50"
                  title="Eliminar"
                >
                  {deletingId === resource.id ? "..." : "🗑️ Eliminar"}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {showCreateForm && (
        <ResourceForm
          onSubmit={handleCreateResource}
          onCancel={() => setShowCreateForm(false)}
          courseTitle={courseTitle}
          courseId={courseId}
        />
      )}

      {editingResource && (
        <ResourceForm
          initialResource={editingResource}
          onSubmit={handleEditResource}
          onCancel={() => setEditingResource(null)}
          courseTitle={courseTitle}
          courseId={courseId}
        />
      )}
    </div>
  );
}
