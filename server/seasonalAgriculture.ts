import { sql } from "drizzle-orm";
import { seasonalAgriculturalBurningCalendar, seasonalAgriculturalStateGeometry } from "../drizzle/schema";
import { getDb } from "./db";

const BOUNDARY_SOURCE_URL = "https://github.com/wmgeolab/geoBoundaries/raw/9469f09/releaseData/gbOpen/IND/ADM1/geoBoundaries-IND-ADM1_simplified.geojson";
const CALENDAR_SOURCE_URL = "https://science.nasa.gov/earth/earth-observatory/new-timing-for-stubble-burning-in-india/";
const SUPPORTED_STATES = new Map([["Punjab", "Punjab"], ["Haryāna", "Haryana"], ["Uttar Pradesh", "Uttar Pradesh"], ["Madhya Pradesh", "Madhya Pradesh"]]);

type Position = [number, number];
type PolygonGeometry = { type: "Polygon"; coordinates: Position[][] };
type MultiPolygonGeometry = { type: "MultiPolygon"; coordinates: Position[][][] };
type StateGeometry = PolygonGeometry | MultiPolygonGeometry;
type StateBoundary = { state: string; geometry: StateGeometry };
type CalendarEntry = { state: string; month: number; season: string; contextLevel: string; sourceUrl: string };

export type SeasonalAgriculturalBurningContext = {
  state: "available" | "unavailable";
  geographicState: string | null;
  month: number;
  calendarState: "in_season" | "out_of_season" | "out_of_scope" | "unavailable";
  season: string | null;
  contextLevel: "high" | "context" | null;
  source: string;
  detail: string;
};

const CALENDAR_ENTRIES: CalendarEntry[] = [
  ...[10, 11].flatMap(month => ["Punjab", "Haryana"].map(state => ({ state, month, season: "post-rice harvest", contextLevel: "high", sourceUrl: CALENDAR_SOURCE_URL }))),
  ...[10, 11, 12].flatMap(month => ["Uttar Pradesh", "Madhya Pradesh"].map(state => ({ state, month, season: "post-harvest broader Indo-Gangetic context", contextLevel: "context", sourceUrl: CALENDAR_SOURCE_URL }))),
];

function pointOnRing(lng: number, lat: number, ring: Position[]) {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
    const [x1, y1] = ring[index];
    const [x2, y2] = ring[previous];
    if ((y1 > lat) !== (y2 > lat) && lng < (x2 - x1) * (lat - y1) / (y2 - y1) + x1) inside = !inside;
  }
  return inside;
}

function pointInPolygon(lng: number, lat: number, polygon: Position[][]) {
  return pointOnRing(lng, lat, polygon[0] ?? []) && !polygon.slice(1).some(hole => pointOnRing(lng, lat, hole));
}

export function pointInStateGeometry(lng: number, lat: number, geometry: StateGeometry) {
  return geometry.type === "Polygon"
    ? pointInPolygon(lng, lat, geometry.coordinates)
    : geometry.coordinates.some(polygon => pointInPolygon(lng, lat, polygon));
}

let boundaryReader = async (): Promise<StateBoundary[]> => {
  const db = await getDb();
  if (!db) throw new Error("database unavailable");
  const rows = await db.select().from(seasonalAgriculturalStateGeometry);
  return rows.map(row => ({ state: row.state, geometry: JSON.parse(row.geometry) as StateGeometry }));
};
let calendarReader = async (): Promise<CalendarEntry[]> => {
  const db = await getDb();
  if (!db) throw new Error("database unavailable");
  return await db.select({ state: seasonalAgriculturalBurningCalendar.state, month: seasonalAgriculturalBurningCalendar.month, season: seasonalAgriculturalBurningCalendar.season, contextLevel: seasonalAgriculturalBurningCalendar.contextLevel, sourceUrl: seasonalAgriculturalBurningCalendar.sourceUrl }).from(seasonalAgriculturalBurningCalendar);
};

