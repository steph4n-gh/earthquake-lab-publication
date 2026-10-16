import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import {stationPhaseState} from './wavefronts.js';
import {createWavefrontGeometry} from './wavefront-geometry.js';
import { unitVector, projectPath } from './geography.js';

const RADIUS_KM = 6371;
const OUTER_CORE = (RADIUS_KM - 2889) / RADIUS_KM;
const INNER_CORE = (RADIUS_KM - 5153.9) / RADIUS_KM;
const DEGREES = 180 / Math.PI;
const COLORS = { P: 0x7be5bc, S: 0xffc174, PKIKP: 0xd2b1ff };
const globeVector = point => {
  const [x, y, z] = unitVector(point);
  return new THREE.Vector3(x, y, -z);
};
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

function cutFrame(source, receiver) {
  const start = globeVector(source);
  const end = globeVector(receiver);
  const [x, y, z] = projectPath(source, receiver, [{ distance_rad: Math.PI / 2, depth_km: 0 }])[0];
  const along = new THREE.Vector3(x, y, -z);
  const normal = new THREE.Vector3().crossVectors(start, along).normalize();
  const middle = start.clone().add(end);
  if (middle.lengthSq() < 1e-20) middle.copy(start);
  middle.normalize();
  const tangent = new THREE.Vector3().crossVectors(normal, middle).normalize();
  return {
    normal, middle, tangent,
    planes: [new THREE.Plane(normal.clone().negate(), 0), new THREE.Plane(middle.clone().negate(), 0)],
    focusDirection: normal.clone().multiplyScalar(0.75).addScaledVector(middle, 0.62).addScaledVector(tangent, 0.98).normalize(),
  };
}

function disposeGroup(group) {
  group.traverse(object => {
    object.geometry?.dispose();
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) material?.dispose();
  });
  group.clear();
}

function pathIndex(path, time) {
  let low = 0;
  let high = path.length - 1;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (path[middle].time_s < time) low = middle + 1;
    else high = middle;
  }
  return low;
}

