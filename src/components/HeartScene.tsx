import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { CSS2DObject, CSS2DRenderer } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import {
  atrialContraction,
  avOpenness,
  chamberCycle,
  chamberPhaseAt,
  semilunarOpenness,
  ventricularContraction,
  type ChamberPhaseId,
} from "../data/chambers";
import {
  DEOXY_BLOOD,
  OXY_BLOOD,
  fetchHeartManifest,
  type HeartManifest,
  type HeartValve,
  type SceneFocus,
  type Vec3,
} from "../data/heartScene";

interface Props {
  playing: boolean;
  speed: number;
  openAmount: number;
  focus: SceneFocus;
  seekMs: number;
  seekToken: number;
  restartToken: number;
  onPhaseChange: (phase: ChamberPhaseId) => void;
}

interface SceneApi {
  setPlaying: (playing: boolean) => void;
  setSpeed: (speed: number) => void;
  setOpen: (open: number) => void;
  setFocus: (focus: SceneFocus) => void;
  seek: (ms: number) => void;
  replay: () => void;
}

type Status = { kind: "loading" } | { kind: "ready" } | { kind: "failed"; reason: string };

interface ValveRig {
  kind: HeartValve["kind"];
  side: HeartValve["side"];
  hinges: THREE.Group[];
  maxAngle: number;
}

interface FlowWindow {
  start: number;
  end: number;
}

interface FlowLoop {
  curve: THREE.CatmullRomCurve3;
  lungU: number;
  avWindows: FlowWindow[];
  semiWindows: FlowWindow[];
  travel: Float32Array;
  jitter: Float32Array;
  positions: Float32Array;
  colors: Float32Array;
  geometry: THREE.BufferGeometry;
}

type LabelKind = "chamber" | "valve" | "vessel" | "organ";

interface LabelEntry {
  object: CSS2DObject;
  kind: LabelKind;
  side: SceneFocus | null;
  minOpen: number;
  minor: boolean;
}

interface CameraPose {
  position: THREE.Vector3;
  target: THREE.Vector3;
}

const SHELL_IDS = new Set([
  "ventricle-wall",
  "atrium-wall-left",
  "atrium-wall-right",
  "lv",
  "rv",
  "la",
  "ra",
]);
const PARTICLE_COUNT = 320;
const FLOW_RATE = 0.078;
const BLUE = new THREE.Color(DEOXY_BLOOD);
const RED = new THREE.Color(OXY_BLOOD);
const BODY_POINT = new THREE.Vector3(0.42, 0.2, -1.5);
const LUNG_LEFT = new THREE.Vector3(1.26, 0.38, 0.12);
const LUNG_RIGHT = new THREE.Vector3(-1.26, 0.38, 0.12);

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function smooth01(value: number): number {
  const x = clamp01(value);
  return x * x * (3 - 2 * x);
}

