"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type {
  Resource,
  VideoContent,
  PresentationContent,
  DocumentContent,
  PdfContent,
  TextContent,
  QuizContent,
  FileContent,
  QuizAnswer,
} from "@/types";
import { toDriveEmbedUrl, extractDriveFileId } from "@/lib/drive";
import QuizViewer from "./QuizViewer";
import { updateResourceEngagement } from "@/lib/firestore";

// ── Interfaces ────────────────────────────────────────────────────────────────

interface NextAction {
  label: string;
  onClick: () => void;
}

interface Props {
  resource: Resource;
  isCompleted: boolean;
  onComplete: (score?: number, answers?: QuizAnswer[]) => Promise<void>;
  nextAction?: NextAction | null;
  userId?: string;
  courseId?: string;
}

interface EngagementProps {
  userId?: string;
  courseId?: string;
  resourceId: string;
  onComplete: (score?: number, answers?: QuizAnswer[]) => Promise<void>;
  nextAction?: NextAction | null;
}

// ── Estilos compartidos ───────────────────────────────────────────────────────

const btnBase =
  "px-4 py-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-40";
const btnActive = "bg-texo-amarillo text-texo-azul hover:bg-texo-amarillo/90";
const btnGray   = "bg-gray-100 dark:bg-gray-800 text-gray-400";

// ── CircleTimer — contador regresivo animado ──────────────────────────────────

function CircleTimer({ seconds, elapsed }: { seconds: number; elapsed: number }) {
  const remaining = Math.max(0, seconds - elapsed);
  if (remaining === 0) return null;

  const r = 16;
  const size = 44;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * r;
  const progress = Math.min(1, elapsed / seconds);
  const dashOffset = circumference * (1 - progress);

  return (
    <div
      className="relative inline-flex items-center justify-center shrink-0"
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        className="absolute"
        style={{ transform: "rotate(-90deg)" }}
      >
        <circle
          cx={cx} cy={cy} r={r}
          fill="none"
          stroke="#e5e7eb"
          strokeWidth="3"
        />
        <circle
          cx={cx} cy={cy} r={r}
          fill="none"
          stroke="#E8B84B"
          strokeWidth="3"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 0.9s linear" }}
        />
      </svg>
      <span
        className="relative font-bold"
        style={{ color: "#E8B84B", fontSize: "10px", lineHeight: 1 }}
      >
        {remaining}s
      </span>
    </div>
  );
}

// ── EngagementBar — barra de consumo del recurso ──────────────────────────────

function EngagementBar({
  pct,
  message,
  ready,
}: {
  pct: number;
  message: string;
  ready: boolean;
}) {
  return (
    <div className="mt-3">
      <div className="flex justify-between text-xs mb-1">
        <span className={ready ? "text-texo-verde font-medium" : "text-gray-500 dark:text-gray-400"}>
          {message}
        </span>
        <span className={ready ? "text-texo-verde font-semibold" : "text-gray-400"}>
          {pct}%
        </span>
      </div>
      <div className="w-full h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, backgroundColor: ready ? "#3A9688" : "#E8B84B" }}
        />
      </div>
    </div>
  );
}

// ── ActionButton — botón "Podés avanzar" con gate ─────────────────────────────

function ActionButton({
  ready,
  completing,
  onComplete,
}: {
  ready: boolean;
  completing: boolean;
  onComplete: () => void;
}) {
  return (
    <button
      onClick={onComplete}
      disabled={!ready || completing}
      title={!ready ? "Completá los requisitos para continuar" : undefined}
      className="mt-4 bg-texo-verde text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-texo-verde/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
    >
      {completing ? "Guardando..." : "Podés avanzar"}
    </button>
  );
}

// ── LegacyActionArea — para tipos legados sin tracking ───────────────────────

function LegacyActionArea({
  onComplete,
}: {
  onComplete: (score?: number) => Promise<void>;
}) {
  const [completing, setCompleting] = useState(false);
  async function handle() {
    setCompleting(true);
    await onComplete();
    setCompleting(false);
  }
  return (
    <button
      onClick={handle}
      disabled={completing}
      className="mt-4 bg-texo-verde text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-texo-verde/90 disabled:opacity-50 transition-colors"
    >
      {completing ? "Guardando..." : "Podés avanzar"}
    </button>
  );
}

// ── ResourceViewer — dispatcher ───────────────────────────────────────────────

export default function ResourceViewer({
  resource,
  isCompleted,
  onComplete,
  nextAction,
  userId,
  courseId,
}: Props) {
  // Tipos no-quiz ya completados → mostrar bloque directamente
  if (isCompleted && resource.type !== "quiz") {
    return <CompletedBlock nextAction={nextAction} />;
  }

  const ep: EngagementProps = {
    userId,
    courseId,
    resourceId: resource.id,
    onComplete,
    nextAction,
  };

  switch (resource.type) {
    case "video":
      return <VideoResource content={resource.content as VideoContent} {...ep} />;

    case "presentation":
      return <PresentationResource content={resource.content as PresentationContent} {...ep} />;

    case "document":
      return <DocumentResource content={resource.content as DocumentContent} {...ep} />;

    case "pdf":
      return <PdfResource content={resource.content as PdfContent} {...ep} />;

    case "quiz":
      return (
        <div>
          {isCompleted ? (
            <CompletedBlock nextAction={nextAction} />
          ) : (
            <QuizViewer
              content={resource.content as QuizContent}
              onComplete={(score, answers) => onComplete(score, answers)}
            />
          )}
        </div>
      );

    case "text": {
      const { body } = resource.content as TextContent;
      return (
        <div>
          <div className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap leading-relaxed text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-6">
            {body}
          </div>
          <LegacyActionArea onComplete={onComplete} />
        </div>
      );
    }

    case "file": {
      const { cloudinaryUrl, fileName } = resource.content as FileContent;
      return (
        <div className="flex flex-col gap-4">
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-5 flex items-center gap-4">
            <span className="text-3xl">📎</span>
            <div>
              <p className="font-medium text-gray-900 dark:text-white text-sm">{fileName}</p>
              <a
                href={cloudinaryUrl}
                target="_blank"
                rel="noopener noreferrer"
                download
                className="text-sm text-texo-amarillo hover:underline mt-0.5 inline-block"
              >
                ↓ Descargar archivo
              </a>
            </div>
          </div>
          <LegacyActionArea onComplete={onComplete} />
        </div>
      );
    }
  }
}

