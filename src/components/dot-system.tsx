"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { StudyNav } from "./study-nav";
import { drawDotField } from "@/lib/dot-field";
import type { DotFieldLayout } from "@/lib/dot-field";
import { clampShadowSize, DITHER_FIELD_DEFAULTS, FIGURE_LED_DEFAULTS, IMAGE_DITHER_DEFAULTS, IMAGE_MERGE_DEFAULTS, MEDIA_PAIR_DEFAULTS, PUSH_MORPH_DEFAULTS, PUSH_MORPH_IMAGE_DEFAULTS, SHADOW_SIZE_DEFAULT, SHADOW_SIZE_MAX, SHADOW_SIZE_MIN, TYPE_AREA_FIELD_DEFAULTS, MORPH_0918_LIBRARY, MORPH_LIBRARY, NECK_LIBRARY, STEP_LIBRARY, TONAL_LIBRARY, type DitherStamp } from "@/lib/dither-cells";
import { clampMediaWipe, MEDIA_BLEED_DEFAULT, MEDIA_BLEED_MAX, MEDIA_BLEED_MIN, MEDIA_PAIR_WIPE_DEFAULT, MEDIA_RANDOM_DEFAULT, MEDIA_RANDOM_MAX, MEDIA_RANDOM_MIN } from "@/lib/media-pair";
import { replayStepSequence, MORPH_IMAGE_OVERLAYS, SEQUENCE_DEFAULTS, STEP_OVERLAYS, type SequenceStudio, type SequenceTiming, type StepOverlaySpec } from "@/lib/step-overlays";
import { clampTypeBar, clampTypeFace, clampTypeField, clampTypeFont, clampTypeTrack, renderTypeArea, renderTypeBlock, typeBlockFromSetup, typeBlockLabel, TYPE_AREA_ACT2, TYPE_AREA_ACT2_BAR_HEIGHT, TYPE_AREA_ACT2_BAR_WIDTH, TYPE_AREA_ACT2_FONT, TYPE_AREA_ANCHOR, TYPE_AREA_BAR_HEIGHT, TYPE_AREA_BAR_HEIGHT_MAX, TYPE_AREA_BAR_MAX, TYPE_AREA_BAR_MIN, TYPE_AREA_BAR_WIDTH, TYPE_AREA_DEFAULT, TYPE_AREA_FACE, TYPE_AREA_FACES, TYPE_AREA_FIELD, TYPE_AREA_FONT, TYPE_AREA_FONT_MAX, TYPE_AREA_FONT_MIN, TYPE_AREA_TRACK, TYPE_AREA_TRACK_MAX, TYPE_AREA_TRACK_MIN, TYPE_SURROUND_ACT2, TYPE_SURROUND_DEFAULTS, type TypeBlockSpec, type TypeFace, type TypeSetupImage, type TypeStyle } from "@/lib/type-area";
import styles from "./dot-system.module.css";
import { CellLibrary, RimBlockSet, ToneRamp } from "./cell-library";
import { TrailControls } from "./trail-controls";
import { TRAIL_DEFAULTS } from "@/lib/domain-trails";
import { DitherControls } from "./dither-controls";
import { DendriticControls } from "./dendritic-layer";
import { LINKAGE_DEFAULTS } from "@/lib/component-linkage";

const EMPTY_OVERLAYS: typeof MORPH_IMAGE_OVERLAYS = [];

function defaultFigureAnchor(bounds: { width: number; height: number }, ditherImage: boolean, typeArea: boolean) {
  if (ditherImage) {
    const gutter = Math.min(260, bounds.width * .26);
    const usable = Math.max(bounds.width * .55, bounds.width - gutter);
    return { x: usable / 2, y: bounds.height / 2 };
  }
  if (typeArea) return { x: bounds.width * TYPE_AREA_ANCHOR.x, y: bounds.height * TYPE_AREA_ANCHOR.y };
  return { x: bounds.width * .489, y: bounds.height * .442 };
}

function typeStyleOf(step: { typeFace?: TypeFace; typeTrack?: number; face?: TypeFace; track?: number }): TypeStyle {
  return {
    face: clampTypeFace(step.typeFace ?? step.face),
    track: clampTypeTrack(step.typeTrack ?? step.track ?? TYPE_AREA_TRACK),
  };
}

function makeTypeStep(spec: TypeBlockSpec, stage: number): StepOverlaySpec {
  const style = typeStyleOf(spec);
  return {
    image: renderTypeBlock(spec.copy, spec.fontSize, spec.fieldWidth, stage, style),
    label: typeBlockLabel(spec.copy),
    cx: spec.cx,
    cy: spec.cy,
    size: clampTypeField(spec.fieldWidth),
    typeCopy: spec.copy,
    typeFontSize: clampTypeFont(spec.fontSize),
    typeBarWidth: clampTypeBar(spec.barWidth ?? TYPE_AREA_BAR_WIDTH),
    typeBarHeight: clampTypeBar(spec.barHeight ?? TYPE_AREA_BAR_HEIGHT, TYPE_AREA_BAR_HEIGHT_MAX),
    typeFace: style.face,
    typeTrack: style.track,
  };
}

function refreshTypeSteps(items: StepOverlaySpec[], stage: number) {
  return items.map(step => typeof step.typeCopy === "string"
    ? { ...step, image: renderTypeBlock(step.typeCopy, step.typeFontSize ?? TYPE_AREA_FONT, step.size, stage, typeStyleOf(step)), label: typeBlockLabel(step.typeCopy) }
    : step);
}

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