export function setSeasonalAgriculturalContextForTests(overrides: { boundaries?: () => Promise<StateBoundary[]>; calendar?: () => Promise<CalendarEntry[]> } = {}) {
  boundaryReader = overrides.boundaries ?? (async () => {
    const db = await getDb();
    if (!db) throw new Error("database unavailable");
    const rows = await db.select().from(seasonalAgriculturalStateGeometry);
    return rows.map(row => ({ state: row.state, geometry: JSON.parse(row.geometry) as StateGeometry }));
  });
  calendarReader = overrides.calendar ?? (async () => {
    const db = await getDb();
    if (!db) throw new Error("database unavailable");
    return await db.select({ state: seasonalAgriculturalBurningCalendar.state, month: seasonalAgriculturalBurningCalendar.month, season: seasonalAgriculturalBurningCalendar.season, contextLevel: seasonalAgriculturalBurningCalendar.contextLevel, sourceUrl: seasonalAgriculturalBurningCalendar.sourceUrl }).from(seasonalAgriculturalBurningCalendar);
  });
}

export async function initializeSeasonalAgriculturalContext() {
  const db = await getDb();
  if (!db) return false;
  try {
    await db.insert(seasonalAgriculturalBurningCalendar).values(CALENDAR_ENTRIES).onDuplicateKeyUpdate({
      set: {
        season: sql`VALUES(${seasonalAgriculturalBurningCalendar.season})`,
        contextLevel: sql`VALUES(${seasonalAgriculturalBurningCalendar.contextLevel})`,
        sourceUrl: sql`VALUES(${seasonalAgriculturalBurningCalendar.sourceUrl})`,
      },
    });
    const existing = await db.select({ state: seasonalAgriculturalStateGeometry.state }).from(seasonalAgriculturalStateGeometry);
    if (existing.length >= SUPPORTED_STATES.size) return true;
    const response = await fetch(BOUNDARY_SOURCE_URL, { signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new Error(`state geometry source HTTP ${response.status}`);
    const document = await response.json() as { features?: Array<{ properties?: { shapeName?: string }; geometry?: StateGeometry }> };
    const loadedAt = new Date();
    const states = (document.features ?? []).flatMap(feature => {
      const state = feature.properties?.shapeName ? SUPPORTED_STATES.get(feature.properties.shapeName) : undefined;
      return state && feature.geometry ? [{ state, geometry: JSON.stringify(feature.geometry), sourceUrl: BOUNDARY_SOURCE_URL, loadedAt }] : [];
    });
    if (states.length !== SUPPORTED_STATES.size) throw new Error("published state geometry set is incomplete");
    await db.insert(seasonalAgriculturalStateGeometry).values(states).onDuplicateKeyUpdate({
      set: { geometry: sql`VALUES(${seasonalAgriculturalStateGeometry.geometry})`, sourceUrl: BOUNDARY_SOURCE_URL, loadedAt },
    });
    return true;
  } catch {
    return false;
  }
}

export async function lookupSeasonalAgriculturalBurning(lat: number, lng: number, month = new Date().getUTCMonth() + 1): Promise<SeasonalAgriculturalBurningContext> {
  const unavailable = (): SeasonalAgriculturalBurningContext => ({ state: "unavailable", geographicState: null, month, calendarState: "unavailable", season: null, contextLevel: null, source: "India seasonal agricultural-burning calendar", detail: "The local seasonal agricultural-burning calendar is unavailable; no agricultural interpretation has been inferred." });
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !Number.isInteger(month) || month < 1 || month > 12) return unavailable();
  try {
    const [boundaries, calendar] = await Promise.all([boundaryReader(), calendarReader()]);
    if (boundaries.length === 0) return unavailable();
    const state = boundaries.find(boundary => pointInStateGeometry(lng, lat, boundary.geometry))?.state;
    if (!state) return { state: "available", geographicState: null, month, calendarState: "out_of_scope", season: null, contextLevel: null, source: "NASA Earth Observatory seasonal crop-fire context", detail: "This coordinate is outside the calendar's narrowly mapped agricultural-burning states; no seasonal agricultural context is asserted." };
    const entry = calendar.find(candidate => candidate.state === state && candidate.month === month);
    if (!entry) return { state: "available", geographicState: state, month, calendarState: "out_of_season", season: null, contextLevel: null, source: "NASA Earth Observatory seasonal crop-fire context", detail: `${state} is mapped, but month ${month} is outside the documented calendar period; no seasonal agricultural context is asserted.` };
    return { state: "available", geographicState: state, month, calendarState: "in_season", season: entry.season, contextLevel: entry.contextLevel === "high" ? "high" : "context", source: "NASA Earth Observatory seasonal crop-fire context", detail: `${state} month ${month} is within documented ${entry.season} timing. This is contextual screening evidence, not a cause determination.` };
  } catch {
    return unavailable();
  }
}
