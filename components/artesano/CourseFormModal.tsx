"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { createCourse, updateCourse } from "@/lib/firestore";
import { useAuth } from "@/lib/auth-context";

interface Props {
  onCreated: () => void;
  onClose: () => void;
  /** If provided, switches to edit mode */
  editCourseId?: string;
  initialTitle?: string;
  initialDescription?: string;
  initialWelcomeMessage?: string;
}

export default function CourseFormModal({ onCreated, onClose, editCourseId, initialTitle = "", initialDescription = "", initialWelcomeMessage = "" }: Props) {
  const { firebaseUser } = useAuth();
  const isEdit = !!editCourseId;
  const [title, setTitle] = useState(isEdit ? initialTitle : "");
  const [description, setDescription] = useState(isEdit ? initialDescription : "");
  const [welcomeMessage, setWelcomeMessage] = useState(isEdit ? initialWelcomeMessage : "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!firebaseUser) return;
    setLoading(true);
    setError(null);
    try {
      if (isEdit) {
        await updateCourse(editCourseId, { title, description, welcomeMessage: welcomeMessage || undefined });
        toast.success("Propedéutico actualizado");
      } else {
        await createCourse({ title, description, welcomeMessage: welcomeMessage || undefined }, firebaseUser.uid);
        toast.success("Propedéutico creado correctamente");
      }
      onCreated();
    } catch (err) {
      console.error(err);
      setError(isEdit ? "Error al actualizar. Intentá de nuevo." : "Error al crear el curso. Intentá de nuevo.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{isEdit ? "Editar propedéutico" : "Nuevo propedéutico"}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xl leading-none">✕</button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Título</label>
            <input
              type="text"
              placeholder="Ej: Fundamentos de Diseño Gráfico"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2.5 text-sm bg-white dark:bg-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-texo-amarillo focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Descripción</label>
            <textarea
              placeholder="Breve descripción del curso..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
              rows={3}
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2.5 text-sm bg-white dark:bg-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-texo-amarillo focus:border-transparent resize-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Mensaje de bienvenida <span className="font-normal text-gray-400">(opcional)</span>
            </label>
            <textarea
              placeholder="Este mensaje se mostrará al participante antes de comenzar el propedéutico..."
              value={welcomeMessage}
              onChange={(e) => setWelcomeMessage(e.target.value)}
              rows={5}
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2.5 text-sm bg-white dark:bg-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-texo-amarillo focus:border-transparent resize-none"
            />
            <p className="mt-1 text-xs text-gray-400">Se muestra en la pantalla de inicio del propedéutico, antes de acceder a las cápsulas.</p>
          </div>
          {error && (
            <p className="text-sm text-texo-rojo bg-texo-rojo/10 px-3 py-2 rounded-lg">{error}</p>
          )}
          <div className="flex gap-2 justify-end pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-gray-600 dark:text-gray-300"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 text-sm bg-texo-amarillo text-texo-azul font-semibold rounded-lg hover:bg-texo-amarillo/90 disabled:opacity-50 transition-colors"
            >
              {loading ? (isEdit ? "Guardando..." : "Creando...") : (isEdit ? "Guardar cambios" : "Crear propedéutico")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
