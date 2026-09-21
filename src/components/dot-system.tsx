"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { StudyNav } from "./study-nav";
import { drawDotField } from "@/lib/dot-field";
import type { DotFieldLayout } from "@/lib/dot-field";
import { DITHER_FIELD_DEFAULTS, FIGURE_LED_DEFAULTS, IMAGE_DITHER_DEFAULTS, IMAGE_MERGE_DEFAULTS, PUSH_MORPH_DEFAULTS, PUSH_MORPH_IMAGE_DEFAULTS, MORPH_0918_LIBRARY, MORPH_LIBRARY, NECK_LIBRARY, STEP_LIBRARY, TONAL_LIBRARY, type DitherStamp } from "@/lib/dither-cells";
import { replayStepSequence, MORPH_IMAGE_OVERLAYS, SEQUENCE_DEFAULTS, STEP_OVERLAYS, type SequenceStudio, type SequenceTiming, type StepOverlaySpec } from "@/lib/step-overlays";
import styles from "./dot-system.module.css";
import { CellLibrary, RimBlockSet, ToneRamp } from "./cell-library";
import { TrailControls } from "./trail-controls";
import { TRAIL_DEFAULTS } from "@/lib/domain-trails";
import { DitherControls } from "./dither-controls";
import { DendriticControls } from "./dendritic-layer";
import { LINKAGE_DEFAULTS } from "@/lib/component-linkage";

function loadOverlayImage(file: File): Promise<{ image: HTMLImageElement; label: string }> {
  if (!file.type.startsWith("image/")) return Promise.reject(new Error("Choose an image file."));
  return new Promise((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(file);
    image.onload = () => { URL.revokeObjectURL(url); resolve({ image, label: file.name }); };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error(`Could not load ${file.name}.`)); };
    image.src = url;
  });
}

