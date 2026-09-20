import React, { useEffect, useRef } from "react";

type Point = { lat: number; lon: number; phase: number };

const indiaHotspots: Point[] = [
  { lat: 28.6, lon: 77.2, phase: 0.1 },
  { lat: 22.6, lon: 88.4, phase: 1.3 },
  { lat: 19.1, lon: 73.0, phase: 2.4 },
  { lat: 17.4, lon: 78.5, phase: 3.2 },
  { lat: 23.3, lon: 75.8, phase: 4.7 },
  { lat: 13.1, lon: 80.3, phase: 5.5 },
];

const normalizeLon = (lon: number) => ((lon + 540) % 360) - 180;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

function project(lat: number, lon: number, rotationLon: number, rotationLat: number, radius: number) {
  const lonDelta = (normalizeLon(lon - rotationLon) * Math.PI) / 180;
  const latRad = (lat * Math.PI) / 180;
  const pitch = (rotationLat * Math.PI) / 180;
  const x = Math.cos(latRad) * Math.sin(lonDelta);
  const y = Math.sin(latRad) * Math.cos(pitch) - Math.cos(latRad) * Math.cos(lonDelta) * Math.sin(pitch);
  const z = Math.sin(latRad) * Math.sin(pitch) + Math.cos(latRad) * Math.cos(lonDelta) * Math.cos(pitch);
  return { x: x * radius, y: -y * radius, z };
}

