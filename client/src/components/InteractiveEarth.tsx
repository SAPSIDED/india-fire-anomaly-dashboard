import React, { useEffect, useRef } from "react";
import worldCountriesRaw from "@/data/worldCountries.geojson?raw";

type CountryGeometry =
  | { type: "Polygon"; coordinates: number[][][] }
  | { type: "MultiPolygon"; coordinates: number[][][][] };
type CountryFeature = { geometry: CountryGeometry | null; properties?: { NAME?: string } };
type CountryCollection = { features: CountryFeature[] };
type GeoPoint = { lat: number; lon: number; name?: string };
type LiveHotspot = GeoPoint & { born: number; life: number; phase: number };

const countryCollection = JSON.parse(worldCountriesRaw) as CountryCollection;

const countryLabels: GeoPoint[] = countryCollection.features.flatMap(feature => {
  if (!feature.geometry || !feature.properties?.NAME) return [];
  const rings = feature.geometry.type === "Polygon"
    ? feature.geometry.coordinates
    : feature.geometry.coordinates.flat();
  const ring = rings[0];
  if (!ring?.length) return [];
  const anchor = ring.reduce((sum, [lon, lat]) => ({ lon: sum.lon + lon, lat: sum.lat + lat }), { lon: 0, lat: 0 });
  return [{ name: feature.properties.NAME, lon: anchor.lon / ring.length, lat: anchor.lat / ring.length }];
});

const cityLabels: GeoPoint[] = [
  { name: "Delhi", lat: 28.61, lon: 77.21 },
  { name: "Mumbai", lat: 19.08, lon: 72.88 },
  { name: "Kolkata", lat: 22.57, lon: 88.36 },
  { name: "Singapore", lat: 1.35, lon: 103.82 },
  { name: "Cairo", lat: 30.04, lon: 31.24 },
  { name: "London", lat: 51.51, lon: -0.13 },
  { name: "New York", lat: 40.71, lon: -74.01 },
  { name: "Tokyo", lat: 35.68, lon: 139.69 },
];

// Land-biased candidates: representative populated/continental areas, never deep-ocean points.
const landCandidates: GeoPoint[] = [
  { lat: 28, lon: 77 }, { lat: 22, lon: 88 }, { lat: 19, lon: 73 }, { lat: 13, lon: 80 },
  { lat: 35, lon: 105 }, { lat: 31, lon: 121 }, { lat: 23, lon: 90 }, { lat: 14, lon: 108 },
  { lat: 40, lon:  -3 }, { lat: 52, lon: 13 }, { lat: 45, lon: 28 }, { lat: 30, lon: 31 },
  { lat: 15, lon:  -1 }, { lat: -1, lon: 36 }, { lat: -26, lon: 28 }, { lat: -33, lon: 18 },
  { lat:  -6, lon: 106 }, { lat: -23, lon: 133 }, { lat: -37, lon: 145 }, { lat:  -8, lon: -55 },
  { lat: -34, lon: -58 }, { lat:  19, lon: -99 }, { lat:  40, lon: -97 }, { lat:  34, lon: -118 },
  { lat:  52, lon: -106 }, { lat:  61, lon:  25 }, { lat:  35, lon: 139 }, { lat:  30, lon:  -90 },
];

const normalizeLon = (lon: number) => ((lon + 540) % 360) - 180;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const hashColor = (index: number) => ["#9aa67f", "#b1a778", "#7f9a7a", "#c0ad7b", "#879b84"][index % 5];

function project(lat: number, lon: number, rotationLon: number, rotationLat: number, radius: number) {
  const lonDelta = (normalizeLon(lon - rotationLon) * Math.PI) / 180;
  const latRad = (lat * Math.PI) / 180;
  const pitch = (rotationLat * Math.PI) / 180;
  const x = Math.cos(latRad) * Math.sin(lonDelta);
  const y = Math.sin(latRad) * Math.cos(pitch) - Math.cos(latRad) * Math.cos(lonDelta) * Math.sin(pitch);
  const z = Math.sin(latRad) * Math.sin(pitch) + Math.cos(latRad) * Math.cos(lonDelta) * Math.cos(pitch);
  return { x: x * radius, y: -y * radius, z };
}