export function DotSystem({ rectangular = false, multiple = false, neurons = false, dither = false, figure, pushMorph = false, gridOnly = false, editableImages = false, sequenceStudio = false, ditherImage = false, imageMerge = false }: { rectangular?: boolean; multiple?: boolean; neurons?: boolean; dither?: boolean; figure?: string; pushMorph?: boolean; gridOnly?: boolean; editableImages?: boolean; sequenceStudio?: boolean; ditherImage?: boolean; imageMerge?: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const seed = useRef<number | null>(null);
  const layout = useRef<DotFieldLayout | null>(null);
  const headlinePosition = useRef<{ x: number; y: number } | null>(null);
  const figurePosition = useRef<{ x: number; y: number } | null>(null);
  const [mainImageSize, setMainImageSize] = useState(editableImages ? .14 : .158);
  const mainImageSizeRef = useRef(mainImageSize);
  mainImageSizeRef.current = mainImageSize;
  const objectPositions = useRef<({ x: number; y: number } | null)[]>([]);
  const activeObject = useRef(0);
  const dragOffset = useRef<{ x: number; y: number } | null>(null);
  const dragPointer = useRef<number | null>(null);
  const resizeDrag = useRef<{ pointer: number; distance: number; size: number } | null>(null);
  const [error, setError] = useState(false);
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "error">("idle");
  const [pasteStatus, setPasteStatus] = useState("");
  const [pastedSetup, setPastedSetup] = useState("");
  const [mainImageLabel, setMainImageLabel] = useState(editableImages ? "1.png" : "innate-os-card.png");
  const [sequence, setSequence] = useState<SequenceTiming>(SEQUENCE_DEFAULTS);
  const [sequencePlaying, setSequencePlaying] = useState(false);
  const [sequencePreview, setSequencePreview] = useState<1 | 2>(1);
  const [nextImageLabel, setNextImageLabel] = useState("");
  const [nextImageSize, setNextImageSize] = useState(.14);
  const nextImageSizeRef = useRef(nextImageSize);
  nextImageSizeRef.current = nextImageSize;
  const [dragging, setDragging] = useState(false);
  const [nextFigureImage, setNextFigureImage] = useState<HTMLImageElement | null>(null);
  const [nextStepImages, setNextStepImages] = useState<StepOverlaySpec[]>([]);
  const nextFigureRef = useRef(nextFigureImage);
  if (nextFigureImage) nextFigureRef.current = nextFigureImage;
  const nextStepsRef = useRef(nextStepImages);
  if (!dragging) nextStepsRef.current = nextStepImages;
  const sequencePreviewRef = useRef(sequencePreview);
  sequencePreviewRef.current = sequencePreview;
  const sequenceRef = useRef<SequenceStudio | null>(null);
  sequenceRef.current = sequenceStudio ? {
    ...sequence,
    playing: sequencePlaying,
    preview: sequencePreview,
    nextFigure: nextFigureRef.current ?? nextFigureImage ?? undefined,
    nextFigureSize: nextImageSizeRef.current,
    nextSteps: nextStepsRef.current,
  } : null;
  const centerInput = useRef<HTMLInputElement>(null);
  const nextCenterInput = useRef<HTMLInputElement>(null);
  const nextImageInput = useRef<HTMLInputElement>(null);
  const replaceSurroundIndex = useRef<number | null>(null);
  const replaceSurroundAct = useRef<1 | 2>(1);
  const [linkage, setLinkage] = useState(LINKAGE_DEFAULTS);
  const [selectedImage, setSelectedImage] = useState<number | null>(null);
  const selectedImageRef = useRef<number | null>(null);
  const [trails, setTrails] = useState(TRAIL_DEFAULTS);
  const trailsRef = useRef(trails);
  trailsRef.current = trails;
  const fieldDefaults = imageMerge ? IMAGE_MERGE_DEFAULTS : ditherImage ? IMAGE_DITHER_DEFAULTS : editableImages ? PUSH_MORPH_IMAGE_DEFAULTS : pushMorph ? PUSH_MORPH_DEFAULTS : figure || gridOnly ? FIGURE_LED_DEFAULTS : DITHER_FIELD_DEFAULTS;
  const [ditherSettings, setDitherSettings] = useState(fieldDefaults);
  const defaultOverlays = editableImages ? MORPH_IMAGE_OVERLAYS : STEP_OVERLAYS;
  const ditherSettingsRef = useRef(ditherSettings);
  ditherSettingsRef.current = ditherSettings;
  const [stamp, setStamp] = useState<DitherStamp>({ id: ditherImage || editableImages ? "morph-0918" : pushMorph ? "morph" : "tonal" });
  const stampRef = useRef(stamp);
  stampRef.current = stamp;
  const [stepStamp, setStepStamp] = useState<DitherStamp>({ id: "step" });
  const stepStampRef = useRef(stepStamp);
  stepStampRef.current = stepStamp;
  const [neckStamp, setNeckStamp] = useState<DitherStamp>({ id: "neck" });
  const neckStampRef = useRef(neckStamp);
  neckStampRef.current = neckStamp;
  const [figureImage, setFigureImage] = useState<HTMLImageElement | null>(null);
  const figureRef = useRef(figureImage);
  figureRef.current = figureImage;
  const [stepImages, setStepImages] = useState<StepOverlaySpec[]>([]);
  const stepsRef = useRef(stepImages);
  if (!dragging) stepsRef.current = stepImages;
  const imageInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!figure) { setFigureImage(null); return; }
    let cancelled = false;
    const image = new Image();
    image.onload = () => { if (!cancelled) setFigureImage(image); };
    image.onerror = () => { if (!cancelled) setError(true); };
    image.src = figure;
    return () => { cancelled = true; };
  }, [figure]);

  useEffect(() => {
    if (!figure || ditherImage) { setStepImages([]); return; }
    let cancelled = false;
    Promise.all(defaultOverlays.map(step => new Promise<StepOverlaySpec>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve({ ...step, image });
      image.onerror = () => reject(new Error(`Could not load ${step.src}`));
      image.src = step.src;
    }))).then(steps => { if (!cancelled) setStepImages(steps); }).catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, [figure, defaultOverlays, ditherImage]);

  useEffect(() => {
    if (!canvas.current) return;
    seed.current ??= crypto.getRandomValues(new Uint32Array(1))[0];
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    let animation = 0, lastDraw = 0;
    const draw = (time = 0) => {
      try { layout.current = drawDotField(canvas.current!, seed.current!, time, headlinePosition.current, rectangular, (multiple || gridOnly) && !figure ? objectPositions.current : undefined, neurons ? linkage : undefined, dither ? stampRef.current : undefined, ditherSettingsRef.current, dither && !figure ? trailsRef.current : undefined, figureRef.current ?? undefined, figure && !ditherImage ? stepsRef.current : undefined, figure && !ditherImage ? stepStampRef.current : undefined, figure && !ditherImage ? neckStampRef.current : undefined, pushMorph, gridOnly, figurePosition.current, editableImages, mainImageSizeRef.current, sequenceRef.current, ditherImage, imageMerge) ?? null; }
      catch { setError(true); }
    };
    const tick = (time: number) => {
      const freeze = media.matches && !sequenceRef.current?.playing;
      if (time - lastDraw >= 1000 / 30) { draw(freeze ? 0 : time); lastDraw = time; }
      animation = requestAnimationFrame(tick);
    };
    const syncMotion = () => {
      cancelAnimationFrame(animation);
      if ((!media.matches || dither || gridOnly) && !document.hidden) animation = requestAnimationFrame(tick);
      else draw(0);
    };
    const observer = new ResizeObserver(() => {
      if (editableImages && !figurePosition.current) {
        const bounds = canvas.current!.getBoundingClientRect();
        figurePosition.current = { x: bounds.width * .489, y: bounds.height * .442 };
      }
      draw(media.matches ? 0 : performance.now());
    });
    observer.observe(canvas.current);
    if (editableImages && !figurePosition.current) {
      const bounds = canvas.current.getBoundingClientRect();
      if (bounds.width && bounds.height) figurePosition.current = { x: bounds.width * .489, y: bounds.height * .442 };
    }
    draw();
    document.addEventListener("visibilitychange", syncMotion);
    media.addEventListener("change", syncMotion);
    syncMotion();
    return () => {
      cancelAnimationFrame(animation);
      observer.disconnect();
      document.removeEventListener("visibilitychange", syncMotion);
      media.removeEventListener("change", syncMotion);
    };
  }, [rectangular, multiple, neurons, dither, linkage, figure, figureImage, stepImages, pushMorph, gridOnly, editableImages, nextFigureImage, nextStepImages, ditherImage, imageMerge]);

  useEffect(() => {
    if (sequencePlaying || (!dither && !gridOnly) || !window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const frame = requestAnimationFrame(() => {
      if (!canvas.current || seed.current === null) return;
      try { layout.current = drawDotField(canvas.current, seed.current, 0, headlinePosition.current, rectangular,
        (multiple || gridOnly) && !figure ? objectPositions.current : undefined, neurons ? linkage : undefined, stamp, ditherSettingsRef.current, dither && !figure ? trailsRef.current : undefined, figureRef.current ?? undefined, figure && !ditherImage ? stepsRef.current : undefined, figure && !ditherImage ? stepStamp : undefined, figure && !ditherImage ? neckStamp : undefined, pushMorph, gridOnly, figurePosition.current, editableImages, mainImageSizeRef.current, sequenceRef.current, ditherImage, imageMerge) ?? null; }
      catch { setError(true); }
    });
    return () => cancelAnimationFrame(frame);
  }, [ditherSettings, trails, dither, rectangular, multiple, neurons, linkage, stamp, stepStamp, neckStamp, figure, figureImage, pushMorph, gridOnly, editableImages, mainImageSize, sequence, sequencePlaying, sequencePreview, nextFigureImage, nextStepImages, nextImageSize, ditherImage, imageMerge]);

  const canvasPoint = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
  };

  const addFigureImages = async (files?: FileList | null, act: 1 | 2 = 1) => {
    if (!files) return;
    setError(false);
    try {
      const images = await Promise.all(Array.from(files).map(loadOverlayImage));
      const slots = act === 2
        ? [{ cx: .68, cy: .24 }, { cx: .78, cy: .72 }, { cx: .28, cy: .22 }, { cx: .52, cy: .84 }, { cx: .14, cy: .48 }, { cx: .86, cy: .52 }]
        : [{ cx: .72, cy: .22 }, { cx: .76, cy: .78 }, { cx: .48, cy: .18 }, { cx: .5, cy: .82 }, { cx: .12, cy: .52 }, { cx: .88, cy: .48 }];
      const apply = (current: StepOverlaySpec[]) => [...current, ...images.map(({ image, label }, index) => ({
        image, label,
        ...slots[(current.length + index) % slots.length],
        size: .14,
      }))];
      if (act === 2) setNextStepImages(apply);
      else setStepImages(apply);
    } catch {
      setError(true);
    }
    if (act === 2 && nextImageInput.current) nextImageInput.current.value = "";
    if (act === 1 && imageInput.current) imageInput.current.value = "";
  };

  const replaceCenterImage = async (files?: FileList | null, act: 1 | 2 = 1) => {
    if (!files?.[0]) return;
    setError(false);
    try {
      const { image, label } = await loadOverlayImage(files[0]);
      if (act === 2) {
        nextFigureRef.current = image;
        setNextFigureImage(image);
        setNextImageLabel(label);
      } else {
        setFigureImage(image);
        setMainImageLabel(label);
      }
    } catch {
      setError(true);
    }
    if (act === 2 && nextCenterInput.current) nextCenterInput.current.value = "";
    if (act === 1 && centerInput.current) centerInput.current.value = "";
  };

  const replaceSurroundImage = async (files?: FileList | null, index = replaceSurroundIndex.current, act = replaceSurroundAct.current) => {
    if (!files?.[0] || index === null) return;
    setError(false);
    try {
      const { image, label } = await loadOverlayImage(files[0]);
      const apply = (current: StepOverlaySpec[]) => current.map((step, stepIndex) => stepIndex === index ? { ...step, image, label } : step);
      if (act === 2) setNextStepImages(apply);
      else setStepImages(apply);
    } catch {
      setError(true);
    }
    replaceSurroundIndex.current = null;
  };

  const moveSurround = (index: number, direction: -1 | 1, act: 1 | 2 = 1) => {
    const current = act === 2 ? nextStepsRef.current : stepsRef.current;
    const next = index + direction;
    if (next < 0 || next >= current.length) return;
    const apply = (items: StepOverlaySpec[]) => {
      const copy = [...items];
      [copy[index], copy[next]] = [copy[next], copy[index]];
      return copy;
    };
    if (act === 2) setNextStepImages(apply);
    else setStepImages(apply);
  };

  const showSequenceScene = (preview: 1 | 2) => {
    sequenceRef.current = {
      ...sequence,
      playing: false,
      preview,
      nextFigure: nextFigureRef.current ?? undefined,
      nextFigureSize: nextImageSizeRef.current,
      nextSteps: nextStepsRef.current,
    };
    setSequencePlaying(false);
    setSequencePreview(preview);
    selectedImageRef.current = null;
    setSelectedImage(null);
  };

  const playSequence = () => {
    if (canvas.current) replayStepSequence(canvas.current);
    sequenceRef.current = {
      ...sequence,
      playing: true,
      preview: 1,
      nextFigure: nextFigureRef.current ?? undefined,
      nextFigureSize: nextImageSizeRef.current,
      nextSteps: nextStepsRef.current,
    };
    setSequencePreview(1);
    setSequencePlaying(true);
  };

  const beginDrag = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if ((figure && !editableImages) || !layout.current) return;
    const point = canvasPoint(event);
    const objects = layout.current.objects ?? [{ bounds: layout.current.headlineBounds, anchor: layout.current.headlineAnchor }];
    const hit = objects.findLastIndex(({ bounds }) => point.x >= bounds.left && point.x <= bounds.right
      && point.y >= bounds.top && point.y <= bounds.bottom);
    if (hit < 0) {
      if (editableImages) {
        selectedImageRef.current = null;
        setSelectedImage(null);
      }
      return;
    }
    if (editableImages) {
      selectedImageRef.current = hit;
      setSelectedImage(hit);
    }
    activeObject.current = hit;
    if (gridOnly) {
      event.currentTarget.dataset.activeCell = String(hit);
      event.currentTarget.dataset.draggingCell = "1";
    }
    dragOffset.current = { x: point.x - objects[hit].anchor.x, y: point.y - objects[hit].anchor.y };
    dragPointer.current = event.pointerId;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
    event.preventDefault();
  };

  const moveDrag = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (dragPointer.current !== event.pointerId || !dragOffset.current || !layout.current) return;
    const point = canvasPoint(event);
    const canvasBounds = event.currentTarget.getBoundingClientRect();
    const selected = layout.current.objects?.[activeObject.current];
    const headlineBounds = selected?.bounds ?? layout.current.headlineBounds;
    const headlineAnchor = selected?.anchor ?? layout.current.headlineAnchor;
    const leftOffset = headlineBounds.left - headlineAnchor.x;
    const rightOffset = headlineBounds.right - headlineAnchor.x;
    const topOffset = headlineBounds.top - headlineAnchor.y;
    const bottomOffset = headlineBounds.bottom - headlineAnchor.y;
    const position = {
      x: Math.max(4 - leftOffset, Math.min(canvasBounds.width - 4 - rightOffset, point.x - dragOffset.current.x)),
      y: Math.max(4 - topOffset, Math.min(canvasBounds.height - 4 - bottomOffset, point.y - dragOffset.current.y)),
    };
    if (figure && editableImages) {
      if (activeObject.current === 0) figurePosition.current = position;
      else {
        const index = activeObject.current - 1;
        const relocate = (items: StepOverlaySpec[]) => items.map((step, stepIndex) => stepIndex === index
          ? { ...step, cx: position.x / canvasBounds.width, cy: position.y / canvasBounds.height }
          : step);
        if (editingSecondAct()) {
          nextStepsRef.current = relocate(nextStepsRef.current);
          if (sequenceRef.current) sequenceRef.current = { ...sequenceRef.current, nextSteps: nextStepsRef.current, preview: 2 };
        } else stepsRef.current = relocate(stepsRef.current);
      }
    } else if (multiple || gridOnly) objectPositions.current[activeObject.current] = position;
    else headlinePosition.current = position;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches && seed.current !== null) {
      layout.current = drawDotField(event.currentTarget, seed.current, 0, headlinePosition.current, rectangular, (multiple || gridOnly) && !figure ? objectPositions.current : undefined, neurons ? linkage : undefined, dither ? stampRef.current : undefined, ditherSettingsRef.current, dither && !figure ? trailsRef.current : undefined, figureRef.current ?? undefined, figure && !ditherImage ? stepsRef.current : undefined, figure && !ditherImage ? stepStampRef.current : undefined, figure && !ditherImage ? neckStampRef.current : undefined, pushMorph, gridOnly, figurePosition.current, editableImages, mainImageSizeRef.current, sequenceRef.current, ditherImage, imageMerge) ?? null;
    }
    event.preventDefault();
  };

  const endDrag = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (dragPointer.current !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (gridOnly) delete event.currentTarget.dataset.draggingCell;
    if (figure && editableImages) {
      if (editingSecondAct()) setNextStepImages([...nextStepsRef.current]);
      else setStepImages([...stepsRef.current]);
    }
    dragPointer.current = null;
    dragOffset.current = null;
    setDragging(false);
  };

  const deleteSelectedImage = () => {
    const selected = selectedImageRef.current;
    if (selected === null) return;
    if (selected === 0) {
      if (sequenceStudio) return;
      const [replacement, ...remaining] = stepsRef.current;
      if (!replacement) return;
      const bounds = canvas.current?.getBoundingClientRect();
      if (bounds) figurePosition.current = { x: replacement.cx * bounds.width, y: replacement.cy * bounds.height };
      setFigureImage(replacement.image as HTMLImageElement);
      setMainImageLabel(replacement.label ?? "Image");
      setMainImageSize(replacement.size);
      stepsRef.current = remaining;
      setStepImages(remaining);
    } else if (editingSecondAct()) {
      const remaining = nextStepsRef.current.filter((_, index) => index !== selected - 1);
      nextStepsRef.current = remaining;
      setNextStepImages(remaining);
    } else {
      const remaining = stepsRef.current.filter((_, index) => index !== selected - 1);
      stepsRef.current = remaining;
      setStepImages(remaining);
    }
    selectedImageRef.current = null;
    setSelectedImage(null);
  };

  const editingSecondAct = () => sequenceStudio && (sequencePreviewRef.current === 2 || canvas.current?.dataset.editAct === "2");
  const editingSecond = editingSecondAct();
  const selectedBounds = selectedImage === null ? undefined : layout.current?.objects?.[selectedImage]?.bounds;
  const selectedSize = selectedImage === 0
    ? (editingSecond ? nextImageSize : mainImageSize)
    : selectedImage === null ? undefined : (editingSecond ? nextStepImages : stepImages)[selectedImage - 1]?.size;
  const updateSelectedSize = (size: number) => {
    const selected = selectedImageRef.current;
    if (selected === null) return;
    const object = layout.current?.objects?.[selected];
    const previousSize = selected === 0
      ? (editingSecond ? nextImageSizeRef.current : mainImageSizeRef.current)
      : (editingSecond ? nextStepsRef.current : stepsRef.current)[selected - 1]?.size;
    if (object && previousSize) {
      const scale = size / previousSize;
      const halfWidth = (object.bounds.right - object.bounds.left) * scale / 2;
      const halfHeight = (object.bounds.bottom - object.bounds.top) * scale / 2;
      object.bounds = {
        left: object.anchor.x - halfWidth,
        top: object.anchor.y - halfHeight,
        right: object.anchor.x + halfWidth,
        bottom: object.anchor.y + halfHeight,
      };
    }
    if (selected === 0) {
      if (editingSecond) {
        nextImageSizeRef.current = size;
        setNextImageSize(size);
      } else {
        mainImageSizeRef.current = size;
        setMainImageSize(size);
      }
      return;
    }
    const apply = (items: StepOverlaySpec[]) => items.map((step, index) => index === selected - 1 ? { ...step, size } : step);
    if (editingSecond) {
      const updated = apply(nextStepsRef.current);
      nextStepsRef.current = updated;
      setNextStepImages(updated);
    } else {
      const updated = apply(stepsRef.current);
      stepsRef.current = updated;
      setStepImages(updated);
    }
  };
  const beginResize = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const selected = selectedImageRef.current;
    const object = selected === null ? undefined : layout.current?.objects?.[selected];
    if (!object || selectedSize === undefined) return;
    const canvasBounds = canvas.current?.getBoundingClientRect();
    if (!canvasBounds) return;
    const x = event.clientX - canvasBounds.left;
    const y = event.clientY - canvasBounds.top;
    resizeDrag.current = {
      pointer: event.pointerId,
      distance: Math.max(1, Math.hypot(x - object.anchor.x, y - object.anchor.y)),
      size: selectedSize,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.stopPropagation();
    event.preventDefault();
  };
  const moveResize = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const start = resizeDrag.current;
    const selected = selectedImageRef.current;
    const object = selected === null ? undefined : layout.current?.objects?.[selected];
    const canvasBounds = canvas.current?.getBoundingClientRect();
    if (!start || start.pointer !== event.pointerId || !object || !canvasBounds) return;
    const x = event.clientX - canvasBounds.left;
    const y = event.clientY - canvasBounds.top;
    const distance = Math.hypot(x - object.anchor.x, y - object.anchor.y);
    updateSelectedSize(Math.max(.06, Math.min(.4, start.size * distance / start.distance)));
    event.stopPropagation();
    event.preventDefault();
  };
  const endResize = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (resizeDrag.current?.pointer !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    resizeDrag.current = null;
    event.stopPropagation();
  };
  const copyCurrentSetup = async () => {
    const canvasBounds = canvas.current?.getBoundingClientRect();
    const mainAnchor = layout.current?.objects?.[0]?.anchor;
    const percent = (value: number) => Math.round(value * 1000) / 10;
    const preset = {
      version: 1,
      study: sequenceStudio ? "10_5" : "10_4",
      capturedAt: new Date().toISOString(),
      field: { ...ditherSettings },
      buildingBlocks: (stamp.ramp ?? []).map(cell => ({
        id: cell.id,
        name: cell.label,
        tonePercent: percent(cell.level),
        joinEdges: Boolean(cell.joins),
      })),
      rimBlocks: (stamp.rim ?? []).map(cell => ({ id: cell.id, name: cell.label })),
      images: [
        {
          name: mainImageLabel,
          xPercent: percent(mainAnchor && canvasBounds ? mainAnchor.x / canvasBounds.width : .5),
          yPercent: percent(mainAnchor && canvasBounds ? mainAnchor.y / canvasBounds.height : .5),
          sizePercent: percent(mainImageSize),
        },
        ...stepsRef.current.map((step, index) => ({
          name: step.label ?? `Image ${index + 2}`,
          xPercent: percent(step.cx),
          yPercent: percent(step.cy),
          sizePercent: percent(step.size),
        })),
      ],
      nextImages: sequenceStudio ? [
        {
          name: nextImageLabel,
          xPercent: percent(mainAnchor && canvasBounds ? mainAnchor.x / canvasBounds.width : .5),
          yPercent: percent(mainAnchor && canvasBounds ? mainAnchor.y / canvasBounds.height : .5),
          sizePercent: percent(nextImageSize),
        },
        ...nextStepsRef.current.map((step, index) => ({
          name: step.label ?? `Image ${index + 2}`,
          xPercent: percent(step.cx),
          yPercent: percent(step.cy),
          sizePercent: percent(step.size),
        })),
      ] : undefined,
    };
    const text = JSON.stringify(preset, null, 2);
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text);
      else {
        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        if (!document.execCommand("copy")) throw new Error("Copy failed.");
        textarea.remove();
      }
      setCopyStatus("copied");
      window.setTimeout(() => setCopyStatus("idle"), 1800);
    } catch {
      setCopyStatus("error");
    }
  };
  const applyPastedSetup = () => {
    try {
      const parsed: unknown = JSON.parse(pastedSetup);
      if (!parsed || typeof parsed !== "object") throw new Error("Setup must be a JSON object.");
      const setup = parsed as {
        version?: number;
        field?: Record<string, unknown>;
        buildingBlocks?: { id?: string; name?: string; tonePercent?: number; joinEdges?: boolean }[];
        rimBlocks?: { id?: string; name?: string }[];
        images?: { name?: string; xPercent?: number; yPercent?: number; sizePercent?: number }[];
        nextImages?: { name?: string; xPercent?: number; yPercent?: number; sizePercent?: number }[];
      };
      if (setup.version !== 1) throw new Error("This setup version is not supported.");

      if (setup.field && typeof setup.field === "object") {
        const restored = { ...ditherSettings };
        for (const key of Object.keys(restored) as (keyof typeof restored)[]) {
          const incoming = setup.field[key];
          if (typeof incoming === typeof restored[key]) {
            (restored as Record<string, unknown>)[key] = incoming;
          }
        }
        setDitherSettings(restored);
      }

      let missing = 0;
      if (Array.isArray(setup.buildingBlocks)) {
        const available = stampRef.current.ramp ?? [];
        const restored = setup.buildingBlocks.flatMap(block => {
          const cell = available.find(item => item.id === block.id || item.label === block.name);
          if (!cell) { missing++; return []; }
          const level = typeof block.tonePercent === "number"
            ? Math.max(0, Math.min(1, block.tonePercent / 100))
            : cell.level;
          return [{ ...cell, level, joins: typeof block.joinEdges === "boolean" ? block.joinEdges : cell.joins }];
        }).sort((a, b) => a.level - b.level);
        if (restored.length) setStamp(current => ({ ...current, id: "morph-0918", ramp: restored }));
      }

      if (Array.isArray(setup.rimBlocks)) {
        const available = stampRef.current.rim ?? [];
        const restored = setup.rimBlocks.flatMap(block => {
          const cell = available.find(item => item.id === block.id || item.label === block.name);
          if (!cell) { missing++; return []; }
          return [cell];
        });
        setStamp(current => ({ ...current, rim: restored }));
      }

      if (Array.isArray(setup.images) && setup.images.length) {
        const [main, ...others] = setup.images;
        const bounds = canvas.current?.getBoundingClientRect();
        if (bounds && typeof main.xPercent === "number" && typeof main.yPercent === "number") {
          figurePosition.current = {
            x: bounds.width * Math.max(0, Math.min(1, main.xPercent / 100)),
            y: bounds.height * Math.max(0, Math.min(1, main.yPercent / 100)),
          };
        }
        if (typeof main.sizePercent === "number") {
          setMainImageSize(Math.max(.06, Math.min(.4, main.sizePercent / 100)));
        }
        if (main.name) setMainImageLabel(main.name);

        const available = [...stepsRef.current];
        const restored = others.flatMap((image, index) => {
          let match = available.findIndex(step => step.label === image.name);
          if (match < 0 && !image.name && index < available.length) match = index;
          if (match < 0) { missing++; return []; }
          const [step] = available.splice(match, 1);
          return [{
            ...step,
            cx: typeof image.xPercent === "number" ? Math.max(0, Math.min(1, image.xPercent / 100)) : step.cx,
            cy: typeof image.yPercent === "number" ? Math.max(0, Math.min(1, image.yPercent / 100)) : step.cy,
            size: typeof image.sizePercent === "number" ? Math.max(.06, Math.min(.4, image.sizePercent / 100)) : step.size,
          }];
        });
        stepsRef.current = restored;
        setStepImages(restored);
      }

      if (sequenceStudio && Array.isArray(setup.nextImages) && setup.nextImages.length) {
        const [main, ...others] = setup.nextImages;
        if (typeof main.sizePercent === "number") {
          setNextImageSize(Math.max(.06, Math.min(.4, main.sizePercent / 100)));
        }
        if (main.name) setNextImageLabel(main.name);
        const available = [...nextStepsRef.current];
        const restored = others.flatMap((image, index) => {
          let match = available.findIndex(step => step.label === image.name);
          if (match < 0 && !image.name && index < available.length) match = index;
          if (match < 0) { missing++; return []; }
          const [step] = available.splice(match, 1);
          return [{
            ...step,
            cx: typeof image.xPercent === "number" ? Math.max(0, Math.min(1, image.xPercent / 100)) : step.cx,
            cy: typeof image.yPercent === "number" ? Math.max(0, Math.min(1, image.yPercent / 100)) : step.cy,
            size: typeof image.sizePercent === "number" ? Math.max(.06, Math.min(.4, image.sizePercent / 100)) : step.size,
          }];
        });
        nextStepsRef.current = restored;
        setNextStepImages(restored);
      }

      selectedImageRef.current = null;
      setSelectedImage(null);
      setPasteStatus(missing ? `Applied with ${missing} unavailable asset${missing === 1 ? "" : "s"}.` : "Setup applied ✓");
    } catch (reason) {
      setPasteStatus(reason instanceof Error ? reason.message : "Could not apply this setup.");
    }
  };

  return <main className={styles.workspace}>
    <header className={styles.header}>
      <StudyNav className={styles.navigation} />
      <h1 className={styles.title}>{imageMerge ? "Dithered image · Merge" : ditherImage ? "Dithered image" : sequenceStudio ? "Innate OS · Morph sequence" : editableImages ? "Innate OS · Morph images" : gridOnly ? "Grid cells" : pushMorph ? "Innate OS · Morph" : figure ? "Innate OS" : dither ? "Cell system" : neurons ? "Connected agents" : multiple ? "Four agents" : rectangular ? "Rectangle field" : "Circle field"}</h1>
    </header>
    <section className={`${styles.stage} ${neurons ? styles.neuralStage : ""}`} aria-label={gridOnly ? "Draggable grid cells" : dither ? "Dithered cell field" : rectangular ? "Interactive rectangular density field" : "One generative circle-grid pattern"}>
      <canvas ref={canvas} className={`${styles.canvas} ${dragging ? styles.dragging : ""}`} role="img"
        onPointerDown={beginDrag} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag}
        aria-label={imageMerge ? "A dithered wordmark whose letters are separate density islands that merge by adhesion and reach." : ditherImage ? "An uploaded wordmark dithered with building-block cells on the LED grid." : gridOnly ? "Draggable lettered cells on the LED grid. Nearby cells merge into outlined pills. Use the toggle to hide or show the grid." : figure ? "Innate OS chat on the LED grid, with three MARS steps appearing in sequence around the field." : dither ? "Four draggable text agents. Metaball connections are dithered with a circular cell that can be swapped from the library." : neurons ? "Four draggable text agents joined by curved neuron-like paths around a slowly changing dot field." : multiple ? "Four draggable text objects: innate robotics, 2026 Summer Hackathon, skill_walk, and push. Each merges with nearby dots." : rectangular ? "Drag innate robotics to merge and separate stepped rectangular territories on the grid." : "A draggable innate robotics text agent forms liquid connections with nearby thinking-area dots on a stationary outlined grid."} />
      {editableImages && selectedBounds && selectedSize !== undefined && <div className={styles.imageSelection}
        style={{
          left: selectedBounds.left,
          top: selectedBounds.top,
          width: selectedBounds.right - selectedBounds.left,
          height: selectedBounds.bottom - selectedBounds.top,
        }}>
        {(["nw", "ne", "sw", "se"] as const).map(corner => <button key={corner} type="button"
          className={`${styles.resizeHandle} ${styles[corner]}`}
          aria-label={`Resize selected image from ${corner} corner`}
          onPointerDown={beginResize} onPointerMove={moveResize} onPointerUp={endResize} onPointerCancel={endResize}>
          {corner === "nw" ? "↖" : corner === "ne" ? "↗" : corner === "sw" ? "↙" : "↘"}
        </button>)}
        {!(sequenceStudio && selectedImage === 0) && <button type="button" className={styles.deleteImage}
          aria-label="Delete selected image" onClick={deleteSelectedImage}>×</button>}
      </div>}
      {gridOnly && <DitherControls led gridOnly value={ditherSettings} onChange={setDitherSettings} />}
      {dither && !gridOnly && <CellLibrary library={ditherImage || editableImages ? MORPH_0918_LIBRARY : pushMorph ? MORPH_LIBRARY : TONAL_LIBRARY} value={stamp} onChange={setStamp}>
        {editableImages && <div className={styles.imageControls}>
          <p className={styles.imageControlHeading}>Draggable images</p>
          <p className={styles.imageControlNote}>Drag any image on the canvas. Copy Setup records parameters, block tones, and image positions.</p>
          {!sequenceStudio && <label className={styles.imageUpload}>
            <input ref={imageInput} type="file" aria-label="Add draggable images" multiple accept="image/*"
              onChange={event => { void addFigureImages(event.target.files); }} />
            Add images
          </label>}
          {!sequenceStudio && stepImages.length > defaultOverlays.length && <button className={styles.imageReset} type="button"
            onClick={() => setStepImages(current => current.slice(0, defaultOverlays.length))}>Remove uploaded images</button>}
          <button className={styles.copySetup} type="button" onClick={() => { void copyCurrentSetup(); }}>
            {copyStatus === "copied" ? "Copied setup ✓" : copyStatus === "error" ? "Copy failed" : "Copy current setup"}
          </button>
          <details className={styles.pasteSetup}>
            <summary>Paste a setup</summary>
            <textarea aria-label="Pasted setup JSON" value={pastedSetup}
              placeholder="Paste copied setup JSON here…"
              onChange={event => { setPastedSetup(event.target.value); setPasteStatus(""); }} />
            <button type="button" onClick={applyPastedSetup} disabled={!pastedSetup.trim()}>Render pasted setup</button>
            {pasteStatus && <p aria-live="polite">{pasteStatus}</p>}
          </details>
        </div>}
        {(pushMorph || ditherImage) && <RimBlockSet value={stamp.rim ?? []} onChange={rim => setStamp(current => ({ ...current, rim }))} />}
        {figure && !pushMorph && !ditherImage && <ToneRamp library={STEP_LIBRARY} value={stepStamp} onChange={setStepStamp} />}
        {figure && !pushMorph && !ditherImage && <ToneRamp library={NECK_LIBRARY} value={neckStamp} onChange={setNeckStamp} />}
        <DitherControls led={Boolean(figure)} field value={ditherSettings} onChange={setDitherSettings}
          defaults={imageMerge ? IMAGE_MERGE_DEFAULTS : ditherImage ? IMAGE_DITHER_DEFAULTS : editableImages ? PUSH_MORPH_IMAGE_DEFAULTS : pushMorph ? PUSH_MORPH_DEFAULTS : undefined}
          rimBlocks={pushMorph || ditherImage}
          onReplay={figure && !editableImages && !ditherImage ? () => { if (canvas.current) replayStepSequence(canvas.current); } : undefined} />
        {!figure && <TrailControls value={trails} onChange={setTrails} />}
      </CellLibrary>}
      {neurons && <DendriticControls settings={linkage} onChange={setLinkage} />}
      {sequenceStudio && <div className={styles.sequenceBar}>
        {([{
          act: 1 as const,
          title: "Act 1 · first sequence",
          centerLabel: mainImageLabel,
          centerInput,
          surrounds: stepImages,
          addInput: imageInput,
        }, {
          act: 2 as const,
          title: "Act 2 · new center + surrounds",
          centerLabel: nextImageLabel || "Empty",
          centerInput: nextCenterInput,
          surrounds: nextStepImages,
          addInput: nextImageInput,
        }]).map(row => <div key={row.act} className={styles.sequenceAct}>
          <p className={styles.sequenceActTitle}>{row.title}</p>
          <div className={styles.sequenceSlots}>
            <label className={styles.sequenceSlot}>
              <span>{row.act === 1 ? "Center" : "Center 2"}</span>
              <strong>{row.centerLabel}</strong>
              <input ref={row.centerInput} type="file" aria-label={row.act === 1 ? "Replace center image" : "Replace second center image"} accept="image/*"
                onChange={event => { void replaceCenterImage(event.target.files, row.act); }} />
              {row.act === 2 && !nextImageLabel ? "Upload" : "Replace"}
            </label>
            {row.surrounds.map((step, index) => <div className={styles.sequenceSlot} key={`${row.act}-${step.label ?? "surround"}-${index}`}>
              <span>Surround {index + 1}</span>
              <strong>{step.label ?? `Image ${index + 1}`}</strong>
              <div className={styles.sequenceOrder}>
                <button type="button" aria-label={`Move act ${row.act} surround ${index + 1} earlier`} disabled={index === 0} onClick={() => moveSurround(index, -1, row.act)}>↑</button>
                <button type="button" aria-label={`Move act ${row.act} surround ${index + 1} later`} disabled={index === row.surrounds.length - 1} onClick={() => moveSurround(index, 1, row.act)}>↓</button>
              </div>
              <label>
                <input type="file" aria-label={`Replace act ${row.act} surround ${index + 1}`} accept="image/*"
                  onChange={event => { replaceSurroundAct.current = row.act; replaceSurroundIndex.current = index; void replaceSurroundImage(event.target.files, index, row.act); }} />
                Replace
              </label>
            </div>)}
            <label className={styles.sequenceSlot}>
              <span>Next surround</span>
              <strong>{row.surrounds.length + 1}</strong>
              <input ref={row.addInput} type="file" aria-label={`Add act ${row.act} surround image`} accept="image/*"
                onChange={event => { void addFigureImages(event.target.files, row.act); }} />
              Add
            </label>
          </div>
        </div>)}
        <div className={styles.sequencePlay}>
          <button type="button" className={styles.playButton} onClick={playSequence}>Play sequence</button>
          <button type="button" className={styles.showAll} aria-pressed={!sequencePlaying && sequencePreview === 1} onClick={() => showSequenceScene(1)}>Scene 1</button>
          <button type="button" className={styles.showAll} aria-pressed={!sequencePlaying && sequencePreview === 2} onClick={() => showSequenceScene(2)}>Scene 2</button>
          {([{ key: "delay", label: "Delay", max: 8 }, { key: "appear", label: "Appear", max: 3 }, { key: "gap", label: "Gap", max: 6 }, { key: "fade", label: "Fade", max: 6 }] as const).map(control =>
            <label key={control.key}>{control.label}
              <output>{sequence[control.key].toFixed(1)} s</output>
              <input type="range" min={0} max={control.max} step={.1} value={sequence[control.key]}
                aria-label={`${control.label} time in seconds`}
                onChange={event => setSequence(current => ({ ...current, [control.key]: Number(event.target.value) }))} />
            </label>)}
        </div>
      </div>}
      {error && <p className={styles.error} role="alert">The pattern couldn’t render. Reload in a browser with Canvas support.</p>}
    </section>
    <noscript><p>Enable JavaScript to view the generative pattern.</p></noscript>
  </main>;
}
