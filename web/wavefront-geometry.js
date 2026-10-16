import {packFan, sampleRay, FRONT_PHASES, FRONT_COLORS} from './wavefronts.js';
import * as THREE from 'three';
import {LineSegments2} from 'three/addons/lines/LineSegments2.js';
import {LineSegmentsGeometry} from 'three/addons/lines/LineSegmentsGeometry.js';
import {LineMaterial} from 'three/addons/lines/LineMaterial.js';

export function createWavefrontGeometry(fan, snapshot, axis, along, group) {
  const across = new THREE.Vector3().crossVectors(axis, along).normalize();
  const anchors = packFan({depth_km: fan.depthKm, policy: fan.policy, gaps: [], segments: (snapshot.stationRays ?? []).flatMap(station => station.arrivals.map(arrival => ({phase: arrival.phase, rays: [{...arrival, anchor: {kind: 'station', stationId: station.stationId, distanceDeg: snapshot.stationArrivals.find(summary => summary.stationId === station.stationId).distanceDeg}}]}))).concat(snapshot.arrivals.map(arrival => ({phase: arrival.phase, rays: [{...arrival, anchor: {kind: 'selected', distanceDeg: snapshot.distanceDeg}}]})))}, fan.modelIdentity);
  const anchorRays = anchors.segments.flatMap(segment => segment.rays);
  const azimuthSteps = 48;
  const rings = azimuthSteps + 1;
  const groups = fan.segments.map((segment, segmentIndex) => {
    const minimum = segment.rays[0].rayParamSRad;
    const maximum = segment.rays.at(-1).rayParamSRad;
    const rays = segment.rays.map(ray => ({ray, samples: fan.samples}));
    for (const ray of anchorRays) if (ray.phase === segment.phase && ray.rayParamSRad >= minimum && ray.rayParamSRad <= maximum && !fan.gaps.some(gap => gap.phase === ray.phase && ray.rayParamSRad > gap.lower_p_s_rad && ray.rayParamSRad < gap.upper_p_s_rad)) rays.push({ray, samples: anchors.samples});
    rays.sort((a, b) => a.ray.rayParamSRad - b.ray.rayParamSRad);
    const unique = rays.filter((item, index) => !index || item.ray.rayParamSRad - rays[index - 1].ray.rayParamSRad > 1e-9);
    const positions = new Float32Array(unique.length * rings * 3);
    const indices = new Uint32Array(Math.max(0, unique.length - 1) * azimuthSteps * 6);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setIndex(new THREE.BufferAttribute(indices, 1).setUsage(THREE.DynamicDrawUsage));
    geometry.setDrawRange(0, 0);
    const material = new THREE.MeshBasicMaterial({color: FRONT_COLORS[segment.phase], transparent: true, opacity: 0.1, side: THREE.DoubleSide, depthTest: false, depthWrite: false, toneMapped: false});
    const mesh = new THREE.Mesh(geometry, material);
    mesh.frustumCulled = false; mesh.renderOrder = 2;
    const contourCapacity = Math.max(1, unique.length - 1) * 4;
    const contourGeometry = new LineSegmentsGeometry().setPositions(new Float32Array(contourCapacity * 6));
    contourGeometry.instanceCount = 0;
    const contourMaterial = new LineMaterial({color: FRONT_COLORS[segment.phase], linewidth: 2.1, transparent: true, opacity: 0.85, depthTest: false, depthWrite: false, toneMapped: false});
    const contour = new LineSegments2(contourGeometry, contourMaterial);
    contour.frustumCulled = false; contour.renderOrder = 3;
    group.add(mesh, contour);
    return {segmentIndex, phase: segment.phase, rays: unique, geometry, material, mesh, contour, contourMeta: new Float64Array(contourCapacity * 5), active: new Uint8Array(unique.length), points: new Float64Array(unique.length * 4)};
  });
  const coordinate = new THREE.Vector3();
  const projected = new THREE.Vector3();
  const contourStartPoint = new THREE.Vector3();
  const contourEndPoint = new THREE.Vector3();
  const sample = new Float64Array(4);
  function point(radial, tangent, azimuth, output) {
    return output.copy(axis).multiplyScalar(radial).addScaledVector(along, tangent * Math.cos(azimuth)).addScaledVector(across, tangent * Math.sin(azimuth));
  }
  return {
    render(timeS, selectedPhase, cutaway, frame, camera, width, height, visible) {
      group.visible = visible;
      const phases = FRONT_PHASES.map(phase => ({phase, triangleCount: 0, contourSegmentCount: 0, activeRayCount: 0, samples: [], adjacencies: []}));
      for (const item of groups) {
        const result = phases.find(phase => phase.phase === item.phase);
        const positions = item.geometry.attributes.position;
        const indices = item.geometry.index;
        let indexCount = 0;
        let contourCount = 0;
        let deepest = -1;
        item.material.opacity = item.phase === selectedPhase ? 0.25 : 0.11;
        item.material.clippingPlanes = cutaway ? [new THREE.Plane(frame.normal, 0), new THREE.Plane(frame.middle, 0)] : [];
        item.contour.material.opacity = item.phase === selectedPhase ? 1 : 0.65;
        item.contour.material.resolution.set(width, height);
        item.contour.visible = cutaway;
        item.contour.material.clippingPlanes = [];
        for (let index = 0; index < item.rays.length; index++) {
          const {ray, samples} = item.rays[index];
          item.active[index] = Number(sampleRay(samples, ray, timeS, sample));
          if (!item.active[index]) continue;
          result.activeRayCount++;
          item.points.set(sample, index * 4);
          if (deepest < 0 || Math.hypot(sample[2], sample[3]) < Math.hypot(item.points[deepest * 4 + 2], item.points[deepest * 4 + 3])) deepest = index;
          for (let azimuth = 0; azimuth <= azimuthSteps; azimuth++) {
            point(sample[2], sample[3], azimuth / azimuthSteps * Math.PI * 2, coordinate);
            positions.setXYZ(index * rings + azimuth, coordinate.x, coordinate.y, coordinate.z);
          }
        }
        for (let index = 1; index < item.rays.length; index++) {
          if (!item.active[index - 1] || !item.active[index]) continue;
          for (let azimuth = 0; azimuth < azimuthSteps; azimuth++) {
            const a = (index - 1) * rings + azimuth;
            const b = index * rings + azimuth;
            indices.array[indexCount++] = a; indices.array[indexCount++] = b; indices.array[indexCount++] = a + 1;
            indices.array[indexCount++] = a + 1; indices.array[indexCount++] = b; indices.array[indexCount++] = b + 1;
          }
          const addContour = (face, firstAzimuth, secondAzimuth) => {
            if (!Number.isFinite(firstAzimuth) || !Number.isFinite(secondAzimuth)) return;
            point(item.points[(index - 1) * 4 + 2], item.points[(index - 1) * 4 + 3], firstAzimuth, contourStartPoint);
            point(item.points[index * 4 + 2], item.points[index * 4 + 3], secondAzimuth, contourEndPoint);
            const keep = face === 0 ? frame.middle : frame.normal;
            if (contourStartPoint.dot(keep) < -1e-8 || contourEndPoint.dot(keep) < -1e-8) return;
            item.contour.geometry.attributes.instanceStart.setXYZ(contourCount, contourStartPoint.x, contourStartPoint.y, contourStartPoint.z);
            item.contour.geometry.attributes.instanceEnd.setXYZ(contourCount, contourEndPoint.x, contourEndPoint.y, contourEndPoint.z);
            item.contourMeta.set([face, index - 1, index, firstAzimuth, secondAzimuth], contourCount * 5);
            contourCount++;
          };
          addContour(0, 0, 0); addContour(0, Math.PI, Math.PI);
          const wallAngle = rayIndex => {
            const denominator = item.points[rayIndex * 4 + 3] * frame.middle.dot(along);
            const cosine = -item.points[rayIndex * 4 + 2] * frame.middle.dot(axis) / denominator;
            return Math.abs(cosine) <= 1 ? Math.acos(cosine) : NaN;
          };
          const first = wallAngle(index - 1);
          const second = wallAngle(index);
          addContour(1, first, second); addContour(1, -first, -second);
          if (result.adjacencies.length < 3) result.adjacencies.push({segmentIndex: item.segmentIndex, rayIndices: [index - 1, index], parameters: [item.rays[index - 1].ray.rayParamSRad, item.rays[index].ray.rayParamSRad], endTimesS: [item.rays[index - 1].ray.timeS, item.rays[index].ray.timeS]});
        }
        item.geometry.setDrawRange(0, visible ? indexCount : 0);
        positions.needsUpdate = true; indices.needsUpdate = true;
        item.contour.geometry.instanceCount = visible && cutaway ? contourCount : 0;
        item.contour.geometry.attributes.instanceStart.needsUpdate = true;
        item.contour.geometry.attributes.instanceEnd.needsUpdate = true;
        result.triangleCount += visible ? indexCount / 3 : 0;
        result.contourSegmentCount += visible && cutaway ? contourCount : 0;
        if (deepest >= 0) {
          const ray = item.rays[deepest].ray;
          const vertex = deepest * rings;
          coordinate.fromBufferAttribute(positions, vertex);
          projected.copy(coordinate).project(camera);
          result.samples.push({segmentIndex: item.segmentIndex, rayIndex: deepest, vertexIndex: vertex, anchor: ray.anchor, rayParamSRad: ray.rayParamSRad, timeS, endTimeS: ray.timeS, distanceRad: Math.atan2(item.points[deepest * 4 + 3], item.points[deepest * 4 + 2]), pathDistanceRad: item.points[deepest * 4], pathDepthKm: item.points[deepest * 4 + 1], renderedRadius: coordinate.length(), depthKm: (1 - coordinate.length()) * 6371, modelPosition: [coordinate.x, coordinate.y, -coordinate.z], screenPosition: [(projected.x + 1) * width / 2, (1 - projected.y) * height / 2], onScreen: Math.abs(projected.x) <= 1 && Math.abs(projected.y) <= 1 && projected.z >= -1 && projected.z <= 1});
        }
      }
      return phases;
    },
    inspect() {
      return groups.map(item => {
        const contourCount = item.contour.geometry.instanceCount;
        const contourStart = item.contour.geometry.attributes.instanceStart;
        const contourEnd = item.contour.geometry.attributes.instanceEnd;
        return {segmentIndex: item.segmentIndex, phase: item.phase, rings, azimuthSteps, drawRange: {...item.geometry.drawRange}, rays: item.rays.map(({ray}, index) => ({rayParamSRad: ray.rayParamSRad, endTimeS: ray.timeS, anchor: ray.anchor ? {...ray.anchor} : undefined, active: Boolean(item.active[index])})), indices: Array.from(item.geometry.index.array.subarray(0, item.geometry.drawRange.count)), positions: Array.from(item.geometry.attributes.position.array), contourCount, contours: Array.from({length: contourCount}, (_, index) => ({face: item.contourMeta[index * 5], rayIndices: [item.contourMeta[index * 5 + 1], item.contourMeta[index * 5 + 2]], azimuths: [item.contourMeta[index * 5 + 3], item.contourMeta[index * 5 + 4]], start: [contourStart.getX(index), contourStart.getY(index), contourStart.getZ(index)], end: [contourEnd.getX(index), contourEnd.getY(index), contourEnd.getZ(index)]}))};
      });
    },
    dispose() { for (const item of groups) { group.remove(item.mesh, item.contour); item.geometry.dispose(); item.material.dispose(); item.contour.geometry.dispose(); item.contour.material.dispose(); } },
  };
}