function firstSphereIntersection(
  origin: { x: number; y: number },
  target: { x: number; y: number },
  center: { x: number; y: number },
  radius: number,
) {
  const dx = target.x - origin.x;
  const dy = target.y - origin.y;
  const ox = origin.x - center.x;
  const oy = origin.y - center.y;
  const a = dx * dx + dy * dy;
  const b = 2 * (ox * dx + oy * dy);
  const c = ox * ox + oy * oy - radius * radius;
  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0 || a === 0) return target;
  const near = (-b - Math.sqrt(discriminant)) / (2 * a);
  const far = (-b + Math.sqrt(discriminant)) / (2 * a);
  const t = [near, far].filter(candidate => candidate >= 0 && candidate <= 1).sort((left, right) => left - right)[0] ?? 1;
  return { x: origin.x + dx * t, y: origin.y + dy * t };
}

export function InteractiveEarth() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef({
    lon: 78, lat: 10, zoom: 1, velocityLon: 0, velocityLat: 0, dragging: false,
    lastX: 0, lastY: 0, lastInteraction: 0, startedAt: performance.now(),
    hotspots: [] as LiveHotspot[], nextSpawn: 0,
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    const state = stateRef.current;
    let frame = 0;
    let width = 0;
    let height = 0;
    let ratio = 1;
    const random = () => Math.random();

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      ratio = Math.min(2, window.devicePixelRatio || 1);
      width = Math.max(260, rect.width);
      height = Math.max(300, rect.height);
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
    };

    const drawArc = (points: Array<{ x: number; y: number; z: number }>, centerX: number, centerY: number, color: string, lineWidth = 0.7) => {
      context.beginPath();
      let visible = false;
      points.forEach((point, index) => {
        if (point.z > -0.04) {
          if (!visible || index === 0) context.moveTo(centerX + point.x, centerY + point.y);
          else context.lineTo(centerX + point.x, centerY + point.y);
          visible = true;
        } else visible = false;
      });
      context.strokeStyle = color;
      context.lineWidth = lineWidth;
      context.stroke();
    };

    const spawnHotspot = (now: number) => {
      const candidate = landCandidates[Math.floor(random() * landCandidates.length)];
      state.hotspots.push({ ...candidate, born: now, life: 2.2 + random() * 1.2, phase: random() * Math.PI * 2 });
      state.nextSpawn = now + 420 + random() * 1100;
    };

    const draw = (now: number) => {
      const age = (now - state.startedAt) / 1000;
      const idle = now - state.lastInteraction > 900;
      if (!state.dragging) {
        if (idle) state.velocityLon = state.velocityLon * 0.985 + 0.006;
        state.lon = normalizeLon(state.lon + state.velocityLon);
        state.lat = clamp(state.lat + state.velocityLat, -55, 55);
        state.velocityLon *= 0.94;
        state.velocityLat *= 0.94;
      }
      if (now > state.nextSpawn || state.hotspots.length === 0) spawnHotspot(now);
      state.hotspots = state.hotspots.filter(hotspot => now - hotspot.born < hotspot.life * 1000);
      const dprWidth = width;
      const dprHeight = height;
      context.clearRect(0, 0, dprWidth, dprHeight);
      const baseRadius = Math.min(dprWidth * 0.34, dprHeight * 0.38);
      const radius = Math.min(baseRadius * state.zoom, Math.min(dprWidth, dprHeight) * 0.47);
      const centerX = dprWidth * 0.48;
      const centerY = dprHeight * 0.56;
      const pulse = 0.5 + Math.sin(age * 1.6) * 0.14;

      const ocean = context.createRadialGradient(centerX - radius * 0.3, centerY - radius * 0.35, radius * 0.05, centerX, centerY, radius * 1.08);
      ocean.addColorStop(0, "#7da9ba");
      ocean.addColorStop(0.55, "#4d8197");
      ocean.addColorStop(1, "#244e66");
      context.beginPath();
      context.arc(centerX, centerY, radius, 0, Math.PI * 2);
      context.fillStyle = ocean;
      context.fill();
      context.save();
      context.beginPath();
      context.arc(centerX, centerY, radius, 0, Math.PI * 2);
      context.clip();

      for (let lat = -60; lat <= 60; lat += 20) {
        drawArc(Array.from({ length: 181 }, (_, i) => project(lat, i * 2 - 180, state.lon, state.lat, radius)), centerX, centerY, "rgba(213, 236, 239, .18)");
      }
      for (let lon = -180; lon < 180; lon += 20) {
        drawArc(Array.from({ length: 121 }, (_, i) => project(i - 60, lon, state.lon, state.lat, radius)), centerX, centerY, "rgba(213, 236, 239, .16)");
      }

      countryCollection.features.forEach((feature, featureIndex) => {
        if (!feature.geometry) return;
        const polygons = feature.geometry.type === "Polygon" ? [feature.geometry.coordinates] : feature.geometry.coordinates;
        polygons.forEach(polygon => polygon.forEach(ring => {
          context.beginPath();
          ring.forEach(([lon, lat], index) => {
            const point = project(lat, lon, state.lon, state.lat, radius);
            if (index === 0) context.moveTo(centerX + point.x, centerY + point.y);
            else context.lineTo(centerX + point.x, centerY + point.y);
          });
          context.closePath();
          context.fillStyle = hashColor(featureIndex);
          context.globalAlpha = 0.83;
          context.fill();
          context.globalAlpha = 1;
          context.strokeStyle = "rgba(43, 69, 70, .55)";
          context.lineWidth = state.zoom > 1.1 ? 0.85 : 0.55;
          context.stroke();
        }));
      });

      const labelPoints = state.zoom < 1.04 ? [] : state.zoom < 1.2 ? countryLabels : [...countryLabels, ...cityLabels];
      labelPoints.forEach(label => {
        const point = project(label.lat, label.lon, state.lon, state.lat, radius);
        if (point.z < 0.15) return;
        context.font = `${state.zoom > 1.2 ? 8 : 7}px "IBM Plex Mono", monospace`;
        context.fillStyle = "rgba(231, 242, 237, .88)";
        context.fillText(label.name ?? "", centerX + point.x + 4, centerY + point.y - 4);
      });
      context.restore();

      context.beginPath();
      context.arc(centerX, centerY, radius, 0, Math.PI * 2);
      context.strokeStyle = "rgba(38, 77, 91, .78)";
      context.lineWidth = 1.25;
      context.stroke();

      // A modest inclined orbit keeps the satellite in a separate, believable motion loop.
      const orbit = age * 0.22;
      const satX = centerX + Math.cos(orbit) * radius * 1.18;
      const satY = centerY - radius * 0.88 + Math.sin(orbit) * radius * 0.28;
      const satScale = 0.78 + (Math.sin(orbit) + 1) * 0.1;
      const surfacePoint = firstSphereIntersection(
        { x: satX, y: satY },
        { x: centerX + Math.cos(orbit) * radius * 0.18, y: centerY + Math.sin(orbit) * radius * 0.18 },
        { x: centerX, y: centerY },
        radius,
      );
      context.save();
      context.globalAlpha = 0.1 + pulse * 0.14;
      context.beginPath();
      context.moveTo(satX, satY + 10 * satScale);
      context.lineTo(surfacePoint.x - radius * 0.025, surfacePoint.y - radius * 0.02);
      context.lineTo(surfacePoint.x + radius * 0.025, surfacePoint.y + radius * 0.02);
      context.closePath();
      context.fillStyle = "#efd18e";
      context.fill();
      context.restore();
      context.beginPath();
      context.moveTo(satX, satY + 8 * satScale);
      context.lineTo(surfacePoint.x, surfacePoint.y);
      context.strokeStyle = `rgba(239, 209, 142, ${0.22 + pulse * 0.18})`;
      context.lineWidth = 0.8;
      context.stroke();
      context.beginPath();
      context.arc(surfacePoint.x, surfacePoint.y, 4 + pulse * 3, 0, Math.PI * 2);
      context.strokeStyle = `rgba(239, 209, 142, ${0.3 + pulse * 0.22})`;
      context.stroke();

      context.save();
      context.translate(satX, satY);
      context.rotate(orbit + 0.25);
      context.scale(satScale, satScale);
      context.fillStyle = "#263d47";
      context.fillRect(-11, -7, 22, 14);
      context.fillStyle = "#b6a56f";
      context.fillRect(-7, -4, 14, 7);
      context.strokeStyle = "#172b36";
      context.lineWidth = 1;
      context.strokeRect(-11, -7, 22, 14);
      context.fillStyle = "#688fa3";
      context.fillRect(-35, -5, 20, 10);
      context.fillRect(15, -5, 20, 10);
      context.strokeStyle = "rgba(218, 231, 225, .46)";
      for (let panelX = -32; panelX <= 32; panelX += 6) {
        if (Math.abs(panelX) < 13) continue;
        context.beginPath(); context.moveTo(panelX, -5); context.lineTo(panelX, 5); context.stroke();
      }
      context.strokeRect(-35, -5, 20, 10);
      context.strokeRect(15, -5, 20, 10);
      context.beginPath();
      context.moveTo(0, 7); context.lineTo(0, 19); context.lineTo(11, 24); context.moveTo(0, 19); context.lineTo(-11, 24);
      context.stroke();
      context.beginPath(); context.arc(0, 23, 4, 0, Math.PI * 2); context.stroke();
      context.beginPath(); context.arc(0, -13, 5, Math.PI, Math.PI * 2); context.stroke();
      context.beginPath(); context.moveTo(0, -13); context.lineTo(0, -20); context.stroke();
      context.restore();

      state.hotspots.forEach(hotspot => {
        const point = project(hotspot.lat, hotspot.lon, state.lon, state.lat, radius);
        if (point.z < 0.02) return;
        const elapsed = (now - hotspot.born) / 1000;
        const fadeIn = Math.min(1, elapsed / 0.45);
        const fadeOut = Math.min(1, Math.max(0, (hotspot.life - elapsed) / 0.6));
        const visibility = Math.min(fadeIn, fadeOut) * (0.78 + Math.sin(age * 2.2 + hotspot.phase) * 0.12);
        const x = centerX + point.x;
        const y = centerY + point.y;
        context.beginPath(); context.arc(x, y, 3 + visibility * 2.7, 0, Math.PI * 2);
        context.fillStyle = `rgba(224, 86, 60, ${visibility})`; context.fill();
        context.beginPath(); context.arc(x, y, 8 + visibility * 6, 0, Math.PI * 2);
        context.strokeStyle = `rgba(249, 181, 90, ${visibility * 0.52})`; context.stroke();
      });

      frame = requestAnimationFrame(draw);
    };

    const pointerDown = (event: PointerEvent) => {
      state.dragging = true; state.lastInteraction = performance.now(); state.lastX = event.clientX; state.lastY = event.clientY; state.velocityLon = 0; state.velocityLat = 0; canvas.setPointerCapture(event.pointerId);
    };
    const pointerMove = (event: PointerEvent) => {
      if (!state.dragging) return;
      const dx = event.clientX - state.lastX; const dy = event.clientY - state.lastY;
      state.lon -= dx * 0.34; state.lat = clamp(state.lat + dy * 0.22, -55, 55);
      state.velocityLon = -dx * 0.025; state.velocityLat = dy * 0.018; state.lastX = event.clientX; state.lastY = event.clientY; state.lastInteraction = performance.now();
    };
    const pointerUp = () => { state.dragging = false; state.lastInteraction = performance.now(); };
    const wheel = (event: WheelEvent) => { event.preventDefault(); state.zoom = clamp(state.zoom - event.deltaY * 0.0007, 0.72, 1.34); state.lastInteraction = performance.now(); };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    canvas.addEventListener("pointerdown", pointerDown);
    canvas.addEventListener("pointermove", pointerMove);
    canvas.addEventListener("pointerup", pointerUp);
    canvas.addEventListener("pointercancel", pointerUp);
    canvas.addEventListener("wheel", wheel, { passive: false });
    frame = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(frame); observer.disconnect(); canvas.removeEventListener("pointerdown", pointerDown); canvas.removeEventListener("pointermove", pointerMove); canvas.removeEventListener("pointerup", pointerUp); canvas.removeEventListener("pointercancel", pointerUp); canvas.removeEventListener("wheel", wheel); };
  }, []);

  return <div className="interactive-earth" aria-label="Interactive realistic Earth visualization. Drag to rotate, scroll to zoom."><canvas ref={canvasRef} /></div>;
}