// ── VideoResource ─────────────────────────────────────────────────────────────

function VideoResource({
  content,
  userId,
  courseId,
  resourceId,
  onComplete,
}: EngagementProps & { content: VideoContent }) {
  const { driveUrl } = content;
  const fileId = extractDriveFileId(driveUrl);

  const videoRef        = useRef<HTMLVideoElement>(null);
  const watchedSetRef   = useRef(new Set<number>());
  const lastSavedRef    = useRef(0);
  const seekingRef      = useRef(false);
  const lastTimeRef     = useRef(0);

  const streamSrc = fileId ? `/api/drive/stream?fileId=${fileId}` : null;

  const [watchedPct,  setWatchedPct]  = useState(0);
  const [useFallback, setUseFallback] = useState(!streamSrc);
  const [buffering,   setBuffering]   = useState(false);
  const [completing,  setCompleting]  = useState(false);

  const REQUIRED = 100;
  const ready = useFallback || watchedPct >= REQUIRED;

  const saveWatched = useCallback(() => {
    if (!userId || !courseId) return;
    updateResourceEngagement(userId, courseId, resourceId, {
      videoWatchedSeconds: watchedSetRef.current.size,
      timeSpent: watchedSetRef.current.size,
    }).catch(() => {});
  }, [userId, courseId, resourceId]);

  function handleSeeking() {
    // Guardar posición antes del salto y marcar seeking
    seekingRef.current = true;
  }

  function handleSeeked() {
    seekingRef.current = false;
    const video = videoRef.current;
    if (video) lastTimeRef.current = video.currentTime;
  }

  function handleTimeUpdate() {
    const video = videoRef.current;
    if (!video || !video.duration) return;

    const currentSecond = Math.floor(video.currentTime);

    // Solo contar segundos consecutivos al máximo ya visto.
    // Si el usuario salta del segundo 5 al 60, currentSecond (60) > maxWatched (5) + 1
    // y no se agrega — independientemente de seekingRef o diff.
    const maxWatched = watchedSetRef.current.size > 0
      ? Array.from(watchedSetRef.current).reduce((a, b) => Math.max(a, b), -1)
      : -1;

    if (currentSecond <= maxWatched + 1) {
      watchedSetRef.current.add(currentSecond);
    }

    lastTimeRef.current = video.currentTime;

    const pct = Math.min(100, Math.round((watchedSetRef.current.size / Math.floor(video.duration)) * 100));
    setWatchedPct(pct);

    const now = Date.now();
    if (now - lastSavedRef.current >= 10_000) {
      lastSavedRef.current = now;
      saveWatched();
    }
  }

  async function handleComplete() {
    setCompleting(true);
    if (userId && courseId) {
      await updateResourceEngagement(userId, courseId, resourceId, {
        videoWatchedSeconds: watchedSetRef.current.size,
        readingComplete: true,
      }).catch(() => {});
    }
    await onComplete();
    setCompleting(false);
  }

  // Iframe fallback (Drive embed — sin tracking)
  if (useFallback) {
    return (
      <div>
        <iframe
          src={toDriveEmbedUrl(driveUrl ?? "")}
          width="100%"
          style={{ height: "500px", border: "none", borderRadius: "8px" }}
          allow="autoplay"
        />
        <ActionButton ready completing={completing} onComplete={handleComplete} />
      </div>
    );
  }

  const progressMsg = watchedPct >= REQUIRED
    ? "Video completado ✓"
    : `Visto: ${watchedPct}% — debés ver el video completo`;

  return (
    <div>
      <div className="relative rounded-xl overflow-hidden bg-black">
        <video
          ref={videoRef}
          src={streamSrc!}
          controls
          preload="metadata"
          style={{ width: "100%", maxHeight: "500px", display: "block" }}
          onTimeUpdate={handleTimeUpdate}
          onSeeking={handleSeeking}
          onSeeked={handleSeeked}
          onWaiting={() => setBuffering(true)}
          onCanPlay={() => setBuffering(false)}
          onPlaying={() => setBuffering(false)}
          onError={() => setUseFallback(true)}
        />
        {buffering && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40 pointer-events-none">
            <div className="w-10 h-10 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          </div>
        )}
      </div>
      <EngagementBar pct={watchedPct} message={progressMsg} ready={ready} />
      <ActionButton ready={ready} completing={completing} onComplete={handleComplete} />
    </div>
  );
}

// ── ManualPageNav — navegación manual para iframes (PDF fallback / doc iframe) ─