export function InteractiveEarth() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef({ lon: 78, lat: 10, zoom: 1, velocityLon: 0, velocityLat: 0, dragging: false, lastX: 0, lastY: 0, startedAt: performance.now() });

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

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      ratio = Math.min(2, window.devicePixelRatio || 1);
      width = Math.max(260, rect.width);
      height = Math.max(300, rect.height);
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
    };

    const drawArc = (points: Array<{ x: number; y: number; z: number }>, centerX: number, centerY: number, radius: number, color: string, lineWidth = 0.7) => {
      context.beginPath();
      let visible = false;
      points.forEach((point, index) => {
        if (point.z > -0.04) {
          if (!visible || index === 0) context.moveTo(centerX + point.x, centerY + point.y);
          else context.lineTo(centerX + point.x, centerY + point.y);
          visible = true;
        } else {
          visible = false;
        }
      });
      context.strokeStyle = color;
      context.lineWidth = lineWidth;
      context.stroke();
    };

    const draw = (now: number) => {
      state.lon = normalizeLon(state.lon + state.velocityLon);
      state.lat = clamp(state.lat + state.velocityLat, -55, 55);
      state.velocityLon *= 0.94;
      state.velocityLat *= 0.94;
      const dprWidth = width;
      const dprHeight = height;
      context.clearRect(0, 0, dprWidth, dprHeight);
      context.fillStyle = "#e8f0eb";
      context.fillRect(0, 0, dprWidth, dprHeight);

      const radius = Math.min(dprWidth * 0.34, dprHeight * 0.39) * state.zoom;
      const centerX = dprWidth * 0.48;
      const centerY = dprHeight * 0.56;
      const indiaFacing = Math.abs(normalizeLon(78 - state.lon)) < 42 && Math.abs(20 - state.lat) < 35;
      const age = (now - state.startedAt) / 1000;
      const pulse = 0.5 + Math.sin(age * 1.8) * 0.15;

      const globe = context.createRadialGradient(centerX - radius * 0.28, centerY - radius * 0.3, radius * 0.08, centerX, centerY, radius * 1.05);
      globe.addColorStop(0, "#dbe9e2");
      globe.addColorStop(1, "#b5cec5");
      context.beginPath();
      context.arc(centerX, centerY, radius, 0, Math.PI * 2);
      context.fillStyle = globe;
      context.fill();
      context.save();
      context.beginPath();
      context.arc(centerX, centerY, radius, 0, Math.PI * 2);
      context.clip();

      for (let lat = -60; lat <= 60; lat += 20) {
        const points = Array.from({ length: 181 }, (_, i) => project(lat, i * 2 - 180, state.lon, state.lat, radius));
        drawArc(points, centerX, centerY, radius, "rgba(72, 102, 96, .24)");
      }
      for (let lon = -180; lon < 180; lon += 20) {
        const points = Array.from({ length: 121 }, (_, i) => project(i - 60, lon, state.lon, state.lat, radius));
        drawArc(points, centerX, centerY, radius, "rgba(72, 102, 96, .24)");
      }

      // Simplified land silhouettes: restrained low-poly shapes, intentionally not photorealistic.
      const landShapes = [[[-125, 45], [-70, 52], [-55, 25], [-80, 10], [-115, 20]], [[-15, 35], [35, 60], [75, 42], [52, 10], [5, 5]], [[70, 30], [90, 27], [88, 7], [70, 10], [55, 20]], [[110, 40], [150, 45], [150, 10], [115, 5]], [[-55, -5], [-35, -12], [-45, -50], [-70, -20]]];
      landShapes.forEach(shape => {
        const projected = shape.map(([lon, lat]) => project(lat, lon, state.lon, state.lat, radius));
        context.beginPath();
        projected.forEach((point, index) => index ? context.lineTo(centerX + point.x, centerY + point.y) : context.moveTo(centerX + point.x, centerY + point.y));
        context.closePath();
        context.fillStyle = "rgba(119, 147, 129, .28)";
        context.fill();
        context.strokeStyle = "rgba(77, 111, 101, .35)";
        context.lineWidth = 0.8;
        context.stroke();
      });
      context.restore();

      context.beginPath();
      context.arc(centerX, centerY, radius, 0, Math.PI * 2);
      context.strokeStyle = "rgba(52, 83, 78, .62)";
      context.lineWidth = 1.1;
      context.stroke();

      // Beam target is the centre-facing scan point. India-only activity appears only when India is facing it.
      const beamX = centerX + radius * 0.12;
      const beamY = centerY - radius * 0.02;
      const satX = centerX + radius * 0.54;
      const satY = centerY - radius * 1.08;
      context.save();
      context.globalAlpha = 0.12 + pulse * 0.16;
      context.beginPath();
      context.moveTo(satX - 10, satY + 12);
      context.lineTo(beamX - radius * 0.11, beamY - radius * 0.06);
      context.lineTo(beamX + radius * 0.11, beamY + radius * 0.06);
      context.closePath();
      context.fillStyle = "#d99742";
      context.fill();
      context.restore();
      context.beginPath();
      context.moveTo(satX - 15, satY + 7);
      context.lineTo(satX + 15, satY + 7);
      context.moveTo(satX - 7, satY + 7);
      context.lineTo(satX - 18, satY + 20);
      context.moveTo(satX + 7, satY + 7);
      context.lineTo(satX + 18, satY + 20);
      context.strokeStyle = "#4c6761";
      context.lineWidth = 1.4;
      context.stroke();
      context.fillStyle = "#d99742";
      context.fillRect(satX - 6, satY - 2, 12, 9);

      if (indiaFacing) {
        indiaHotspots.forEach((hotspot, index) => {
          const point = project(hotspot.lat, hotspot.lon, state.lon, state.lat, radius);
          if (point.z < 0) return;
          const visibility = (Math.sin(age * 2.2 + hotspot.phase) + 1) / 2;
          if (visibility < 0.08) return;
          const x = centerX + point.x;
          const y = centerY + point.y;
          context.beginPath();
          context.arc(x, y, 3 + visibility * 3, 0, Math.PI * 2);
          context.fillStyle = `rgba(204, 78, 54, ${0.42 + visibility * 0.5})`;
          context.fill();
          context.beginPath();
          context.arc(x, y, 7 + visibility * 5, 0, Math.PI * 2);
          context.strokeStyle = `rgba(204, 78, 54, ${0.2 + visibility * 0.32})`;
          context.stroke();
          if (index === 0) {
            context.font = '500 8px "IBM Plex Mono", monospace';
            context.fillStyle = "#7a5144";
            context.fillText("INDIA SCAN", x + 9, y - 8);
          }
        });
      }

      context.font = '500 8px "IBM Plex Mono", monospace';
      context.fillStyle = "#63746f";
      context.fillText(indiaFacing ? "INDIA UNDER BEAM · TRANSIENT FIRMS SIGNALS" : "BEAM ACTIVE · INDIA OUTSIDE SCAN WINDOW", 15, 40);
      context.fillStyle = "#657873";
      context.fillText("DRAG TO ROTATE", 15, dprHeight - 18);
      context.fillText("WHEEL TO ZOOM", dprWidth - 92, dprHeight - 18);
      frame = requestAnimationFrame(draw);
    };

    const pointerDown = (event: PointerEvent) => { state.dragging = true; state.lastX = event.clientX; state.lastY = event.clientY; canvas.setPointerCapture(event.pointerId); };
    const pointerMove = (event: PointerEvent) => { if (!state.dragging) return; const dx = event.clientX - state.lastX; const dy = event.clientY - state.lastY; state.lon -= dx * 0.34; state.lat += dy * 0.22; state.velocityLon = -dx * 0.025; state.velocityLat = dy * 0.018; state.lastX = event.clientX; state.lastY = event.clientY; };
    const pointerUp = () => { state.dragging = false; };
    const wheel = (event: WheelEvent) => { event.preventDefault(); state.zoom = clamp(state.zoom - event.deltaY * 0.0007, 0.72, 1.34); };
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

  return <div className="interactive-earth" aria-label="Interactive low-poly Earth scan. Drag to rotate, scroll to zoom."><canvas ref={canvasRef} /><div className="earth-scan-caption"><span>ORBITAL THERMAL SCAN</span><span>INDIA-FOCUSED MONITORING</span></div></div>;
}