function hasWebGL(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") ?? canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

function toVector(value: Vec3): THREE.Vector3 {
  return new THREE.Vector3(value[0], value[1], value[2]);
}

/** 蓝→红按肺内换气点切换；到全身组织后淡回蓝，接上下一圈。 */
function flowColor(u: number, lungU: number, target: THREE.Color): THREE.Color {
  const afterLung = smooth01((u - (lungU - 0.018)) / 0.036);
  const nearBody = smooth01((u - 0.976) / 0.024);
  return target.copy(BLUE).lerp(RED, afterLung * (1 - nearBody));
}

function makeGlowTexture(): THREE.CanvasTexture {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (context) {
    const gradient = context.createRadialGradient(
      size / 2,
      size / 2,
      0,
      size / 2,
      size / 2,
      size / 2,
    );
    gradient.addColorStop(0, "rgba(255,255,255,1)");
    gradient.addColorStop(0.32, "rgba(255,255,255,0.62)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, size, size);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function windowAround(center: number, end: number, pad: number): FlowWindow {
  const lo = Math.min(center, end) - pad;
  const hi = Math.max(center, end) + pad;
  return { start: clamp01(lo), end: clamp01(hi) };
}

function inWindow(u: number, window: FlowWindow): boolean {
  return u >= window.start && u <= window.end;
}

function closestU(curve: THREE.CatmullRomCurve3, point: THREE.Vector3): number {
  let best = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  const probe = new THREE.Vector3();
  for (let index = 0; index <= 600; index += 1) {
    const u = index / 600;
    curve.getPointAt(u, probe);
    const distance = probe.distanceToSquared(point);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = u;
    }
  }
  return best;
}

function leafletShape(radius: number, halfWidth: number): THREE.ShapeGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(0, -halfWidth);
  shape.quadraticCurveTo(-radius * 0.55, -halfWidth * 0.92, -radius * 0.98, 0);
  shape.quadraticCurveTo(-radius * 0.55, halfWidth * 0.92, 0, halfWidth);
  shape.lineTo(0, -halfWidth);
  const geometry = new THREE.ShapeGeometry(shape, 14);
  const position = geometry.getAttribute("position") as THREE.BufferAttribute;
  for (let index = 0; index < position.count; index += 1) {
    const x = position.getX(index);
    const belly = Math.sin(Math.PI * clamp01(-x / radius)) * radius * 0.15;
    position.setZ(index, belly);
  }
  position.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * 全屏 3D 循环演示：BP3D 平滑网格共用世界坐标，前面用滑动剖切面切开，
 * 四腔、程序化瓣膜、两圈粒子血流和心房/心室收缩都按同一个心动周期联动。
 */
export default function HeartScene({
  playing,
  speed,
  openAmount,
  focus,
  seekMs,
  seekToken,
  restartToken,
  onPhaseChange,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<SceneApi | null>(null);
  const onPhaseRef = useRef(onPhaseChange);
  const supported = useMemo(() => hasWebGL(), []);
  const [status, setStatus] = useState<Status>({ kind: "loading" });
  const [loaded, setLoaded] = useState(0);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    onPhaseRef.current = onPhaseChange;
  }, [onPhaseChange]);

  useEffect(() => {
    const host = hostRef.current;
    if (!supported || !host) return;

    let cancelled = false;
    let disposed = false;
    let ready = false;
    let playingNow = true;
    let speedNow = 1;
    let elapsed = 0;
    let openTarget = 0;
    let openCurrent = 0;
    let focusNow: SceneFocus = "overview";
    let cutClosed = 0;
    let cutOpen = 0;
    let clipPlane: THREE.Plane | null = null;
    let frame = 0;
    let camGoal: CameraPose | null = null;
    let lastPhase: ChamberPhaseId | null = null;
    let atriaGroup: THREE.Group | null = null;
    let ventricleGroup: THREE.Group | null = null;
    let atriaPivot = new THREE.Vector3();
    let ventriclePivot = new THREE.Vector3();
    const valveRigs: ValveRig[] = [];
    const flowLoops: FlowLoop[] = [];
    const labels: LabelEntry[] = [];
    const vesselMaterials = new Map<string, THREE.MeshPhysicalMaterial>();
    const resources = new Set<{ dispose: () => void }>();

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.localClippingEnabled = true;
    renderer.domElement.className = "heart-scene-canvas";

    const labelRenderer = new CSS2DRenderer();
    labelRenderer.domElement.className = "heart-scene-labels";
    host.replaceChildren(renderer.domElement, labelRenderer.domElement);

    const scene = new THREE.Scene();
    scene.environmentIntensity = 0.5;
    const camera = new THREE.PerspectiveCamera(32, 1, 0.01, 100);
    camera.up.set(0, 0, 1);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.enablePan = false;
    controls.rotateSpeed = 0.78;
    controls.zoomSpeed = 0.9;
    controls.minDistance = 1.2;
    controls.maxDistance = 12;
    controls.minPolarAngle = 0.18;
    controls.maxPolarAngle = Math.PI - 0.18;
    controls.addEventListener("start", () => {
      camGoal = null;
    });

    scene.add(new THREE.HemisphereLight(0xcfe2ff, 0x2a1016, 0.6));
    const key = new THREE.DirectionalLight(0xffe7d8, 2.6);
    key.position.set(-3.4, -4.8, 5.4);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0x86b6ff, 0.95);
    fill.position.set(4.2, -2.2, -1.2);
    scene.add(fill);
    const rim = new THREE.DirectionalLight(0xffd6c6, 1.7);
    rim.position.set(2.6, 4.8, 2.6);
    scene.add(rim);

    const pmrem = new THREE.PMREMGenerator(renderer);
    const room = new RoomEnvironment();
    const envTarget = pmrem.fromScene(room, 0.04);
    scene.environment = envTarget.texture;
    resources.add(envTarget);
    room.dispose();
    pmrem.dispose();

    function track<T extends { dispose: () => void }>(resource: T): T {
      resources.add(resource);
      return resource;
    }

    const hostElement = host;

    function applySize(): void {
      const width = Math.max(1, hostElement.clientWidth);
      const height = Math.max(1, hostElement.clientHeight);
      renderer.setSize(width, height, false);
      labelRenderer.setSize(width, height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    }
    applySize();
    const resizeObserver = new ResizeObserver(applySize);
    resizeObserver.observe(host);

    function poseFor(next: SceneFocus): CameraPose {
      const portrait = camera.aspect < 1.15;
      const overviewZoom = portrait ? Math.min(1.25, 1.15 / camera.aspect) : 1;
      const focusZoom = portrait ? Math.min(1.6, 1.45 / camera.aspect) : 1;
      if (next === "left") {
        const target = new THREE.Vector3(0.24, -0.02, 0.06);
        return {
          target,
          position: target
            .clone()
            .add(new THREE.Vector3(1.18 * focusZoom, -4.45 * focusZoom, 0.68 * focusZoom)),
        };
      }
      if (next === "right") {
        const target = new THREE.Vector3(-0.34, -0.08, 0.06);
        return {
          target,
          position: target
            .clone()
            .add(new THREE.Vector3(-1.18 * focusZoom, -4.45 * focusZoom, 0.68 * focusZoom)),
        };
      }
      return {
        target: new THREE.Vector3(0.02, 0.02, 0.1),
        position: new THREE.Vector3(0.45 * overviewZoom, -6.7 * overviewZoom, 1.75 * overviewZoom),
      };
    }

    function applyFocus(next: SceneFocus, instant: boolean): void {
      const pose = poseFor(next);
      if (instant) {
        camera.position.copy(pose.position);
        controls.target.copy(pose.target);
        controls.update();
        camGoal = null;
      } else {
        camGoal = pose;
      }
      updateLabels();
    }

    function applyClip(): void {
      if (!clipPlane) return;
      const cut = cutClosed + openCurrent * (cutOpen - cutClosed);
      clipPlane.constant = -cut;
    }

    function updateLabels(): void {
      const compact = window.matchMedia("(max-width: 48rem)").matches;
      for (const label of labels) {
        let show = openCurrent >= label.minOpen;
        if (label.kind === "chamber" || label.kind === "valve") {
          if (focusNow !== "overview") show = show && label.side === focusNow;
        } else if (label.side && focusNow !== "overview") {
          show = show && label.side === focusNow;
        }
        if (compact) {
          if (label.minor) show = false;
          if (focusNow === "overview" && label.kind === "valve") show = false;
        }
        label.object.visible = show;
      }
    }

    function setPlaying(next: boolean): void {
      playingNow = next;
    }

    function setSpeed(next: number): void {
      speedNow = Number.isFinite(next) && next > 0 ? next : 1;
    }

    function setOpen(next: number): void {
      openTarget = clamp01(next);
      if (ready) updateLabels();
    }

    function applyGhost(next: SceneFocus): void {
      const pulmonary = vesselMaterials.get("pulmonary-trunk");
      if (!pulmonary) return;
      const opacity = next === "left" ? 0.28 : 0.92;
      pulmonary.transparent = true;
      pulmonary.opacity = opacity;
      pulmonary.depthWrite = true;
    }

    function setFocus(next: SceneFocus): void {
      focusNow = next;
      applyGhost(next);
      if (ready) applyFocus(next, false);
    }

    function seek(ms: number): void {
      elapsed = Math.max(0, Number.isFinite(ms) ? ms : 0);
    }

    function replay(): void {
      elapsed = 0;
      for (const loop of flowLoops) {
        for (let index = 0; index < PARTICLE_COUNT; index += 1) {
          loop.travel[index] = ((index + 0.5) / PARTICLE_COUNT) % 1;
        }
      }
    }

    apiRef.current = {
      setPlaying,
      setSpeed,
      setOpen,
      setFocus,
      seek,
      replay,
    };

    function addLabel(
      text: string,
      kind: LabelKind,
      position: THREE.Vector3,
      side: SceneFocus | null,
      minOpen: number,
      minor = false,
    ): void {
      const element = document.createElement("div");
      element.className = `hc-label is-${kind}${minor ? " is-minor" : ""}`;
      element.textContent = text;
      const object = new CSS2DObject(element);
      object.position.copy(position);
      object.center.set(0.5, 0.5);
      labelRoot.add(object);
      labels.push({ object, kind, side, minOpen, minor });
    }

    const labelRoot = new THREE.Group();
    scene.add(labelRoot);

    function addValve(
      valve: HeartValve,
      sceneCenter: THREE.Vector3,
      scale: number,
      clip: THREE.Plane[],
    ): void {
      const normal = toVector(valve.normal).normalize();
      const radius = valve.radius * scale;
      const group = new THREE.Group();
      group.position.copy(sceneCenter);
      group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);

      const ringGeometry = track(
        new THREE.TorusGeometry(radius, Math.max(0.014, radius * 0.075), 8, 40),
      );
      const ringMaterial = track(
        new THREE.MeshStandardMaterial({
          color: 0xd8b4b0,
          roughness: 0.5,
          metalness: 0.04,
          emissive: 0x1a0709,
          emissiveIntensity: 0.06,
          envMapIntensity: 0.4,
          clippingPlanes: clip,
        }),
      );
      group.add(new THREE.Mesh(ringGeometry, ringMaterial));

      const leafletMaterial = track(
        new THREE.MeshPhysicalMaterial({
          color: 0xe8c6c3,
          roughness: 0.5,
          metalness: 0,
          clearcoat: 0.3,
          clearcoatRoughness: 0.34,
          side: THREE.DoubleSide,
          emissive: 0x1a0709,
          emissiveIntensity: 0.05,
          envMapIntensity: 0.32,
          clippingPlanes: clip,
        }),
      );
      const count = valve.id === "mitral" ? 2 : 3;
      const halfWidth = radius * Math.sin(Math.PI / count) * 0.97;
      const geometry = track(leafletShape(radius, halfWidth));
      const hinges: THREE.Group[] = [];
      for (let index = 0; index < count; index += 1) {
        const sector = new THREE.Group();
        sector.rotation.z = (index / count) * Math.PI * 2;
        const hinge = new THREE.Group();
        hinge.position.set(radius, 0, 0);
        hinge.add(new THREE.Mesh(geometry, leafletMaterial));
        sector.add(hinge);
        group.add(sector);
        hinges.push(hinge);
      }
      valveRigs.push({
        kind: valve.kind,
        side: valve.side,
        hinges,
        maxAngle: valve.kind === "av" ? 1.18 : 1.26,
      });
      scene.add(group);
    }

    function makeFlowLoop(
      points: THREE.Vector3[],
      landmarks: {
        lung: THREE.Vector3;
        tricuspid: THREE.Vector3;
        rv: THREE.Vector3;
        mitral: THREE.Vector3;
        lv: THREE.Vector3;
        pulmonary: THREE.Vector3;
        pa: THREE.Vector3;
        aortic: THREE.Vector3;
        aorta: THREE.Vector3;
      },
    ): FlowLoop {
      const curve = new THREE.CatmullRomCurve3(points, true, "centripetal", 0.5);
      const lungU = closestU(curve, landmarks.lung);
      const avWindows = [
        windowAround(closestU(curve, landmarks.tricuspid), closestU(curve, landmarks.rv), 0.008),
        windowAround(closestU(curve, landmarks.mitral), closestU(curve, landmarks.lv), 0.008),
      ];
      const semiWindows = [
        windowAround(closestU(curve, landmarks.pulmonary), closestU(curve, landmarks.pa), 0.006),
        windowAround(closestU(curve, landmarks.aortic), closestU(curve, landmarks.aorta), 0.006),
      ];
      const travel = new Float32Array(PARTICLE_COUNT);
      const jitter = new Float32Array(PARTICLE_COUNT);
      for (let index = 0; index < PARTICLE_COUNT; index += 1) {
        travel[index] = ((index + 0.5) / PARTICLE_COUNT) % 1;
        jitter[index] = 0.82 + (0.36 * ((index * 37) % 17)) / 17;
      }
      const positions = new Float32Array(PARTICLE_COUNT * 3);
      const colors = new Float32Array(PARTICLE_COUNT * 3);
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
      track(geometry);
      return {
        curve,
        lungU,
        avWindows,
        semiWindows,
        travel,
        jitter,
        positions,
        colors,
        geometry,
      };
    }

    function build(manifest: HeartManifest, geometries: Map<string, THREE.BufferGeometry>): void {
      const shells = manifest.parts.filter((part) => SHELL_IDS.has(part.id));
      const lo = new THREE.Vector3(
        Number.POSITIVE_INFINITY,
        Number.POSITIVE_INFINITY,
        Number.POSITIVE_INFINITY,
      );
      const hi = new THREE.Vector3(
        Number.NEGATIVE_INFINITY,
        Number.NEGATIVE_INFINITY,
        Number.NEGATIVE_INFINITY,
      );
      for (const part of shells) {
        lo.min(toVector(part.bounds[0]));
        hi.max(toVector(part.bounds[1]));
      }
      const size = hi.clone().sub(lo);
      const maxDim = Math.max(size.x, size.y, size.z);
      if (!Number.isFinite(maxDim) || maxDim <= 0) throw new Error("心脏外壳包围盒退化");
      const scale = 2 / maxDim;
      const center = lo.clone().add(hi).multiplyScalar(0.5);
      const norm = new THREE.Matrix4()
        .makeScale(scale, scale, scale)
        .multiply(new THREE.Matrix4().makeTranslation(-center.x, -center.y, -center.z));

      for (const geometry of geometries.values()) geometry.applyMatrix4(norm);

      let yMin = Number.POSITIVE_INFINITY;
      let yMax = Number.NEGATIVE_INFINITY;
      for (const part of shells) {
        const geometry = geometries.get(part.id);
        if (!geometry) continue;
        geometry.computeBoundingBox();
        if (!geometry.boundingBox) continue;
        yMin = Math.min(yMin, geometry.boundingBox.min.y);
        yMax = Math.max(yMax, geometry.boundingBox.max.y);
      }
      if (!Number.isFinite(yMin) || !Number.isFinite(yMax)) throw new Error("无法计算剖面范围");
      cutClosed = yMin - 0.04;
      cutOpen = yMin + (yMax - yMin) * 0.3;
      clipPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -cutClosed);
      const clip = [clipPlane];

      const muscleMaterial = track(
        new THREE.MeshPhysicalMaterial({
          color: 0xc47474,
          roughness: 0.4,
          metalness: 0,
          clearcoat: 0.5,
          clearcoatRoughness: 0.32,
          sheen: 0.3,
          sheenColor: new THREE.Color(0xe3aaa4),
          sheenRoughness: 0.6,
          side: THREE.FrontSide,
          clippingPlanes: clip,
          envMapIntensity: 0.5,
        }),
      );
      const muscleInnerMaterial = track(
        new THREE.MeshStandardMaterial({
          color: 0x7e3a40,
          roughness: 0.8,
          metalness: 0,
          side: THREE.BackSide,
          clippingPlanes: clip,
          envMapIntensity: 0.12,
          polygonOffset: true,
          polygonOffsetFactor: 2,
          polygonOffsetUnits: 2,
        }),
      );
      const atriumMaterial = track(
        new THREE.MeshPhysicalMaterial({
          color: 0xc47474,
          roughness: 0.4,
          metalness: 0,
          clearcoat: 0.5,
          clearcoatRoughness: 0.32,
          sheen: 0.3,
          sheenColor: new THREE.Color(0xe3aaa4),
          sheenRoughness: 0.6,
          side: THREE.FrontSide,
          transparent: true,
          opacity: 0.9,
          depthWrite: false,
          clippingPlanes: clip,
          envMapIntensity: 0.5,
        }),
      );
      const atriumInnerMaterial = track(
        new THREE.MeshStandardMaterial({
          color: 0xa55f63,
          roughness: 0.66,
          metalness: 0,
          side: THREE.BackSide,
          clippingPlanes: clip,
          envMapIntensity: 0.24,
          polygonOffset: true,
          polygonOffsetFactor: 2,
          polygonOffsetUnits: 2,
        }),
      );
      const cavityMaterial = track(
        new THREE.MeshStandardMaterial({
          color: 0x7e3a40,
          roughness: 0.74,
          metalness: 0,
          side: THREE.DoubleSide,
          clippingPlanes: clip,
          envMapIntensity: 0.12,
          polygonOffset: true,
          polygonOffsetFactor: -1,
          polygonOffsetUnits: -1,
        }),
      );

      atriaGroup = new THREE.Group();
      ventricleGroup = new THREE.Group();
      const staticGroup = new THREE.Group();
      scene.add(atriaGroup, ventricleGroup, staticGroup);

      const la = toVector(manifest.chambers.la).applyMatrix4(norm);
      const ra = toVector(manifest.chambers.ra).applyMatrix4(norm);
      const lv = toVector(manifest.chambers.lv).applyMatrix4(norm);
      const rv = toVector(manifest.chambers.rv).applyMatrix4(norm);
      atriaPivot = la.clone().add(ra).multiplyScalar(0.5);
      ventriclePivot = lv.clone().add(rv).multiplyScalar(0.5);

      for (const part of manifest.parts) {
        const geometry = geometries.get(part.id);
        if (!geometry) continue;
        let material: THREE.Material;
        if (part.id === "ventricle-wall") {
          material = muscleMaterial;
        } else if (part.id.startsWith("atrium-wall")) {
          material = atriumMaterial;
        } else if (part.id === "lv" || part.id === "rv" || part.id === "la" || part.id === "ra") {
          material = cavityMaterial;
        } else if (part.id.startsWith("papillary")) {
          material = muscleMaterial;
        } else if (part.group === "coronary") {
          material = track(
            new THREE.MeshStandardMaterial({
              color: new THREE.Color(part.color),
              roughness: 0.5,
              metalness: 0,
              envMapIntensity: 0.35,
              clippingPlanes: clip,
              polygonOffset: true,
              polygonOffsetFactor: -1,
              polygonOffsetUnits: -1,
            }),
          );
        } else {
          const vessel = track(
            new THREE.MeshPhysicalMaterial({
              color: new THREE.Color(part.color),
              roughness: 0.42,
              metalness: 0,
              clearcoat: 0.28,
              clearcoatRoughness: 0.35,
              side: THREE.FrontSide,
              envMapIntensity: 0.4,
              clippingPlanes: clip,
            }),
          );
          if (part.id === "pulmonary-trunk") {
            vessel.side = THREE.DoubleSide;
            vessel.transparent = true;
            vessel.opacity = 0.9;
            vessel.depthWrite = true;
          }
          vesselMaterials.set(part.id, vessel);
          material = vessel;
        }
        const mesh = new THREE.Mesh(geometry, material);
        mesh.userData.partId = part.id;
        if (part.id === "lv" || part.id === "rv" || part.id === "la" || part.id === "ra") {
          const cavityCenter = toVector(part.bounds[0])
            .applyMatrix4(norm)
            .add(toVector(part.bounds[1]).applyMatrix4(norm))
            .multiplyScalar(0.5);
          const inset = 0.94;
          mesh.scale.setScalar(inset);
          mesh.position.copy(cavityCenter).multiplyScalar(1 - inset);
        }
        const targetGroup =
          part.id === "ventricle-wall" ||
          part.id === "lv" ||
          part.id === "rv" ||
          part.id.startsWith("papillary") ||
          part.group === "coronary"
            ? ventricleGroup
            : part.id.startsWith("atrium-wall") || part.id === "la" || part.id === "ra"
              ? atriaGroup
              : staticGroup;
        targetGroup.add(mesh);
        if (material === muscleMaterial) {
          targetGroup.add(new THREE.Mesh(geometry, muscleInnerMaterial));
        } else if (material === atriumMaterial) {
          targetGroup.add(new THREE.Mesh(geometry, atriumInnerMaterial));
        }
      }

      for (const stump of manifest.stumps) {
        const center = toVector(stump.center).applyMatrix4(norm);
        const normal = toVector(stump.normal).normalize();
        const part = manifest.parts.find((item) => item.id === stump.part);
        const radius = stump.radius * scale;
        const thickness = Math.max(0.012, radius * 0.16);
        const depth = Math.max(0.02, radius * 0.34);
        const group = new THREE.Group();
        group.position.copy(center);
        group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
        const rimMaterial = track(
          new THREE.MeshStandardMaterial({
            color: new THREE.Color(part?.color ?? "#c47474").multiplyScalar(0.55),
            roughness: 0.72,
            metalness: 0,
            side: THREE.DoubleSide,
            clippingPlanes: clip,
            envMapIntensity: 0.1,
          }),
        );
        const rim = new THREE.Mesh(
          track(new THREE.RingGeometry(radius - thickness, radius + 0.003, 40, 1)),
          rimMaterial,
        );
        group.add(rim);
        const inner = new THREE.Mesh(
          track(
            new THREE.CylinderGeometry(radius - thickness, radius - thickness, depth, 32, 1, true),
          ),
          track(
            new THREE.MeshStandardMaterial({
              color: 0x3a1a20,
              roughness: 0.85,
              metalness: 0,
              side: THREE.BackSide,
              clippingPlanes: clip,
              envMapIntensity: 0.08,
            }),
          ),
        );
        inner.rotation.x = Math.PI / 2;
        inner.position.z = -depth / 2;
        group.add(inner);
        const lumen = new THREE.Mesh(
          track(new THREE.CircleGeometry(radius - thickness, 40)),
          track(
            new THREE.MeshStandardMaterial({
              color: 0x241018,
              roughness: 0.9,
              metalness: 0,
              side: THREE.DoubleSide,
              clippingPlanes: clip,
              envMapIntensity: 0.05,
            }),
          ),
        );
        lumen.position.z = -depth + 0.002;
        group.add(lumen);
        staticGroup.add(group);
      }

      for (const valve of manifest.valves) {
        addValve(valve, toVector(valve.center).applyMatrix4(norm), scale, clip);
      }

      const lungGeometry = track(new THREE.IcosahedronGeometry(1, 1));
      const lungMaterial = track(
        new THREE.MeshBasicMaterial({
          color: 0x6f9bd6,
          wireframe: true,
          transparent: true,
          opacity: 0.14,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      for (const sign of [1, -1]) {
        const lung = new THREE.Mesh(lungGeometry, lungMaterial);
        lung.position.set(sign * 1.26, 0.38, 0.12);
        lung.scale.set(0.48, 0.36, 0.78);
        scene.add(lung);
      }

      const bodyMaterial = track(
        new THREE.MeshBasicMaterial({
          color: 0xffb27a,
          transparent: true,
          opacity: 0.9,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      const body = new THREE.Mesh(track(new THREE.SphereGeometry(0.06, 16, 12)), bodyMaterial);
      body.position.copy(BODY_POINT);
      scene.add(body);
      const bodyRing = new THREE.Mesh(
        track(new THREE.TorusGeometry(0.135, 0.005, 8, 36)),
        track(
          new THREE.MeshBasicMaterial({
            color: 0xffb27a,
            transparent: true,
            opacity: 0.36,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
          }),
        ),
      );
      bodyRing.position.copy(BODY_POINT);
      bodyRing.rotation.x = Math.PI / 2;
      scene.add(bodyRing);

      const port = (id: keyof HeartManifest["ports"]): THREE.Vector3 =>
        toVector(manifest.ports[id]).applyMatrix4(norm);
      const valveCenter = (id: string): THREE.Vector3 => {
        const valve = manifest.valves.find((item) => item.id === id);
        return valve ? toVector(valve.center).applyMatrix4(norm) : new THREE.Vector3();
      };

      const bodyIn = BODY_POINT.clone().add(new THREE.Vector3(-0.16, 0, 0.02));
      const bodyOut = BODY_POINT.clone().add(new THREE.Vector3(0.16, 0.02, 0.02));
      const bodyLeft = new THREE.Vector3(0.88, 0.25, -0.86);
      const bodyRight = new THREE.Vector3(-0.92, 0.25, -0.86);
      const svcPort = port("svc");
      const ivcPort = port("ivc");
      const svc = new THREE.Vector3(svcPort.x, svcPort.y, svcPort.z + 0.06);
      const ivc = new THREE.Vector3(ivcPort.x, ivcPort.y, ivcPort.z - 0.06);
      const aorta = port("aorta");
      const pa = port("pa");
      const pvLeft = port("pv-left-superior");
      const pvRight = port("pv-right-superior");
      const tricuspid = valveCenter("tricuspid");
      const mitral = valveCenter("mitral");
      const pulmonary = valveCenter("pulmonary");
      const aortic = valveCenter("aortic");

      const landmarks = {
        lung: LUNG_LEFT,
        tricuspid,
        rv,
        mitral,
        lv,
        pulmonary,
        pa,
        aortic,
        aorta,
      };

      const leftPoints = [
        bodyOut,
        new THREE.Vector3(0.18, 0.18, -1.42),
        ivc,
        ra.clone().add(new THREE.Vector3(0, -0.04, 0.22)),
        ra,
        tricuspid,
        rv,
        pulmonary,
        pa,
        new THREE.Vector3(0.36, -0.2, 0.92),
        LUNG_LEFT.clone().add(new THREE.Vector3(-0.22, -0.16, 0.24)),
        LUNG_LEFT,
        LUNG_LEFT.clone().add(new THREE.Vector3(0.1, 0.06, -0.3)),
        pvLeft,
        la,
        mitral,
        lv,
        aortic,
        aorta,
        new THREE.Vector3(0.42, -0.02, 0.92),
        new THREE.Vector3(0.95, 0.2, 0.04),
        bodyLeft,
        bodyIn,
      ];
      const rightPoints = [
        bodyOut,
        new THREE.Vector3(-0.28, 0.18, -1.42),
        new THREE.Vector3(-0.96, 0.22, -1.0),
        new THREE.Vector3(-1.02, 0.16, -0.1),
        new THREE.Vector3(-0.9, 0.1, 0.82),
        svc,
        ra,
        tricuspid,
        rv,
        pulmonary,
        pa,
        new THREE.Vector3(-0.2, -0.16, 0.94),
        LUNG_RIGHT.clone().add(new THREE.Vector3(0.22, -0.16, 0.24)),
        LUNG_RIGHT,
        LUNG_RIGHT.clone().add(new THREE.Vector3(-0.1, 0.06, -0.3)),
        pvRight,
        la,
        mitral,
        lv,
        aortic,
        aorta,
        new THREE.Vector3(0.42, -0.02, 0.92),
        new THREE.Vector3(0.95, 0.2, 0.04),
        bodyRight,
        bodyIn,
      ];

      const rightOffset = new THREE.Vector3(0.045, 0, 0);
      for (const point of rightPoints) point.add(rightOffset);

      const loopSpecs: { points: THREE.Vector3[]; lung: THREE.Vector3 }[] = [
        { points: leftPoints, lung: LUNG_LEFT },
        { points: rightPoints, lung: LUNG_RIGHT },
      ];
      for (const spec of loopSpecs) {
        const loop = makeFlowLoop(spec.points, { ...landmarks, lung: spec.lung });
        flowLoops.push(loop);
      }

      const glow = track(makeGlowTexture());
      const coreMaterial = track(
        new THREE.PointsMaterial({
          color: 0xffffff,
          size: 0.068,
          map: glow,
          vertexColors: true,
          transparent: true,
          depthWrite: false,
          sizeAttenuation: true,
          alphaTest: 0.01,
        }),
      );
      const haloMaterial = track(
        new THREE.PointsMaterial({
          color: 0xffffff,
          size: 0.17,
          map: glow,
          vertexColors: true,
          transparent: true,
          opacity: 0.18,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          sizeAttenuation: true,
          alphaTest: 0.01,
        }),
      );
      for (const loop of flowLoops) {
        const halo = new THREE.Points(loop.geometry, haloMaterial);
        halo.renderOrder = 1;
        halo.frustumCulled = false;
        const core = new THREE.Points(loop.geometry, coreMaterial);
        core.renderOrder = 2;
        core.frustumCulled = false;
        scene.add(halo, core);
        const tubeGeometry = track(new THREE.TubeGeometry(loop.curve, 260, 0.02, 5, true));
        const tubePosition = tubeGeometry.getAttribute("position") as THREE.BufferAttribute;
        const tubeColors = new Float32Array(tubePosition.count * 3);
        const tubeColor = new THREE.Color();
        for (let index = 0; index < tubePosition.count; index += 1) {
          const u = Math.floor(index / 6) / 260;
          flowColor(u, loop.lungU, tubeColor);
          tubeColors[index * 3] = tubeColor.r;
          tubeColors[index * 3 + 1] = tubeColor.g;
          tubeColors[index * 3 + 2] = tubeColor.b;
        }
        tubeGeometry.setAttribute("color", new THREE.BufferAttribute(tubeColors, 3));
        const tube = new THREE.Mesh(
          tubeGeometry,
          track(
            new THREE.MeshBasicMaterial({
              vertexColors: true,
              transparent: true,
              opacity: 0.16,
              depthWrite: false,
              side: THREE.DoubleSide,
            }),
          ),
        );
        tube.renderOrder = 0;
        scene.add(tube);
      }

      const chamberOffsets: Record<"la" | "lv" | "ra" | "rv", THREE.Vector3> = {
        la: new THREE.Vector3(0.36, -0.15, 0.27),
        lv: new THREE.Vector3(0.38, -0.15, 0.02),
        ra: new THREE.Vector3(-0.36, -0.15, 0.27),
        rv: new THREE.Vector3(-0.38, -0.15, 0.02),
      };
      addLabel("左心房", "chamber", la.clone().add(chamberOffsets.la), "left", 0.44);
      addLabel("左心室", "chamber", lv.clone().add(chamberOffsets.lv), "left", 0.44);
      addLabel("右心房", "chamber", ra.clone().add(chamberOffsets.ra), "right", 0.44);
      addLabel("右心室", "chamber", rv.clone().add(chamberOffsets.rv), "right", 0.44);

      const valveOffsets: Record<string, THREE.Vector3> = {
        mitral: new THREE.Vector3(0.54, -0.08, 0.34),
        aortic: new THREE.Vector3(0.76, -0.08, 0.5),
        tricuspid: new THREE.Vector3(-0.54, -0.08, 0.32),
        pulmonary: new THREE.Vector3(-0.62, -0.08, 0.5),
      };
      for (const valve of manifest.valves) {
        const offset = valveOffsets[valve.id] ?? new THREE.Vector3(0.4, -0.08, 0.3);
        addLabel(
          valve.name,
          "valve",
          toVector(valve.center).applyMatrix4(norm).add(offset),
          valve.side,
          0.6,
        );
      }

      addLabel("主动脉", "vessel", aorta.clone().add(new THREE.Vector3(0.1, 0, 0.22)), "left", 0);
      addLabel("肺动脉", "vessel", pa.clone().add(new THREE.Vector3(0.26, 0, 0.14)), "right", 0);
      addLabel(
        "上腔静脉",
        "vessel",
        svc.clone().add(new THREE.Vector3(0.04, 0, 0.17)),
        "right",
        0.36,
      );
      addLabel(
        "下腔静脉",
        "vessel",
        ivc.clone().add(new THREE.Vector3(0.04, 0, -0.12)),
        "right",
        0.36,
        true,
      );
      addLabel(
        "肺静脉",
        "vessel",
        pvLeft.clone().add(new THREE.Vector3(0.38, 0, 0.15)),
        "left",
        0.58,
        true,
      );
      addLabel(
        "肺 · 气体交换",
        "organ",
        LUNG_LEFT.clone().add(new THREE.Vector3(0.04, 0.02, 0.7)),
        null,
        0,
      );
      addLabel(
        "全身组织",
        "organ",
        BODY_POINT.clone().add(new THREE.Vector3(0.18, 0, -0.14)),
        null,
        0,
      );

      openCurrent = openTarget;
      applyClip();
      applyGhost(focusNow);
      applyFocus(focusNow, true);
      updateLabels();
      renderer.render(scene, camera);
      labelRenderer.render(scene, camera);
      ready = true;

      let last = performance.now();
      const tick = (now: number): void => {
        frame = requestAnimationFrame(tick);
        const dtMs = Math.min(64, Math.max(0, now - last));
        last = now;
        const dt = dtMs / 1000;
        if (playingNow) elapsed += dtMs * speedNow;

        const phase = chamberCycle(elapsed);
        const info = chamberPhaseAt(phase);
        if (info.id !== lastPhase) {
          lastPhase = info.id;
          onPhaseRef.current(info.id);
        }
        const av = avOpenness(phase);
        const semi = semilunarOpenness(phase);
        for (const rig of valveRigs) {
          const openness = rig.kind === "av" ? av : semi;
          for (const hinge of rig.hinges) hinge.rotation.y = openness * rig.maxAngle;
        }
        if (atriaGroup) {
          const factor = 1 - 0.09 * atrialContraction(phase);
          atriaGroup.scale.setScalar(factor);
          atriaGroup.position.copy(atriaPivot).multiplyScalar(1 - factor);
        }
        if (ventricleGroup) {
          const factor = 1 - 0.16 * ventricularContraction(phase);
          ventricleGroup.scale.setScalar(factor);
          ventricleGroup.position.copy(ventriclePivot).multiplyScalar(1 - factor);
        }

        if (Math.abs(openTarget - openCurrent) > 0.0005) {
          openCurrent += (openTarget - openCurrent) * Math.min(1, dt * 9);
          if (Math.abs(openTarget - openCurrent) <= 0.0005) openCurrent = openTarget;
          applyClip();
          updateLabels();
        }

        const point = new THREE.Vector3();
        const color = new THREE.Color();
        for (const loop of flowLoops) {
          for (let index = 0; index < PARTICLE_COUNT; index += 1) {
            const current = loop.travel[index] ?? 0;
            let gate = 1;
            for (const window of loop.avWindows) {
              if (inWindow(current, window)) gate = av;
            }
            for (const window of loop.semiWindows) {
              if (inWindow(current, window)) gate = semi;
            }
            let u = current;
            if (playingNow && dtMs > 0) {
              const pace = FLOW_RATE * speedNow * (loop.jitter[index] ?? 1) * (0.16 + 0.84 * gate);
              u = (current + dt * pace) % 1;
              loop.travel[index] = u;
            }
            loop.curve.getPointAt(u, point);
            loop.positions[index * 3] = point.x;
            loop.positions[index * 3 + 1] = point.y;
            loop.positions[index * 3 + 2] = point.z;
            flowColor(u, loop.lungU, color);
            const brightness = 0.36 + 0.64 * gate;
            loop.colors[index * 3] = color.r * brightness;
            loop.colors[index * 3 + 1] = color.g * brightness;
            loop.colors[index * 3 + 2] = color.b * brightness;
          }
          const position = loop.geometry.getAttribute("position") as THREE.BufferAttribute;
          const tint = loop.geometry.getAttribute("color") as THREE.BufferAttribute;
          position.needsUpdate = true;
          tint.needsUpdate = true;
        }

        if (camGoal) {
          const k = 1 - Math.exp(-dt * 6.2);
          camera.position.lerp(camGoal.position, k);
          controls.target.lerp(camGoal.target, k);
          if (
            camera.position.distanceToSquared(camGoal.position) < 0.0004 &&
            controls.target.distanceToSquared(camGoal.target) < 0.0004
          ) {
            camera.position.copy(camGoal.position);
            controls.target.copy(camGoal.target);
            camGoal = null;
          }
        }
        controls.update();
        renderer.render(scene, camera);
        labelRenderer.render(scene, camera);
      };
      frame = requestAnimationFrame(tick);
    }

    const loader = new GLTFLoader();
    const geometries = new Map<string, THREE.BufferGeometry>();

    async function boot(): Promise<void> {
      const manifest = await fetchHeartManifest();
      if (cancelled) return;
      setTotal(manifest.parts.length);
      await Promise.all(
        manifest.parts.map(async (part) => {
          const gltf = await loader.loadAsync(`/assets/${part.file}`);
          let geometry: THREE.BufferGeometry | null = null;
          gltf.scene.traverse((child) => {
            if (child.type !== "Mesh") return;
            const mesh = child as THREE.Mesh;
            geometry ??= mesh.geometry;
            const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
            for (const material of materials) material.dispose();
          });
          if (!geometry) throw new Error(`${part.id} 的 GLB 中没有网格`);
          geometries.set(part.id, geometry);
          if (!cancelled) setLoaded((count) => count + 1);
        }),
      );
      if (cancelled) {
        for (const geometry of geometries.values()) geometry.dispose();
        geometries.clear();
        return;
      }
      build(manifest, geometries);
      if (cancelled) return;
      setStatus({ kind: "ready" });
    }

    void boot().catch((error: unknown) => {
      if (cancelled || disposed) return;
      setStatus({
        kind: "failed",
        reason: `3D 场景加载失败：${error instanceof Error ? error.message : String(error)}。文字讲解与心动周期仍可使用。`,
      });
    });

    return () => {
      cancelled = true;
      disposed = true;
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      controls.dispose();
      scene.environment = null;
      for (const resource of resources) resource.dispose();
      resources.clear();
      disposeGeometries(geometries);
      renderer.dispose();
      host.replaceChildren();
      apiRef.current = null;
      if (labels.length) labels.length = 0;
    };
  }, [supported]);

  useEffect(() => {
    apiRef.current?.setPlaying(playing);
  }, [playing]);

  useEffect(() => {
    apiRef.current?.setSpeed(speed);
  }, [speed]);

  useEffect(() => {
    apiRef.current?.setOpen(openAmount);
  }, [openAmount]);

  useEffect(() => {
    apiRef.current?.setFocus(focus);
  }, [focus]);

  useEffect(() => {
    apiRef.current?.seek(seekMs);
  }, [seekMs, seekToken]);

  useEffect(() => {
    apiRef.current?.replay();
  }, [restartToken]);

  if (!supported) {
    return (
      <div className="heart-scene heart-scene-fallback">
        <p role="status" className="heart-scene-status">
          当前浏览器不支持 WebGL，3D 心脏无法渲染；文字解说与心动周期仍可阅读。
        </p>
      </div>
    );
  }

  return (
    <div className="heart-scene">
      <div ref={hostRef} className="heart-scene-host" aria-hidden="true" />
      {status.kind === "loading" && (
        <p role="status" className="heart-scene-status">
          {total > 0
            ? `正在合成 3D 心脏：${loaded} / ${total} 个部件…`
            : "正在读取 3D 心脏资产清单…"}
        </p>
      )}
      {status.kind === "failed" && (
        <p role="status" className="heart-scene-status is-error">
          {status.reason}
        </p>
      )}
    </div>
  );
}

/** GLTFLoader 交出的几何体不归场景树管，卸载时需要显式释放。 */
function disposeGeometries(geometries: Map<string, THREE.BufferGeometry>): void {
  for (const geometry of geometries.values()) geometry.dispose();
  geometries.clear();
}