interface PageStatus {
  current: number;
  total: number;
  allReady: boolean;
}

interface ManualPageNavProps {
  totalPages: number;
  minTimePerPage: number;
  onReadyChange: (ready: boolean) => void;
  iframeContent: React.ReactNode;
  renderBottom: (status: PageStatus) => React.ReactNode;
}

function ManualPageNav({
  totalPages,
  minTimePerPage,
  onReadyChange,
  iframeContent,
  renderBottom,
}: ManualPageNavProps) {
  const [current,    setCurrent]    = useState(1);
  const timedRef     = useRef(new Set<number>());
  const viewedRef    = useRef(new Set<number>());
  const [timedCount, setTimedCount] = useState(0);
  const [viewedCount, setViewedCount] = useState(0);
  const [pageTimer,  setPageTimer]  = useState(0);

  // Marcar página como vista y resetear timer
  useEffect(() => {
    if (!viewedRef.current.has(current)) {
      viewedRef.current.add(current);
      setViewedCount(viewedRef.current.size);
    }
    setPageTimer(0);
  }, [current]);

  // Timer por página
  useEffect(() => {
    if (timedRef.current.has(current)) return;
    let elapsed = 0;
    const interval = setInterval(() => {
      elapsed += 1;
      setPageTimer(elapsed);
      if (elapsed >= minTimePerPage && !timedRef.current.has(current)) {
        timedRef.current.add(current);
        setTimedCount(timedRef.current.size);
        clearInterval(interval);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [current, minTimePerPage]);

  const isCurrentTimed = timedRef.current.has(current) || pageTimer >= minTimePerPage;
  const allReady = timedCount >= totalPages && viewedCount >= totalPages;

  useEffect(() => { onReadyChange(allReady); }, [allReady, onReadyChange]);

  const canPrev = current > 1;
  const canNext = current < totalPages && isCurrentTimed;

  return (
    <div>
      {iframeContent}
      <div className="flex items-center justify-between mt-3">
        <button
          onClick={() => setCurrent((p) => Math.max(1, p - 1))}
          disabled={!canPrev}
          className={`${btnBase} ${canPrev ? btnActive : btnGray}`}
        >
          ← Anterior
        </button>
        <div className="flex flex-col items-center gap-1">
          <span className="text-sm text-gray-500 dark:text-gray-400 text-center">
            Página{" "}
            <span className="font-semibold text-gray-900 dark:text-white">{current}</span>
            {" "}de {totalPages}
          </span>
          {!isCurrentTimed && (
            <CircleTimer seconds={minTimePerPage} elapsed={pageTimer} />
          )}
        </div>
        <button
          onClick={() => setCurrent((p) => Math.min(totalPages, p + 1))}
          disabled={!canNext}
          className={`${btnBase} ${canNext ? btnActive : btnGray}`}
        >
          Siguiente →
        </button>
      </div>
      {renderBottom({ current, total: totalPages, allReady })}
    </div>
  );
}

// ── TrackedPageViewer ─────────────────────────────────────────────────────────
// Visor de páginas (PDF/PPT) — convierte a imágenes via API, con fallback iframe.

interface TrackedPageViewerProps {
  driveUrl?: string;           // para fetch interno (presentaciones PPT)
  preloadedPages?: string[];   // páginas ya cargadas externamente (PDFs via PdfResource)
  loadingLabel?: string;
  minTimePerPage: number;
  totalPages?: number;         // para fallback de navegación manual si la API falla
  onReadyChange: (ready: boolean) => void;
  onSave?: (pagesViewed: number[]) => void;
  renderBottom: (status: PageStatus) => React.ReactNode;
}

function TrackedPageViewer({
  driveUrl,
  preloadedPages,
  loadingLabel = "Cargando...",
  minTimePerPage,
  totalPages,
  onReadyChange,
  onSave,
  renderBottom,
}: TrackedPageViewerProps) {
  const [current,  setCurrent]  = useState(1);
  const [pages,    setPages]    = useState<string[] | null>(preloadedPages ?? null);
  const [loading,  setLoading]  = useState(!preloadedPages);
  const [failed,   setFailed]   = useState(false);

  const timedPagesRef  = useRef(new Set<number>());
  const viewedPagesRef = useRef(new Set<number>());
  const [timedCount,   setTimedCount]  = useState(0);
  const [viewedCount,  setViewedCount] = useState(0);
  const [pageTimer,    setPageTimer]   = useState(0);

  const fileId = driveUrl ? extractDriveFileId(driveUrl) : null;

  // Cargar páginas desde API (solo si no hay preloadedPages)
  useEffect(() => {
    if (preloadedPages) return;
    if (!fileId) { setFailed(true); setLoading(false); return; }
    setLoading(true);
    setFailed(false);
    fetch(`/api/drive/slides?fileId=${fileId}`)
      .then((r) => r.json())
      .then((data: { slides?: string[] }) => {
        if (data.slides?.length) setPages(data.slides);
        else setFailed(true);
      })
      .catch(() => setFailed(true))
      .finally(() => setLoading(false));
  }, [fileId, preloadedPages]);

  // Al cambiar de página: agregar a vistas, resetear timer
  useEffect(() => {
    if (!viewedPagesRef.current.has(current)) {
      viewedPagesRef.current.add(current);
      setViewedCount(viewedPagesRef.current.size);
      onSave?.(Array.from(viewedPagesRef.current));
    }
    setPageTimer(0);
  }, [current, onSave]);

  // Timer por página — detiene cuando se cumple minTimePerPage
  useEffect(() => {
    if (timedPagesRef.current.has(current)) return;
    let elapsed = 0;
    const interval = setInterval(() => {
      elapsed += 1;
      setPageTimer(elapsed);
      if (elapsed >= minTimePerPage && !timedPagesRef.current.has(current)) {
        timedPagesRef.current.add(current);
        setTimedCount(timedPagesRef.current.size);
        clearInterval(interval);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [current, minTimePerPage]);

  const total              = pages?.length ?? 0;
  const isCurrentPageTimed = timedPagesRef.current.has(current) || pageTimer >= minTimePerPage;
  const allReady           = total > 0 && timedCount >= total && viewedCount >= total;

  useEffect(() => { onReadyChange(allReady); }, [allReady, onReadyChange]);

  const canPrev = current > 1;
  const canNext = current < total && isCurrentPageTimed;

  const status: PageStatus = { current, total, allReady };

  if (loading) {
    return (
      <div>
        <div
          className="w-full flex flex-col items-center justify-center gap-3 rounded-xl bg-gray-100 dark:bg-gray-800"
          style={{ height: "clamp(350px, 55vw, 560px)" }}
        >
          <div className="w-10 h-10 border-2 border-texo-amarillo/30 border-t-texo-amarillo rounded-full animate-spin" />
          <p className="text-sm text-gray-500 dark:text-gray-400">{loadingLabel}</p>
        </div>
        {renderBottom({ current: 0, total: 0, allReady: false })}
      </div>
    );
  }

  if (pages?.length) {
    return (
      <div style={{ userSelect: "none" }}>
        <div
          className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900"
          style={{ height: "auto", overflow: "visible" }}
        >
          {pages[current - 1].startsWith("data:") ? (
            // Base64 PNG (conversiones futuras con sharp u otro método)
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={pages[current - 1]}
              alt={`Página ${current}`}
              style={{ width: "100%", height: "auto", display: "block", borderRadius: "8px" }}
              draggable={false}
            />
          ) : (
            // URL de Drive preview — renderizar como iframe
            <iframe
              key={current}
              src={pages[current - 1]}
              className="w-full h-full border-none rounded-xl"
              scrolling="no"
              allowFullScreen
              title={`Página ${current}`}
            />
          )}
        </div>
        <div className="flex items-center justify-between mt-3">
          <button
            onClick={() => setCurrent((p) => Math.max(1, p - 1))}
            disabled={!canPrev}
            className={`${btnBase} ${canPrev ? btnActive : btnGray}`}
          >
            ← Anterior
          </button>
          <div className="flex flex-col items-center gap-1">
            <span className="text-sm text-gray-500 dark:text-gray-400 text-center">
              Página{" "}
              <span className="font-semibold text-gray-900 dark:text-white">{current}</span>
              {" "}de {total}
            </span>
            {!isCurrentPageTimed && (
              <CircleTimer seconds={minTimePerPage} elapsed={pageTimer} />
            )}
          </div>
          <button
            onClick={() => setCurrent((p) => Math.min(total, p + 1))}
            disabled={!canNext}
            className={`${btnBase} ${canNext ? btnActive : btnGray}`}
          >
            Siguiente →
          </button>
        </div>
        {renderBottom(status)}
      </div>
    );
  }

  // Fallback iframe — con navegación manual si el Artesano definió totalPages
  const fallbackIframe = (
    <div style={{ height: "600px", overflow: "hidden", userSelect: "none" }} className="rounded-xl">
      <iframe
        src={toDriveEmbedUrl(driveUrl ?? "")}
        className="w-full h-full rounded-xl border-none"
        scrolling="no"
        allowFullScreen
      />
    </div>
  );

  if (totalPages && totalPages > 0) {
    return (
      <ManualPageNav
        totalPages={totalPages}
        minTimePerPage={minTimePerPage}
        onReadyChange={onReadyChange}
        iframeContent={fallbackIframe}
        renderBottom={renderBottom}
      />
    );
  }

  return (
    <div>
      {fallbackIframe}
      {renderBottom({ current: 0, total: 0, allReady: true })}
    </div>
  );
}

// ── PdfResource ───────────────────────────────────────────────────────────────

const MIN_PDF_TIME = 0; // sin timer — navegación libre

function PdfResource({
  content,
  userId,
  courseId,
  resourceId,
  onComplete,
}: EngagementProps & { content: PdfContent }) {
  const { driveUrl } = content;
  const fileId = extractDriveFileId(driveUrl);

  const [slides,      setSlides]      = useState<string[] | null>(null);
  const [loadingMsg,  setLoadingMsg]  = useState("Descargando PDF...");
  const [loadingSlides, setLoadingSlides] = useState(true);
  const [slidesError, setSlidesError] = useState<string | null>(null);
  const [ready,       setReady]       = useState(false);
  const [completing,  setCompleting]  = useState(false);

  useEffect(() => {
    if (!fileId) {
      setSlidesError("No se pudo extraer el ID del archivo de Drive.");
      setLoadingSlides(false);
      return;
    }
    let cancelled = false;

    async function convertPdf() {
      try {
        setLoadingMsg("Descargando PDF...");
        const res = await fetch(`/api/drive/stream?fileId=${fileId}`);
        if (!res.ok) throw new Error(`Error al descargar PDF (${res.status})`);
        const arrayBuffer = await res.arrayBuffer();
        if (cancelled) return;

        setLoadingMsg("Procesando páginas...");
        const pdfjsLib = await import("pdfjs-dist");
        pdfjsLib.GlobalWorkerOptions.workerSrc =
          `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

        const pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        const numPages = pdfDoc.numPages;
        const result: string[] = [];

        for (let i = 1; i <= numPages; i++) {
          if (cancelled) return;
          setLoadingMsg(`Procesando página ${i} de ${numPages}...`);
          const page = await pdfDoc.getPage(i);
          const viewport = page.getViewport({ scale: 1.5 });
          const canvas = document.createElement("canvas");
          canvas.width  = viewport.width;
          canvas.height = viewport.height;
          const ctx = canvas.getContext("2d")!;
          await page.render({ canvasContext: ctx, viewport, canvas }).promise;
          result.push(canvas.toDataURL("image/png"));
        }

        if (!cancelled) {
          setSlides(result);
          setLoadingSlides(false);
        }
      } catch (err: unknown) {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : String(err);
          setSlidesError(msg);
          setLoadingSlides(false);
        }
      }
    }

    convertPdf();
    return () => { cancelled = true; };
  }, [fileId]);

  const handleSave = useCallback(
    (pagesViewed: number[]) => {
      if (!userId || !courseId) return;
      updateResourceEngagement(userId, courseId, resourceId, { pagesViewed }).catch(() => {});
    },
    [userId, courseId, resourceId]
  );

  async function handleComplete() {
    setCompleting(true);
    if (userId && courseId) {
      await updateResourceEngagement(userId, courseId, resourceId, {
        readingComplete: true,
      }).catch(() => {});
    }
    await onComplete();
    setCompleting(false);
  }

  function renderBottom({ current, total, allReady }: PageStatus) {
    if (total === 0) {
      return <ActionButton ready={true} completing={completing} onComplete={handleComplete} />;
    }
    const pct = allReady ? 100 : Math.round((current - 1) / total * 100);
    const msg = allReady
      ? "PDF completado ✓"
      : `Página ${current} de ${total}`;
    return (
      <div>
        <EngagementBar pct={Math.min(100, pct)} message={msg} ready={allReady} />
        <ActionButton ready={true} completing={completing} onComplete={handleComplete} />
      </div>
    );
  }

  // Cargando / procesando
  if (loadingSlides) {
    return (
      <div>
        <div
          className="w-full flex flex-col items-center justify-center gap-3 rounded-xl bg-gray-100 dark:bg-gray-800"
          style={{ height: "600px" }}
        >
          <div className="w-10 h-10 border-2 border-texo-amarillo/30 border-t-texo-amarillo rounded-full animate-spin" />
          <p className="text-sm text-gray-500 dark:text-gray-400">{loadingMsg}</p>
        </div>
        {renderBottom({ current: 0, total: 0, allReady: false })}
      </div>
    );
  }

  // Slides cargadas → visor de imágenes con navegación
  if (slides?.length) {
    return (
      <TrackedPageViewer
        preloadedPages={slides}
        minTimePerPage={MIN_PDF_TIME}
        onReadyChange={setReady}
        onSave={handleSave}
        renderBottom={renderBottom}
      />
    );
  }

  // Error — sin iframe fallback
  return (
    <div>
      <div
        className="w-full rounded-xl border border-texo-rojo/30 bg-texo-rojo/5 flex flex-col items-center justify-center gap-3 p-8"
        style={{ minHeight: "200px" }}
      >
        <span className="text-3xl">⚠️</span>
        <p className="text-sm font-semibold text-texo-rojo text-center">
          No se pudo cargar el PDF
        </p>
        <p className="text-xs text-gray-500 dark:text-gray-400 text-center max-w-sm">
          {slidesError}
        </p>
      </div>
      {renderBottom({ current: 0, total: 0, allReady: false })}
    </div>
  );
}

// ── TrackedSlidePlayer — Google Slides con CircleTimer ────────────────────────

interface SlideStatus {
  current: number;
  total: number;
  allReady: boolean;
}

interface TrackedSlidePlayerProps {
  slidesId: string;
  totalSlides: number;
  minTimePerSlide: number;
  onReadyChange: (ready: boolean) => void;
  renderBottom: (status: SlideStatus) => React.ReactNode;
}

function TrackedSlidePlayer({
  slidesId,
  totalSlides,
  minTimePerSlide,
  onReadyChange,
  renderBottom,
}: TrackedSlidePlayerProps) {
  const [current,    setCurrent]    = useState(1);
  const timedRef     = useRef(new Set<number>());
  const [timedCount, setTimedCount] = useState(0);
  const [slideTimer, setSlideTimer] = useState(0);

  // Resetear timer al cambiar de slide
  useEffect(() => { setSlideTimer(0); }, [current]);

  // Timer por slide
  useEffect(() => {
    if (timedRef.current.has(current)) return;
    let elapsed = 0;
    const interval = setInterval(() => {
      elapsed += 1;
      setSlideTimer(elapsed);
      if (elapsed >= minTimePerSlide && !timedRef.current.has(current)) {
        timedRef.current.add(current);
        setTimedCount(timedRef.current.size);
        clearInterval(interval);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [current, minTimePerSlide]);

  const isCurrentSlideTimed = timedRef.current.has(current) || slideTimer >= minTimePerSlide;
  const allReady = totalSlides > 0 && timedCount >= totalSlides;

  useEffect(() => { onReadyChange(allReady); }, [allReady, onReadyChange]);

  const canPrev = current > 1;
  const canNext = current < totalSlides && isCurrentSlideTimed;

  const src = `https://docs.google.com/presentation/d/${slidesId}/embed?start=false&loop=false&slide=${current}`;
  const status: SlideStatus = { current, total: totalSlides, allReady };

  return (
    <div>
      <iframe
        key={current}
        src={src}
        className="w-full rounded-xl border-none"
        style={{ height: "clamp(350px, 55vw, 560px)" }}
        allowFullScreen
      />
      <div className="flex items-center justify-between mt-3">
        <button
          onClick={() => setCurrent((p) => Math.max(1, p - 1))}
          disabled={!canPrev}
          className={`${btnBase} ${canPrev ? btnActive : btnGray}`}
        >
          ← Anterior
        </button>
        <div className="flex flex-col items-center gap-1">
          <span className="text-sm text-gray-500 dark:text-gray-400 text-center">
            Diapositiva{" "}
            <span className="font-semibold text-gray-900 dark:text-white">{current}</span>
            {" "}de {totalSlides}
          </span>
          {!isCurrentSlideTimed && (
            <CircleTimer seconds={minTimePerSlide} elapsed={slideTimer} />
          )}
        </div>
        <button
          onClick={() => setCurrent((p) => Math.min(totalSlides, p + 1))}
          disabled={!canNext}
          className={`${btnBase} ${canNext ? btnActive : btnGray}`}
        >
          Siguiente →
        </button>
      </div>
      {renderBottom(status)}
    </div>
  );
}

// ── PresentationResource ──────────────────────────────────────────────────────

const MIN_SLIDE_TIME = 20; // segundos por diapositiva

function PresentationResource({
  content,
  userId,
  courseId,
  resourceId,
  onComplete,
}: EngagementProps & { content: PresentationContent }) {
  const { driveUrl, totalSlides, pdfFileId } = content;
  const [ready,      setReady]      = useState(false);
  const [completing, setCompleting] = useState(false);

  // PPT convertido a PDF → mostrar con pdfjs-dist (sin iframe, sin scroll)
  if (pdfFileId) {
    return (
      <PdfResource
        content={{ driveUrl: `https://drive.google.com/file/d/${pdfFileId}/view` }}
        userId={userId}
        courseId={courseId}
        resourceId={resourceId}
        onComplete={onComplete}
      />
    );
  }

  const slidesMatch    = driveUrl.match(/presentation\/d\/([^/?#\s]+)/);
  const isGoogleSlides = !!slidesMatch;
  const slidesId       = slidesMatch?.[1];

  async function handleComplete() {
    setCompleting(true);
    if (userId && courseId) {
      await updateResourceEngagement(userId, courseId, resourceId, {
        readingComplete: true,
      }).catch(() => {});
    }
    await onComplete();
    setCompleting(false);
  }

  function renderSlideBottom({ current, total, allReady }: SlideStatus) {
    const pct = allReady ? 100 : total > 0 ? Math.round((current - 1) / total * 100) : 0;
    const msg = allReady
      ? "Presentación completada ✓"
      : `Diapositiva ${current} de ${total} — revisá cada diapositiva`;
    return (
      <div>
        <EngagementBar pct={pct} message={msg} ready={allReady} />
        <ActionButton ready={ready} completing={completing} onComplete={handleComplete} />
      </div>
    );
  }

  function renderPageBottom({ current, total, allReady }: PageStatus) {
    const pct = allReady ? 100 : total > 0 ? Math.round((current - 1) / total * 100) : 0;
    const msg = allReady
      ? "Presentación completada ✓"
      : total === 0
      ? "Revisá la presentación"
      : `Diapositiva ${current} de ${total} — revisá cada diapositiva`;
    return (
      <div>
        {total > 0 && <EngagementBar pct={pct} message={msg} ready={allReady} />}
        <ActionButton ready={ready} completing={completing} onComplete={handleComplete} />
      </div>
    );
  }

  // Google Slides con totalSlides conocido → tracking con timer por slide
  if (isGoogleSlides && slidesId && totalSlides && totalSlides > 0) {
    return (
      <TrackedSlidePlayer
        slidesId={slidesId}
        totalSlides={totalSlides}
        minTimePerSlide={MIN_SLIDE_TIME}
        onReadyChange={setReady}
        renderBottom={renderSlideBottom}
      />
    );
  }

  // PPT/archivo subido a Drive → usar TrackedPageViewer
  return (
    <TrackedPageViewer
      driveUrl={driveUrl}
      totalPages={totalSlides}
      loadingLabel="Convirtiendo presentación..."
      minTimePerPage={MIN_SLIDE_TIME}
      onReadyChange={setReady}
      renderBottom={renderPageBottom}
    />
  );
}

// ── splitIntoSections — helper para documentos de texto ──────────────────────

function splitIntoSections(text: string, wordsPerSection: number): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length <= wordsPerSection) return [text.trim()];
  const sections: string[] = [];
  for (let i = 0; i < words.length; i += wordsPerSection) {
    sections.push(words.slice(i, i + wordsPerSection).join(" "));
  }
  return sections;
}

// ── TrackedTextPager — documento de texto paginado con timer ─────────────────

const MIN_TEXT_SECTION_TIME = 20; // segundos por sección

interface TrackedTextPagerProps {
  sections: string[];
  userId?: string;
  courseId?: string;
  resourceId: string;
  onComplete: (score?: number) => Promise<void>;
}

function TrackedTextPager({
  sections,
  userId,
  courseId,
  resourceId,
  onComplete,
}: TrackedTextPagerProps) {
  const [current,    setCurrent]    = useState(1);
  const timedRef     = useRef(new Set<number>());
  const [timedCount, setTimedCount] = useState(0);
  const [sectionTimer, setSectionTimer] = useState(0);
  const [completing,   setCompleting]   = useState(false);
  const timeRef = useRef(0);

  const total = sections.length;

  // Reset timer on section change
  useEffect(() => { setSectionTimer(0); }, [current]);

  // Timer por sección
  useEffect(() => {
    if (timedRef.current.has(current)) return;
    let elapsed = 0;
    const interval = setInterval(() => {
      elapsed += 1;
      setSectionTimer(elapsed);
      timeRef.current = elapsed;
      if (elapsed >= MIN_TEXT_SECTION_TIME && !timedRef.current.has(current)) {
        timedRef.current.add(current);
        setTimedCount(timedRef.current.size);
        clearInterval(interval);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [current]);

  // Guardar timeSpent en Firestore cada 30s
  useEffect(() => {
    if (!userId || !courseId) return;
    const interval = setInterval(() => {
      updateResourceEngagement(userId, courseId, resourceId, {
        timeSpent: timeRef.current,
      }).catch(() => {});
    }, 30_000);
    return () => clearInterval(interval);
  }, [userId, courseId, resourceId]);

  const isCurrentTimed = timedRef.current.has(current) || sectionTimer >= MIN_TEXT_SECTION_TIME;
  const allReady = timedCount >= total;

  const canPrev = current > 1;
  const canNext = current < total && isCurrentTimed;

  async function handleComplete() {
    setCompleting(true);
    if (userId && courseId) {
      await updateResourceEngagement(userId, courseId, resourceId, {
        timeSpent: timeRef.current,
        readingComplete: true,
      }).catch(() => {});
    }
    await onComplete();
    setCompleting(false);
  }

  const pct = allReady ? 100 : total > 0 ? Math.round((timedCount / total) * 100) : 0;
  const msg = allReady ? "Documento leído ✓" : `Sección ${current} de ${total}`;
  const isLastSection = current === total;

  return (
    <div>
      <div
        className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap leading-relaxed text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-6"
        style={{ overflow: "hidden", maxHeight: "500px", userSelect: "none" }}
      >
        {sections[current - 1]}
      </div>

      {/* Nav — siempre visible */}
      <div className="flex items-center justify-between mt-3">
        <button
          onClick={() => setCurrent((p) => Math.max(1, p - 1))}
          disabled={!canPrev}
          className={`${btnBase} ${canPrev ? btnActive : btnGray}`}
        >
          ← Anterior
        </button>
        <div className="flex flex-col items-center gap-1">
          <span className="text-sm text-gray-500 dark:text-gray-400 text-center">
            Sección{" "}
            <span className="font-semibold text-gray-900 dark:text-white">{current}</span>
            {" "}de {total}
          </span>
          {!isCurrentTimed && (
            <CircleTimer seconds={MIN_TEXT_SECTION_TIME} elapsed={sectionTimer} />
          )}
        </div>
        {isLastSection ? (
          /* Última sección: botón derecho = "Podés avanzar" */
          <button
            onClick={handleComplete}
            disabled={!isCurrentTimed || completing}
            title={!isCurrentTimed ? "Esperá que termine el timer" : undefined}
            className={`${btnBase} ${isCurrentTimed ? "bg-texo-verde text-white hover:bg-texo-verde/90" : btnGray} disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            {completing ? "Guardando..." : "Podés avanzar"}
          </button>
        ) : (
          /* Secciones intermedias: navegar al siguiente */
          <button
            onClick={() => setCurrent((p) => Math.min(total, p + 1))}
            disabled={!canNext}
            className={`${btnBase} ${canNext ? btnActive : btnGray}`}
          >
            Siguiente →
          </button>
        )}
      </div>

      <EngagementBar pct={pct} message={msg} ready={allReady} />
    </div>
  );
}

// ── DocumentResource ──────────────────────────────────────────────────────────

const MIN_IFRAME_DOC_TIME = 20; // segundos para documentos en iframe

function DocumentResource({
  content,
  userId,
  courseId,
  resourceId,
  onComplete,
}: EngagementProps & { content: DocumentContent }) {
  const { body, driveUrl, pdfFileId } = content;

  // DOCX convertido a PDF → mostrar con pdfjs-dist (sin iframe, sin scroll)
  if (pdfFileId) {
    return (
      <PdfResource
        content={{ driveUrl: `https://drive.google.com/file/d/${pdfFileId}/view` }}
        userId={userId}
        courseId={courseId}
        resourceId={resourceId}
        onComplete={onComplete}
      />
    );
  }

  // Documento de texto escrito → paginación por secciones
  if (body) {
    const sections = splitIntoSections(body, 300);
    return (
      <TrackedTextPager
        sections={sections}
        userId={userId}
        courseId={courseId}
        resourceId={resourceId}
        onComplete={onComplete}
      />
    );
  }

  // Documento en Drive/iframe → timer (60s sin páginas, 20s/pág con totalPages)
  if (driveUrl) {
    return (
      <IframeDocViewer
        driveUrl={driveUrl}
        totalPages={content.totalPages}
        userId={userId}
        courseId={courseId}
        resourceId={resourceId}
        onComplete={onComplete}
      />
    );
  }

  return <div className="text-gray-400 text-sm">Sin contenido.</div>;
}

// ── IframeDocViewer — iframe con timer o navegación manual ───────────────────

const MIN_IFRAME_DOC_TIMER = 20;   // segundos sin totalPages
const MIN_IFRAME_DOC_PAGE  = 20;   // segundos por página con totalPages

function IframeDocViewer({
  driveUrl,
  totalPages,
  userId,
  courseId,
  resourceId,
  onComplete,
}: {
  driveUrl: string;
  totalPages?: number;
  userId?: string;
  courseId?: string;
  resourceId: string;
  onComplete: (score?: number) => Promise<void>;
}) {
  const [ready,      setReady]      = useState(false);
  const [timeSpent,  setTimeSpent]  = useState(0);
  const [completing, setCompleting] = useState(false);
  const timeRef = useRef(0);

  const hasManualNav = !!(totalPages && totalPages > 0);

  // Timer solo cuando NO hay navegación manual
  useEffect(() => {
    if (hasManualNav) return;
    const interval = setInterval(() => {
      setTimeSpent((t) => {
        const next = t + 1;
        timeRef.current = next;
        if (next >= MIN_IFRAME_DOC_TIMER) setReady(true);
        return next;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [hasManualNav]);

  // Guardar en Firestore cada 30s
  useEffect(() => {
    if (!userId || !courseId) return;
    const interval = setInterval(() => {
      updateResourceEngagement(userId, courseId, resourceId, {
        timeSpent: timeRef.current,
      }).catch(() => {});
    }, 30_000);
    return () => clearInterval(interval);
  }, [userId, courseId, resourceId]);

  async function handleComplete() {
    setCompleting(true);
    if (userId && courseId) {
      await updateResourceEngagement(userId, courseId, resourceId, {
        timeSpent: timeRef.current,
        readingComplete: true,
      }).catch(() => {});
    }
    await onComplete();
    setCompleting(false);
  }

  const iframeEl = (
    <div style={{ height: "600px", overflow: "hidden", userSelect: "none" }} className="rounded-xl">
      <iframe
        src={toDriveEmbedUrl(driveUrl ?? "")}
        className="w-full h-full rounded-xl border-none"
        scrolling="no"
        allowFullScreen
      />
    </div>
  );

  // Con totalPages: navegación manual con 20s/página
  if (hasManualNav) {
    return (
      <ManualPageNav
        totalPages={totalPages!}
        minTimePerPage={MIN_IFRAME_DOC_PAGE}
        onReadyChange={setReady}
        iframeContent={iframeEl}
        renderBottom={({ current, total, allReady }) => {
          const pct = allReady ? 100 : total > 0 ? Math.round((current - 1) / total * 100) : 0;
          const msg = allReady ? "Documento revisado ✓" : `Página ${current} de ${total}`;
          return (
            <div>
              <EngagementBar pct={pct} message={msg} ready={allReady} />
              <ActionButton ready={ready} completing={completing} onComplete={handleComplete} />
            </div>
          );
        }}
      />
    );
  }

  // Sin totalPages: timer de 60s
  const pct = Math.min(100, Math.round((timeSpent / MIN_IFRAME_DOC_TIMER) * 100));
  const msg = ready ? "Documento revisado ✓" : "Revisá el documento antes de continuar";

  return (
    <div>
      {iframeEl}
      {!ready && (
        <div className="flex items-center gap-2 mt-3">
          <CircleTimer seconds={MIN_IFRAME_DOC_TIMER} elapsed={timeSpent} />
          <span className="text-sm text-gray-500 dark:text-gray-400">
            Revisá el documento antes de continuar
          </span>
        </div>
      )}
      <EngagementBar pct={pct} message={msg} ready={ready} />
      <ActionButton ready={ready} completing={completing} onComplete={handleComplete} />
    </div>
  );
}

// ── CompletedBlock ────────────────────────────────────────────────────────────

function CompletedBlock({ nextAction }: { nextAction?: NextAction | null }) {
  if (nextAction === null) {
    return (
      <div className="mt-4 space-y-3">
        <div className="inline-flex items-center gap-2 text-texo-verde font-medium text-sm bg-texo-verde/10 px-4 py-2 rounded-lg">
          <span>✓</span> Completado
        </div>
        <div className="w-full bg-gradient-to-r from-texo-azul to-texo-verde rounded-2xl p-6 text-center text-white">
          <div className="text-5xl mb-2">🎉</div>
          <h3 className="text-xl font-bold mb-1">¡Completaste el Propedéutico!</h3>
          <p className="text-white/70 text-sm">Felicitaciones, terminaste todo el contenido.</p>
        </div>
      </div>
    );
  }

  if (nextAction) {
    return (
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <div className="inline-flex items-center gap-2 text-texo-verde font-medium text-sm bg-texo-verde/10 px-4 py-2 rounded-lg">
          <span>✓</span> Completado
        </div>
        <button
          onClick={nextAction.onClick}
          className="inline-flex items-center gap-2 bg-texo-amarillo text-texo-azul font-semibold px-5 py-2 rounded-lg text-sm hover:bg-texo-amarillo/90 transition-colors"
        >
          {nextAction.label}
        </button>
      </div>
    );
  }

  return (
    <div className="mt-4 inline-flex items-center gap-2 text-texo-verde font-medium text-sm bg-texo-verde/10 px-4 py-2 rounded-lg">
      <span>✓</span> Completado
    </div>
  );
}