export function DotSystem({ rectangular = false, multiple = false, neurons = false, dither = false, figure, pushMorph = false, gridOnly = false, editableImages = false, sequenceStudio = false, ditherImage = false, imageMerge = false, typeArea = false, mediaPair = false }: { rectangular?: boolean; multiple?: boolean; neurons?: boolean; dither?: boolean; figure?: string; pushMorph?: boolean; gridOnly?: boolean; editableImages?: boolean; sequenceStudio?: boolean; ditherImage?: boolean; imageMerge?: boolean; typeArea?: boolean; mediaPair?: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const seed = useRef<number | null>(null);
  const layout = useRef<DotFieldLayout | null>(null);
  const headlinePosition = useRef<{ x: number; y: number } | null>(null);
  const figurePosition = useRef<{ x: number; y: number } | null>(null);
  const [mainImageSize, setMainImageSize] = useState(ditherImage ? .62 : typeArea ? TYPE_AREA_FIELD : editableImages ? .14 : .158);
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
  const [mainImageLabel, setMainImageLabel] = useState(mediaPair ? "innate-plant-cutout.jpg" : ditherImage ? "intelligence.png" : typeArea ? "Type area" : editableImages ? "1.png" : "innate-os-card.png");
  const [mediaWipe, setMediaWipe] = useState(MEDIA_PAIR_WIPE_DEFAULT);
  const mediaWipeRef = useRef(mediaWipe);
  mediaWipeRef.current = mediaWipe;
  const [mediaWipePlaying, setMediaWipePlaying] = useState(false);
  const [mediaRandom, setMediaRandom] = useState(MEDIA_RANDOM_DEFAULT);
  const mediaRandomRef = useRef(mediaRandom);
  mediaRandomRef.current = mediaRandom;
  const [mediaBleed, setMediaBleed] = useState(MEDIA_BLEED_DEFAULT);
  const mediaBleedRef = useRef(mediaBleed);
  mediaBleedRef.current = mediaBleed;
  const [typeCopy, setTypeCopy] = useState(TYPE_AREA_DEFAULT);
  const [typeFontSize, setTypeFontSize] = useState(TYPE_AREA_FONT);
  const [typeFieldWidth, setTypeFieldWidth] = useState(TYPE_AREA_FIELD);
  const [typeBarWidth, setTypeBarWidth] = useState(TYPE_AREA_BAR_WIDTH);
  const [typeBarHeight, setTypeBarHeight] = useState(TYPE_AREA_BAR_HEIGHT);
  const [typeFace, setTypeFace] = useState<TypeFace>(TYPE_AREA_FACE);
  const [typeTrack, setTypeTrack] = useState(TYPE_AREA_TRACK);
  const [nextTypeCopy, setNextTypeCopy] = useState(typeArea ? TYPE_AREA_ACT2 : "");
  const [nextTypeFontSize, setNextTypeFontSize] = useState(TYPE_AREA_ACT2_FONT);
  const [nextTypeBarWidth, setNextTypeBarWidth] = useState(TYPE_AREA_ACT2_BAR_WIDTH);
  const [nextTypeBarHeight, setNextTypeBarHeight] = useState(TYPE_AREA_ACT2_BAR_HEIGHT);
  const [nextTypeFace, setNextTypeFace] = useState<TypeFace>(TYPE_AREA_FACE);
  const [nextTypeTrack, setNextTypeTrack] = useState(TYPE_AREA_TRACK);
  const [nextCenterIsType, setNextCenterIsType] = useState(typeArea);
  const [typeEdit, setTypeEdit] = useState<{ act: 1 | 2; slot: "center" | number }>({ act: 1, slot: "center" });
  const [shadowWidth, setShadowWidth] = useState(SHADOW_SIZE_DEFAULT);
  const [shadowHeight, setShadowHeight] = useState(SHADOW_SIZE_DEFAULT);
  const [nextShadowWidth, setNextShadowWidth] = useState(SHADOW_SIZE_DEFAULT);
  const [nextShadowHeight, setNextShadowHeight] = useState(SHADOW_SIZE_DEFAULT);
  const [stageWidth, setStageWidth] = useState(0);
  const [centerIsType, setCenterIsType] = useState(typeArea);
  const typeSeeded = useRef(false);
  const typeFieldWidthRef = useRef(typeFieldWidth);
  typeFieldWidthRef.current = typeFieldWidth;
  const [sequence, setSequence] = useState<SequenceTiming>(SEQUENCE_DEFAULTS);
  const [sequencePlaying, setSequencePlaying] = useState(false);
  const [sequencePreview, setSequencePreview] = useState<1 | 2>(1);
  const [sequenceOpen, setSequenceOpen] = useState(true);
  const [nextImageLabel, setNextImageLabel] = useState(typeArea ? typeBlockLabel(TYPE_AREA_ACT2) : "");
  const [nextImageSize, setNextImageSize] = useState(typeArea ? TYPE_AREA_FIELD : .14);
  const nextImageSizeRef = useRef(nextImageSize);
  nextImageSizeRef.current = nextImageSize;
  const [dragging, setDragging] = useState(false);
  const [nextFigureImage, setNextFigureImage] = useState<CanvasImageSource | null>(null);
  const [nextStepImages, setNextStepImages] = useState<StepOverlaySpec[]>([]);
  const nextFigureRef = useRef(nextFigureImage);
  if (nextFigureImage) nextFigureRef.current = nextFigureImage;
  const nextStepsRef = useRef(nextStepImages);
  if (!dragging) nextStepsRef.current = nextStepImages;
  const sequencePreviewRef = useRef(sequencePreview);
  sequencePreviewRef.current = sequencePreview;
  const sequenceRef = useRef<SequenceStudio | null>(null);
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
  const fieldDefaults = mediaPair ? MEDIA_PAIR_DEFAULTS : imageMerge ? IMAGE_MERGE_DEFAULTS : ditherImage ? IMAGE_DITHER_DEFAULTS : typeArea ? TYPE_AREA_FIELD_DEFAULTS : editableImages ? PUSH_MORPH_IMAGE_DEFAULTS : pushMorph ? PUSH_MORPH_DEFAULTS : figure || gridOnly ? FIGURE_LED_DEFAULTS : DITHER_FIELD_DEFAULTS;
  const [ditherSettings, setDitherSettings] = useState(fieldDefaults);
  sequenceRef.current = sequenceStudio ? {
    ...sequence,
    playing: sequencePlaying,
    preview: sequencePreview,
    nextFigure: nextFigureRef.current ?? nextFigureImage ?? undefined,
    nextFigureSize: nextImageSizeRef.current,
    nextSteps: nextStepsRef.current,
    typeBarWidth,
    typeBarHeight,
    nextTypeBarWidth,
    nextTypeBarHeight,
    shadowWidth,
    shadowHeight,
    nextShadowWidth,
    nextShadowHeight,
  } : null;
  const defaultOverlays = typeArea ? EMPTY_OVERLAYS : editableImages ? MORPH_IMAGE_OVERLAYS : STEP_OVERLAYS;
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
  const [figureImage, setFigureImage] = useState<CanvasImageSource | null>(null);
  const figureRef = useRef(figureImage);
  figureRef.current = figureImage;
  const [stepImages, setStepImages] = useState<StepOverlaySpec[]>([]);
  const stepsRef = useRef(stepImages);
  if (!dragging) stepsRef.current = stepImages;
  const imageInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (typeArea) return;
    if (!figure) { setFigureImage(null); return; }
    let cancelled = false;
    const image = new Image();
    image.onload = () => { if (!cancelled) setFigureImage(image); };
    image.onerror = () => { if (!cancelled) setError(true); };
    image.src = figure;
    return () => { cancelled = true; };
  }, [figure, typeArea]);

  useEffect(() => {
    if (!typeArea) return;
    let cancelled = false;
    const paint = () => {
      if (cancelled) return;
      const stage = canvas.current?.getBoundingClientRect().width || stageWidth || 1000;
      if (centerIsType) {
        setFigureImage(renderTypeArea(typeCopy, { fontSize: typeFontSize, fieldWidth: Math.round(typeFieldWidth * stage), face: typeFace, track: typeTrack }));
        setMainImageLabel(typeBlockLabel(typeCopy));
      }
      if (nextCenterIsType) {
        const image = renderTypeArea(nextTypeCopy, { fontSize: nextTypeFontSize, fieldWidth: Math.round(nextImageSize * stage), face: nextTypeFace, track: nextTypeTrack });
        nextFigureRef.current = image;
        setNextFigureImage(image);
        setNextImageLabel(nextTypeCopy.trim() ? typeBlockLabel(nextTypeCopy) : "Empty");
      }
      if (!typeSeeded.current) {
        typeSeeded.current = true;
        setStepImages(TYPE_SURROUND_DEFAULTS.map(spec => makeTypeStep(spec, stage)));
        setNextStepImages(TYPE_SURROUND_ACT2.map(spec => makeTypeStep(spec, stage)));
      } else {
        setStepImages(current => refreshTypeSteps(current, stage));
        setNextStepImages(current => refreshTypeSteps(current, stage));
      }
    };
    if (document.fonts?.load) void Promise.all(TYPE_AREA_FACES.map(face => document.fonts.load(`${typeFontSize}px ${face}`))).finally(paint);
    else paint();
    return () => { cancelled = true; };
  }, [typeArea, typeCopy, centerIsType, typeFontSize, typeFieldWidth, stageWidth, nextCenterIsType, nextTypeCopy, nextTypeFontSize, nextImageSize, typeFace, typeTrack, nextTypeFace, nextTypeTrack]);

  useEffect(() => {
    if (!figure || ditherImage || typeArea) { if (!typeArea) setStepImages([]); return; }
    let cancelled = false;
    Promise.all(defaultOverlays.map(step => new Promise<StepOverlaySpec>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve({ ...step, image });
      image.onerror = () => reject(new Error(`Could not load ${step.src}`));
      image.src = step.src;
    }))).then(steps => { if (!cancelled) setStepImages(steps); }).catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, [figure, defaultOverlays, ditherImage, typeArea]);

  useEffect(() => {
    if (!canvas.current) return;
    seed.current ??= crypto.getRandomValues(new Uint32Array(1))[0];
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    let animation = 0, lastDraw = 0;
    const draw = (time = 0) => {
      try {
        if (mediaPair) {
          canvas.current!.dataset.mediaPair = "1";
          canvas.current!.dataset.mediaWipe = String(mediaWipeRef.current);
          canvas.current!.dataset.mediaRandom = String(mediaRandomRef.current);
          canvas.current!.dataset.mediaBleed = String(mediaBleedRef.current);
        } else {
          delete canvas.current!.dataset.mediaPair;
          delete canvas.current!.dataset.mediaWipe;
          delete canvas.current!.dataset.mediaRandom;
          delete canvas.current!.dataset.mediaBleed;
        }
        layout.current = drawDotField(canvas.current!, seed.current!, time, headlinePosition.current, rectangular, (multiple || gridOnly) && !figure ? objectPositions.current : undefined, neurons ? linkage : undefined, dither ? stampRef.current : undefined, ditherSettingsRef.current, dither && !figure ? trailsRef.current : undefined, figureRef.current ?? undefined, figure && !ditherImage ? stepsRef.current : undefined, figure && !ditherImage ? stepStampRef.current : undefined, figure && !ditherImage ? neckStampRef.current : undefined, pushMorph, gridOnly, figurePosition.current, editableImages, mainImageSizeRef.current, sequenceRef.current, ditherImage, imageMerge) ?? null;
      }
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
      const bounds = canvas.current!.getBoundingClientRect();
      if (bounds.width) setStageWidth(bounds.width);
      if ((editableImages || ditherImage) && !figurePosition.current) {
        figurePosition.current = defaultFigureAnchor(bounds, ditherImage, typeArea);
      }
      draw(media.matches ? 0 : performance.now());
    });
    observer.observe(canvas.current);
    if ((editableImages || ditherImage) && !figurePosition.current) {
      const bounds = canvas.current.getBoundingClientRect();
      if (bounds.width && bounds.height) figurePosition.current = defaultFigureAnchor(bounds, ditherImage, typeArea);
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
  }, [rectangular, multiple, neurons, dither, linkage, figure, figureImage, stepImages, pushMorph, gridOnly, editableImages, nextFigureImage, nextStepImages, ditherImage, imageMerge, typeArea, mediaPair]);

  useEffect(() => {
    if (sequencePlaying || (!dither && !gridOnly) || !window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const frame = requestAnimationFrame(() => {
      if (!canvas.current || seed.current === null) return;
      try {
        if (mediaPair) {
          canvas.current.dataset.mediaPair = "1";
          canvas.current.dataset.mediaWipe = String(mediaWipeRef.current);
          canvas.current.dataset.mediaRandom = String(mediaRandomRef.current);
          canvas.current.dataset.mediaBleed = String(mediaBleedRef.current);
        } else {
          delete canvas.current.dataset.mediaPair;
          delete canvas.current.dataset.mediaWipe;
          delete canvas.current.dataset.mediaRandom;
          delete canvas.current.dataset.mediaBleed;
        }
        layout.current = drawDotField(canvas.current, seed.current, 0, headlinePosition.current, rectangular,
        (multiple || gridOnly) && !figure ? objectPositions.current : undefined, neurons ? linkage : undefined, stamp, ditherSettingsRef.current, dither && !figure ? trailsRef.current : undefined, figureRef.current ?? undefined, figure && !ditherImage ? stepsRef.current : undefined, figure && !ditherImage ? stepStamp : undefined, figure && !ditherImage ? neckStamp : undefined, pushMorph, gridOnly, figurePosition.current, editableImages, mainImageSizeRef.current, sequenceRef.current, ditherImage, imageMerge) ?? null; }
      catch { setError(true); }
    });
    return () => cancelAnimationFrame(frame);
  }, [ditherSettings, trails, dither, rectangular, multiple, neurons, linkage, stamp, stepStamp, neckStamp, figure, figureImage, pushMorph, gridOnly, editableImages, mainImageSize, sequence, sequencePlaying, sequencePreview, nextFigureImage, nextStepImages, nextImageSize, ditherImage, imageMerge, typeBarWidth, typeBarHeight, nextTypeBarWidth, nextTypeBarHeight, shadowWidth, shadowHeight, nextShadowWidth, nextShadowHeight, mediaWipe, mediaRandom, mediaBleed]);

  useEffect(() => {
    if (!mediaPair || !mediaWipePlaying) return;
    const started = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const travel = Math.min(1, (now - started) / 1800);
      setMediaWipe(clampMediaWipe(travel));
      if (travel < 1) frame = requestAnimationFrame(tick);
      else setMediaWipePlaying(false);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [mediaPair, mediaWipePlaying]);

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
        shadowWidth: SHADOW_SIZE_DEFAULT,
        shadowHeight: SHADOW_SIZE_DEFAULT,
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
        setCenterIsType(false);
        setFigureImage(image);
        setMainImageLabel(label);
      }
    } catch {
      setError(true);
    }
    if (act === 2 && nextCenterInput.current) nextCenterInput.current.value = "";
    if (act === 1 && centerInput.current) centerInput.current.value = "";
  };

  const restoreDefaultFigure = () => {
    if (typeArea) {
      const stage = stagePx();
      typeSeeded.current = true;
      setCenterIsType(true);
      setTypeCopy(TYPE_AREA_DEFAULT);
      setTypeFontSize(TYPE_AREA_FONT);
      applyTypeFieldWidth(TYPE_AREA_FIELD);
      setTypeBarWidth(TYPE_AREA_BAR_WIDTH);
      setTypeBarHeight(TYPE_AREA_BAR_HEIGHT);
      setTypeFace(TYPE_AREA_FACE);
      setTypeTrack(TYPE_AREA_TRACK);
      setNextCenterIsType(true);
      setNextTypeCopy(TYPE_AREA_ACT2);
      setNextTypeFontSize(TYPE_AREA_ACT2_FONT);
      setNextTypeBarWidth(TYPE_AREA_ACT2_BAR_WIDTH);
      setNextTypeBarHeight(TYPE_AREA_ACT2_BAR_HEIGHT);
      setNextTypeFace(TYPE_AREA_FACE);
      setNextTypeTrack(TYPE_AREA_TRACK);
      nextImageSizeRef.current = TYPE_AREA_FIELD;
      setNextImageSize(TYPE_AREA_FIELD);
      setStepImages(TYPE_SURROUND_DEFAULTS.map(spec => makeTypeStep(spec, stage)));
      setNextStepImages(TYPE_SURROUND_ACT2.map(spec => makeTypeStep(spec, stage)));
      setTypeEdit({ act: 1, slot: "center" });
      setMainImageLabel(typeBlockLabel(TYPE_AREA_DEFAULT));
      const bounds = canvas.current?.getBoundingClientRect();
      if (bounds?.width && bounds.height) figurePosition.current = defaultFigureAnchor(bounds, false, true);
      return;
    }
    if (mediaPair) {
      setMediaWipe(MEDIA_PAIR_WIPE_DEFAULT);
      setMediaWipePlaying(false);
    }
    if (!figure) {
      if (mediaPair) {
        setFigureImage(null);
        setMainImageLabel("");
      }
      return;
    }
    const image = new Image();
    image.onload = () => {
      setFigureImage(image);
      setMainImageLabel(figure.split("/").pop()?.replace(/%20/g, " ") ?? "intelligence.png");
    };
    image.src = figure;
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
      typeBarWidth,
      typeBarHeight,
      nextTypeBarWidth,
      nextTypeBarHeight,
      shadowWidth,
      shadowHeight,
      nextShadowWidth,
      nextShadowHeight,
    };
    setSequencePlaying(false);
    setSequencePreview(preview);
    setTypeEdit(current => current.act === preview ? current : { act: preview, slot: "center" });
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
      typeBarWidth,
      typeBarHeight,
      nextTypeBarWidth,
      nextTypeBarHeight,
      shadowWidth,
      shadowHeight,
      nextShadowWidth,
      nextShadowHeight,
    };
    setSequencePreview(1);
    setSequencePlaying(true);
  };

  const beginDrag = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if ((!mediaPair && figure && !editableImages && !ditherImage) || !layout.current) return;
    const point = canvasPoint(event);
    const objects = layout.current.objects ?? [{ bounds: layout.current.headlineBounds, anchor: layout.current.headlineAnchor }];
    const hit = objects.findLastIndex(({ bounds }) => point.x >= bounds.left && point.x <= bounds.right
      && point.y >= bounds.top && point.y <= bounds.bottom);
    if (hit < 0) {
      if (editableImages || ditherImage) {
        selectedImageRef.current = null;
        setSelectedImage(null);
      }
      return;
    }
    if (editableImages || ditherImage) {
      selectedImageRef.current = hit;
      setSelectedImage(hit);
      if (sequenceStudio) setTypeEdit({ act: editingSecondAct() ? 2 : 1, slot: hit === 0 ? "center" : hit - 1 });
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
    if (figure && (editableImages || ditherImage)) {
      if (activeObject.current === 0) figurePosition.current = position;
      else if (editableImages) {
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
    if (sequenceStudio) setTypeEdit({ act: editingSecondAct() ? 2 : 1, slot: "center" });
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
  const selectedIsType = () => {
    const selected = selectedImageRef.current;
    if (!typeArea || selected === null) return false;
    if (selected === 0) return editingSecondAct() ? nextCenterIsType : centerIsType;
    return typeof (editingSecondAct() ? nextStepsRef.current : stepsRef.current)[selected - 1]?.typeCopy === "string";
  };
  const resizingTypeField = () => selectedIsType();
  const applyTypeFieldWidth = (width: number) => {
    const next = clampTypeField(width);
    typeFieldWidthRef.current = next;
    setTypeFieldWidth(next);
    mainImageSizeRef.current = next;
    setMainImageSize(next);
  };
  const stagePx = () => canvas.current?.getBoundingClientRect().width || stageWidth || 1000;
  const applySelectedTypeField = (width: number) => {
    const next = clampTypeField(width);
    const selected = selectedImageRef.current;
    if (selected === null) return;
    if (selected === 0) {
      if (editingSecondAct()) {
        nextImageSizeRef.current = next;
        setNextImageSize(next);
      } else applyTypeFieldWidth(next);
      return;
    }
    const apply = (items: StepOverlaySpec[]) => items.map((step, index) => {
      if (index !== selected - 1 || typeof step.typeCopy !== "string") return step;
      return { ...step, size: next, image: renderTypeBlock(step.typeCopy, step.typeFontSize ?? 36, next, stagePx(), typeStyleOf(step)) };
    });
    if (editingSecondAct()) {
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
    const fieldResize = resizingTypeField();
    resizeDrag.current = {
      pointer: event.pointerId,
      distance: Math.max(1, fieldResize ? Math.abs(x - object.anchor.x) : Math.hypot(x - object.anchor.x, y - object.anchor.y)),
      size: fieldResize ? typeFieldWidthRef.current : selectedSize,
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
    if (resizingTypeField()) {
      const half = Math.abs(x - object.anchor.x);
      object.bounds = { ...object.bounds, left: object.anchor.x - half, right: object.anchor.x + half };
      applySelectedTypeField(start.size * half / start.distance);
    } else {
      const distance = Math.hypot(x - object.anchor.x, y - object.anchor.y);
      updateSelectedSize(Math.max(.06, Math.min(ditherImage ? .95 : typeArea ? .75 : .4, start.size * distance / start.distance)));
    }
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
      study: typeArea ? "10_text area" : sequenceStudio ? "10_5" : "10_4",
      typeCopy: typeArea && centerIsType ? typeCopy : undefined,
      typeFontSize: typeArea && centerIsType ? typeFontSize : undefined,
      typeFieldWidth: typeArea && centerIsType ? typeFieldWidth : undefined,
      typeBarWidth: typeArea && centerIsType ? typeBarWidth : undefined,
      typeBarHeight: typeArea && centerIsType ? typeBarHeight : undefined,
      typeFace: typeArea && centerIsType ? typeFace : undefined,
      typeTrack: typeArea && centerIsType ? typeTrack : undefined,
      nextTypeCopy: typeArea && nextCenterIsType ? nextTypeCopy : undefined,
      nextTypeFontSize: typeArea && nextCenterIsType ? nextTypeFontSize : undefined,
      nextTypeBarWidth: typeArea && nextCenterIsType ? nextTypeBarWidth : undefined,
      nextTypeBarHeight: typeArea && nextCenterIsType ? nextTypeBarHeight : undefined,
      nextTypeFace: typeArea && nextCenterIsType ? nextTypeFace : undefined,
      nextTypeTrack: typeArea && nextCenterIsType ? nextTypeTrack : undefined,
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
          typeCopy: typeArea && centerIsType ? typeCopy : undefined,
          typeFontSize: typeArea && centerIsType ? typeFontSize : undefined,
          typeBarWidth: typeArea && centerIsType ? typeBarWidth : undefined,
          typeBarHeight: typeArea && centerIsType ? typeBarHeight : undefined,
          typeFace: typeArea && centerIsType ? typeFace : undefined,
          typeTrack: typeArea && centerIsType ? typeTrack : undefined,
          shadowWidth: !typeArea ? shadowWidth : undefined,
          shadowHeight: !typeArea ? shadowHeight : undefined,
        },
        ...stepsRef.current.map((step, index) => ({
          name: step.label ?? `Image ${index + 2}`,
          xPercent: percent(step.cx),
          yPercent: percent(step.cy),
          sizePercent: percent(step.size),
          typeCopy: step.typeCopy,
          typeFontSize: step.typeFontSize,
          typeBarWidth: step.typeBarWidth,
          typeBarHeight: step.typeBarHeight,
          typeFace: step.typeFace,
          typeTrack: step.typeTrack,
          shadowWidth: step.shadowWidth,
          shadowHeight: step.shadowHeight,
        })),
      ],
      nextImages: sequenceStudio ? [
        {
          name: nextImageLabel,
          xPercent: percent(mainAnchor && canvasBounds ? mainAnchor.x / canvasBounds.width : .5),
          yPercent: percent(mainAnchor && canvasBounds ? mainAnchor.y / canvasBounds.height : .5),
          sizePercent: percent(nextImageSize),
          typeCopy: typeArea && nextCenterIsType ? nextTypeCopy : undefined,
          typeFontSize: typeArea && nextCenterIsType ? nextTypeFontSize : undefined,
          typeBarWidth: typeArea && nextCenterIsType ? nextTypeBarWidth : undefined,
          typeBarHeight: typeArea && nextCenterIsType ? nextTypeBarHeight : undefined,
          typeFace: typeArea && nextCenterIsType ? nextTypeFace : undefined,
          typeTrack: typeArea && nextCenterIsType ? nextTypeTrack : undefined,
          shadowWidth: !typeArea ? nextShadowWidth : undefined,
          shadowHeight: !typeArea ? nextShadowHeight : undefined,
        },
        ...nextStepsRef.current.map((step, index) => ({
          name: step.label ?? `Image ${index + 2}`,
          xPercent: percent(step.cx),
          yPercent: percent(step.cy),
          sizePercent: percent(step.size),
          typeCopy: step.typeCopy,
          typeFontSize: step.typeFontSize,
          typeBarWidth: step.typeBarWidth,
          typeBarHeight: step.typeBarHeight,
          typeFace: step.typeFace,
          typeTrack: step.typeTrack,
          shadowWidth: step.shadowWidth,
          shadowHeight: step.shadowHeight,
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
        images?: TypeSetupImage[];
        nextImages?: TypeSetupImage[];
        typeCopy?: string;
        typeFontSize?: number;
        typeFieldWidth?: number;
        typeBarWidth?: number;
        typeBarHeight?: number;
        typeFace?: TypeFace;
        typeTrack?: number;
        nextTypeCopy?: string;
        nextTypeFontSize?: number;
        nextTypeBarWidth?: number;
        nextTypeBarHeight?: number;
        nextTypeFace?: TypeFace;
        nextTypeTrack?: number;
      };
      if (setup.version !== 1) throw new Error("This setup version is not supported.");

      const centerImage = setup.images?.[0];
      const nextCenterImage = setup.nextImages?.[0];
      const centerCopy = setup.typeCopy ?? centerImage?.typeCopy;
      const centerFont = setup.typeFontSize ?? centerImage?.typeFontSize;
      const centerBarW = setup.typeBarWidth ?? centerImage?.typeBarWidth;
      const centerBarH = setup.typeBarHeight ?? centerImage?.typeBarHeight;
      const centerFace = centerImage?.typeFace ?? setup.typeFace;
      const centerTrack = centerImage?.typeTrack ?? setup.typeTrack;
      const act2Copy = setup.nextTypeCopy ?? nextCenterImage?.typeCopy;
      const act2Font = setup.nextTypeFontSize ?? nextCenterImage?.typeFontSize;
      const act2BarW = setup.nextTypeBarWidth ?? nextCenterImage?.typeBarWidth;
      const act2BarH = setup.nextTypeBarHeight ?? nextCenterImage?.typeBarHeight;
      const act2Face = nextCenterImage?.typeFace ?? setup.nextTypeFace;
      const act2Track = nextCenterImage?.typeTrack ?? setup.nextTypeTrack;
      if (typeArea && typeof centerCopy === "string") {
        setCenterIsType(true);
        setTypeCopy(centerCopy);
      }
      if (typeArea && typeof centerFont === "number") setTypeFontSize(clampTypeFont(centerFont));
      if (typeArea && typeof setup.typeFieldWidth === "number") applyTypeFieldWidth(setup.typeFieldWidth);
      if (typeArea && typeof centerBarW === "number") setTypeBarWidth(clampTypeBar(centerBarW));
      if (typeArea && typeof centerBarH === "number") setTypeBarHeight(clampTypeBar(centerBarH, TYPE_AREA_BAR_HEIGHT_MAX));
      if (typeArea && typeof act2BarW === "number") setNextTypeBarWidth(clampTypeBar(act2BarW));
      if (typeArea && typeof act2BarH === "number") setNextTypeBarHeight(clampTypeBar(act2BarH, TYPE_AREA_BAR_HEIGHT_MAX));
      if (typeArea && typeof act2Copy === "string") {
        setNextCenterIsType(true);
        setNextTypeCopy(act2Copy);
      }
      if (typeArea && typeof act2Font === "number") setNextTypeFontSize(clampTypeFont(act2Font));
      if (typeArea) setTypeFace(clampTypeFace(centerFace));
      if (typeArea && typeof centerTrack === "number") setTypeTrack(clampTypeTrack(centerTrack));
      if (typeArea) setNextTypeFace(clampTypeFace(act2Face));
      if (typeArea && typeof act2Track === "number") setNextTypeTrack(clampTypeTrack(act2Track));

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

      const restoreOverlays = (others: TypeSetupImage[], current: StepOverlaySpec[], sizeMax: number) => {
        const stage = stagePx();
        if (typeArea && others.some(image => typeof image.typeCopy === "string")) {
          return others.flatMap(image => {
            const spec = typeBlockFromSetup(image);
            if (!spec) { missing++; return []; }
            return [makeTypeStep(spec, stage)];
          });
        }
        const available = [...current];
        return others.flatMap((image, index) => {
          let match = available.findIndex(step => step.label === image.name);
          if (match < 0 && !image.name && index < available.length) match = index;
          if (match < 0) { missing++; return []; }
          const [step] = available.splice(match, 1);
          const next = {
            ...step,
            cx: typeof image.xPercent === "number" ? Math.max(0, Math.min(1, image.xPercent / 100)) : step.cx,
            cy: typeof image.yPercent === "number" ? Math.max(0, Math.min(1, image.yPercent / 100)) : step.cy,
            size: typeof image.sizePercent === "number" ? Math.max(.06, Math.min(sizeMax, image.sizePercent / 100)) : step.size,
            typeCopy: typeof image.typeCopy === "string" ? image.typeCopy : step.typeCopy,
            typeFontSize: typeof image.typeFontSize === "number" ? clampTypeFont(image.typeFontSize) : step.typeFontSize,
            typeBarWidth: typeof image.typeBarWidth === "number" ? clampTypeBar(image.typeBarWidth) : step.typeBarWidth,
            typeBarHeight: typeof image.typeBarHeight === "number" ? clampTypeBar(image.typeBarHeight, TYPE_AREA_BAR_HEIGHT_MAX) : step.typeBarHeight,
            typeFace: image.typeFace ? clampTypeFace(image.typeFace) : step.typeFace,
            typeTrack: typeof image.typeTrack === "number" ? clampTypeTrack(image.typeTrack) : step.typeTrack,
            shadowWidth: typeof image.shadowWidth === "number" ? clampShadowSize(image.shadowWidth) : step.shadowWidth,
            shadowHeight: typeof image.shadowHeight === "number" ? clampShadowSize(image.shadowHeight) : step.shadowHeight,
          };
          return typeof next.typeCopy === "string"
            ? [{ ...next, image: renderTypeBlock(next.typeCopy, next.typeFontSize ?? 36, next.size, stage, typeStyleOf(next)), label: typeBlockLabel(next.typeCopy) }]
            : [next];
        });
      };

      if (Array.isArray(setup.images) && setup.images.length) {
        const [main, ...others] = setup.images;
        const bounds = canvas.current?.getBoundingClientRect();
        if (bounds && typeof main.xPercent === "number" && typeof main.yPercent === "number") {
          figurePosition.current = {
            x: bounds.width * Math.max(0, Math.min(1, main.xPercent / 100)),
            y: bounds.height * Math.max(0, Math.min(1, main.yPercent / 100)),
          };
        }
        if (typeof main.sizePercent === "number" && !(typeArea && typeof setup.typeFieldWidth === "number")) {
          const next = Math.max(typeArea ? TYPE_AREA_FIELD : .06, Math.min(typeArea ? .78 : .4, main.sizePercent / 100));
          if (typeArea) applyTypeFieldWidth(next);
          else setMainImageSize(next);
        }
        if (main.name) setMainImageLabel(main.name);
        if (!typeArea && typeof main.shadowWidth === "number") setShadowWidth(clampShadowSize(main.shadowWidth));
        if (!typeArea && typeof main.shadowHeight === "number") setShadowHeight(clampShadowSize(main.shadowHeight));
        const restored = restoreOverlays(others, stepsRef.current, .4);
        stepsRef.current = restored;
        setStepImages(restored);
      }

      if (sequenceStudio && Array.isArray(setup.nextImages) && setup.nextImages.length) {
        const [main, ...others] = setup.nextImages;
        if (typeof main.sizePercent === "number") {
          setNextImageSize(typeArea ? clampTypeField(main.sizePercent / 100) : Math.max(.06, Math.min(.4, main.sizePercent / 100)));
        }
        if (main.name) setNextImageLabel(main.name);
        if (!typeArea && typeof main.shadowWidth === "number") setNextShadowWidth(clampShadowSize(main.shadowWidth));
        if (!typeArea && typeof main.shadowHeight === "number") setNextShadowHeight(clampShadowSize(main.shadowHeight));
        const restored = restoreOverlays(others, nextStepsRef.current, .4);
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

  const selectTypeSlot = (act: 1 | 2, slot: "center" | number) => {
    setTypeEdit({ act, slot });
    if (act !== sequencePreview) showSequenceScene(act);
    const index = slot === "center" ? 0 : slot + 1;
    selectedImageRef.current = index;
    setSelectedImage(index);
  };
  const writeShadowSize = (axis: "width" | "height", value: number) => {
    const next = clampShadowSize(value);
    const { act, slot } = typeEdit;
    if (slot === "center") {
      if (act === 2) {
        if (axis === "width") setNextShadowWidth(next);
        else setNextShadowHeight(next);
      } else if (axis === "width") setShadowWidth(next);
      else setShadowHeight(next);
      return;
    }
    const apply = (items: StepOverlaySpec[]) => items.map((step, index) => {
      if (index !== slot) return step;
      return axis === "width" ? { ...step, shadowWidth: next } : { ...step, shadowHeight: next };
    });
    if (act === 2) setNextStepImages(apply);
    else setStepImages(apply);
  };
  const writeTypeCopy = (copy: string) => {
    const { act, slot } = typeEdit;
    if (slot === "center") {
      if (act === 2) {
        setNextCenterIsType(true);
        setNextTypeCopy(copy);
        setNextImageLabel(typeBlockLabel(copy));
      } else {
        setCenterIsType(true);
        setTypeCopy(copy);
        setMainImageLabel(typeBlockLabel(copy));
      }
      return;
    }
    const apply = (items: StepOverlaySpec[]) => items.map((step, index) => index === slot && typeof step.typeCopy === "string"
      ? { ...step, typeCopy: copy, image: renderTypeBlock(copy, step.typeFontSize ?? 36, step.size, stagePx(), typeStyleOf(step)), label: typeBlockLabel(copy) }
      : step);
    if (act === 2) setNextStepImages(apply);
    else setStepImages(apply);
  };
  const writeTypeFont = (fontSize: number) => {
    const next = clampTypeFont(fontSize);
    const { act, slot } = typeEdit;
    if (slot === "center") {
      if (act === 2) { setNextCenterIsType(true); setNextTypeFontSize(next); }
      else { setCenterIsType(true); setTypeFontSize(next); }
      return;
    }
    const apply = (items: StepOverlaySpec[]) => items.map((step, index) => {
      if (index !== slot || typeof step.typeCopy !== "string") return step;
      return { ...step, typeFontSize: next, image: renderTypeBlock(step.typeCopy, next, step.size, stagePx(), typeStyleOf(step)) };
    });
    if (act === 2) setNextStepImages(apply);
    else setStepImages(apply);
  };
  const writeTypeBar = (axis: "width" | "height", value: number) => {
    const next = clampTypeBar(value, axis === "height" ? TYPE_AREA_BAR_HEIGHT_MAX : TYPE_AREA_BAR_MAX);
    const { act, slot } = typeEdit;
    if (slot === "center") {
      if (act === 2) {
        if (axis === "width") setNextTypeBarWidth(next);
        else setNextTypeBarHeight(next);
      } else if (axis === "width") setTypeBarWidth(next);
      else setTypeBarHeight(next);
      return;
    }
    const apply = (items: StepOverlaySpec[]) => items.map((step, index) => {
      if (index !== slot || typeof step.typeCopy !== "string") return step;
      return axis === "width" ? { ...step, typeBarWidth: next } : { ...step, typeBarHeight: next };
    });
    if (act === 2) setNextStepImages(apply);
    else setStepImages(apply);
  };
  const writeTypeFace = (face: TypeFace) => {
    const next = clampTypeFace(face);
    const { act, slot } = typeEdit;
    if (slot === "center") {
      if (act === 2) { setNextCenterIsType(true); setNextTypeFace(next); }
      else { setCenterIsType(true); setTypeFace(next); }
      return;
    }
    const apply = (items: StepOverlaySpec[]) => items.map((step, index) => {
      if (index !== slot || typeof step.typeCopy !== "string") return step;
      return { ...step, typeFace: next, image: renderTypeBlock(step.typeCopy, step.typeFontSize ?? 36, step.size, stagePx(), typeStyleOf({ ...step, typeFace: next })) };
    });
    if (act === 2) setNextStepImages(apply);
    else setStepImages(apply);
  };
  const writeTypeTrack = (track: number) => {
    const next = clampTypeTrack(track);
    const { act, slot } = typeEdit;
    if (slot === "center") {
      if (act === 2) { setNextCenterIsType(true); setNextTypeTrack(next); }
      else { setCenterIsType(true); setTypeTrack(next); }
      return;
    }
    const apply = (items: StepOverlaySpec[]) => items.map((step, index) => {
      if (index !== slot || typeof step.typeCopy !== "string") return step;
      return { ...step, typeTrack: next, image: renderTypeBlock(step.typeCopy, step.typeFontSize ?? 36, step.size, stagePx(), typeStyleOf({ ...step, typeTrack: next })) };
    });
    if (act === 2) setNextStepImages(apply);
    else setStepImages(apply);
  };
  const addTypeSurround = (act: 1 | 2) => {
    const current = act === 2 ? nextStepsRef.current : stepsRef.current;
    const slots = act === 2
      ? [{ cx: .68, cy: .24 }, { cx: .78, cy: .72 }, { cx: .28, cy: .22 }, { cx: .52, cy: .84 }, { cx: .14, cy: .48 }, { cx: .86, cy: .52 }]
      : [{ cx: .72, cy: .22 }, { cx: .76, cy: .78 }, { cx: .48, cy: .18 }, { cx: .5, cy: .82 }, { cx: .12, cy: .52 }, { cx: .88, cy: .48 }];
    const place = slots[current.length % slots.length];
    const step = makeTypeStep({ copy: "Type", fontSize: 36, fieldWidth: .18, ...place }, stagePx());
    if (act === 2) setNextStepImages(items => [...items, step]);
    else setStepImages(items => [...items, step]);
    selectTypeSlot(act, current.length);
  };
  const addTypeCenter = () => {
    setNextCenterIsType(true);
    setNextTypeCopy(TYPE_AREA_ACT2);
    setNextTypeFontSize(TYPE_AREA_ACT2_FONT);
    setNextTypeBarWidth(TYPE_AREA_ACT2_BAR_WIDTH);
    setNextTypeBarHeight(TYPE_AREA_ACT2_BAR_HEIGHT);
    setNextTypeFace(TYPE_AREA_FACE);
    setNextTypeTrack(TYPE_AREA_TRACK);
    nextImageSizeRef.current = TYPE_AREA_FIELD;
    setNextImageSize(TYPE_AREA_FIELD);
    selectTypeSlot(2, "center");
  };
  const editingType = typeEdit.slot === "center"
    ? typeEdit.act === 2
      ? { copy: nextTypeCopy, fontSize: nextTypeFontSize, barWidth: nextTypeBarWidth, barHeight: nextTypeBarHeight, face: nextTypeFace, track: nextTypeTrack, title: "Act 2 · Center" }
      : { copy: typeCopy, fontSize: typeFontSize, barWidth: typeBarWidth, barHeight: typeBarHeight, face: typeFace, track: typeTrack, title: "Act 1 · Center" }
    : {
      copy: ((typeEdit.act === 2 ? nextStepImages : stepImages)[typeEdit.slot]?.typeCopy ?? ""),
      fontSize: ((typeEdit.act === 2 ? nextStepImages : stepImages)[typeEdit.slot]?.typeFontSize ?? 36),
      barWidth: ((typeEdit.act === 2 ? nextStepImages : stepImages)[typeEdit.slot]?.typeBarWidth ?? TYPE_AREA_BAR_WIDTH),
      barHeight: ((typeEdit.act === 2 ? nextStepImages : stepImages)[typeEdit.slot]?.typeBarHeight ?? TYPE_AREA_BAR_HEIGHT),
      face: clampTypeFace((typeEdit.act === 2 ? nextStepImages : stepImages)[typeEdit.slot]?.typeFace),
      track: clampTypeTrack((typeEdit.act === 2 ? nextStepImages : stepImages)[typeEdit.slot]?.typeTrack ?? TYPE_AREA_TRACK),
      title: `Act ${typeEdit.act} · Surround ${typeEdit.slot + 1}`,
    };
  const editingShadow = typeEdit.slot === "center"
    ? typeEdit.act === 2
      ? { width: nextShadowWidth, height: nextShadowHeight, title: "Act 2 · Center" }
      : { width: shadowWidth, height: shadowHeight, title: "Act 1 · Center" }
    : {
      width: ((typeEdit.act === 2 ? nextStepImages : stepImages)[typeEdit.slot]?.shadowWidth ?? SHADOW_SIZE_DEFAULT),
      height: ((typeEdit.act === 2 ? nextStepImages : stepImages)[typeEdit.slot]?.shadowHeight ?? SHADOW_SIZE_DEFAULT),
      title: `Act ${typeEdit.act} · Surround ${typeEdit.slot + 1}`,
    };

  return <main className={styles.workspace}>
    <header className={styles.header}>
      <StudyNav className={styles.navigation} />
      <h1 className={styles.title}>{mediaPair ? "Innate OS · Combined media" : imageMerge ? "Dithered image · Merge" : ditherImage ? "Dithered image" : typeArea ? "Innate OS · Text area" : sequenceStudio ? "Innate OS · Morph sequence" : editableImages ? "Innate OS · Morph images" : gridOnly ? "Grid cells" : pushMorph ? "Innate OS · Morph" : figure ? "Innate OS" : dither ? "Cell system" : neurons ? "Connected agents" : multiple ? "Four agents" : rectangular ? "Rectangle field" : "Circle field"}</h1>
    </header>
    <section className={`${styles.stage} ${neurons ? styles.neuralStage : ""}`} aria-label={gridOnly ? "Draggable grid cells" : dither ? "Dithered cell field" : rectangular ? "Interactive rectangular density field" : "One generative circle-grid pattern"}>
      <canvas ref={canvas} className={`${styles.canvas} ${mediaPair ? styles.mediaCanvas : ""} ${dragging ? styles.dragging : ""}`} role="img"
        onPointerDown={beginDrag} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag}
        aria-label={mediaPair ? "A draggable full-color robot photograph with a rounded block edge and scattered photo and purple fragments on a white dot grid." : imageMerge ? "A dithered wordmark whose letters are separate density islands that merge by adhesion and reach." : ditherImage ? "An uploaded wordmark dithered with building-block cells on the LED grid." : typeArea ? "A live type block on the LED grid. Edit the copy, then drag, resize, and sequence surrounds around it." : gridOnly ? "Draggable lettered cells on the LED grid. Nearby cells merge into outlined pills. Use the toggle to hide or show the grid." : figure ? "Innate OS chat on the LED grid, with three MARS steps appearing in sequence around the field." : dither ? "Four draggable text agents. Metaball connections are dithered with a circular cell that can be swapped from the library." : neurons ? "Four draggable text agents joined by curved neuron-like paths around a slowly changing dot field." : multiple ? "Four draggable text objects: innate robotics, 2026 Summer Hackathon, skill_walk, and push. Each merges with nearby dots." : rectangular ? "Drag innate robotics to merge and separate stepped rectangular territories on the grid." : "A draggable innate robotics text agent forms liquid connections with nearby thinking-area dots on a stationary outlined grid."} />
      {(editableImages || ditherImage) && !mediaPair && selectedBounds && selectedSize !== undefined && <div className={styles.imageSelection}
        style={{
          left: selectedBounds.left,
          top: selectedBounds.top,
          width: selectedBounds.right - selectedBounds.left,
          height: selectedBounds.bottom - selectedBounds.top,
        }}>
        {(["nw", "ne", "sw", "se"] as const).map(corner => <button key={corner} type="button"
          className={`${styles.resizeHandle} ${styles[corner]}${selectedIsType() ? ` ${styles.typeFieldHandle}` : ""}`}
          aria-label={selectedIsType() ? `Change type field width from ${corner} corner` : `Resize selected image from ${corner} corner`}
          onPointerDown={beginResize} onPointerMove={moveResize} onPointerUp={endResize} onPointerCancel={endResize}>
          {corner === "nw" ? "↖" : corner === "ne" ? "↗" : corner === "sw" ? "↙" : "↘"}
        </button>)}
        {!(ditherImage && selectedImage === 0) && !(sequenceStudio && selectedImage === 0) && <button type="button" className={styles.deleteImage}
          aria-label="Delete selected image" onClick={deleteSelectedImage}>×</button>}
      </div>}
      {gridOnly && <DitherControls led gridOnly value={ditherSettings} onChange={setDitherSettings} />}
      {dither && !gridOnly && <CellLibrary library={ditherImage || editableImages ? MORPH_0918_LIBRARY : pushMorph ? MORPH_LIBRARY : TONAL_LIBRARY} value={stamp} onChange={setStamp}>
        {ditherImage && <div className={styles.imageControls}>
          <p className={styles.imageControlHeading}>{mediaPair ? "Treated subject" : "Source image"}</p>
          <p className={styles.imageControlNote}>{mediaPair
            ? "Purple and light purple follow the cutout, drifting along it and lagging when you drag. Randomness breaks the edge; over-bleed spills past it. Loose marks wander, and nearby LEDs wake."
            : "Upload a PNG or JPG, then drag or resize it on the canvas. Dark ink is dithered; nearby shapes merge with Adhesion and Reach."}</p>
          {mediaPair && <div className={styles.typeSliders}>
            <label className={styles.typeSize}>
              <span>Randomness</span>
              <output htmlFor="media-random">{Math.round(mediaRandom * 100)}%</output>
              <input id="media-random" type="range" min={MEDIA_RANDOM_MIN} max={MEDIA_RANDOM_MAX} step={.01}
                value={mediaRandom} aria-label="Randomness of the cutout edge"
                onChange={event => setMediaRandom(Math.max(MEDIA_RANDOM_MIN, Math.min(MEDIA_RANDOM_MAX, Number(event.target.value))))} />
            </label>
            <label className={styles.typeSize}>
              <span>Over-bleed</span>
              <output htmlFor="media-bleed">{Math.round(mediaBleed * 100)}%</output>
              <input id="media-bleed" type="range" min={MEDIA_BLEED_MIN} max={MEDIA_BLEED_MAX} step={.01}
                value={mediaBleed} aria-label="How far the purple shape bleeds past the cutout"
                onChange={event => setMediaBleed(Math.max(MEDIA_BLEED_MIN, Math.min(MEDIA_BLEED_MAX, Number(event.target.value))))} />
            </label>
          </div>}
          <label className={styles.imageUpload}>
            <input ref={centerInput} type="file" accept="image/*" aria-label={mediaPair ? "Replace treated subject" : "Replace dithered image"}
              onChange={event => { void replaceCenterImage(event.target.files); }} />
            Replace image · {mainImageLabel}
          </label>
          {mainImageLabel !== (mediaPair ? "innate-plant-cutout.jpg" : "intelligence.png") && <button className={styles.imageReset} type="button" onClick={restoreDefaultFigure}>
            {mediaPair ? "Restore plant" : "Restore Intelligence"}
          </button>}
        </div>}
        {editableImages && <div className={styles.imageControls}>
          <p className={styles.imageControlHeading}>{typeArea ? "Type area" : "Draggable images"}</p>
          <p className={styles.imageControlNote}>{typeArea
            ? "Select a type slot in the sequence bar to edit copy, size, and that block’s line width and height."
            : sequenceStudio
              ? "Select a part in the sequence bar to edit that island’s shadow width and height. Copy Setup records the sizes with positions."
              : "Drag any image on the canvas. Copy Setup records parameters, block tones, and image positions."}</p>
          {typeArea && <button className={styles.imageReset} type="button" onClick={restoreDefaultFigure}>
            Restore type
          </button>}
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
          defaults={mediaPair ? MEDIA_PAIR_DEFAULTS : imageMerge ? IMAGE_MERGE_DEFAULTS : ditherImage ? IMAGE_DITHER_DEFAULTS : typeArea ? TYPE_AREA_FIELD_DEFAULTS : editableImages ? PUSH_MORPH_IMAGE_DEFAULTS : pushMorph ? PUSH_MORPH_DEFAULTS : undefined}
          rimBlocks={pushMorph || ditherImage}
          onReplay={figure && !editableImages && !ditherImage ? () => { if (canvas.current) replayStepSequence(canvas.current); } : undefined} />
        {!figure && <TrailControls value={trails} onChange={setTrails} />}
      </CellLibrary>}
      {neurons && <DendriticControls settings={linkage} onChange={setLinkage} />}
      {sequenceStudio && !sequenceOpen && <button type="button" className={styles.sequenceShow} onClick={() => setSequenceOpen(true)}>Show sequence</button>}
      {sequenceStudio && sequenceOpen && <div className={styles.sequenceBar}>
        <div className={styles.sequenceHeader}>
          <p className={styles.sequenceBarTitle}>Sequence</p>
          <button type="button" className={styles.sequenceHide} onClick={() => setSequenceOpen(false)}>Hide</button>
        </div>
        <div className={styles.sequenceBody}>
        <div className={styles.sequenceMain}>
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
            {typeArea ? <button type="button"
              className={`${styles.sequenceSlot} ${typeEdit.act === row.act && typeEdit.slot === "center" ? styles.sequenceSlotSelected : ""}`}
              onClick={() => row.act === 2 && !nextCenterIsType ? addTypeCenter() : selectTypeSlot(row.act, "center")}>
              <span>{row.act === 1 ? "Center" : "Center 2"}</span>
              <strong>{row.act === 2 && !nextCenterIsType ? "Empty" : row.centerLabel}</strong>
              {row.act === 2 && !nextCenterIsType ? "Add type" : "Edit"}
            </button> : <div className={`${styles.sequenceSlot} ${typeEdit.act === row.act && typeEdit.slot === "center" ? styles.sequenceSlotSelected : ""}`}>
              <button type="button" className={styles.sequenceSlotPick} onClick={() => selectTypeSlot(row.act, "center")}>
                <span>{row.act === 1 ? "Center" : "Center 2"}</span>
                <strong>{row.centerLabel}</strong>
              </button>
              <label>
                <input ref={row.centerInput} type="file" aria-label={row.act === 1 ? "Replace center image" : "Replace second center image"} accept="image/*"
                  onChange={event => { void replaceCenterImage(event.target.files, row.act); }} />
                {row.act === 2 && !nextImageLabel ? "Upload" : "Replace"}
              </label>
            </div>}
            {row.surrounds.map((step, index) => <div
              className={`${styles.sequenceSlot} ${typeEdit.act === row.act && typeEdit.slot === index ? styles.sequenceSlotSelected : ""}`}
              key={`${row.act}-${step.label ?? "surround"}-${index}`}>
              <button type="button" className={styles.sequenceSlotPick} onClick={() => selectTypeSlot(row.act, index)}>
                <span>Surround {index + 1}</span>
                <strong>{step.label ?? `Image ${index + 1}`}</strong>
              </button>
              <div className={styles.sequenceOrder}>
                <button type="button" aria-label={`Move act ${row.act} surround ${index + 1} earlier`} disabled={index === 0} onClick={() => moveSurround(index, -1, row.act)}>↑</button>
                <button type="button" aria-label={`Move act ${row.act} surround ${index + 1} later`} disabled={index === row.surrounds.length - 1} onClick={() => moveSurround(index, 1, row.act)}>↓</button>
              </div>
              {typeArea ? <span className={styles.sequenceSlotHint}>Edit</span> : <label>
                <input type="file" aria-label={`Replace act ${row.act} surround ${index + 1}`} accept="image/*"
                  onChange={event => { replaceSurroundAct.current = row.act; replaceSurroundIndex.current = index; void replaceSurroundImage(event.target.files, index, row.act); }} />
                Replace
              </label>}
            </div>)}
            {typeArea ? <button type="button" className={styles.sequenceSlot} onClick={() => addTypeSurround(row.act)}>
              <span>Next surround</span>
              <strong>{row.surrounds.length + 1}</strong>
              Add type
            </button> : <label className={styles.sequenceSlot}>
              <span>Next surround</span>
              <strong>{row.surrounds.length + 1}</strong>
              <input ref={row.addInput} type="file" aria-label={`Add act ${row.act} surround image`} accept="image/*"
                onChange={event => { void addFigureImages(event.target.files, row.act); }} />
              Add
            </label>}
          </div>
        </div>)}
        </div>
        {typeArea ? <div className={styles.sequenceEditor}>
          <p className={styles.sequenceActTitle}>Type · {editingType.title}</p>
          <label className={styles.typeArea}>
            Type
            <textarea aria-label="Selected type copy" value={editingType.copy}
              style={{ fontFamily: `${editingType.face}, Arial, sans-serif` }}
              onChange={event => writeTypeCopy(event.target.value)} />
          </label>
          <div className={styles.typeFace} role="group" aria-label="Typeface">
            {TYPE_AREA_FACES.map(face =>
              <button key={face} type="button" aria-pressed={editingType.face === face} onClick={() => writeTypeFace(face)}>
                {face}
              </button>)}
          </div>
          <div className={styles.typeSliders}>
            <label className={styles.typeSize}>
              <span>Text size</span>
              <output htmlFor="type-font-size">{editingType.fontSize} px</output>
              <input id="type-font-size" type="range" min={TYPE_AREA_FONT_MIN} max={TYPE_AREA_FONT_MAX} step={1}
                value={editingType.fontSize} aria-label="Type size"
                onChange={event => writeTypeFont(Number(event.target.value))} />
            </label>
            <label className={styles.typeSize}>
              <span>Tracking</span>
              <output htmlFor="type-track">{Math.round(editingType.track * 100)}%</output>
              <input id="type-track" type="range" min={TYPE_AREA_TRACK_MIN} max={TYPE_AREA_TRACK_MAX} step={.005}
                value={editingType.track} aria-label="Type tracking"
                onChange={event => writeTypeTrack(Number(event.target.value))} />
            </label>
            <label className={styles.typeSize}>
              <span>Line width</span>
              <output htmlFor="type-bar-width">{editingType.barWidth.toFixed(2)} ×</output>
              <input id="type-bar-width" type="range" min={TYPE_AREA_BAR_MIN} max={TYPE_AREA_BAR_MAX} step={.02}
                value={editingType.barWidth} aria-label="Type line occupancy width"
                onChange={event => writeTypeBar("width", Number(event.target.value))} />
            </label>
            <label className={styles.typeSize}>
              <span>Line height</span>
              <output htmlFor="type-bar-height">{editingType.barHeight.toFixed(2)} ×</output>
              <input id="type-bar-height" type="range" min={TYPE_AREA_BAR_MIN} max={TYPE_AREA_BAR_HEIGHT_MAX} step={.01}
                value={editingType.barHeight} aria-label="Type line occupancy height"
                onChange={event => writeTypeBar("height", Number(event.target.value))} />
            </label>
          </div>
        </div> : <div className={styles.sequenceEditor}>
          <p className={styles.sequenceActTitle}>Shadow · {editingShadow.title}</p>
          <div className={styles.typeSliders}>
            <label className={styles.typeSize}>
              <span>Shadow width</span>
              <output htmlFor="shadow-width">{editingShadow.width.toFixed(2)} ×</output>
              <input id="shadow-width" type="range" min={SHADOW_SIZE_MIN} max={SHADOW_SIZE_MAX} step={.05}
                value={editingShadow.width} aria-label="Selected part shadow width"
                onChange={event => writeShadowSize("width", Number(event.target.value))} />
            </label>
            <label className={styles.typeSize}>
              <span>Shadow height</span>
              <output htmlFor="shadow-height">{editingShadow.height.toFixed(2)} ×</output>
              <input id="shadow-height" type="range" min={SHADOW_SIZE_MIN} max={SHADOW_SIZE_MAX} step={.05}
                value={editingShadow.height} aria-label="Selected part shadow height"
                onChange={event => writeShadowSize("height", Number(event.target.value))} />
            </label>
          </div>
        </div>}
        </div>
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
