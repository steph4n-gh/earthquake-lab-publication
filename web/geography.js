const RADIANS = Math.PI / 180;
const EARTH_RADIUS_KM = 6371;
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

export function unitVector(point) {
  const latitude = point.latitudeDeg * RADIANS;
  const longitude = point.longitudeDeg * RADIANS;
  return [Math.cos(latitude) * Math.cos(longitude), Math.sin(latitude), Math.cos(latitude) * Math.sin(longitude)];
}

export function greatCircleDeg(a, b) {
  const latitudeA = a.latitudeDeg * RADIANS;
  const latitudeB = b.latitudeDeg * RADIANS;
  const halfLatitude = (latitudeB - latitudeA) / 2;
  const halfLongitude = (b.longitudeDeg - a.longitudeDeg) * RADIANS / 2;
  const haversine = Math.sin(halfLatitude) ** 2 + Math.cos(latitudeA) * Math.cos(latitudeB) * Math.sin(halfLongitude) ** 2;
  return 2 * Math.atan2(Math.sqrt(clamp(haversine, 0, 1)), Math.sqrt(clamp(1 - haversine, 0, 1))) / RADIANS;
}

export function bearingDeg(a, b) {
  const latitudeA = a.latitudeDeg * RADIANS;
  const latitudeB = b.latitudeDeg * RADIANS;
  const longitude = (b.longitudeDeg - a.longitudeDeg) * RADIANS;
  return (Math.atan2(Math.sin(longitude) * Math.cos(latitudeB), Math.cos(latitudeA) * Math.sin(latitudeB) - Math.sin(latitudeA) * Math.cos(latitudeB) * Math.cos(longitude)) / RADIANS + 360) % 360;
}

export function destination(a, bearing, distance) {
  const latitude = a.latitudeDeg * RADIANS;
  const longitude = a.longitudeDeg * RADIANS;
  const angle = distance * RADIANS;
  const direction = bearing * RADIANS;
  const resultLatitude = Math.asin(clamp(Math.sin(latitude) * Math.cos(angle) + Math.cos(latitude) * Math.sin(angle) * Math.cos(direction), -1, 1));
  const resultLongitude = longitude + Math.atan2(Math.sin(direction) * Math.sin(angle) * Math.cos(latitude), Math.cos(angle) - Math.sin(latitude) * Math.sin(resultLatitude));
  return { latitudeDeg: resultLatitude / RADIANS, longitudeDeg: ((resultLongitude / RADIANS + 540) % 360) - 180 };
}

export function projectPath(source, receiver, path) {
  const start = unitVector(source);
  const end = unitVector(receiver);
  const dot = clamp(start.reduce((sum, value, index) => sum + value * end[index], 0), -1, 1);
  let tangent = end.map((value, index) => value - dot * start[index]);
  let length = Math.hypot(...tangent);
  if (length < 1e-12) {
    const fallback = unitVector(destination(source, 90, 90));
    const projection = fallback.reduce((sum, value, index) => sum + value * start[index], 0);
    tangent = fallback.map((value, index) => value - projection * start[index]);
    length = Math.hypot(...tangent);
  }
  tangent = tangent.map(value => value / length);
  return path.map(point => {
    const radius = (EARTH_RADIUS_KM - point.depth_km) / EARTH_RADIUS_KM;
    return start.map((value, index) => radius * (Math.cos(point.distance_rad) * value + Math.sin(point.distance_rad) * tangent[index]));
  });
}
