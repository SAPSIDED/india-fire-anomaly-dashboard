import { date, decimal, index, int, mysqlEnum, mysqlTable, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/** Timestamped, auditable cache of successful upstream evidence responses. */
export const sourceEvidenceCache = mysqlTable("sourceEvidenceCache", {
  cacheKey: varchar("cacheKey", { length: 255 }).primaryKey(),
  provider: varchar("provider", { length: 64 }).notNull(),
  payload: text("payload").notNull(),
  fetchedAt: timestamp("fetchedAt").notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type SourceEvidenceCache = typeof sourceEvidenceCache.$inferSelect;

/**
 * A reviewed, time-limited pointer to an external incident report. This table
 * deliberately stores provenance, not a copied authority or facility report.
 */
export const incidentEvidence = mysqlTable("incidentEvidence", {
  id: int("id").autoincrement().primaryKey(),
  detectionId: varchar("detectionId", { length: 96 }).notNull(),
  latitude: decimal("latitude", { precision: 9, scale: 6 }).notNull(),
  longitude: decimal("longitude", { precision: 9, scale: 6 }).notNull(),
  sourceType: mysqlEnum("sourceType", ["authority", "facility"]).notNull(),
  sourceName: varchar("sourceName", { length: 160 }).notNull(),
  sourceUrl: varchar("sourceUrl", { length: 1024 }).notNull(),
  incidentReference: varchar("incidentReference", { length: 255 }).notNull(),
  reportedAt: timestamp("reportedAt").notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  details: text("details").notNull(),
  verifiedByUserId: int("verifiedByUserId").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  revokedAt: timestamp("revokedAt"),
});

export type IncidentEvidence = typeof incidentEvidence.$inferSelect;

/**
 * Locally observed FIRMS detections accumulated from the existing live
 * corroboration path. The unique key prevents the same date/location from
 * being counted again when the same source row is returned on later checks.
 */
export const detectionHistory = mysqlTable("detectionHistory", {
  id: int("id").autoincrement().primaryKey(),
  latitude: decimal("latitude", { precision: 9, scale: 6 }).notNull(),
  longitude: decimal("longitude", { precision: 9, scale: 6 }).notNull(),
  detectionDate: date("detectionDate").notNull(),
  brightness: decimal("brightness", { precision: 10, scale: 3 }),
  confidence: varchar("confidence", { length: 32 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [
  uniqueIndex("detectionHistory_unique_location_date").on(table.latitude, table.longitude, table.detectionDate),
]);

export type DetectionHistory = typeof detectionHistory.$inferSelect;

/**
 * The latest successful country-wide FIRMS pull for the map. This is replaced
 * transactionally after each successful scheduled refresh; it is not history.
 */
export const indiaHotspotSnapshot = mysqlTable("india_hotspot_snapshot", {
  id: int("id").autoincrement().primaryKey(),
  latitude: decimal("latitude", { precision: 9, scale: 6 }).notNull(),
  longitude: decimal("longitude", { precision: 9, scale: 6 }).notNull(),
  brightness: decimal("brightness", { precision: 10, scale: 3 }),
  confidence: varchar("confidence", { length: 32 }),
  acquiredDate: date("acquiredDate").notNull(),
  acquiredTime: varchar("acquiredTime", { length: 8 }),
  source: varchar("source", { length: 64 }).notNull(),
  fetchedAt: timestamp("fetchedAt").notNull(),
});

export type IndiaHotspotSnapshot = typeof indiaHotspotSnapshot.$inferSelect;

/**
 * India-only reference copy of WRI's Global Power Plant Database. This is
 * facility context, not incident evidence or a fire classification input.
 */
export const gppdReference = mysqlTable("gppd_reference", {
  id: int("id").autoincrement().primaryKey(),
  gppdId: varchar("gppdId", { length: 64 }).notNull(),
  country: varchar("country", { length: 3 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  primaryFuel: varchar("primaryFuel", { length: 64 }),
  capacityMw: decimal("capacityMw", { precision: 12, scale: 3 }),
  latitude: decimal("latitude", { precision: 9, scale: 6 }).notNull(),
  longitude: decimal("longitude", { precision: 9, scale: 6 }).notNull(),
  sourceUrl: varchar("sourceUrl", { length: 1024 }).notNull(),
  loadedAt: timestamp("loadedAt").notNull(),
}, table => [
  uniqueIndex("gppdReference_gppdId_unique").on(table.gppdId),
  index("gppdReference_latitude_longitude_idx").on(table.latitude, table.longitude),
]);

export type GppdReference = typeof gppdReference.$inferSelect;