export function createGlobe(canvas, investigation, callbacks) {
  const host = canvas.parentElement;
  const overlay = document.createElement('div');
  overlay.dataset.globeOverlay = '';
  Object.assign(overlay.style, { position: 'absolute', inset: '0', pointerEvents: 'none', overflow: 'hidden' });
  host.append(overlay);
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' });
  } catch {
    canvas.dataset.globeStatus = 'unavailable';
    canvas.dataset.earthTexture = 'error';
    overlay.setAttribute('role', 'status');
    overlay.textContent = 'The 3D globe needs WebGL. The recordings, calculations and source controls remain available below.';
    Object.assign(overlay.style, { display: 'grid', placeContent: 'center', padding: '32px', color: '#e5ebd7', font: '14px/1.7 sans-serif' });
    return { render() {}, resize() {}, focusSection() {}, dispose() { overlay.remove(); } };
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.localClippingEnabled = true;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x07121e, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.05, 30);
  const controls = new OrbitControls(camera, canvas);
  controls.enablePan = false;
  controls.enableDamping = false;
  controls.minDistance = 1.5;
  controls.maxDistance = 8;
  controls.minPolarAngle = Math.PI / 180;
  controls.maxPolarAngle = Math.PI - Math.PI / 180;
  controls.rotateSpeed = 0.65;
  controls.zoomSpeed = 0.65;
  const resources = new THREE.Group();
  const interiors = new THREE.Group();
  const section = new THREE.Group();
  const rayGroup = new THREE.Group();
  const markers = new THREE.Group();
  const frontGroup = new THREE.Group();
  resources.add(interiors, section, frontGroup, rayGroup, markers);
  scene.add(resources);
  scene.add(new THREE.AmbientLight(0xa8c4de, 1.3));
  const light = new THREE.DirectionalLight(0xffefdc, 3.1);
  scene.add(light);
  const fill = new THREE.DirectionalLight(0x6da2d8, 0.65);
  fill.position.set(-4, -1, -2);
  scene.add(fill);
  const clippingMaterials = [];
  const clipped = material => { material.clipIntersection = true; clippingMaterials.push(material); return material; };
  const surfaceMaterial = clipped(new THREE.MeshPhongMaterial({ color: 0x315876, emissive: 0x09243b, emissiveIntensity: 0.4, shininess: 18, specular: 0x17394e }));
  const surface = new THREE.Mesh(new THREE.SphereGeometry(1, 128, 96), surfaceMaterial);
  resources.add(surface);
  const atmosphere = new THREE.Mesh(new THREE.SphereGeometry(1.018, 64, 48), clipped(new THREE.MeshBasicMaterial({ color: 0x6ba8db, transparent: true, opacity: 0.075, side: THREE.BackSide, depthWrite: false })));
  resources.add(atmosphere);
  const coreShell = new THREE.Mesh(new THREE.SphereGeometry(OUTER_CORE, 80, 64), clipped(new THREE.MeshPhongMaterial({ color: 0xc27a33, shininess: 10 })));
  const innerShell = new THREE.Mesh(new THREE.SphereGeometry(INNER_CORE, 64, 48), clipped(new THREE.MeshPhongMaterial({ color: 0xffd499, shininess: 12 })));
  interiors.add(coreShell, innerShell);
  const walls = [new THREE.Group(), new THREE.Group()];
  section.add(...walls);
  const wallClips = [new THREE.Plane(), new THREE.Plane()];
  const layers = [
    [OUTER_CORE, (RADIUS_KM - 660) / RADIUS_KM, 0xa56942],
    [(RADIUS_KM - 660) / RADIUS_KM, (RADIUS_KM - 410) / RADIUS_KM, 0xb9814e],
    [(RADIUS_KM - 410) / RADIUS_KM, 1, 0xcf9f65],
    [INNER_CORE, OUTER_CORE, 0xefb768],
    [0, INNER_CORE, 0xffe5b0],
  ];
  walls.forEach((wall, index) => {
    for (const [inside, outside, color] of layers) {
      wall.add(new THREE.Mesh(new THREE.RingGeometry(inside, outside, 192), new THREE.MeshPhongMaterial({ color, shininess: 7, side: THREE.DoubleSide, clippingPlanes: [wallClips[index]], polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 })));
    }
    for (const radius of [1, (RADIUS_KM - 410) / RADIUS_KM, (RADIUS_KM - 660) / RADIUS_KM, OUTER_CORE, INNER_CORE]) {
      const points = Array.from({ length: 257 }, (_, point) => {
        const angle = point / 256 * Math.PI * 2;
        return new THREE.Vector3(Math.cos(angle) * radius, Math.sin(angle) * radius, 0);
      });
      wall.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({ color: 0x513a2f, transparent: true, opacity: radius > OUTER_CORE ? 0.35 : 0.65, clippingPlanes: [wallClips[index]] })));
    }
  });
  const graticulePoints = [];
  const addGraticule = coordinates => {
    for (let index = 1; index < coordinates.length; index++) {
      graticulePoints.push(globeVector(coordinates[index - 1]).multiplyScalar(1.001), globeVector(coordinates[index]).multiplyScalar(1.001));
    }
  };
  for (let latitude = -60; latitude <= 60; latitude += 30) {
    addGraticule(Array.from({ length: 121 }, (_, index) => ({ latitudeDeg: latitude, longitudeDeg: index * 3 - 180 })));
  }
  for (let longitude = -180; longitude < 180; longitude += 30) {
    addGraticule(Array.from({ length: 61 }, (_, index) => ({ latitudeDeg: index * 3 - 90, longitudeDeg: longitude })));
  }
  resources.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(graticulePoints), clipped(new THREE.LineBasicMaterial({ color: 0x9dc6de, transparent: true, opacity: 0.065 }))));
  const markerGeometry = new THREE.SphereGeometry(0.012, 16, 10);
  const stationMarkers = investigation.stations.map(station => {
    const mesh = new THREE.Mesh(markerGeometry, new THREE.MeshBasicMaterial({ color: 0xc8d5a6 }));
    mesh.position.copy(globeVector(station.position).multiplyScalar(1.012));
    mesh.userData.stationId = station.id;
    markers.add(mesh);
    return { station, mesh };
  });
  const source = new THREE.Mesh(new THREE.SphereGeometry(0.019, 20, 12), new THREE.MeshBasicMaterial({ color: 0xffc27a, depthTest: false }));
  source.renderOrder = 5;
  markers.add(source);
  const sourceRing = new THREE.Mesh(new THREE.TorusGeometry(0.033, 0.0018, 8, 48), new THREE.MeshBasicMaterial({ color: 0xffca83, transparent: true, opacity: 0.8, depthTest: false }));
  sourceRing.renderOrder = 5;
  markers.add(sourceRing);
  const catalog = new THREE.Mesh(new THREE.OctahedronGeometry(0.018), new THREE.MeshBasicMaterial({ color: 0xe9ebcf, wireframe: true, depthTest: false }));
  catalog.position.copy(globeVector(investigation.source).multiplyScalar(1.018));
  catalog.renderOrder = 5;
  markers.add(catalog);
  const virtual = new THREE.Mesh(new THREE.OctahedronGeometry(0.022), new THREE.MeshBasicMaterial({ color: 0xd2b1ff, wireframe: true, depthTest: false }));
  virtual.renderOrder = 5;
  markers.add(virtual);
  const fitted = new THREE.Mesh(new THREE.OctahedronGeometry(0.016), new THREE.MeshBasicMaterial({ color: 0x7be5bc, depthTest: false }));
  fitted.renderOrder = 5;
  markers.add(fitted);
  const selectedLabel = makeLabel('#e5edd6');
  const sourceLabel = makeLabel('#f7ca86');
  const virtualLabel = makeLabel('#d6b6ff');
  const catalogLabel = makeLabel('#e5edd6');
  const fitLabel = makeLabel('#7be5bc');
  const northLabel = makeLabel('#e5edd6');
  const packetLabel = document.createElement('div');
  packetLabel.className = 'ray-position';
  packetLabel.setAttribute('aria-live', 'off');
  packetLabel.innerHTML = '<span><em></em> <b></b></span><strong></strong><small></small>';
  const packetFields = ['em', 'b', 'strong', 'small'].map(selector => packetLabel.querySelector(selector));
  overlay.append(packetLabel);
  const textureStatus = document.createElement('div');
  textureStatus.className = 'earth-imagery-status';
  textureStatus.setAttribute('role', 'status');
  textureStatus.textContent = 'Loading NASA surface…';
  overlay.append(textureStatus);
  const focusButton = document.createElement('button');
  focusButton.type = 'button';
  focusButton.textContent = 'Focus cutaway';
  focusButton.setAttribute('aria-label', 'Focus selected ray section');
  Object.assign(focusButton.style, { position: 'absolute', top: '12px', right: '12px', pointerEvents: 'auto', border: '1px solid #8aa99c66', borderRadius: '4px', background: '#082c2beb', color: '#dbe7cd', padding: '9px 12px', minHeight: '44px', font: '12px sans-serif', cursor: 'pointer' });
  overlay.append(focusButton);
  let view;
  let tracks = [];
  let fronts;
  let frontIdentity;
  let frontGeometryKey;
  let frontBuilds = 0;
  let geometryIdentity;
  let selectionIdentity;
  let incomingCamera;
  let applyingCamera = false;
  let disposed = false;
  let width = 1;
  let height = 1;
  let pointerDown;
  const activePointers = new Set();
  let labelBounds = [];
  let packetBounds;
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const sphere = new THREE.Sphere(new THREE.Vector3(), 1);
  let frame;
  let texture;
  const projectedPacket = new THREE.Vector3();
  const lightOffset = new THREE.Vector3(-1, 2, 0.4);
  canvas.dataset.earthTexture = 'loading';
  texture = new THREE.TextureLoader().load(new URL('../fixtures/earth/blue-marble-2004-07-4096.jpg', import.meta.url).href, loaded => {
    if (disposed) { loaded.dispose(); return; }
    texture = loaded;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    surfaceMaterial.color.setHex(0xffffff);
    surfaceMaterial.map = texture;
    surfaceMaterial.needsUpdate = true;
    canvas.dataset.earthTexture = 'ready';
    textureStatus.hidden = true;
    draw();
  }, undefined, () => {
    if (!disposed) {
      texture?.dispose();
      texture = undefined;
      canvas.dataset.earthTexture = 'error';
      textureStatus.textContent = 'NASA surface unavailable. The geometry remains usable.';
      draw();
    }
  });

  function makeLabel(color) {
    const element = document.createElement('div');
    Object.assign(element.style, { position: 'absolute', color, padding: '5px 8px', background: '#082c2be8', border: '1px solid #adc3a02b', borderRadius: '3px', font: '12px/1.4 sans-serif', whiteSpace: 'nowrap', maxWidth: '210px', overflow: 'hidden', textOverflow: 'ellipsis' });
    overlay.append(element);
    return element;
  }

  function label(element, position, text, row) {
    const projected = position.clone().project(camera);
    element.textContent = text;
    element.style.display = projected.z > 1 ? 'none' : '';
    const labelWidth = Math.min(210, element.offsetWidth || 140);
    const labelHeight = element.offsetHeight || 25;
    const x = (projected.x + 1) * width / 2;
    const y = (1 - projected.y) * height / 2;
    element.style.left = `${clamp(x + 12, 10, Math.max(10, width - labelWidth - 10))}px`;
    const left = clamp(x + 12, 10, Math.max(10, width - labelWidth - 10));
    const minTop = view?.experiment.cutaway ? 56 : 10;
    const maxTop = Math.max(minTop, packetBounds && left < packetBounds.right && left + labelWidth > packetBounds.left ? packetBounds.top - labelHeight - 8 : height - 52);
    let top = clamp(y - 12 + row * 26, minTop, maxTop);
    for (let attempt = 0; attempt < 5; attempt++) {
      if (!labelBounds.some(bounds => left < bounds.right && left + labelWidth > bounds.left && top < bounds.bottom && top + labelHeight > bounds.top)) break;
      top = top + 27 > maxTop ? clamp(top - 54, minTop, maxTop) : top + 27;
    }
    element.style.top = `${top}px`;
    labelBounds.push({ left, right: left + labelWidth, top, bottom: top + labelHeight });
    return { x, y };
  }

  function cameraState() {
    return { azimuthDeg: Math.atan2(-camera.position.z, camera.position.x) * DEGREES, elevationDeg: Math.asin(camera.position.y / camera.position.length()) * DEGREES, distance: camera.position.length() };
  }

  function updateSection() {
    if (!view?.snapshot) return;
    frame = cutFrame(view.snapshot.source, view.snapshot.receiver);
    wallClips[0].normal.copy(frame.middle);
    wallClips[1].normal.copy(frame.normal);
    walls[0].quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), frame.normal);
    walls[1].quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), frame.middle);
    canvas.dataset.cutNormals = JSON.stringify(frame.planes.map(plane => plane.normal.toArray()));
  }

  function makeTrack(sourcePoint, receiverPoint, arrival, selected) {
    const positions = projectPath(sourcePoint, receiverPoint, arrival.path).map(([x, y, z]) => new THREE.Vector3(x, y, -z));
    let outline;
    let line;
    let guide;
    if (selected) {
      const flat = positions.flatMap(point => [point.x, point.y, point.z]);
      const geometry = new LineGeometry().setPositions(flat);
      const material = new LineMaterial({ color: COLORS[arrival.phase], linewidth: 3.5, toneMapped: false, depthTest: false, depthWrite: false });
      const outlineMaterial = new LineMaterial({ color: 0x07121e, linewidth: 7, toneMapped: false, depthTest: false, depthWrite: false });
      const guideMaterial = new LineMaterial({ color: COLORS[arrival.phase], linewidth: 2, transparent: true, opacity: 0.32, toneMapped: false, depthTest: false, depthWrite: false });
      for (const item of [material, outlineMaterial, guideMaterial]) item.resolution.set(width, height);
      line = new Line2(geometry, material);
      outline = new Line2(geometry, outlineMaterial);
      guide = new Line2(new LineGeometry().setPositions(flat), guideMaterial);
      outline.renderOrder = 4;
      rayGroup.add(outline);
    } else {
      line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(positions), new THREE.LineBasicMaterial({ color: COLORS[arrival.phase], transparent: true, opacity: 0.24, toneMapped: false, depthTest: false, depthWrite: false }));
      guide = new THREE.Line(new THREE.BufferGeometry().setFromPoints(positions), new THREE.LineBasicMaterial({ color: COLORS[arrival.phase], transparent: true, opacity: 0.08, toneMapped: false, depthTest: false, depthWrite: false }));
    }
    guide.renderOrder = 1;
    line.renderOrder = selected ? 5 : 2;
    const dot = new THREE.Mesh(new THREE.SphereGeometry(selected ? 0.019 : 0.006, 16, 10), new THREE.MeshBasicMaterial({ color: COLORS[arrival.phase], toneMapped: false, depthTest: false, depthWrite: false }));
    if (selected) {
      const halo = new THREE.Mesh(new THREE.SphereGeometry(0.039, 16, 10), new THREE.MeshBasicMaterial({ color: COLORS[arrival.phase], transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, toneMapped: false, depthTest: false, depthWrite: false }));
      const core = new THREE.Mesh(new THREE.SphereGeometry(0.009, 16, 10), new THREE.MeshBasicMaterial({ color: 0xf6fff9, toneMapped: false, depthTest: false, depthWrite: false }));
      const rim = new THREE.Mesh(new THREE.RingGeometry(0.0185, 0.026, 48), new THREE.MeshBasicMaterial({ color: 0x07121e, side: THREE.DoubleSide, toneMapped: false, depthTest: false, depthWrite: false }));
      halo.renderOrder = 6;
      rim.renderOrder = 7;
      core.renderOrder = 9;
      dot.add(halo, rim, core);
    }
    dot.renderOrder = selected ? 8 : 3;
    rayGroup.add(guide, line, dot);
    tracks.push({ arrival, positions, selected, guide, line, outline, dot });
  }

  function rebuildPaths() {
    disposeGroup(rayGroup);
    tracks = [];
    const snapshot = view.snapshot;
    if (!snapshot) return;
    const selected = snapshot.arrivals.filter(arrival => arrival.phase === view.experiment.phase)[view.experiment.branch];
    for (const ray of snapshot.networkRays || []) {
      if (ray.stationId === view.experiment.stationId && selected && ray.arrival.phase === selected.phase && Math.abs(ray.arrival.ray_param_s_rad - selected.ray_param_s_rad) < 1e-8) continue;
      makeTrack(ray.source, ray.receiver, ray.arrival, false);
    }
    if (selected) makeTrack(snapshot.source, snapshot.receiver, selected, true);
    updateSection();
  }

  function draw() {
    if (disposed || !view) return;
    const { experiment, snapshot } = view;
    const cutaway = experiment.cutaway && !!snapshot;
    interiors.visible = cutaway;
    section.visible = cutaway;
    focusButton.hidden = !cutaway;
    for (const material of clippingMaterials) material.clippingPlanes = cutaway ? frame.planes : [];
    camera.updateMatrixWorld();
    const sourcePoint = snapshot?.source || (experiment.context.kind === 'locate' ? experiment.context.candidate : investigation.source);
    source.position.copy(globeVector(sourcePoint).multiplyScalar(cutaway ? 1 - snapshot.source.depthKm / RADIUS_KM : 1.014));
    canvas.dataset.sourcePosition = JSON.stringify([source.position.x, source.position.y, -source.position.z]);
    canvas.dataset.sourceKind = cutaway ? 'source' : 'epicenter';
    sourceRing.position.copy(source.position);
    sourceRing.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), source.position.clone().normalize());
    catalog.visible = experiment.context.kind === 'locate' && experiment.context.revealed;
    const fittedPoint = view.fit?.best;
    const candidateIsFit = fittedPoint && globeVector(fittedPoint).distanceTo(globeVector(sourcePoint)) < 1e-5;
    fitted.visible = experiment.context.kind === 'locate' && !!fittedPoint && !candidateIsFit;
    if (fitted.visible) fitted.position.copy(globeVector(fittedPoint).multiplyScalar(1.018));
    virtual.visible = snapshot?.request?.kind === 'radial';
    if (virtual.visible) virtual.position.copy(globeVector(snapshot.receiver).multiplyScalar(1.018));
    const stationCues = [];
    stationMarkers.forEach(({ station, mesh }) => {
      const selected = station.id === experiment.stationId;
      const arrivals = snapshot?.stationArrivals.find(summary => summary.stationId === station.id)?.arrivals ?? [];
      const cue = stationPhaseState(arrivals, view.playbackTimeS, snapshot?.originOffsetS ?? 0);
      mesh.scale.setScalar((selected ? 1.65 : 1) + cue.pulse * 2.5);
      mesh.material.color.set(cue.phase ? COLORS[cue.phase] : cue.reached.length ? COLORS[cue.reached.at(-1)] : selected ? 0xf4e5a8 : 0xb7d1ac);
      mesh.material.depthTest = false;
      mesh.renderOrder = 7;
      for (const arrival of arrivals) { const catalogTimeS = arrival.timeS + (snapshot?.originOffsetS ?? 0); const elapsed = view.playbackTimeS - catalogTimeS; stationCues.push({stationId: station.id, phase: arrival.phase, branch: arrival.branch, travelTimeS: arrival.timeS, catalogTimeS, reached: elapsed >= 0, pulse: elapsed >= 0 && elapsed < 24 ? 1 - elapsed / 24 : 0}); }
    });
    const rayTime = view.playbackTimeS - (snapshot?.originOffsetS || 0);
    const frontPhases = fronts?.render(rayTime, experiment.phase, cutaway, frame, camera, width, height, Boolean(experiment.wavefronts && snapshot && view.fan?.depthKm === snapshot.source.depthKm)) ?? [];
    canvas.dataset.wavefronts = JSON.stringify({timeS: rayTime, catalogTimeS: view.playbackTimeS, depthKm: view.fan?.depthKm, policy: view.fan?.policy, modelIdentity: view.fan?.modelIdentity, fanRevision: view.fanRevision ?? 0, preparationCount: view.fanPreparationCount ?? 0, geometryBuilds: frontBuilds, byteLength: view.fan?.byteLength ?? 0, rayCount: view.fan?.rayCount ?? 0, visible: frontGroup.visible && !!fronts && experiment.wavefronts && !!snapshot, phases: frontPhases, stationCues});
    canvas.dataset.playbackTimeS = String(view.playbackTimeS);
    canvas.dataset.rayTimeS = String(rayTime);
    delete canvas.dataset.selectedPacket;
    delete canvas.dataset.selectedPath;
    packetLabel.hidden = true;
    for (const track of tracks) {
      const { path } = track.arrival;
      const index = pathIndex(path, rayTime);
      const geometry = track.line.geometry;
      const completedSegments = rayTime < 0 ? 0 : index;
      if (track.selected) geometry.instanceCount = completedSegments;
      else geometry.setDrawRange(0, completedSegments ? index + 1 : 0);
      const attribute = track.selected ? geometry.attributes.instanceEnd : geometry.attributes.position;
      if (track.previousIndex !== undefined) {
        const original = track.positions[track.previousIndex];
        attribute.setXYZ(track.selected ? track.previousIndex - 1 : track.previousIndex, original.x, original.y, original.z);
        attribute.needsUpdate = true;
        track.previousIndex = undefined;
      }
      if (track.selected) {
        canvas.dataset.selectedPath = JSON.stringify({ phase: track.arrival.phase, fullPointCount: track.positions.length, guideSegmentCount: track.guide.geometry.instanceCount, completedSegmentCount: geometry.instanceCount });
      }
      track.dot.visible = rayTime >= 0 && rayTime <= track.arrival.time_s;
      if (track.selected) track.dot.quaternion.copy(camera.quaternion);
      if (track.dot.visible) {
        let fraction = 0;
        if (index === 0) track.dot.position.copy(track.positions[0]);
        else {
          fraction = clamp((rayTime - path[index - 1].time_s) / (path[index].time_s - path[index - 1].time_s), 0, 1);
          track.dot.position.lerpVectors(track.positions[index - 1], track.positions[index], fraction);
        }
        if (track.selected) {
          projectedPacket.copy(track.dot.position).project(camera);
          const screenX = (projectedPacket.x + 1) * width / 2;
          const screenY = (1 - projectedPacket.y) * height / 2;
          canvas.dataset.selectedPacket = JSON.stringify({ phase: track.arrival.phase, timeS: rayTime, index, fraction, modelPosition: [track.dot.position.x, track.dot.position.y, -track.dot.position.z], screenPosition: [screenX, screenY], onScreen: projectedPacket.z >= -1 && projectedPacket.z <= 1 && Math.abs(projectedPacket.x) <= 1 && Math.abs(projectedPacket.y) <= 1 });
          const previous = path[Math.max(0, index - 1)];
          const depthKm = THREE.MathUtils.lerp(previous.depth_km, path[index].depth_km, fraction);
          const material = depthKm >= 5153.9 ? 'Solid inner core' : depthKm >= 2889 ? 'Liquid outer core' : 'Crust and mantle';
          packetLabel.hidden = false;
          packetLabel.style.setProperty('--packet-color', `#${COLORS[track.arrival.phase].toString(16).padStart(6, '0')}`);
          const values = [track.arrival.phase, `${rayTime.toFixed(1)} s`, `${Math.round(depthKm).toLocaleString()} km deep`, material];
          packetFields.forEach((element, field) => { if (element.textContent !== values[field]) element.textContent = values[field]; });
        }
        if (index > 0) {
          attribute.setXYZ(track.selected ? index - 1 : index, track.dot.position.x, track.dot.position.y, track.dot.position.z);
          attribute.needsUpdate = true;
          track.previousIndex = index;
        }
      }
    }
    light.position.copy(camera.position).add(lightOffset);
    labelBounds = [];
    packetBounds = packetLabel.hidden ? undefined : { left: packetLabel.offsetLeft, right: packetLabel.offsetLeft + packetLabel.offsetWidth, top: packetLabel.offsetTop };
    const currentStation = stationMarkers.find(({ station }) => station.id === experiment.stationId);
    let selectedPosition;
    if (currentStation) {
      const farSide = globeVector(currentStation.station.position).dot(camera.position) < 1;
      selectedPosition = label(selectedLabel, currentStation.mesh.position, `${currentStation.station.code} · ${farSide ? 'far side' : 'selected station'}`, 0);
    }
    const projectedSource = source.position.clone().project(camera);
    const sourceX = (projectedSource.x + 1) * width / 2;
    const sourceY = (1 - projectedSource.y) * height / 2;
    const overlap = selectedPosition && Math.abs(sourceX - selectedPosition.x) < 150 && Math.abs(sourceY - selectedPosition.y) < 28;
    label(sourceLabel, source.position, experiment.context.kind === 'locate' ? candidateIsFit ? 'Model fit / candidate' : 'Candidate source' : `${investigation.shortTitle || investigation.title || investigation.id} · ${cutaway ? `${snapshot.source.depthKm.toFixed(0)} km source` : 'epicenter'}`, overlap ? 1 : 0);
    catalogLabel.hidden = !catalog.visible;
    if (catalog.visible) label(catalogLabel, catalog.position, 'Catalog reference', 1);
    fitLabel.hidden = !fitted.visible;
    if (fitted.visible) label(fitLabel, fitted.position, 'Model fit', 1);
    virtualLabel.hidden = !virtual.visible;
    if (virtual.visible) label(virtualLabel, virtual.position, 'Hypothetical receiver', 1);
    northLabel.hidden = camera.position.y < 0.5;
    if (!northLabel.hidden) label(northLabel, new THREE.Vector3(0, 1.035, 0), 'N · North pole', 0);
    renderer.render(scene, camera);
    const actualCamera = cameraState();
    canvas.dataset.cameraAzimuth = String(actualCamera.azimuthDeg);
    canvas.dataset.cameraElevation = String(actualCamera.elevationDeg);
    canvas.dataset.cameraDistance = String(actualCamera.distance);
    canvas.dataset.globeStatus = 'ready';
  }

  function onControlsChange() {
    if (applyingCamera || disposed) return;
    const value = cameraState();
    incomingCamera = JSON.stringify(value);
    callbacks.onCamera?.(value);
    draw();
  }

  function focusSection() {
    if (!view?.snapshot) return;
    const distance = camera.position.length();
    camera.position.copy(frame.focusDirection).multiplyScalar(distance);
    applyingCamera = true;
    controls.update();
    applyingCamera = false;
    onControlsChange();
  }
  focusButton.addEventListener('click', focusSection);

  function onPointerDown(event) {
    activePointers.add(event.pointerId);
    pointerDown = activePointers.size === 1 ? { x: event.clientX, y: event.clientY, time: performance.now() } : null;
  }

  function onPointerUp(event) {
    activePointers.delete(event.pointerId);
    if (!pointerDown || !view || Math.hypot(event.clientX - pointerDown.x, event.clientY - pointerDown.y) > 6 || performance.now() - pointerDown.time > 600) return;
    pointerDown = null;
    const box = canvas.getBoundingClientRect();
    pointer.set((event.clientX - box.left) / box.width * 2 - 1, -(event.clientY - box.top) / box.height * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObjects(stationMarkers.map(station => station.mesh)).find(intersection => intersection.point.clone().normalize().dot(camera.position) > 0.8 || view.experiment.cutaway);
    if (hit) {
      callbacks.onStation?.(hit.object.userData.stationId);
      return;
    }
    if (view.experiment.context.kind !== 'locate') return;
    const point = raycaster.ray.intersectSphere(sphere, new THREE.Vector3());
    if (!point) return;
    callbacks.onCandidate?.({ latitudeDeg: Math.asin(clamp(point.y, -1, 1)) * DEGREES, longitudeDeg: Math.atan2(-point.z, point.x) * DEGREES });
  }

  function onPointerCancel(event) {
    activePointers.delete(event.pointerId);
    pointerDown = null;
  }

  controls.addEventListener('change', onControlsChange);
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerCancel);
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  resize();

  function resize() {
    if (disposed) return;
    width = Math.max(1, canvas.clientWidth || host.clientWidth);
    height = Math.max(1, canvas.clientHeight || host.clientHeight);
    renderer.setSize(width, height, false);
    for (const track of tracks) {
      if (!track.selected) continue;
      track.line.material.resolution.set(width, height);
      track.outline.material.resolution.set(width, height);
      track.guide.material.resolution.set(width, height);
    }
    camera.aspect = width / height;
    camera.fov = 2 * Math.atan(Math.tan(19 * Math.PI / 180) / Math.min(1, camera.aspect)) * DEGREES;
    camera.updateProjectionMatrix();
    draw();
  }

  return {
    render(nextView) {
      if (disposed) return;
      view = nextView;
      const cameraIdentity = JSON.stringify(view.experiment.camera);
      if (cameraIdentity !== incomingCamera) {
        incomingCamera = cameraIdentity;
        const value = view.experiment.camera;
        applyingCamera = true;
        camera.position.copy(globeVector({ latitudeDeg: value.elevationDeg, longitudeDeg: value.azimuthDeg }).multiplyScalar(value.distance));
        controls.update();
        applyingCamera = false;
      }
      const nextSelection = `${view.experiment.stationId}/${view.experiment.phase}/${view.experiment.branch}`;
      if (geometryIdentity !== view.snapshot || selectionIdentity !== nextSelection) {
        geometryIdentity = view.snapshot;
        selectionIdentity = nextSelection;
        rebuildPaths();
      }
      const nextFrontGeometry = view.snapshot ? `${view.snapshot.source.latitudeDeg}/${view.snapshot.source.longitudeDeg}/${view.snapshot.source.depthKm}/${view.snapshot.distanceDeg}` : null;
      if (frontIdentity !== view.fan || frontGeometryKey !== nextFrontGeometry) {
        fronts?.dispose(); fronts = undefined;
        frontIdentity = view.fan; frontGeometryKey = nextFrontGeometry;
        if (view.fan && view.snapshot && view.fan.depthKm === view.snapshot.source.depthKm) {
          const axis = globeVector(view.snapshot.source);
          const [x, y, z] = projectPath(view.snapshot.source, view.snapshot.receiver, [{distance_rad: Math.PI / 2, depth_km: 0}])[0];
          fronts = createWavefrontGeometry(view.fan, view.snapshot, axis, new THREE.Vector3(x, y, -z), frontGroup);
          frontBuilds++;
        }
      }
      draw();
    },
    resize,
    focusSection,
    inspectFronts() {return fronts?.inspect() ?? [];},
    dispose() {
      disposed = true;
      observer.disconnect();
      controls.removeEventListener('change', onControlsChange);
      controls.dispose();
      focusButton.removeEventListener('click', focusSection);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerCancel);
      fronts?.dispose();
      disposeGroup(resources);
      markerGeometry.dispose();
      texture?.dispose();
      renderer.dispose();
      overlay.remove();
      canvas.dataset.globeStatus = 'disposed';
    },
  };
}
