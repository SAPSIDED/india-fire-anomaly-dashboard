// server/vercelTrpcHandler.ts
import express from "express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";

// shared/const.ts
var COOKIE_NAME = "app_session_id";
var ONE_YEAR_MS = 1e3 * 60 * 60 * 24 * 365;
var AXIOS_TIMEOUT_MS = 3e4;
var UNAUTHED_ERR_MSG = "Please login (10001)";
var NOT_ADMIN_ERR_MSG = "You do not have required permission (10002)";
var decodeOAuthState = (state) => {
  let decoded;
  try {
    decoded = atob(state);
  } catch {
    return { redirectUri: "" };
  }
  try {
    const parsed = JSON.parse(decoded);
    if (parsed && typeof parsed.redirectUri === "string") return parsed;
  } catch {
  }
  return { redirectUri: decoded };
};

// server/routers.ts
import { TRPCError as TRPCError3 } from "@trpc/server";
import { z as z2 } from "zod";

// server/corroboration.ts
import { setDefaultResultOrder } from "node:dns";

// server/classification.ts
var builtUpClasses = /* @__PURE__ */ new Set(["built_up", "built-up", "built up", "industrial", "urban"]);
var vegetationClasses = /* @__PURE__ */ new Set(["cropland", "forest"]);
var namedIndustrialCategories = /* @__PURE__ */ new Set(["refinery", "power_plant", "steel", "lng_terminal", "mining"]);
function classifyShortTermEvidence(input, detectionDays) {
  if (input.industrialFeatures > 0 && detectionDays >= 4) return "industrial_thermal_source";
  if (input.industrialFeatures === 0 && detectionDays <= 2) return "likely_wildfire_vegetation";
  return "uncertain_other";
}
function classifyEnrichedEvidence(input) {
  if (!input.landCoverClass || !input.longTermHistory) return "uncertain_other";
  const landCover = input.landCoverClass.toLowerCase();
  if (input.industrialFeatures > 0 && builtUpClasses.has(landCover) && input.longTermHistory.activeMonths >= 2) return "industrial_thermal_source";
  if (input.industrialFeatures === 0 && vegetationClasses.has(landCover) && input.longTermHistory.activeMonths <= 1) return "likely_wildfire_vegetation";
  return "uncertain_other";
}
function enrichedEvidenceDetail(input) {
  if (!input.landCoverClass || !input.longTermHistory) return "";
  return ` Land-cover is ${input.landCoverClass}; stored long-term history contains ${input.longTermHistory.totalDetectionCount} detection${input.longTermHistory.totalDetectionCount === 1 ? "" : "s"} across ${input.longTermHistory.activeMonths} active month${input.longTermHistory.activeMonths === 1 ? "" : "s"}.`;
}
function agriculturalZoneSupport(input) {
  return input.industrialFacilityCategory === "agricultural_zone" ? " Typed OSM evidence identifies an agricultural zone and supports, but does not independently determine, the vegetation/wildfire interpretation." : "";
}
function facilityEvidenceDetail(input) {
  const details = [];
  if (input.gppdReference) {
    const distanceM = Math.round(input.gppdReference.distanceKm * 1e3);
    const fuelType = input.gppdReference.fuelType ? `, fuel type ${input.gppdReference.fuelType}` : "";
    details.push(`GPPD identifies ${input.gppdReference.name}${fuelType}, ${distanceM} m from the hotspot`);
  }
  if (input.industrialFacilityName && input.industrialFacilityCategory && namedIndustrialCategories.has(input.industrialFacilityCategory)) {
    details.push(`nearby OSM evidence names ${input.industrialFacilityName} as a ${input.industrialFacilityCategory.replaceAll("_", " ")}`);
  } else if (input.industrialFacilityCategory === "mining") {
    details.push("typed OSM evidence identifies a mining facility, an industrial non-wildfire category");
  }
  if (input.flareMatch) details.push("the gas-flare cross-reference is matched");
  return details.join("; ");
}
function hasStrongNamedIndustrialEvidence(input) {
  return Boolean(
    input.gppdReference || input.flareMatch || input.industrialFacilityCategory === "mining" || input.industrialFacilityName && input.industrialFacilityCategory && namedIndustrialCategories.has(input.industrialFacilityCategory)
  );
}
function classifyCorroborationEvidence(input) {
  const detectionDays = input.historyDailyDetections.filter((day) => day.detections > 0).length;
  const industrialKnown = input.industrialState !== "unavailable";
  const historyKnown = input.historyState !== "unavailable";
  const confidence = input.industrialState === "available" && input.historyState === "available" ? "high" : industrialKnown && historyKnown ? "medium" : "low";
  if (!industrialKnown || !historyKnown) {
    return {
      classification: "uncertain_other",
      confidence: "low",
      reason: `Nearby industrial context or seven-day FIRMS history is unavailable, so the rule-based layer cannot classify the thermal pattern confidently.${enrichedEvidenceDetail(input)}`
    };
  }
  const namedFacilityEvidence = facilityEvidenceDetail(input);
  if (hasStrongNamedIndustrialEvidence(input)) {
    return {
      classification: "industrial_thermal_source",
      confidence: "high",
      reason: `${namedFacilityEvidence} provides named or typed industrial evidence and takes priority over generic nearby-feature counts.${enrichedEvidenceDetail(input)}`
    };
  }
  const shortTermClassification = classifyShortTermEvidence(input, detectionDays);
  const enrichedClassification = classifyEnrichedEvidence(input);
  const hasEnrichedEvidence = Boolean(input.landCoverClass && input.longTermHistory);
  const vegetationPersistenceConflict = Boolean(
    input.landCoverClass && input.longTermHistory && vegetationClasses.has(input.landCoverClass.toLowerCase()) && input.longTermHistory.activeMonths <= 1
  );
  if (!hasEnrichedEvidence) {
    if (shortTermClassification === "industrial_thermal_source") {
      return {
        classification: "industrial_thermal_source",
        confidence,
        reason: `Nearby industrial context is present and FIRMS detections occurred on ${detectionDays} of the returned seven days, which matches a recurring industrial thermal-source pattern.`
      };
    }
    if (shortTermClassification === "likely_wildfire_vegetation") {
      return {
        classification: "likely_wildfire_vegetation",
        confidence,
        reason: `No nearby industrial context was found and FIRMS detections occurred on ${detectionDays} of the returned seven days, which is more consistent with a short-lived vegetation or wildfire pattern than a recurring industrial source.${agriculturalZoneSupport(input)}`
      };
    }
    return {
      classification: "uncertain_other",
      confidence,
      reason: `The available evidence shows ${input.industrialFeatures} nearby industrial-context feature${input.industrialFeatures === 1 ? "" : "s"} and detections on ${detectionDays} of the returned seven days, which does not meet either rule-based classification threshold.`
    };
  }
  const detail = enrichedEvidenceDetail(input);
  if (shortTermClassification === "industrial_thermal_source" && vegetationPersistenceConflict) {
    return {
      classification: "industrial_thermal_source",
      confidence: "medium",
      reason: `Seven-day FIRMS and nearby industrial context support industrial thermal source, but the ${input.landCoverClass} land-cover and shorter-lived stored persistence pattern point to a vegetation or wildfire explanation. The original FIRMS+OSM rule is retained because the evidence disagrees.${detail}`
    };
  }
  if (shortTermClassification !== "uncertain_other" && enrichedClassification !== "uncertain_other" && shortTermClassification !== enrichedClassification) {
    return {
      classification: shortTermClassification,
      confidence: "medium",
      reason: `Seven-day FIRMS and nearby industrial context support ${shortTermClassification.replaceAll("_", " ")}, but the land-cover and stored-persistence evidence point to ${enrichedClassification.replaceAll("_", " ")}. The original FIRMS+OSM rule is retained because the evidence disagrees.${detail}`
    };
  }
  if (shortTermClassification === "industrial_thermal_source" || enrichedClassification === "industrial_thermal_source") {
    return {
      classification: "industrial_thermal_source",
      confidence: "high",
      reason: `Nearby industrial context is present, FIRMS detections occurred on ${detectionDays} of the returned seven days, and the enriched rule supports a recurring industrial thermal-source pattern.${detail}`
    };
  }
  if (shortTermClassification === "likely_wildfire_vegetation" || enrichedClassification === "likely_wildfire_vegetation") {
    return {
      classification: "likely_wildfire_vegetation",
      confidence: "high",
      reason: `No nearby industrial context was found, FIRMS detections occurred on ${detectionDays} of the returned seven days, and the enriched rule supports a short-lived vegetation or wildfire pattern.${detail}${agriculturalZoneSupport(input)}`
    };
  }
  return {
    classification: "uncertain_other",
    confidence,
    reason: `The available evidence shows ${input.industrialFeatures} nearby industrial-context feature${input.industrialFeatures === 1 ? "" : "s"} and detections on ${detectionDays} of the returned seven days, which does not meet either rule-based classification threshold.${detail}`
  };
}

// server/mlClassifier.ts
import fs from "node:fs";
import path from "node:path";
var FEATURES = ["frpMw", "brightness", "brightT31", "confidence", "dayNightRatio", "sevenDayDetectionCount"];
var LABELS = ["wildfire", "industrial_facility", "agricultural_burning", "mining"];
var artifactOverride;
function artifactCandidates() {
  return [
    path.join(process.cwd(), "ml/model/fire_classifier.json"),
    path.join(process.cwd(), "server/data/fire_classifier.json"),
    path.join(process.cwd(), "dist/ml/model/fire_classifier.json")
  ];
}
function loadArtifact() {
  if (artifactOverride !== void 0) {
    if (artifactOverride === null) throw new Error("Local ML model override is unavailable.");
    return artifactOverride;
  }
  for (const candidate of artifactCandidates()) {
    try {
      return JSON.parse(fs.readFileSync(candidate, "utf8"));
    } catch {
    }
  }
  throw new Error("The Anaconda XGBoost JSON artifact is not available in this deployment.");
}
function featureValue(value) {
  return Number.isFinite(value) ? value : 0;
}
function treeContribution(tree, features) {
  let node = 0;
  while (node >= 0) {
    const left = tree.left_children[node] ?? -1;
    const right = tree.right_children[node] ?? -1;
    if (left < 0 && right < 0) return tree.split_conditions[node] ?? tree.base_weights[node] ?? 0;
    const index2 = tree.split_indices[node] ?? 0;
    const threshold = tree.split_conditions[node] ?? 0;
    const value = features[index2];
    node = !Number.isFinite(value) ? tree.default_left[node] ? left : right : value < threshold ? left : right;
  }
  return 0;
}
function softmax(margins) {
  const max = Math.max(...margins);
  const exponents = margins.map((value) => Math.exp(value - max));
  const total = exponents.reduce((sum, value) => sum + value, 0) || 1;
  return exponents.map((value) => value / total);
}
function localPredict(input, wildfireGate) {
  const artifact = loadArtifact();
  const learner = artifact.learner;
  const model = learner?.gradient_booster?.model;
  const trees = model?.trees ?? [];
  const treeInfo = model?.tree_info ?? [];
  const featureNames = learner?.feature_names ?? [];
  const numClasses = Number(learner?.objective?.softmax_multiclass_param?.num_class ?? learner?.learner_model_param?.num_class ?? 0);
  if (learner?.objective?.name !== "multi:softprob" || learner.gradient_booster?.name !== "gbtree" || numClasses !== LABELS.length || trees.length === 0 || featureNames.join(",") !== FEATURES.join(",")) {
    throw new Error("The local model does not match the Anaconda four-class feature contract.");
  }
  const margins = Array.from({ length: numClasses }, () => 0);
  trees.forEach((tree, index2) => {
    const classIndex = treeInfo[index2] ?? index2 % numClasses;
    if (classIndex >= 0 && classIndex < numClasses) margins[classIndex] += treeContribution(tree, input);
  });
  const rawProbabilities = softmax(margins);
  const gate = !wildfireGate ? "eligible" : wildfireGate.pointForestStatus === "inside" && (wildfireGate.historicalForestFireDetections ?? 0) > 0 ? "eligible" : wildfireGate?.pointForestStatus === "outside" ? "blocked" : "unknown";
  const probabilities = gate === "eligible" ? rawProbabilities : (() => {
    const masked = [...rawProbabilities];
    masked[0] = 0;
    const total = masked.reduce((sum, value) => sum + value, 0) || 1;
    return masked.map((value) => value / total);
  })();
  const prediction = probabilities.indexOf(Math.max(...probabilities));
  return {
    prediction,
    classification: LABELS[prediction],
    wildfireProbability: Number(probabilities[0].toFixed(6)),
    industrialProbability: Number(probabilities[1].toFixed(6)),
    agriculturalProbability: Number(probabilities[2].toFixed(6)),
    miningProbability: Number(probabilities[3].toFixed(6)),
    inference: "local-json-model",
    modelVersion: artifact.version?.join(".") ?? null,
    wildfireGate: gate,
    wildfireGateReason: gate === "eligible" ? `Wildfire class permitted: FSI point forest gate is inside and ISFR historical forest-fire detections are ${wildfireGate?.historicalForestFireDetections}.` : gate === "blocked" ? "Wildfire class blocked: FSI point forest gate is outside forest." : "Wildfire class withheld: point-level FSI forest membership or historical forest-fire evidence is unavailable."
  };
}
async function classifyWithML(frpMw, brightness, brightT31, confidence, dayNightRatio, sevenDayDetectionCount, wildfireGate) {
  try {
    return localPredict([frpMw, brightness, brightT31, confidence, dayNightRatio, sevenDayDetectionCount].map(featureValue), wildfireGate);
  } catch {
    return null;
  }
}

// server/db.ts
import { and, desc, eq, gte, isNull, lte, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";

// drizzle/schema.ts
import { date, decimal, index, int, mediumtext, mysqlEnum, mysqlTable, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/mysql-core";
var users = mysqlTable("users", {
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
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull()
});
var sourceEvidenceCache = mysqlTable("sourceEvidenceCache", {
  cacheKey: varchar("cacheKey", { length: 255 }).primaryKey(),
  provider: varchar("provider", { length: 64 }).notNull(),
  payload: text("payload").notNull(),
  fetchedAt: timestamp("fetchedAt").notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
});
var incidentEvidence = mysqlTable("incidentEvidence", {
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
  revokedAt: timestamp("revokedAt")
});
var detectionHistory = mysqlTable("detectionHistory", {
  id: int("id").autoincrement().primaryKey(),
  latitude: decimal("latitude", { precision: 9, scale: 6 }).notNull(),
  longitude: decimal("longitude", { precision: 9, scale: 6 }).notNull(),
  detectionDate: date("detectionDate").notNull(),
  brightness: decimal("brightness", { precision: 10, scale: 3 }),
  confidence: varchar("confidence", { length: 32 }),
  dayNight: varchar("dayNight", { length: 1 }),
  frp: decimal("frp", { precision: 12, scale: 4 }),
  platform: varchar("platform", { length: 16 }),
  createdAt: timestamp("createdAt").defaultNow().notNull()
}, (table) => [
  uniqueIndex("detectionHistory_unique_location_date").on(table.latitude, table.longitude, table.detectionDate)
]);
var seasonalAgriculturalBurningCalendar = mysqlTable("seasonal_agricultural_burning_calendar", {
  id: int("id").autoincrement().primaryKey(),
  state: varchar("state", { length: 96 }).notNull(),
  month: int("month").notNull(),
  season: varchar("season", { length: 64 }).notNull(),
  contextLevel: varchar("contextLevel", { length: 32 }).notNull(),
  sourceUrl: varchar("sourceUrl", { length: 1024 }).notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
}, (table) => [
  uniqueIndex("seasonalAgriculturalBurning_state_month_unique").on(table.state, table.month)
]);
var seasonalAgriculturalStateGeometry = mysqlTable("seasonal_agricultural_state_geometry", {
  id: int("id").autoincrement().primaryKey(),
  state: varchar("state", { length: 96 }).notNull(),
  geometry: mediumtext("geometry").notNull(),
  sourceUrl: varchar("sourceUrl", { length: 1024 }).notNull(),
  loadedAt: timestamp("loadedAt").notNull()
}, (table) => [
  uniqueIndex("seasonalAgriculturalStateGeometry_state_unique").on(table.state)
]);
var indiaHotspotSnapshot = mysqlTable("india_hotspot_snapshot", {
  id: int("id").autoincrement().primaryKey(),
  latitude: decimal("latitude", { precision: 9, scale: 6 }).notNull(),
  longitude: decimal("longitude", { precision: 9, scale: 6 }).notNull(),
  brightness: decimal("brightness", { precision: 10, scale: 3 }),
  confidence: varchar("confidence", { length: 32 }),
  acquiredDate: date("acquiredDate").notNull(),
  acquiredTime: varchar("acquiredTime", { length: 8 }),
  source: varchar("source", { length: 64 }).notNull(),
  fetchedAt: timestamp("fetchedAt").notNull()
});
var gppdReference = mysqlTable("gppd_reference", {
  id: int("id").autoincrement().primaryKey(),
  gppdId: varchar("gppdId", { length: 64 }).notNull(),
  country: varchar("country", { length: 3 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  primaryFuel: varchar("primaryFuel", { length: 64 }),
  capacityMw: decimal("capacityMw", { precision: 12, scale: 3 }),
  latitude: decimal("latitude", { precision: 9, scale: 6 }).notNull(),
  longitude: decimal("longitude", { precision: 9, scale: 6 }).notNull(),
  sourceUrl: varchar("sourceUrl", { length: 1024 }).notNull(),
  loadedAt: timestamp("loadedAt").notNull()
}, (table) => [
  uniqueIndex("gppdReference_gppdId_unique").on(table.gppdId),
  index("gppdReference_latitude_longitude_idx").on(table.latitude, table.longitude)
]);
var gasFlareReference = mysqlTable("gas_flare_reference", {
  id: int("id").autoincrement().primaryKey(),
  flareId: varchar("flareId", { length: 64 }).notNull(),
  country: varchar("country", { length: 64 }).notNull(),
  latitude: decimal("latitude", { precision: 9, scale: 6 }).notNull(),
  longitude: decimal("longitude", { precision: 9, scale: 6 }).notNull(),
  location: varchar("location", { length: 32 }),
  fieldType: varchar("fieldType", { length: 64 }),
  fieldName: varchar("fieldName", { length: 255 }),
  operator: varchar("operator", { length: 255 }),
  latestAnnualVolumeMcm: decimal("latestAnnualVolumeMcm", { precision: 18, scale: 9 }),
  sourceDataYear: int("sourceDataYear").notNull(),
  sourceUrl: varchar("sourceUrl", { length: 1024 }).notNull(),
  loadedAt: timestamp("loadedAt").notNull()
}, (table) => [
  uniqueIndex("gasFlareReference_flareId_unique").on(table.flareId),
  index("gasFlareReference_latitude_longitude_idx").on(table.latitude, table.longitude)
]);

// server/_core/env.ts
var ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? ""
};

// server/history.ts
function summarizeLongTermPersistence(rows) {
  const dates = rows.map((row) => typeof row.detectionDate === "string" ? row.detectionDate : row.detectionDate.toISOString().slice(0, 10)).sort();
  return {
    totalDetectionCount: dates.length,
    firstSeen: dates[0] ?? null,
    lastSeen: dates.length > 0 ? dates[dates.length - 1] : null,
    activeMonths: new Set(dates.map((date2) => date2.slice(0, 7))).size
  };
}
function summarizeFrpVarianceGroups(rows) {
  const grouped = /* @__PURE__ */ new Map();
  for (const row of rows) {
    if (row.frp === null || row.frp === void 0 || `${row.frp}`.trim() === "") continue;
    const value = Number(row.frp);
    const latitude = Number(row.latitude);
    const longitude = Number(row.longitude);
    if (!Number.isFinite(value) || !Number.isFinite(latitude) || !Number.isFinite(longitude)) continue;
    const normalizedLatitude = latitude.toFixed(6);
    const normalizedLongitude = longitude.toFixed(6);
    const platform = row.platform === "MODIS" || row.platform === "VIIRS" ? row.platform : "unattributed";
    const key = `${normalizedLatitude}:${normalizedLongitude}:${platform}`;
    const group = grouped.get(key) ?? { latitude: normalizedLatitude, longitude: normalizedLongitude, platform, values: [] };
    group.values.push(value);
    grouped.set(key, group);
  }
  return Array.from(grouped.values()).map((group) => {
    if (group.values.length < 4) return { latitude: group.latitude, longitude: group.longitude, platform: group.platform, sampleCount: group.values.length, state: "insufficient", varianceMw2: null };
    const mean = group.values.reduce((sum, value) => sum + value, 0) / group.values.length;
    const variance = group.values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / group.values.length;
    return { latitude: group.latitude, longitude: group.longitude, platform: group.platform, sampleCount: group.values.length, state: "adequate", varianceMw2: Number(variance.toFixed(4)) };
  }).sort((left, right) => left.latitude.localeCompare(right.latitude) || left.longitude.localeCompare(right.longitude) || left.platform.localeCompare(right.platform));
}
function summarizeStoredHistoryStatistics(rows) {
  const dayDetections = rows.filter((row) => row.dayNight?.trim().toUpperCase() === "D").length;
  const nightDetections = rows.filter((row) => row.dayNight?.trim().toUpperCase() === "N").length;
  const frpVarianceGroups = summarizeFrpVarianceGroups(rows);
  return {
    dayDetections,
    nightDetections,
    dayToNightRatio: nightDetections > 0 ? Number((dayDetections / nightDetections).toFixed(4)) : null,
    dayNightSampleCount: dayDetections + nightDetections,
    frpSampleCount: frpVarianceGroups.reduce((total, group) => total + group.sampleCount, 0),
    frpVarianceGroups
  };
}
function dedupeDetectionHistoryRows(rows) {
  const unique = /* @__PURE__ */ new Map();
  for (const row of rows) {
    const key = `${Number(row.latitude).toFixed(6)}:${Number(row.longitude).toFixed(6)}:${row.detectionDate}`;
    unique.set(key, { ...row, latitude: Number(row.latitude).toFixed(6), longitude: Number(row.longitude).toFixed(6) });
  }
  return Array.from(unique.values());
}

// server/db.ts
var _db = null;
async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}
async function upsertUser(user) {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }
  try {
    const values = {
      openId: user.openId
    };
    const updateSet = {};
    const textFields = ["name", "email", "loginMethod"];
    const assignNullable = (field) => {
      const value = user[field];
      if (value === void 0) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };
    textFields.forEach(assignNullable);
    if (user.lastSignedIn !== void 0) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== void 0) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = "admin";
      updateSet.role = "admin";
    }
    if (!values.lastSignedIn) {
      values.lastSignedIn = /* @__PURE__ */ new Date();
    }
    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = /* @__PURE__ */ new Date();
    }
    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}
async function getUserByOpenId(openId) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return void 0;
  }
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : void 0;
}
async function getSourceEvidenceCache(cacheKey3) {
  const db = await getDb();
  if (!db) return void 0;
  const result = await db.select().from(sourceEvidenceCache).where(eq(sourceEvidenceCache.cacheKey, cacheKey3)).limit(1);
  return result[0];
}
async function saveSourceEvidenceCache(entry) {
  const db = await getDb();
  if (!db) return;
  await db.insert(sourceEvidenceCache).values(entry).onDuplicateKeyUpdate({
    set: {
      provider: entry.provider,
      payload: entry.payload,
      fetchedAt: entry.fetchedAt,
      expiresAt: entry.expiresAt
    }
  });
}
async function recordIncidentEvidence(entry) {
  const db = await getDb();
  if (!db) throw new Error("The incident-evidence ledger is not available.");
  await db.insert(incidentEvidence).values(entry);
}
function isWithinTenKilometres(latA, lngA, latB, lngB) {
  const radians = (value) => value * Math.PI / 180;
  const dLat = radians(latB - latA);
  const dLng = radians(lngB - lngA);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(radians(latA)) * Math.cos(radians(latB)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h)) <= 10;
}
async function getActiveIncidentEvidence(detectionId, lat, lng) {
  const db = await getDb();
  if (!db) return void 0;
  const records = await db.select().from(incidentEvidence).where(and(
    eq(incidentEvidence.detectionId, detectionId),
    isNull(incidentEvidence.revokedAt),
    gte(incidentEvidence.expiresAt, /* @__PURE__ */ new Date())
  )).orderBy(desc(incidentEvidence.reportedAt));
  return records.filter((record) => isWithinTenKilometres(
    Number(record.latitude),
    Number(record.longitude),
    lat,
    lng
  ));
}
async function recordDetectionHistory(rows) {
  if (process.env.VITEST === "true") return;
  const db = await getDb();
  if (!db || rows.length === 0) return;
  const uniqueRows = dedupeDetectionHistoryRows(rows);
  const insertRows = uniqueRows.map((row) => ({
    ...row,
    detectionDate: /* @__PURE__ */ new Date(`${row.detectionDate}T00:00:00.000Z`)
  }));
  await db.insert(detectionHistory).values(insertRows).onDuplicateKeyUpdate({
    set: { id: sql`${detectionHistory.id}` }
  });
}
async function getLongTermPersistence(lat, lng) {
  const db = await getDb();
  if (!db) {
    return { state: "unavailable", totalDetectionCount: 0, firstSeen: null, lastSeen: null, activeMonths: 0 };
  }
  try {
    const latitudeDelta = 8 / 111;
    const longitudeDelta = 8 / Math.max(1, 111 * Math.cos(lat * Math.PI / 180));
    const rows = await db.select({ detectionDate: detectionHistory.detectionDate }).from(detectionHistory).where(and(
      gte(detectionHistory.latitude, (lat - latitudeDelta).toFixed(6)),
      lte(detectionHistory.latitude, (lat + latitudeDelta).toFixed(6)),
      gte(detectionHistory.longitude, (lng - longitudeDelta).toFixed(6)),
      lte(detectionHistory.longitude, (lng + longitudeDelta).toFixed(6))
    ));
    return { state: "available", ...summarizeLongTermPersistence(rows) };
  } catch {
    return { state: "unavailable", totalDetectionCount: 0, firstSeen: null, lastSeen: null, activeMonths: 0 };
  }
}
async function getDetectionHistoryStatistics(lat, lng) {
  const unavailable = { state: "unavailable", dayDetections: 0, nightDetections: 0, dayToNightRatio: null, dayNightSampleCount: 0, frpSampleCount: 0, frpVarianceGroups: [] };
  const db = await getDb();
  if (!db) return unavailable;
  try {
    const latitudeDelta = 8 / 111;
    const longitudeDelta = 8 / Math.max(1, 111 * Math.cos(lat * Math.PI / 180));
    const rows = await db.select({ detectionDate: detectionHistory.detectionDate, dayNight: detectionHistory.dayNight, frp: detectionHistory.frp, latitude: detectionHistory.latitude, longitude: detectionHistory.longitude, platform: detectionHistory.platform }).from(detectionHistory).where(and(
      gte(detectionHistory.latitude, (lat - latitudeDelta).toFixed(6)),
      lte(detectionHistory.latitude, (lat + latitudeDelta).toFixed(6)),
      gte(detectionHistory.longitude, (lng - longitudeDelta).toFixed(6)),
      lte(detectionHistory.longitude, (lng + longitudeDelta).toFixed(6))
    ));
    return { state: "available", ...summarizeStoredHistoryStatistics(rows) };
  } catch {
    return unavailable;
  }
}
async function getIndiaHotspotSnapshot() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(indiaHotspotSnapshot).orderBy(desc(indiaHotspotSnapshot.acquiredDate), desc(indiaHotspotSnapshot.acquiredTime), desc(indiaHotspotSnapshot.id));
}
function distanceKmForAlert(latA, lngA, latB, lngB) {
  const radians = (value) => value * Math.PI / 180;
  const dLat = radians(latB - latA);
  const dLng = radians(lngB - lngA);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(radians(latA)) * Math.cos(radians(latB)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}
async function getPersistentHotspotAlerts() {
  const db = await getDb();
  if (!db) return [];
  try {
    const [snapshotRows, historyRows, plants] = await Promise.all([
      db.select().from(indiaHotspotSnapshot),
      db.select({ latitude: detectionHistory.latitude, longitude: detectionHistory.longitude, detectionDate: detectionHistory.detectionDate }).from(detectionHistory),
      db.select({ name: gppdReference.name, primaryFuel: gppdReference.primaryFuel, capacityMw: gppdReference.capacityMw, latitude: gppdReference.latitude, longitude: gppdReference.longitude }).from(gppdReference)
    ]);
    return snapshotRows.flatMap((row) => {
      const lat = Number(row.latitude);
      const lng = Number(row.longitude);
      const nearbyHistory = historyRows.filter((item) => distanceKmForAlert(lat, lng, Number(item.latitude), Number(item.longitude)) <= 8);
      const dates = new Set(nearbyHistory.map((item) => new Date(item.detectionDate).toISOString().slice(0, 10)));
      const months = new Set(Array.from(dates, (date2) => date2.slice(0, 7)));
      if (dates.size < 3 && months.size < 2) return [];
      const nearestPlant = plants.map((plant) => ({ plant, distanceKm: distanceKmForAlert(lat, lng, Number(plant.latitude), Number(plant.longitude)) })).filter((candidate) => candidate.distanceKm <= 10).sort((a, b) => a.distanceKm - b.distanceKm)[0];
      return [{
        hotspotId: row.id,
        latitude: lat,
        longitude: lng,
        acquiredDate: row.acquiredDate,
        acquiredTime: row.acquiredTime,
        persistenceDetections: dates.size,
        activeMonths: months.size,
        facility: nearestPlant ? { name: nearestPlant.plant.name, fuelType: nearestPlant.plant.primaryFuel, capacityMw: nearestPlant.plant.capacityMw === null ? null : Number(nearestPlant.plant.capacityMw), distanceKm: Number(nearestPlant.distanceKm.toFixed(2)) } : null
      }];
    }).sort((a, b) => b.persistenceDetections - a.persistenceDetections);
  } catch {
    return [];
  }
}
async function replaceGppdReference(rows) {
  const db = await getDb();
  if (!db) throw new Error("The GPPD reference database is unavailable.");
  const loadedAt = /* @__PURE__ */ new Date();
  await db.transaction(async (tx) => {
    await tx.delete(gppdReference);
    if (rows.length > 0) await tx.insert(gppdReference).values(rows.map((row) => ({ ...row, loadedAt })));
  });
  return { loadedAt, rowCount: rows.length };
}
async function getGppdReferenceCandidates(lat, lng, radiusKm) {
  const db = await getDb();
  if (!db) return [];
  const latitudeDelta = radiusKm / 111;
  const longitudeDelta = radiusKm / Math.max(1, 111 * Math.cos(lat * Math.PI / 180));
  return db.select().from(gppdReference).where(and(
    gte(gppdReference.latitude, (lat - latitudeDelta).toFixed(6)),
    lte(gppdReference.latitude, (lat + latitudeDelta).toFixed(6)),
    gte(gppdReference.longitude, (lng - longitudeDelta).toFixed(6)),
    lte(gppdReference.longitude, (lng + longitudeDelta).toFixed(6))
  ));
}
async function getGasFlareReferenceCandidates(lat, lng, radiusKm) {
  const db = await getDb();
  if (!db) return [];
  const latitudeDelta = radiusKm / 111;
  const longitudeDelta = radiusKm / Math.max(1, 111 * Math.cos(lat * Math.PI / 180));
  return db.select().from(gasFlareReference).where(and(
    gte(gasFlareReference.latitude, (lat - latitudeDelta).toFixed(6)),
    lte(gasFlareReference.latitude, (lat + latitudeDelta).toFixed(6)),
    gte(gasFlareReference.longitude, (lng - longitudeDelta).toFixed(6)),
    lte(gasFlareReference.longitude, (lng + longitudeDelta).toFixed(6))
  ));
}

// server/landcover.ts
var LAND_COVER_IDENTIFY_URL = "https://ic.imagery1.arcgis.com/arcgis/rest/services/Sentinel2_10m_LandCover/ImageServer/identify";
var LAND_COVER_SOURCE = "Esri Sentinel-2 10m Land Use/Land Cover Time Series";
var LAND_COVER_CACHE_TTL_MS = 30 * 24 * 60 * 6e4;
var REQUEST_TIMEOUT_MS = 8e3;
var RETRY_DELAYS_MS = [0, 300];
var cacheReader = async (cacheKey3) => {
  const record = await getSourceEvidenceCache(cacheKey3);
  return record ? { payload: record.payload, fetchedAt: record.fetchedAt, expiresAt: record.expiresAt } : void 0;
};
var cacheWriter = async (input) => {
  await saveSourceEvidenceCache(input);
};
var LAND_COVER_CLASSES = {
  1: "water",
  2: "forest_vegetation",
  4: "flooded_vegetation",
  5: "cropland",
  7: "built_up",
  8: "bare_other",
  9: "snow_ice",
  10: "cloud_obscured",
  11: "grassland_rangeland"
};
function cacheKeyFor(lat, lon) {
  return `landcover-esri:${lat.toFixed(5)}:${lon.toFixed(5)}`;
}
function parseCachedResult(payload) {
  try {
    const parsed = JSON.parse(payload);
    if (typeof parsed.landCoverClass !== "string" || typeof parsed.source !== "string") return void 0;
    return { landCoverClass: parsed.landCoverClass, source: parsed.source };
  } catch {
    return void 0;
  }
}
function resultFromValue(value) {
  const code = Number(value);
  const landCoverClass = LAND_COVER_CLASSES[code];
  return landCoverClass ? { landCoverClass, source: LAND_COVER_SOURCE } : void 0;
}
async function requestLandCover(lat, lon) {
  let lastError;
  for (const delay of RETRY_DELAYS_MS) {
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
    try {
      const params = new URLSearchParams({
        geometry: JSON.stringify({ x: lon, y: lat, spatialReference: { wkid: 4326 } }),
        geometryType: "esriGeometryPoint",
        sr: "4326",
        returnCatalogItems: "false",
        returnGeometry: "false",
        f: "json"
      });
      const response = await fetch(`${LAND_COVER_IDENTIFY_URL}?${params}`, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
      });
      if (!response.ok) throw new Error(`Land-cover service returned HTTP ${response.status}`);
      const payload = await response.json();
      if (payload.error) throw new Error("Land-cover service returned an error payload.");
      const result = resultFromValue(payload.value);
      if (!result) throw new Error("Land-cover service returned an unrecognised class value.");
      return result;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Land-cover service request failed.");
}
async function fetchLandCover(lat, lon) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) return void 0;
  const cacheKey3 = cacheKeyFor(lat, lon);
  try {
    const result = await requestLandCover(lat, lon);
    const fetchedAt = /* @__PURE__ */ new Date();
    try {
      await cacheWriter({
        cacheKey: cacheKey3,
        provider: "esri-sentinel2-landcover",
        payload: JSON.stringify(result),
        fetchedAt,
        expiresAt: new Date(fetchedAt.getTime() + LAND_COVER_CACHE_TTL_MS)
      });
    } catch {
    }
    return result;
  } catch {
    try {
      const cached = await cacheReader(cacheKey3);
      if (!cached || cached.expiresAt.getTime() <= Date.now()) return void 0;
      return parseCachedResult(cached.payload);
    } catch {
      return void 0;
    }
  }
}

// server/fsiForestContext.ts
var FOREST_COVER_DISTRICT_SERVICE = "https://livingatlas.esri.in/server1/rest/services/ForestSurvey/District_Wise_Forest_Cover_2023/MapServer/0";
var FOREST_FIRE_DISTRICT_SERVICE = "https://livingatlas.esri.in/server1/rest/services/ForestSurvey/District_Wise_Forest_Fire/MapServer/0";
var FSI_SOURCE = "Forest Survey of India / ISFR 2023 via Esri India Living Atlas";
var FSI_POINT_SOURCE = process.env.FSI_POINT_FOREST_QUERY_URL?.replace(/\/+$/, "") ?? null;
var CACHE_TTL_MS = 30 * 24 * 60 * 6e4;
var REQUEST_TIMEOUT_MS2 = 8e3;
var cacheReader2 = async (key) => {
  const value = await getSourceEvidenceCache(key);
  return value ? { payload: value.payload, fetchedAt: value.fetchedAt, expiresAt: value.expiresAt } : void 0;
};
var cacheWriter2 = async (input) => {
  await saveSourceEvidenceCache(input);
};
function cacheKey(lat, lng) {
  return `fsi-forest-context:${lat.toFixed(4)}:${lng.toFixed(4)}`;
}
function validCoordinate(lat, lng) {
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= 6 && lat <= 38 && lng >= 68 && lng <= 98;
}
function numeric(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
function attr(attributes, ...names) {
  const found = names.find((name) => attributes[name] !== void 0 && attributes[name] !== null);
  return found ? attributes[found] : void 0;
}
function queryUrl(service, lat, lng, outFields = "*") {
  const params = new URLSearchParams({
    f: "json",
    geometry: JSON.stringify({ x: lng, y: lat, spatialReference: { wkid: 4326 } }),
    geometryType: "esriGeometryPoint",
    inSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
    outFields,
    returnGeometry: "false"
  });
  return `${service}/query?${params}`;
}
async function requestJson(url) {
  const response = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS2) });
  if (!response.ok) throw new Error(`FSI service returned HTTP ${response.status}`);
  const payload = await response.json();
  if (payload.error || !payload.features?.[0]?.attributes) throw new Error("FSI service returned no point-intersecting feature.");
  return payload.features[0].attributes;
}
function fireCount(attributes) {
  const values = Object.entries(attributes).filter(([key]) => /(2022.?23|2023.?24|fire|viirs|snpp)/i.test(key)).map(([, value]) => numeric(value)).filter((value) => value !== null);
  return values.length ? Math.max(...values) : null;
}
function emptyContext(detail, state = "unavailable") {
  return { state, source: FSI_SOURCE, pointForestStatus: "unknown", pointForestClass: null, districtName: null, stateName: null, forestAreaSqKm: null, forestSharePct: null, districtFireDetections2022_23: null, districtFireDetections2023_24: null, historicalForestFireDetections: null, detail };
}
function unavailableFsiForestContext(detail = "FSI/ISFR forest context was not available within the live evidence window.") {
  return emptyContext(detail);
}
function parseCached(payload) {
  try {
    const value = JSON.parse(payload);
    return value && typeof value.detail === "string" ? value : void 0;
  } catch {
    return void 0;
  }
}
async function fetchFsiForestContext(lat, lng) {
  if (!validCoordinate(lat, lng)) return emptyContext("The hotspot coordinate is outside the supported India bounds.");
  const key = cacheKey(lat, lng);
  try {
    const [forestAttributes, fireAttributes] = await Promise.all([
      requestJson(queryUrl(FOREST_COVER_DISTRICT_SERVICE, lat, lng, "districtname,statename,calarea,vdf2023,mdf2023,of2023,total,percalarea,scrub")),
      requestJson(queryUrl(FOREST_FIRE_DISTRICT_SERVICE, lat, lng))
    ]);
    const forestArea = numeric(attr(forestAttributes, "total"));
    const districtArea = numeric(attr(forestAttributes, "calarea"));
    const f2022 = numeric(attr(fireAttributes, "viirs_2022_23", "viirs2022_23", "VIIRS_2022_23"));
    const f2023 = numeric(attr(fireAttributes, "viirs_2023_24", "viirs2023_24", "VIIRS_2023_24"));
    const historical = f2022 !== null || f2023 !== null ? Math.max(f2022 ?? 0, f2023 ?? 0) : fireCount(fireAttributes);
    let pointForestStatus = "unknown";
    let pointForestClass = null;
    if (FSI_POINT_SOURCE) {
      try {
        const point = await requestJson(queryUrl(FSI_POINT_SOURCE, lat, lng));
        const value = String(attr(point, "class", "forest_class", "landcover", "category") ?? "").toLowerCase();
        pointForestClass = value.includes("very dense") ? "very_dense_forest" : value.includes("moderately") ? "moderately_dense_forest" : value.includes("open forest") ? "open_forest" : value.includes("scrub") ? "scrub" : value.includes("water") ? "water_bodies" : value.includes("non") ? "non_forest" : null;
        pointForestStatus = pointForestClass && ["very_dense_forest", "moderately_dense_forest", "open_forest"].includes(pointForestClass) ? "inside" : pointForestClass ? "outside" : "unknown";
      } catch {
      }
    }
    const result = {
      state: "available",
      source: FSI_SOURCE,
      pointForestStatus,
      pointForestClass,
      districtName: String(attr(forestAttributes, "districtname") ?? attr(fireAttributes, "districtname") ?? "") || null,
      stateName: String(attr(forestAttributes, "statename") ?? attr(fireAttributes, "statename") ?? "") || null,
      forestAreaSqKm: forestArea,
      forestSharePct: forestArea !== null && districtArea ? Number((forestArea / districtArea * 100).toFixed(2)) : numeric(attr(forestAttributes, "percalarea")),
      districtFireDetections2022_23: f2022,
      districtFireDetections2023_24: f2023,
      historicalForestFireDetections: historical,
      detail: pointForestStatus === "unknown" ? "FSI/ISFR 2023 confirms district forest cover and historical forest-fire detections, but no point-level FSI forest polygon was configured; wildfire eligibility remains withheld rather than inferred from a district total." : `FSI point forest gate is ${pointForestStatus}; ISFR 2023 historical forest-fire detections in the district: ${historical ?? "unavailable"}.`
    };
    const fetchedAt = /* @__PURE__ */ new Date();
    try {
      await cacheWriter2({ cacheKey: key, provider: "fsi-isfr-2023", payload: JSON.stringify(result), fetchedAt, expiresAt: new Date(fetchedAt.getTime() + CACHE_TTL_MS) });
    } catch {
    }
    return result;
  } catch {
    try {
      const cached = await cacheReader2(key);
      if (cached && cached.expiresAt.getTime() > Date.now()) return { ...parseCached(cached.payload) ?? emptyContext("The FSI cache payload was invalid."), state: "cached" };
    } catch {
    }
    return emptyContext("FSI/ISFR forest context was unavailable after a bounded request; wildfire eligibility remains withheld.");
  }
}

// server/gppdReference.ts
var GPPD_INDIA_CSV_URL = "https://raw.githubusercontent.com/wri/global-power-plant-database/master/source_databases_csv/database_IND.csv";
var GPPD_SOURCE = "WRI Global Power Plant Database v1.3.0 (CC BY 4.0)";
var GPPD_LOADER_CACHE_KEY = "gppd-reference:india:v1.3.0";
var GPPD_CACHE_TTL_MS = 30 * 24 * 60 * 6e4;
var DEFAULT_RADIUS_KM = 2;
var csvFetcher = async () => {
  const response = await fetch(GPPD_INDIA_CSV_URL, { headers: { Accept: "text/csv" }, signal: AbortSignal.timeout(12e3) });
  if (!response.ok) throw new Error(`GPPD source returned HTTP ${response.status}`);
  return response.text();
};
var cacheReader3 = async (cacheKey3) => getSourceEvidenceCache(cacheKey3);
var cacheWriter3 = async (input) => {
  await saveSourceEvidenceCache(input);
};
var referenceReplacer = replaceGppdReference;
var candidateReader = getGppdReferenceCandidates;
function parseCsvLine(line) {
  const cells = [];
  let cell = "";
  let quoted = false;
  for (let index2 = 0; index2 < line.length; index2 += 1) {
    const char = line[index2];
    if (char === '"' && line[index2 + 1] === '"') {
      cell += '"';
      index2 += 1;
    } else if (char === '"') quoted = !quoted;
    else if (char === "," && !quoted) {
      cells.push(cell);
      cell = "";
    } else cell += char;
  }
  cells.push(cell);
  return cells;
}
function parseIndiaGppdCsv(csv) {
  const lines = csv.trim().split(/\r?\n/);
  const headers = parseCsvLine(lines.shift() ?? "");
  const index2 = (name) => headers.indexOf(name);
  const fields = { country: index2("country"), name: index2("name"), gppdId: index2("gppd_idnr"), capacityMw: index2("capacity_mw"), latitude: index2("latitude"), longitude: index2("longitude"), primaryFuel: index2("primary_fuel") };
  if (Object.values(fields).some((value) => value < 0)) throw new Error("GPPD CSV is missing required reference fields.");
  return lines.flatMap((line) => {
    const row = parseCsvLine(line);
    const latitude = Number(row[fields.latitude]);
    const longitude = Number(row[fields.longitude]);
    if (row[fields.country] !== "IND" || !row[fields.name] || !row[fields.gppdId] || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return [];
    const capacity = Number(row[fields.capacityMw]);
    return [{
      country: "IND",
      gppdId: row[fields.gppdId],
      name: row[fields.name],
      primaryFuel: row[fields.primaryFuel] || null,
      capacityMw: Number.isFinite(capacity) ? capacity.toFixed(3) : null,
      latitude: latitude.toFixed(6),
      longitude: longitude.toFixed(6),
      sourceUrl: GPPD_INDIA_CSV_URL
    }];
  });
}
function distanceKm(latA, lngA, latB, lngB) {
  const radians = (value) => value * Math.PI / 180;
  const dLat = radians(latB - latA);
  const dLng = radians(lngB - lngA);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(radians(latA)) * Math.cos(radians(latB)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}
function pointCacheKey(lat, lng, radiusKm) {
  return `gppd-reference:nearest:${lat.toFixed(5)}:${lng.toFixed(5)}:${radiusKm.toFixed(2)}`;
}
function parseCachedPlant(payload) {
  try {
    const parsed = JSON.parse(payload);
    if (typeof parsed.name !== "string" || typeof parsed.distanceKm !== "number" || typeof parsed.source !== "string") return void 0;
    if (parsed.fuelType !== null && typeof parsed.fuelType !== "string") return void 0;
    if (parsed.capacityMw !== null && typeof parsed.capacityMw !== "number") return void 0;
    return { name: parsed.name, fuelType: parsed.fuelType ?? null, capacityMw: parsed.capacityMw ?? null, distanceKm: parsed.distanceKm, source: parsed.source };
  } catch {
    return void 0;
  }
}
async function hydrateReference() {
  try {
    const csv = await csvFetcher();
    const rows = parseIndiaGppdCsv(csv);
    if (rows.length === 0) throw new Error("GPPD source contained no valid India rows.");
    const replaced = await referenceReplacer(rows);
    const fetchedAt = /* @__PURE__ */ new Date();
    try {
      await cacheWriter3({ cacheKey: GPPD_LOADER_CACHE_KEY, provider: "wri-gppd-india", payload: JSON.stringify({ rowCount: replaced.rowCount, source: GPPD_SOURCE }), fetchedAt, expiresAt: new Date(fetchedAt.getTime() + GPPD_CACHE_TTL_MS) });
    } catch {
    }
    return true;
  } catch {
    return false;
  }
}
var hydrationInFlight;
function loadIndiaGppdReference() {
  if (!hydrationInFlight) hydrationInFlight = hydrateReference().finally(() => {
    hydrationInFlight = void 0;
  });
  return hydrationInFlight;
}
async function lookupNearestGppdPlant(lat, lng, radiusKm = DEFAULT_RADIUS_KM) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !Number.isFinite(radiusKm) || radiusKm <= 0) return void 0;
  try {
    const candidates = await candidateReader(lat, lng, radiusKm);
    const nearest = candidates.map((plant) => ({ plant, distanceKm: distanceKm(lat, lng, Number(plant.latitude), Number(plant.longitude)) })).filter((candidate) => Number.isFinite(candidate.distanceKm) && candidate.distanceKm <= radiusKm).sort((left, right) => left.distanceKm - right.distanceKm)[0];
    if (!nearest) {
      void loadIndiaGppdReference();
      return void 0;
    }
    const result = { name: nearest.plant.name, fuelType: nearest.plant.primaryFuel, capacityMw: nearest.plant.capacityMw === null ? null : Number(nearest.plant.capacityMw), distanceKm: Number(nearest.distanceKm.toFixed(3)), source: GPPD_SOURCE };
    const fetchedAt = /* @__PURE__ */ new Date();
    try {
      await cacheWriter3({ cacheKey: pointCacheKey(lat, lng, radiusKm), provider: "wri-gppd-nearest", payload: JSON.stringify(result), fetchedAt, expiresAt: new Date(fetchedAt.getTime() + GPPD_CACHE_TTL_MS) });
    } catch {
    }
    return result;
  } catch {
    try {
      const cached = await cacheReader3(pointCacheKey(lat, lng, radiusKm));
      if (!cached || cached.expiresAt.getTime() <= Date.now()) return void 0;
      return parseCachedPlant(cached.payload);
    } catch {
      return void 0;
    }
  }
}

// server/flareReference.ts
import ExcelJS from "exceljs";
var FIRMS_GAS_FLARE_REFERENCE_SOURCE = "NASA FIRMS Gas Flares reference context; World Bank GFMR individual flare locations (2012\u20132025)";
var SOURCE_DATA_YEAR = 2025;
var LOADER_CACHE_KEY = "firms-gas-flare-reference:india:world-bank-gfmr:2025";
var CACHE_TTL_MS2 = 400 * 24 * 60 * 6e4;
var DEFAULT_RADIUS_KM2 = 2;
function distanceKm2(latA, lngA, latB, lngB) {
  const radians = (value) => value * Math.PI / 180;
  const dLat = radians(latB - latA);
  const dLng = radians(lngB - lngA);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(radians(latA)) * Math.cos(radians(latB)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}
function pointCacheKey2(lat, lng, radiusKm) {
  return `firms-gas-flare-reference:nearest:${lat.toFixed(5)}:${lng.toFixed(5)}:${radiusKm.toFixed(2)}`;
}
function parseCachedMatch(payload) {
  try {
    const value = JSON.parse(payload);
    if (typeof value.flareId !== "string" || typeof value.latitude !== "number" || typeof value.longitude !== "number" || typeof value.distanceKm !== "number" || typeof value.source !== "string" || typeof value.sourceDataYear !== "number") return void 0;
    return {
      flareId: value.flareId,
      latitude: value.latitude,
      longitude: value.longitude,
      distanceKm: value.distanceKm,
      source: value.source,
      sourceDataYear: value.sourceDataYear,
      fieldType: typeof value.fieldType === "string" ? value.fieldType : null,
      fieldName: typeof value.fieldName === "string" ? value.fieldName : null,
      operator: typeof value.operator === "string" ? value.operator : null,
      location: typeof value.location === "string" ? value.location : null,
      latestAnnualVolumeMcm: typeof value.latestAnnualVolumeMcm === "number" ? value.latestAnnualVolumeMcm : null
    };
  } catch {
    return void 0;
  }
}
var cacheReader4 = (key) => getSourceEvidenceCache(key);
var cacheWriter4 = (input) => saveSourceEvidenceCache(input);
var candidateReader2 = getGasFlareReferenceCandidates;
async function catalogIsAvailable() {
  try {
    const cached = await cacheReader4(LOADER_CACHE_KEY);
    return Boolean(cached && cached.expiresAt.getTime() > Date.now());
  } catch {
    return false;
  }
}
async function lookupNearestFirmsGasFlare(lat, lng, radiusKm = DEFAULT_RADIUS_KM2) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !Number.isFinite(radiusKm) || radiusKm <= 0) {
    return { state: "unavailable", candidateCount: 0, dataYear: null };
  }
  try {
    const candidates = await candidateReader2(lat, lng, radiusKm);
    const nearest = candidates.map((candidate) => ({ candidate, distanceKm: distanceKm2(lat, lng, Number(candidate.latitude), Number(candidate.longitude)) })).filter((item) => Number.isFinite(item.distanceKm) && item.distanceKm <= radiusKm).sort((left, right) => left.distanceKm - right.distanceKm)[0];
    const sourceAvailable = nearest !== void 0 || await catalogIsAvailable();
    if (!nearest) {
      return { state: sourceAvailable ? "available" : "unavailable", candidateCount: candidates.length, dataYear: sourceAvailable ? SOURCE_DATA_YEAR : null };
    }
    const match = {
      flareId: nearest.candidate.flareId,
      latitude: Number(nearest.candidate.latitude),
      longitude: Number(nearest.candidate.longitude),
      distanceKm: Number(nearest.distanceKm.toFixed(3)),
      source: FIRMS_GAS_FLARE_REFERENCE_SOURCE,
      sourceDataYear: nearest.candidate.sourceDataYear,
      fieldType: nearest.candidate.fieldType,
      fieldName: nearest.candidate.fieldName,
      operator: nearest.candidate.operator,
      location: nearest.candidate.location,
      latestAnnualVolumeMcm: nearest.candidate.latestAnnualVolumeMcm === null ? null : Number(nearest.candidate.latestAnnualVolumeMcm)
    };
    const fetchedAt = /* @__PURE__ */ new Date();
    try {
      await cacheWriter4({ cacheKey: pointCacheKey2(lat, lng, radiusKm), provider: "nasa-firms-gas-flares-reference", payload: JSON.stringify(match), fetchedAt, expiresAt: new Date(fetchedAt.getTime() + CACHE_TTL_MS2) });
    } catch {
    }
    return { state: "available", candidateCount: candidates.length, dataYear: match.sourceDataYear, match };
  } catch {
    try {
      const cached = await cacheReader4(pointCacheKey2(lat, lng, radiusKm));
      const match = cached && cached.expiresAt.getTime() > Date.now() ? parseCachedMatch(cached.payload) : void 0;
      return match ? { state: "cached", candidateCount: 1, dataYear: match.sourceDataYear, match } : { state: "unavailable", candidateCount: 0, dataYear: null };
    } catch {
      return { state: "unavailable", candidateCount: 0, dataYear: null };
    }
  }
}

// server/facilityReference.ts
var VNF_RADIUS_KM = 2;
var VNF_FACILITY_MATCH_KM = 1;
function distanceKm3(latA, lngA, latB, lngB) {
  const radians = (value) => value * Math.PI / 180;
  const dLat = radians(latB - latA);
  const dLng = radians(lngB - lngA);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(radians(latA)) * Math.cos(radians(latB)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}
var flareReferenceLookup = lookupNearestFirmsGasFlare;
async function assessFacilitySignals(input) {
  const miningMatch = input.industrialFacilityCategory === "mining" && (input.industrialFacilityDistanceM ?? Infinity) <= VNF_RADIUS_KM * 1e3;
  let reference = { state: "unavailable", candidateCount: 0, dataYear: null };
  try {
    reference = await flareReferenceLookup(input.lat, input.lng, VNF_RADIUS_KM);
  } catch {
  }
  const hasRelevantOsmFacility = (input.industrialFacilityCategory === "refinery" || input.industrialFacilityCategory === "lng_terminal") && Number.isFinite(input.industrialFacilityLatitude) && Number.isFinite(input.industrialFacilityLongitude);
  const candidateNearRelevantFacility = hasRelevantOsmFacility && reference.match !== void 0 && distanceKm3(reference.match.latitude, reference.match.longitude, Number(input.industrialFacilityLatitude), Number(input.industrialFacilityLongitude)) <= VNF_FACILITY_MATCH_KM;
  const currentThermalObservation = input.firmsCurrentState === "available" && (input.firmsCurrentDetections ?? 0) > 0;
  const persistentThermalObservation = input.firmsHistoryState === "available" && (input.firmsHistoryDetections ?? 0) >= 5;
  const gppdCrossReferenceAvailable = Boolean(input.gppdReference);
  const flareMatch = reference.state === "available" && candidateNearRelevantFacility && currentThermalObservation && persistentThermalObservation;
  const detail = flareMatch ? `Live NASA FIRMS thermal activity is persistent in the existing seven-day window and aligns with a public Gas Flares reference location near a typed ${input.industrialFacilityCategory?.replaceAll("_", " ")} OSM facility${gppdCrossReferenceAvailable ? "; nearby GPPD context was also available" : ""}.` : miningMatch ? "A nearby OSM facility is typed as mining; this is separate context and not a flare match." : reference.state === "cached" ? "Cached public gas-flare reference context is available, but cached data cannot issue a high-confidence gas-flare match." : reference.state === "unavailable" ? "Public gas-flare reference context is unavailable; no gas-flare match is issued." : !reference.match ? "No public gas-flare reference location is within the local search radius." : !currentThermalObservation ? "A nearby gas-flare reference exists, but no current live NASA FIRMS thermal observation is present." : !persistentThermalObservation ? "A nearby gas-flare reference exists, but the existing seven-day FIRMS window does not meet the established recurring-heat persistence threshold." : "No gas-flare match is issued.";
  return {
    flareMatch,
    flareMatchConfidence: flareMatch ? "high" : "none",
    miningMatch,
    // Retained for compatibility with the optional EOG VNF adapter. It remains
    // intentionally unavailable when no licensed EOG source has been configured.
    vnfState: "unavailable",
    vnfCandidateCount: 0,
    flareReferenceState: reference.state,
    flareReferenceCandidateCount: reference.candidateCount,
    flareReferenceDataYear: reference.dataYear,
    detail
  };
}

// server/seasonalAgriculture.ts
import { sql as sql2 } from "drizzle-orm";
var CALENDAR_SOURCE_URL = "https://science.nasa.gov/earth/earth-observatory/new-timing-for-stubble-burning-in-india/";
var CALENDAR_ENTRIES = [
  ...[10, 11].flatMap((month) => ["Punjab", "Haryana"].map((state) => ({ state, month, season: "post-rice harvest", contextLevel: "high", sourceUrl: CALENDAR_SOURCE_URL }))),
  ...[10, 11, 12].flatMap((month) => ["Uttar Pradesh", "Madhya Pradesh"].map((state) => ({ state, month, season: "post-harvest broader Indo-Gangetic context", contextLevel: "context", sourceUrl: CALENDAR_SOURCE_URL })))
];
function pointOnRing(lng, lat, ring) {
  let inside = false;
  for (let index2 = 0, previous = ring.length - 1; index2 < ring.length; previous = index2++) {
    const [x1, y1] = ring[index2];
    const [x2, y2] = ring[previous];
    if (y1 > lat !== y2 > lat && lng < (x2 - x1) * (lat - y1) / (y2 - y1) + x1) inside = !inside;
  }
  return inside;
}
function pointInPolygon(lng, lat, polygon) {
  return pointOnRing(lng, lat, polygon[0] ?? []) && !polygon.slice(1).some((hole) => pointOnRing(lng, lat, hole));
}
function pointInStateGeometry(lng, lat, geometry) {
  return geometry.type === "Polygon" ? pointInPolygon(lng, lat, geometry.coordinates) : geometry.coordinates.some((polygon) => pointInPolygon(lng, lat, polygon));
}
var boundaryReader = async () => {
  const db = await getDb();
  if (!db) throw new Error("database unavailable");
  const rows = await db.select().from(seasonalAgriculturalStateGeometry);
  return rows.map((row) => ({ state: row.state, geometry: JSON.parse(row.geometry) }));
};
var calendarReader = async () => {
  const db = await getDb();
  if (!db) throw new Error("database unavailable");
  return await db.select({ state: seasonalAgriculturalBurningCalendar.state, month: seasonalAgriculturalBurningCalendar.month, season: seasonalAgriculturalBurningCalendar.season, contextLevel: seasonalAgriculturalBurningCalendar.contextLevel, sourceUrl: seasonalAgriculturalBurningCalendar.sourceUrl }).from(seasonalAgriculturalBurningCalendar);
};
async function lookupSeasonalAgriculturalBurning(lat, lng, month = (/* @__PURE__ */ new Date()).getUTCMonth() + 1) {
  const unavailable = () => ({ state: "unavailable", geographicState: null, month, calendarState: "unavailable", season: null, contextLevel: null, source: "India seasonal agricultural-burning calendar", detail: "The local seasonal agricultural-burning calendar is unavailable; no agricultural interpretation has been inferred." });
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !Number.isInteger(month) || month < 1 || month > 12) return unavailable();
  try {
    const [boundaries, calendar] = await Promise.all([boundaryReader(), calendarReader()]);
    if (boundaries.length === 0) return unavailable();
    const state = boundaries.find((boundary) => pointInStateGeometry(lng, lat, boundary.geometry))?.state;
    if (!state) return { state: "available", geographicState: null, month, calendarState: "out_of_scope", season: null, contextLevel: null, source: "NASA Earth Observatory seasonal crop-fire context", detail: "This coordinate is outside the calendar's narrowly mapped agricultural-burning states; no seasonal agricultural context is asserted." };
    const entry = calendar.find((candidate) => candidate.state === state && candidate.month === month);
    if (!entry) return { state: "available", geographicState: state, month, calendarState: "out_of_season", season: null, contextLevel: null, source: "NASA Earth Observatory seasonal crop-fire context", detail: `${state} is mapped, but month ${month} is outside the documented calendar period; no seasonal agricultural context is asserted.` };
    return { state: "available", geographicState: state, month, calendarState: "in_season", season: entry.season, contextLevel: entry.contextLevel === "high" ? "high" : "context", source: "NASA Earth Observatory seasonal crop-fire context", detail: `${state} month ${month} is within documented ${entry.season} timing. This is contextual screening evidence, not a cause determination.` };
  } catch {
    return unavailable();
  }
}

// server/_core/map.ts
function getMapsConfig() {
  const baseUrl = ENV.forgeApiUrl;
  const apiKey = ENV.forgeApiKey;
  if (!baseUrl || !apiKey) {
    throw new Error(
      "Google Maps proxy credentials missing: set BUILT_IN_FORGE_API_URL and BUILT_IN_FORGE_API_KEY"
    );
  }
  return {
    baseUrl: baseUrl.replace(/\/+$/, ""),
    apiKey
  };
}
async function makeRequest(endpoint, params = {}, options = {}) {
  const { baseUrl, apiKey } = getMapsConfig();
  const url = new URL(`${baseUrl}/v1/maps/proxy${endpoint}`);
  url.searchParams.append("key", apiKey);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== void 0 && value !== null) {
      url.searchParams.append(key, String(value));
    }
  });
  const response = await fetch(url.toString(), {
    method: options.method || "GET",
    headers: {
      "Content-Type": "application/json"
    },
    body: options.body ? JSON.stringify(options.body) : void 0
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Google Maps API request failed (${response.status} ${response.statusText}): ${errorText}`
    );
  }
  return await response.json();
}

// server/corroboration.ts
setDefaultResultOrder("ipv4first");
var REQUEST_TIMEOUT_MS3 = 12e3;
var RETRY_DELAYS_MS2 = [0, 300];
var FIRMS_DETECTION_PREFERENCE_MS = 6e3;
var FACILITY_SIGNAL_BUDGET_MS = 750;
var liveEvidenceWindowMs = 27e3;
var memoryCache = /* @__PURE__ */ new Map();
var persistEvidenceCacheWrites = process.env.VITEST !== "true";
var authorityEvidenceTestOverride;
var detectionHistoryRecorder = recordDetectionHistory;
var longTermPersistenceReader = getLongTermPersistence;
var detectionHistoryStatisticsReader = getDetectionHistoryStatistics;
var seasonalAgriculturalBurningReader = lookupSeasonalAgriculturalBurning;
var landCoverFetcher = fetchLandCover;
var gppdReferenceLookup = lookupNearestGppdPlant;
var facilitySignalLookup = assessFacilitySignals;
var FIRMS_RELAY_BASE_URL = (process.env.FIRMS_RELAY_BASE_URL ?? "https://fireguard-firms-relay.fireguard-2cddbeab.workers.dev").replace(/\/+$/, "");
function nowIso() {
  return (/* @__PURE__ */ new Date()).toISOString();
}
function frpVarianceEvidence(statistics) {
  const state = statistics.state === "unavailable" ? "unavailable" : statistics.frpVarianceGroups.some((group) => group.state === "adequate") ? "adequate" : "insufficient";
  return { state, sampleCount: statistics.frpSampleCount, groups: statistics.frpVarianceGroups };
}
function bboxFor(lat, lng, delta = 0.055) {
  return [lng - delta, lat - delta, lng + delta, lat + delta].map((value) => value.toFixed(4)).join(",");
}
function cacheKey2(provider, lat, lng, days) {
  return `${provider}:${lat.toFixed(3)}:${lng.toFixed(3)}${days ? `:${days}` : ""}`;
}
function haversineKm(aLat, aLng, bLat, bLng) {
  const radians = (value) => value * Math.PI / 180;
  const dLat = radians(bLat - aLat);
  const dLng = radians(bLng - aLng);
  const startLat = radians(aLat);
  const endLat = radians(bLat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(startLat) * Math.cos(endLat) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}
function emptyIndustrialFacility() {
  return { industrialFacilityName: null, industrialFacilityType: null, industrialFacilityCategory: null, industrialFacilityLatitude: null, industrialFacilityLongitude: null, industrialFacilityDistanceM: null, industrialFacilityOsmUrl: null };
}
function industrialFacilityType(tags) {
  if (tags.man_made === "works") return "man_made=works";
  if (tags.man_made === "mine") return "man_made=mine";
  if (tags.power === "plant") return "power=plant";
  if (tags.landuse === "industrial") return "landuse=industrial";
  if (tags.landuse === "quarry") return "landuse=quarry";
  if (tags.industrial) return `industrial=${tags.industrial}`;
  if (tags.landuse === "farmland") return "landuse=farmland";
  return null;
}
function isExistingIndustrialContext(tags) {
  return tags.landuse === "industrial" || tags.man_made === "works" || Boolean(tags.industrial) || tags.power === "plant";
}
function industrialFacilityCategory(tags) {
  const searchable = Object.entries(tags).flatMap(([key, value]) => [key, value ?? ""]).join(" ").toLowerCase();
  if (/\brefiner(?:y|ies)\b|petroleum refinery/.test(searchable)) return "refinery";
  if (/\blng(?:\b|_)|liquefied natural gas/.test(searchable)) return "lng_terminal";
  if (/\bsteel\b|iron and steel/.test(searchable)) return "steel";
  if (tags.man_made === "mine" || tags.landuse === "quarry" || /\bmin(?:e|ing)\b|quarry/.test(searchable)) return "mining";
  if (tags.landuse === "farmland" || /\bagricultur(?:e|al)\b|crop|farm/.test(searchable)) return "agricultural_zone";
  if (tags.power === "plant") return "power_plant";
  return null;
}
function nearestIndustrialFacility(lat, lng, elements) {
  const nearest = elements.flatMap((element) => {
    const featureLat = Number(element.lat ?? element.center?.lat);
    const featureLng = Number(element.lon ?? element.center?.lon);
    const tags = element.tags ?? {};
    const type = industrialFacilityType(tags);
    if (!Number.isFinite(featureLat) || !Number.isFinite(featureLng) || !type) return [];
    return [{
      name: tags.name ?? tags["name:en"] ?? null,
      type,
      category: industrialFacilityCategory(tags),
      latitude: featureLat,
      longitude: featureLng,
      distanceM: haversineKm(lat, lng, featureLat, featureLng) * 1e3,
      osmUrl: ["node", "way", "relation"].includes(element.type ?? "") && Number.isInteger(element.id) ? `https://www.openstreetmap.org/${element.type}/${element.id}` : null
    }];
  }).sort((left, right) => left.distanceM - right.distanceM)[0];
  return nearest ? { industrialFacilityName: nearest.name, industrialFacilityType: nearest.type, industrialFacilityCategory: nearest.category, industrialFacilityLatitude: nearest.latitude, industrialFacilityLongitude: nearest.longitude, industrialFacilityDistanceM: Number(nearest.distanceM.toFixed(1)), industrialFacilityOsmUrl: nearest.osmUrl } : emptyIndustrialFacility();
}
function cachedIndustrialFacility(value) {
  return {
    industrialFacilityName: value.industrialFacilityName ?? null,
    industrialFacilityType: value.industrialFacilityType ?? null,
    industrialFacilityCategory: value.industrialFacilityCategory ?? null,
    industrialFacilityLatitude: value.industrialFacilityLatitude ?? null,
    industrialFacilityLongitude: value.industrialFacilityLongitude ?? null,
    industrialFacilityDistanceM: value.industrialFacilityDistanceM ?? null,
    industrialFacilityOsmUrl: value.industrialFacilityOsmUrl ?? null
  };
}
function parseFirmsRows(csv, lat, lng) {
  const lines = csv.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return 0;
  const header = lines[0].split(",").map((value) => value.trim().toLowerCase());
  const latIndex = header.indexOf("latitude");
  const lngIndex = header.indexOf("longitude");
  if (lat === void 0 || lng === void 0 || latIndex < 0 || lngIndex < 0) return lines.length - 1;
  return lines.slice(1).filter((line) => {
    const values = line.split(",");
    const candidateLat = Number(values[latIndex]);
    const candidateLng = Number(values[lngIndex]);
    return Number.isFinite(candidateLat) && Number.isFinite(candidateLng) && haversineKm(lat, lng, candidateLat, candidateLng) <= 8;
  }).length;
}
function parseFirmsDailyDetections(csv, lat, lng) {
  const lines = csv.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const header = lines[0].split(",").map((value) => value.trim().toLowerCase());
  const latIndex = header.indexOf("latitude");
  const lngIndex = header.indexOf("longitude");
  const dateIndex = header.indexOf("acq_date");
  if (dateIndex < 0) return [];
  const buckets = /* @__PURE__ */ new Map();
  for (const line of lines.slice(1)) {
    const values = line.split(",");
    const date2 = values[dateIndex]?.trim();
    if (!date2) continue;
    if (lat !== void 0 && lng !== void 0 && latIndex >= 0 && lngIndex >= 0) {
      const candidateLat = Number(values[latIndex]);
      const candidateLng = Number(values[lngIndex]);
      if (!Number.isFinite(candidateLat) || !Number.isFinite(candidateLng) || haversineKm(lat, lng, candidateLat, candidateLng) > 8) continue;
    }
    buckets.set(date2, (buckets.get(date2) ?? 0) + 1);
  }
  return Array.from(buckets, ([date2, detections]) => ({ date: date2, detections })).sort((a, b) => a.date.localeCompare(b.date));
}
function platformFromFirmsFields(instrument, satellite) {
  const normalizedInstrument = instrument?.trim().toUpperCase();
  if (normalizedInstrument === "MODIS" || normalizedInstrument === "VIIRS") return normalizedInstrument;
  const normalizedSatellite = satellite?.trim().toUpperCase();
  if (normalizedSatellite === "A" || normalizedSatellite === "T") return "MODIS";
  if (normalizedSatellite === "N" || normalizedSatellite === "N20" || normalizedSatellite === "N21") return "VIIRS";
  return null;
}
function parseFirmsDetectionHistoryRows(csv, lat, lng, platformHint) {
  const lines = csv.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const header = lines[0].split(",").map((value) => value.trim().toLowerCase());
  const latIndex = header.indexOf("latitude");
  const lngIndex = header.indexOf("longitude");
  const dateIndex = header.indexOf("acq_date");
  const brightnessIndex = ["bright_ti4", "brightness"].map((field) => header.indexOf(field)).find((index2) => index2 >= 0) ?? -1;
  const brightT31Index = header.indexOf("bright_t31");
  const confidenceIndex = header.indexOf("confidence");
  const dayNightIndex = header.indexOf("daynight");
  const frpIndex = header.indexOf("frp");
  const instrumentIndex = header.indexOf("instrument");
  const satelliteIndex = header.indexOf("satellite");
  if (latIndex < 0 || lngIndex < 0 || dateIndex < 0) return [];
  return lines.slice(1).flatMap((line) => {
    const values = line.split(",");
    const detectionLat = Number(values[latIndex]);
    const detectionLng = Number(values[lngIndex]);
    const detectionDate = values[dateIndex]?.trim();
    if (!Number.isFinite(detectionLat) || !Number.isFinite(detectionLng) || !detectionDate) return [];
    if (lat !== void 0 && lng !== void 0 && haversineKm(lat, lng, detectionLat, detectionLng) > 8) return [];
    const rawBrightness = brightnessIndex >= 0 ? values[brightnessIndex]?.trim() : void 0;
    const brightness = rawBrightness && Number.isFinite(Number(rawBrightness)) ? rawBrightness : null;
    const rawBrightT31 = brightT31Index >= 0 ? values[brightT31Index]?.trim() : void 0;
    const brightT31 = rawBrightT31 && Number.isFinite(Number(rawBrightT31)) ? rawBrightT31 : null;
    const confidence = confidenceIndex >= 0 ? values[confidenceIndex]?.trim() || null : null;
    const rawDayNight = dayNightIndex >= 0 ? values[dayNightIndex]?.trim().toUpperCase() : void 0;
    const dayNight = rawDayNight === "D" || rawDayNight === "N" ? rawDayNight : null;
    const rawFrp = frpIndex >= 0 ? values[frpIndex]?.trim() : void 0;
    const frp = rawFrp && Number.isFinite(Number(rawFrp)) ? rawFrp : null;
    const platform = platformFromFirmsFields(
      instrumentIndex >= 0 ? values[instrumentIndex] : void 0,
      satelliteIndex >= 0 ? values[satelliteIndex] : void 0
    ) ?? platformHint ?? null;
    return [{ latitude: detectionLat.toFixed(6), longitude: detectionLng.toFixed(6), detectionDate, brightness, brightT31, confidence, dayNight, frp, platform }];
  });
}
async function wait(ms) {
  if (ms > 0) await new Promise((resolve) => setTimeout(resolve, ms));
}
async function requestWithRetry(url, init) {
  let lastError;
  for (const delay of RETRY_DELAYS_MS2) {
    await wait(delay);
    try {
      const response = await fetch(url, {
        ...init,
        headers: {
          "User-Agent": "IndiaFireAnomalyIntelligence/1.0 (research-verifier)",
          Accept: "text/csv, application/json;q=0.9, */*;q=0.1",
          ...init?.headers
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS3)
      });
      if (response.ok) return response;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Upstream request failed.");
}
function firmsCountryUrl(sensor, days) {
  return `${FIRMS_RELAY_BASE_URL}/api/country/csv/${sensor}/IND/${days}`;
}
function preferDetectedFirmsResponse(requests) {
  return new Promise((resolve, reject) => {
    let pending = requests.length;
    let firstZeroRowResponse;
    let settled = false;
    const settle = (callback) => {
      if (settled) return;
      settled = true;
      clearTimeout(preferenceTimer);
      callback();
    };
    const preferenceTimer = setTimeout(() => {
      const fallback = firstZeroRowResponse;
      if (fallback) settle(() => resolve(fallback));
    }, FIRMS_DETECTION_PREFERENCE_MS);
    for (const request of requests) {
      request.then((response) => {
        if (settled) return;
        if (response.detections > 0) {
          settle(() => resolve(response));
          return;
        }
        firstZeroRowResponse ??= response;
        pending -= 1;
        if (pending === 0) settle(() => resolve(firstZeroRowResponse));
      }).catch(() => {
        if (settled) return;
        pending -= 1;
        if (pending === 0) {
          const fallback = firstZeroRowResponse;
          if (fallback) settle(() => resolve(fallback));
          else settle(() => reject(new Error("All official FIRMS routes failed.")));
        }
      });
    }
  });
}
async function readCached(key) {
  const memory2 = memoryCache.get(key);
  if (memory2 && memory2.expiresAt.getTime() > Date.now()) return memory2;
  try {
    const persisted = await getSourceEvidenceCache(key);
    if (!persisted || persisted.expiresAt.getTime() <= Date.now()) return void 0;
    const record = { value: JSON.parse(persisted.payload), fetchedAt: persisted.fetchedAt, expiresAt: persisted.expiresAt };
    memoryCache.set(key, record);
    return record;
  } catch {
    return void 0;
  }
}
async function writeCached(key, provider, value, ttlMs) {
  const fetchedAt = /* @__PURE__ */ new Date();
  const expiresAt = new Date(fetchedAt.getTime() + ttlMs);
  const record = { value, fetchedAt, expiresAt };
  memoryCache.set(key, record);
  if (persistEvidenceCacheWrites) {
    try {
      await saveSourceEvidenceCache({ cacheKey: key, provider, payload: JSON.stringify(value), fetchedAt, expiresAt });
    } catch {
    }
  }
  return record;
}
function cacheSuffix(record) {
  return ` Last verified ${record.fetchedAt.toISOString().replace("T", " ").slice(0, 16)} UTC.`;
}
async function fetchFirms(lat, lng, days, sensor, label) {
  const provider = `firms-${sensor.toLowerCase()}`;
  const key = cacheKey2(provider, lat, lng, days);
  const mapKey = process.env.NASA_FIRMS_MAP_KEY;
  const relayAuthToken = process.env.FIRMS_RELAY_AUTH_TOKEN ?? mapKey;
  const checkedAt2 = nowIso();
  if (!relayAuthToken) return { state: "unavailable", detections: 0, dailyDetections: [], frpMw: null, brightness: null, brightT31: null, confidence: null, provider, checkedAt: checkedAt2, detail: `The secure FIRMS relay is not configured with backend authentication.` };
  const areaUrl = `${FIRMS_RELAY_BASE_URL}/api/area/csv/${sensor}/${bboxFor(lat, lng)}/${days}`;
  const countryUrl = firmsCountryUrl(sensor, days);
  const wfsSensor = sensor === "VIIRS_NOAA21_NRT" ? "noaa21" : "noaa20";
  const wfsPeriod = days >= 7 ? "7days" : "24hrs";
  const wfsBbox = `${(lat - 0.055).toFixed(4)},${(lng - 0.055).toFixed(4)},${(lat + 0.055).toFixed(4)},${(lng + 0.055).toFixed(4)},urn:ogc:def:crs:EPSG::4326`;
  const wfsUrl = `${FIRMS_RELAY_BASE_URL}/mapserver/wfs/Russia_Asia/?SERVICE=WFS&REQUEST=GetFeature&VERSION=2.0.0&TYPENAME=ms:fires_${wfsSensor}_${wfsPeriod}&STARTINDEX=0&COUNT=1000&SRSNAME=urn:ogc:def:crs:EPSG::4326&BBOX=${encodeURIComponent(wfsBbox)}&outputformat=csv`;
  try {
    const evidence = await preferDetectedFirmsResponse([
      requestWithRetry(areaUrl, { headers: { Authorization: `Bearer ${relayAuthToken}` } }).then(async (response) => {
        const csv = await response.text();
        if (/invalid\s+map[_ ]key|error/i.test(csv)) throw new Error("FIRMS area route rejected the request.");
        const historyRows = parseFirmsDetectionHistoryRows(csv, void 0, void 0, "VIIRS");
        return { detections: parseFirmsRows(csv), dailyDetections: days > 1 ? parseFirmsDailyDetections(csv) : [], historyRows, brightness: historyRows.reduce((max, d) => Math.max(max, Number(d.brightness) || 0), 0) || null, brightT31: historyRows.reduce((max, d) => Math.max(max, Number(d.brightT31) || 0), 0) || null, confidence: historyRows.reduce((max, d) => Math.max(max, Number(d.confidence) || 0), 0) || null };
      }),
      requestWithRetry(countryUrl, { headers: { Authorization: `Bearer ${relayAuthToken}` } }).then(async (response) => {
        const csv = await response.text();
        if (/invalid\s+map[_ ]key|error/i.test(csv)) throw new Error("FIRMS country route rejected the request.");
        const historyRows = parseFirmsDetectionHistoryRows(csv, lat, lng, "VIIRS");
        return { detections: parseFirmsRows(csv, lat, lng), dailyDetections: days > 1 ? parseFirmsDailyDetections(csv, lat, lng) : [], historyRows, brightness: historyRows.reduce((max, d) => Math.max(max, Number(d.brightness) || 0), 0) || null, brightT31: historyRows.reduce((max, d) => Math.max(max, Number(d.brightT31) || 0), 0) || null, confidence: historyRows.reduce((max, d) => Math.max(max, Number(d.confidence) || 0), 0) || null };
      }),
      requestWithRetry(wfsUrl, { headers: { Authorization: `Bearer ${relayAuthToken}` } }).then(async (response) => {
        const csv = await response.text();
        if (/invalid\s+map[_ ]key|serviceexception|error/i.test(csv)) throw new Error("FIRMS WFS route rejected the request.");
        const historyRows = parseFirmsDetectionHistoryRows(csv, lat, lng, "VIIRS");
        return { detections: parseFirmsRows(csv, lat, lng), dailyDetections: days > 1 ? parseFirmsDailyDetections(csv, lat, lng) : [], historyRows, brightness: historyRows.reduce((max, d) => Math.max(max, Number(d.brightness) || 0), 0) || null, brightT31: historyRows.reduce((max, d) => Math.max(max, Number(d.brightT31) || 0), 0) || null, confidence: historyRows.reduce((max, d) => Math.max(max, Number(d.confidence) || 0), 0) || null };
      })
    ]);
    try {
      await detectionHistoryRecorder(evidence.historyRows);
    } catch {
    }
    await writeCached(key, provider, evidence, days === 1 ? 20 * 6e4 : 6 * 60 * 6e4);
    return {
      state: "available",
      detections: evidence.detections,
      dailyDetections: evidence.dailyDetections,
      frpMw: evidence.historyRows.reduce((max, d) => Math.max(max, Number(d.frp) || 0), 0) || null,
      brightness: evidence.historyRows.reduce((max, d) => Math.max(max, Number(d.brightness) || 0), 0) || null,
      brightT31: evidence.historyRows.reduce((max, d) => Math.max(max, Number(d.brightT31) || 0), 0) || null,
      confidence: evidence.historyRows.reduce((max, d) => Math.max(max, Number(d.confidence) || 0), 0) || null,
      provider,
      checkedAt: checkedAt2,
      detail: evidence.detections > 0 ? `${evidence.detections} live NASA FIRMS ${label} detections in the local ${days}-day window.` : `No live NASA FIRMS ${label} detections in the local ${days}-day window.`
    };
  } catch {
    const cached = await readCached(key);
    if (cached) {
      return {
        state: "cached",
        detections: cached.value.detections,
        dailyDetections: cached.value.dailyDetections ?? [],
        frpMw: null,
        brightness: null,
        brightT31: null,
        confidence: null,
        provider,
        checkedAt: checkedAt2,
        detail: `${cached.value.detections} previously verified NASA FIRMS ${label} detections are shown while the live response is delayed.${cacheSuffix(cached)}`
      };
    }
    return {
      state: "unavailable",
      detections: 0,
      dailyDetections: [],
      frpMw: null,
      brightness: null,
      brightT31: null,
      confidence: null,
      provider,
      checkedAt: checkedAt2,
      detail: `The permanent FIRMS relay could not retrieve NASA ${label} data after bounded Area API, India route, and WFS retries. No verified cached reading is available.`
    };
  }
}
async function fetchIndustrialContext(lat, lng) {
  const provider = "osm-overpass";
  const key = cacheKey2(provider, lat, lng);
  const checkedAt2 = nowIso();
  const query = `[out:json][timeout:12];(way(around:5000,${lat},${lng})["landuse"="industrial"];way(around:5000,${lat},${lng})["man_made"="works"];way(around:5000,${lat},${lng})["man_made"="mine"];way(around:5000,${lat},${lng})["landuse"="quarry"];way(around:5000,${lat},${lng})["industrial"];way(around:5000,${lat},${lng})["power"="plant"];node(around:5000,${lat},${lng})["man_made"="works"];node(around:5000,${lat},${lng})["man_made"="mine"];node(around:5000,${lat},${lng})["power"="plant"];node(around:5000,${lat},${lng})["landuse"="farmland"];way(around:5000,${lat},${lng})["landuse"="farmland"];);out center tags;`;
  const hosts = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter", "https://overpass.private.coffee/api/interpreter"];
  try {
    const data = await Promise.any(hosts.map(async (host) => {
      const response = await requestWithRetry(host, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
        body: new URLSearchParams({ data: query })
      });
      return response.json();
    }));
    const elements = data.elements ?? [];
    const features = elements.filter((element) => !element.tags || isExistingIndustrialContext(element.tags)).length;
    const nearestFacility = nearestIndustrialFacility(lat, lng, elements);
    await writeCached(key, provider, { features, ...nearestFacility }, 7 * 24 * 60 * 6e4);
    return {
      state: "available",
      features,
      provider,
      checkedAt: checkedAt2,
      ...nearestFacility,
      detail: features > 0 ? `${features} live nearby OSM industrial-context features found within 5 km.` : "No live nearby OSM industrial-context feature was returned within 5 km."
    };
  } catch {
    const placesKey = cacheKey2("google-places-industrial", lat, lng);
    try {
      const places = await makeRequest("/maps/api/place/nearbysearch/json", {
        location: `${lat},${lng}`,
        radius: 5e3,
        keyword: "industrial factory manufacturing"
      });
      const features = places.results?.filter((place) => place.business_status !== "CLOSED_PERMANENTLY").length ?? 0;
      await writeCached(placesKey, "google-places-industrial", { features, ...emptyIndustrialFacility() }, 24 * 60 * 6e4);
      return {
        state: "available",
        features,
        provider: "google-places-industrial",
        checkedAt: checkedAt2,
        ...emptyIndustrialFacility(),
        detail: features > 0 ? `${features} live Google Places industrial/factory context records found within 5 km after OSM mirrors were unavailable.` : "Google Places returned no operational industrial/factory context record within 5 km after OSM mirrors were unavailable."
      };
    } catch {
      const googleCached = await readCached(placesKey);
      if (googleCached) {
        return {
          state: "cached",
          features: googleCached.value.features,
          provider: "google-places-industrial",
          checkedAt: checkedAt2,
          ...cachedIndustrialFacility(googleCached.value),
          detail: `${googleCached.value.features} previously verified Google Places industrial/factory context records are shown while OSM mirrors are delayed.${cacheSuffix(googleCached)}`
        };
      }
    }
    const cached = await readCached(key);
    if (cached) {
      return {
        state: "cached",
        features: cached.value.features,
        provider,
        checkedAt: checkedAt2,
        ...cachedIndustrialFacility(cached.value),
        detail: `${cached.value.features} previously verified OSM industrial-context features are shown while all live mirrors are delayed.${cacheSuffix(cached)}`
      };
    }
    return {
      state: "unavailable",
      features: 0,
      provider,
      checkedAt: checkedAt2,
      ...emptyIndustrialFacility(),
      detail: "OSM industrial context did not respond after bounded retries across three Overpass mirrors, and the independent Google Places facility fallback was unavailable. No verified cached context is available."
    };
  }
}
async function fetchWeather(lat, lng) {
  const provider = "open-meteo";
  const checkedAt2 = nowIso();
  try {
    const query = new URLSearchParams({ latitude: lat.toString(), longitude: lng.toString(), current: "temperature_2m,wind_speed_10m,wind_direction_10m,precipitation,weather_code" });
    const response = await requestWithRetry(`https://api.open-meteo.com/v1/forecast?${query}`);
    const data = await response.json();
    const current = data.current;
    if (!current) throw new Error("Weather payload missing current conditions.");
    return { state: "available", provider, checkedAt: checkedAt2, detail: `${current.temperature_2m ?? "\u2013"}\xB0C \xB7 wind ${current.wind_speed_10m ?? "\u2013"} km/h at ${current.wind_direction_10m ?? "\u2013"}\xB0 \xB7 precipitation ${current.precipitation ?? "\u2013"} mm.` };
  } catch {
    return { state: "unavailable", provider, checkedAt: checkedAt2, detail: "Weather context did not respond within the retry budget." };
  }
}
async function fetchAuthorityIncidentEvidence(input) {
  const checkedAt2 = nowIso();
  try {
    let summaries;
    if (authorityEvidenceTestOverride) {
      summaries = authorityEvidenceTestOverride;
    } else {
      const records = await getActiveIncidentEvidence(input.detectionId, input.lat, input.lng);
      if (records === void 0) {
        return {
          state: "unavailable",
          records: [],
          provider: "fireguard-incident-ledger",
          checkedAt: checkedAt2,
          detail: "The controlled authority/facility incident ledger is unavailable. No confirmed-incident verdict can be issued."
        };
      }
      summaries = records.map((record) => ({
        id: record.id,
        sourceType: record.sourceType,
        sourceName: record.sourceName,
        incidentReference: record.incidentReference,
        reportedAt: record.reportedAt.toISOString(),
        verifiedAt: record.createdAt.toISOString()
      }));
    }
    return {
      state: "available",
      records: summaries,
      provider: "fireguard-incident-ledger",
      checkedAt: checkedAt2,
      detail: summaries.length > 0 ? `${summaries.length} time-aligned, administrator-reviewed ${summaries.length === 1 ? "incident record is" : "incident records are"} linked to an external ${summaries[0].sourceType} source.` : "No time-aligned authority or verified-facility incident record is linked to this detection."
    };
  } catch {
    return {
      state: "unavailable",
      records: [],
      provider: "fireguard-incident-ledger",
      checkedAt: checkedAt2,
      detail: "The controlled authority/facility incident ledger could not be read. No confirmed-incident verdict can be issued."
    };
  }
}
function pendingFirms(provider, checkedAt2) {
  return { state: "unavailable", detections: 0, dailyDetections: [], frpMw: null, brightness: null, brightT31: null, confidence: null, provider, checkedAt: checkedAt2, detail: "The source did not return within the live evidence window. It has been marked pending; no result has been inferred." };
}
function pendingIndustrial(checkedAt2) {
  return { state: "unavailable", features: 0, provider: "osm-overpass", checkedAt: checkedAt2, ...emptyIndustrialFacility(), detail: "The industrial-context source did not return within the live evidence window. It has been marked pending." };
}
function pendingWeather(checkedAt2) {
  return { state: "unavailable", provider: "open-meteo", checkedAt: checkedAt2, detail: "Weather context did not return within the live evidence window." };
}
async function evaluateCorroboration(input) {
  const authorityIncidentEvidence = fetchAuthorityIncidentEvidence(input);
  let landCover;
  void landCoverFetcher(input.lat, input.lng).then((result) => {
    landCover = result;
  }).catch(() => void 0);
  const fsiForestContextPromise = fetchFsiForestContext(input.lat, input.lng);
  let gppdReference2;
  void gppdReferenceLookup(input.lat, input.lng).then((result) => {
    gppdReference2 = result;
  }).catch(() => void 0);
  const evaluatedMonth = (/* @__PURE__ */ new Date()).getUTCMonth() + 1;
  const facilitySignalsInput = (industrial2, firmsCurrent2, firmsHistory2) => ({
    lat: input.lat,
    lng: input.lng,
    ...industrial2,
    firmsCurrentState: firmsCurrent2.state,
    firmsCurrentDetections: firmsCurrent2.detections,
    firmsHistoryState: firmsHistory2.state,
    firmsHistoryDetections: firmsHistory2.detections,
    ...gppdReference2 ? { gppdReference: gppdReference2 } : {}
  });
  const checks = Promise.all([
    fetchFirms(input.lat, input.lng, 1, "VIIRS_NOAA20_NRT", "NOAA-20"),
    fetchFirms(input.lat, input.lng, 7, "VIIRS_NOAA20_NRT", "NOAA-20"),
    fetchFirms(input.lat, input.lng, 1, "VIIRS_NOAA21_NRT", "NOAA-21"),
    fetchIndustrialContext(input.lat, input.lng),
    fetchWeather(input.lat, input.lng)
  ]);
  const timedOut = await Promise.race([
    checks.then(() => false),
    new Promise((resolve) => setTimeout(() => resolve(true), liveEvidenceWindowMs))
  ]);
  const checkedAt2 = nowIso();
  if (timedOut) {
    const firmsCurrent2 = pendingFirms("firms-viirs_noaa20_nrt", checkedAt2);
    const firmsHistory2 = pendingFirms("firms-viirs_noaa20_nrt", checkedAt2);
    const firmsIndependentCurrent2 = pendingFirms("firms-viirs_noaa21_nrt", checkedAt2);
    const industrial2 = pendingIndustrial(checkedAt2);
    const weather2 = pendingWeather(checkedAt2);
    const incidentEvidence3 = await authorityIncidentEvidence;
    const [longTermHistory2, detectionHistoryStatistics2, seasonalAgriculturalBurning2] = await Promise.all([
      longTermPersistenceReader(input.lat, input.lng),
      detectionHistoryStatisticsReader(input.lat, input.lng),
      seasonalAgriculturalBurningReader(input.lat, input.lng, evaluatedMonth)
    ]);
    const fsiForestContext2 = unavailableFsiForestContext();
    const classification2 = classifyCorroborationEvidence({
      industrialFeatures: industrial2.features,
      industrialState: industrial2.state,
      historyDailyDetections: firmsHistory2.dailyDetections,
      historyState: firmsHistory2.state,
      landCoverClass: landCover?.landCoverClass ?? null,
      longTermHistory: longTermHistory2.state === "available" ? { totalDetectionCount: longTermHistory2.totalDetectionCount, activeMonths: longTermHistory2.activeMonths } : null,
      gppdReference: gppdReference2 ? { name: gppdReference2.name, fuelType: gppdReference2.fuelType, distanceKm: gppdReference2.distanceKm } : null,
      industrialFacilityName: industrial2.industrialFacilityName,
      industrialFacilityCategory: industrial2.industrialFacilityCategory,
      flareMatch: false
    });
    return {
      detectionId: input.detectionId,
      checkedAt: checkedAt2,
      sourcesRunInParallel: true,
      firmsCurrent: firmsCurrent2,
      firmsHistory: firmsHistory2,
      firmsIndependentCurrent: firmsIndependentCurrent2,
      industrial: industrial2,
      weather: weather2,
      incidentEvidence: incidentEvidence3,
      classification: classification2,
      longTermHistory: longTermHistory2,
      fsiForestContext: fsiForestContext2,
      dayNightDetectionRatio: { state: detectionHistoryStatistics2.state, dayDetections: detectionHistoryStatistics2.dayDetections, nightDetections: detectionHistoryStatistics2.nightDetections, ratio: detectionHistoryStatistics2.dayToNightRatio, sampleCount: detectionHistoryStatistics2.dayNightSampleCount },
      frpVariance: frpVarianceEvidence(detectionHistoryStatistics2),
      seasonalAgriculturalBurning: seasonalAgriculturalBurning2,
      flareMatch: false,
      flareMatchConfidence: "none",
      miningMatch: false,
      vnfState: "unavailable",
      vnfCandidateCount: 0,
      flareReferenceState: "unavailable",
      flareReferenceCandidateCount: 0,
      flareReferenceDataYear: null,
      ...landCover ? { landCover } : {},
      ...gppdReference2 ? { gppdReference: gppdReference2 } : {},
      independentCorroboration: { state: "evidence_pending", detail: "The live evidence window closed before all sources responded. The screen remains operational and no industrial-fire conclusion has been issued." },
      conclusion: { level: "evidence_pending", title: "Evidence pending \u2014 sources still delayed", detail: "The verifier closed the 27-second live request window to keep the investigation usable. It will not convert a delayed upstream response into a fire conclusion." }
    };
  }
  const [firmsCurrent, firmsHistory, firmsIndependentCurrent, industrial, weather] = await checks;
  const facilitySignals = await Promise.race([
    facilitySignalLookup(facilitySignalsInput(industrial, firmsCurrent, firmsHistory)).catch(() => void 0),
    new Promise((resolve) => setTimeout(() => resolve(void 0), FACILITY_SIGNAL_BUDGET_MS))
  ]);
  const incidentEvidence2 = await authorityIncidentEvidence;
  const [longTermHistory, detectionHistoryStatistics, seasonalAgriculturalBurning] = await Promise.all([
    longTermPersistenceReader(input.lat, input.lng),
    detectionHistoryStatisticsReader(input.lat, input.lng),
    seasonalAgriculturalBurningReader(input.lat, input.lng, evaluatedMonth)
  ]);
  const fsiForestContext = await fsiForestContextPromise;
  const mlResult = await classifyWithML(
    firmsCurrent.frpMw ?? 0,
    firmsCurrent.brightness ?? 0,
    firmsCurrent.brightT31 ?? 0,
    firmsCurrent.confidence ?? 0,
    detectionHistoryStatistics.dayToNightRatio ?? 0,
    firmsHistory.detections,
    {
      pointForestStatus: fsiForestContext.pointForestStatus,
      historicalForestFireDetections: fsiForestContext.historicalForestFireDetections
    }
  );
  const classification = classifyCorroborationEvidence({
    industrialFeatures: industrial.features,
    industrialState: industrial.state,
    historyDailyDetections: firmsHistory.dailyDetections,
    historyState: firmsHistory.state,
    landCoverClass: landCover?.landCoverClass ?? null,
    longTermHistory: longTermHistory.state === "available" ? { totalDetectionCount: longTermHistory.totalDetectionCount, activeMonths: longTermHistory.activeMonths } : null,
    gppdReference: gppdReference2 ? { name: gppdReference2.name, fuelType: gppdReference2.fuelType, distanceKm: gppdReference2.distanceKm } : null,
    industrialFacilityName: industrial.industrialFacilityName,
    industrialFacilityCategory: industrial.industrialFacilityCategory,
    flareMatch: facilitySignals?.flareMatch ?? false
  });
  const hasOnlyLiveCore = [firmsCurrent, firmsIndependentCurrent, industrial].every((source) => source.state === "available");
  const persistent = firmsHistory.state === "available" && firmsHistory.detections >= 5;
  const crossPlatformMatch = firmsCurrent.state === "available" && firmsIndependentCurrent.state === "available" && firmsCurrent.detections > 0 && firmsIndependentCurrent.detections > 0;
  const hasCache = [firmsCurrent, firmsHistory, firmsIndependentCurrent, industrial].some((source) => source.state === "cached");
  const hasAuthorityIncident = incidentEvidence2.state === "available" && incidentEvidence2.records.length > 0;
  let conclusion;
  if (firmsCurrent.state === "unavailable" || firmsIndependentCurrent.state === "unavailable" || industrial.state === "unavailable") {
    conclusion = { level: "evidence_pending", title: "Evidence pending \u2014 live source delayed", detail: "The verifier is still operational, but a required live source did not answer within its retry budget. It has not inferred an industrial fire from missing data." };
  } else if (hasCache) {
    conclusion = { level: "evidence_pending", title: "Evidence pending \u2014 cached context shown", detail: "Some upstream evidence is cached and timestamped. It may guide review, but a current industrial-fire conclusion is withheld until live satellite evidence returns." };
  } else if (firmsCurrent.detections === 0) {
    conclusion = { level: "no_current_detection", title: "No current FIRMS thermal detection", detail: "The live local one-day FIRMS search found no thermal detection; an industrial-fire conclusion is not supported." };
  } else if (industrial.features === 0) {
    conclusion = { level: "evidence_pending", title: "Industrial context not established", detail: "A live thermal record is present but no nearby industrial feature was returned. The industrial-fire conclusion is withheld." };
  } else if (!crossPlatformMatch) {
    conclusion = { level: "evidence_pending", title: "No cross-platform thermal agreement", detail: "NOAA-20 is not corroborated by the independent SNPP local search window. The industrial-fire conclusion is withheld." };
  } else if (hasAuthorityIncident) {
    const record = incidentEvidence2.records[0];
    conclusion = {
      level: "confirmed_incident",
      title: "Confirmed industrial incident \u2014 external report recorded",
      detail: `Current paired NOAA-20/NOAA-21 detections and live industrial context are aligned with a time-limited, administrator-reviewed ${record.sourceType} incident record from ${record.sourceName} (${record.incidentReference}).`
    };
  } else if (persistent) {
    conclusion = { level: "routine_heat", title: "Likely recurring industrial heat", detail: "Live seven-day persistence supports a routine/static heat-source explanation rather than a new incident claim." };
  } else {
    conclusion = { level: "candidate", title: "Screened industrial thermal candidate", detail: "Live NOAA-20 and SNPP detections plus live industrial context are present. This is a prioritised candidate, not confirmation; authority or on-site corroboration is still required." };
  }
  return {
    detectionId: input.detectionId,
    checkedAt: nowIso(),
    sourcesRunInParallel: true,
    firmsCurrent,
    firmsHistory,
    firmsIndependentCurrent,
    industrial,
    weather,
    incidentEvidence: incidentEvidence2,
    classification,
    longTermHistory,
    fsiForestContext,
    ...mlResult ? { mlPrediction: mlResult } : {},
    dayNightDetectionRatio: { state: detectionHistoryStatistics.state, dayDetections: detectionHistoryStatistics.dayDetections, nightDetections: detectionHistoryStatistics.nightDetections, ratio: detectionHistoryStatistics.dayToNightRatio, sampleCount: detectionHistoryStatistics.dayNightSampleCount },
    frpVariance: frpVarianceEvidence(detectionHistoryStatistics),
    seasonalAgriculturalBurning,
    ...facilitySignals ?? {
      flareMatch: false,
      flareMatchConfidence: "none",
      miningMatch: false,
      vnfState: "unavailable",
      vnfCandidateCount: 0,
      flareReferenceState: "unavailable",
      flareReferenceCandidateCount: 0,
      flareReferenceDataYear: null
    },
    ...landCover ? { landCover } : {},
    ...gppdReference2 ? { gppdReference: gppdReference2 } : {},
    independentCorroboration: {
      state: crossPlatformMatch ? "cross_platform_match" : hasOnlyLiveCore ? "no_cross_platform_match" : hasCache ? "cached_evidence" : "evidence_pending",
      detail: crossPlatformMatch ? "NOAA-20 and independent NOAA-21 both returned live local detections in the same one-day window. This corroborates a thermal observation, not an on-site fire." : hasCache ? "At least one source is a timestamped cache fallback; live corroboration remains pending." : "Required live sources are incomplete or disagree, so independent corroboration is not established."
    },
    conclusion
  };
}

// server/weather.ts
var memory = /* @__PURE__ */ new Map();
var TTL_MS = 5 * 6e4;
var keyFor = (lat, lng) => `live-weather:${lat.toFixed(2)}:${lng.toFixed(2)}`;
var checkedAt = () => (/* @__PURE__ */ new Date()).toISOString();
async function getLiveWeather(lat, lng) {
  const key = keyFor(lat, lng);
  const now = Date.now();
  const cachedMemory = memory.get(key);
  if (cachedMemory && cachedMemory.expiresAt.getTime() > now) {
    return { ...cachedMemory.value, state: "cached", checkedAt: checkedAt(), detail: "Recent Open-Meteo reading." };
  }
  try {
    const query = new URLSearchParams({ latitude: String(lat), longitude: String(lng), current: "temperature_2m,wind_speed_10m,wind_direction_10m,precipitation,weather_code", hourly: "wind_speed_10m,wind_direction_10m", forecast_days: "2", timezone: "auto" });
    const response = await fetch(`https://api.open-meteo.com/v1/forecast?${query}`, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(8e3) });
    if (!response.ok) throw new Error(`Open-Meteo HTTP ${response.status}`);
    const data = await response.json();
    const current = data.current ?? {};
    const hourly = data.hourly ?? {};
    const times = Array.isArray(hourly.time) ? hourly.time : [];
    const speeds = Array.isArray(hourly.wind_speed_10m) ? hourly.wind_speed_10m : [];
    const directions = Array.isArray(hourly.wind_direction_10m) ? hourly.wind_direction_10m : [];
    const value = {
      provider: "open-meteo",
      latitude: lat,
      longitude: lng,
      temperatureC: typeof current.temperature_2m === "number" ? current.temperature_2m : null,
      windSpeedKmh: typeof current.wind_speed_10m === "number" ? current.wind_speed_10m : null,
      windDirectionDeg: typeof current.wind_direction_10m === "number" ? current.wind_direction_10m : null,
      precipitationMm: typeof current.precipitation === "number" ? current.precipitation : null,
      weatherCode: typeof current.weather_code === "number" ? current.weather_code : null,
      timezone: typeof data.timezone === "string" ? data.timezone : null,
      forecast: times.slice(0, 24).map((time, index2) => ({
        time,
        windSpeedKmh: typeof speeds[index2] === "number" ? speeds[index2] : null,
        windDirectionDeg: typeof directions[index2] === "number" ? directions[index2] : null
      }))
    };
    const fetchedAt = /* @__PURE__ */ new Date();
    const record = { value, fetchedAt, expiresAt: new Date(fetchedAt.getTime() + TTL_MS) };
    memory.set(key, record);
    try {
      await saveSourceEvidenceCache({ cacheKey: key, provider: "open-meteo", payload: JSON.stringify(value), fetchedAt, expiresAt: record.expiresAt });
    } catch {
    }
    return { ...value, state: "available", checkedAt: checkedAt(), detail: "Live Open-Meteo reading." };
  } catch {
    try {
      const persisted = await getSourceEvidenceCache(key);
      if (persisted && persisted.expiresAt.getTime() > now) {
        const value = JSON.parse(persisted.payload);
        return { ...value, state: "cached", checkedAt: checkedAt(), detail: `Cached Open-Meteo reading from ${persisted.fetchedAt.toISOString()}.` };
      }
    } catch {
    }
    return { provider: "open-meteo", latitude: lat, longitude: lng, state: "unavailable", checkedAt: checkedAt(), temperatureC: null, windSpeedKmh: null, windDirectionDeg: null, precipitationMm: null, weatherCode: null, timezone: null, forecast: [], detail: "Open-Meteo did not return within the bounded live request." };
  }
}

// server/_core/cookies.ts
function isSecureRequest(req) {
  if (req.protocol === "https") return true;
  const forwardedProto = req.headers["x-forwarded-proto"];
  if (!forwardedProto) return false;
  const protoList = Array.isArray(forwardedProto) ? forwardedProto : forwardedProto.split(",");
  return protoList.some((proto) => proto.trim().toLowerCase() === "https");
}
function getSessionCookieOptions(req) {
  return {
    httpOnly: true,
    path: "/",
    sameSite: "none",
    secure: isSecureRequest(req)
  };
}

// server/_core/systemRouter.ts
import { z } from "zod";

// server/_core/notification.ts
import { TRPCError } from "@trpc/server";
var TITLE_MAX_LENGTH = 1200;
var CONTENT_MAX_LENGTH = 2e4;
var trimValue = (value) => value.trim();
var isNonEmptyString = (value) => typeof value === "string" && value.trim().length > 0;
var buildEndpointUrl = (baseUrl) => {
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL(
    "webdevtoken.v1.WebDevService/SendNotification",
    normalizedBase
  ).toString();
};
var validatePayload = (input) => {
  if (!isNonEmptyString(input.title)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Notification title is required."
    });
  }
  if (!isNonEmptyString(input.content)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Notification content is required."
    });
  }
  const title = trimValue(input.title);
  const content = trimValue(input.content);
  if (title.length > TITLE_MAX_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Notification title must be at most ${TITLE_MAX_LENGTH} characters.`
    });
  }
  if (content.length > CONTENT_MAX_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Notification content must be at most ${CONTENT_MAX_LENGTH} characters.`
    });
  }
  return { title, content };
};
async function notifyOwner(payload) {
  const { title, content } = validatePayload(payload);
  if (!ENV.forgeApiUrl) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Notification service URL is not configured."
    });
  }
  if (!ENV.forgeApiKey) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Notification service API key is not configured."
    });
  }
  const endpoint = buildEndpointUrl(ENV.forgeApiUrl);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${ENV.forgeApiKey}`,
        "content-type": "application/json",
        "connect-protocol-version": "1"
      },
      body: JSON.stringify({ title, content })
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.warn(
        `[Notification] Failed to notify owner (${response.status} ${response.statusText})${detail ? `: ${detail}` : ""}`
      );
      return false;
    }
    return true;
  } catch (error) {
    console.warn("[Notification] Error calling notification service:", error);
    return false;
  }
}

// server/_core/trpc.ts
import { initTRPC, TRPCError as TRPCError2 } from "@trpc/server";
import superjson from "superjson";
var t = initTRPC.context().create({
  transformer: superjson
});
var router = t.router;
var publicProcedure = t.procedure;
var requireUser = t.middleware(async (opts) => {
  const { ctx, next } = opts;
  if (!ctx.user) {
    throw new TRPCError2({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }
  return next({
    ctx: {
      ...ctx,
      user: ctx.user
    }
  });
});
var protectedProcedure = t.procedure.use(requireUser);
var adminProcedure = t.procedure.use(
  t.middleware(async (opts) => {
    const { ctx, next } = opts;
    if (!ctx.user || ctx.user.role !== "admin") {
      throw new TRPCError2({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }
    return next({
      ctx: {
        ...ctx,
        user: ctx.user
      }
    });
  })
);

// server/_core/systemRouter.ts
var systemRouter = router({
  health: publicProcedure.input(
    z.object({
      timestamp: z.number().min(0, "timestamp cannot be negative")
    })
  ).query(() => ({
    ok: true
  })),
  notifyOwner: adminProcedure.input(
    z.object({
      title: z.string().min(1, "title is required"),
      content: z.string().min(1, "content is required")
    })
  ).mutation(async ({ input }) => {
    const delivered = await notifyOwner(input);
    return {
      success: delivered
    };
  })
});

// server/routers.ts
var appRouter = router({
  // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true
      };
    })
  }),
  corroboration: router({
    run: publicProcedure.input(z2.object({
      detectionId: z2.string().min(1),
      lat: z2.number().min(6).max(38),
      lng: z2.number().min(68).max(98)
    })).mutation(({ input }) => evaluateCorroboration(input))
  }),
  getIndiaHotspots: publicProcedure.query(() => getIndiaHotspotSnapshot()),
  getLiveWeather: publicProcedure.input(z2.object({ lat: z2.number().min(6).max(38), lng: z2.number().min(68).max(98) })).query(({ input }) => getLiveWeather(input.lat, input.lng)),
  getPersistentHotspotAlerts: publicProcedure.query(() => getPersistentHotspotAlerts()),
  incidentEvidence: router({
    record: adminProcedure.input(z2.object({
      detectionId: z2.string().min(1).max(96),
      lat: z2.number().min(6).max(38),
      lng: z2.number().min(68).max(98),
      sourceType: z2.enum(["authority", "facility"]),
      sourceName: z2.string().trim().min(3).max(160),
      sourceUrl: z2.string().url().max(1024).refine((value) => new URL(value).protocol === "https:", "An HTTPS source URL is required."),
      incidentReference: z2.string().trim().min(3).max(255),
      reportedAt: z2.string().refine((value) => Number.isFinite(Date.parse(value)), "A valid report time is required."),
      details: z2.string().trim().min(20).max(2e3)
    })).mutation(async ({ input, ctx }) => {
      const reportedAt = new Date(input.reportedAt);
      const now = /* @__PURE__ */ new Date();
      const ageMs = now.getTime() - reportedAt.getTime();
      if (reportedAt.getTime() > now.getTime() + 30 * 6e4 || ageMs > 48 * 60 * 6e4) {
        throw new TRPCError3({
          code: "BAD_REQUEST",
          message: "Authority or facility evidence must be time-aligned: no more than 48 hours old and not materially in the future."
        });
      }
      const expiresAt = new Date(reportedAt.getTime() + 48 * 60 * 6e4);
      await recordIncidentEvidence({
        detectionId: input.detectionId,
        latitude: input.lat.toFixed(6),
        longitude: input.lng.toFixed(6),
        sourceType: input.sourceType,
        sourceName: input.sourceName,
        sourceUrl: input.sourceUrl,
        incidentReference: input.incidentReference,
        reportedAt,
        expiresAt,
        details: input.details,
        verifiedByUserId: ctx.user.id
      });
      return { recorded: true, expiresAt };
    })
  })
  // TODO: add feature routers here, e.g.
  // todo: router({
  //   list: protectedProcedure.query(({ ctx }) =>
  //     db.getUserTodos(ctx.user.id)
  //   ),
  // }),
});

// shared/_core/errors.ts
var HttpError = class extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
    this.name = "HttpError";
  }
};
var ForbiddenError = (msg) => new HttpError(403, msg);

// server/_core/sdk.ts
import axios from "axios";
import { parse as parseCookieHeader } from "cookie";
import { SignJWT, jwtVerify } from "jose";
var isNonEmptyString2 = (value) => typeof value === "string" && value.length > 0;
var EXCHANGE_TOKEN_PATH = `/webdev.v1.WebDevAuthPublicService/ExchangeToken`;
var GET_USER_INFO_PATH = `/webdev.v1.WebDevAuthPublicService/GetUserInfo`;
var GET_USER_INFO_WITH_JWT_PATH = `/webdev.v1.WebDevAuthPublicService/GetUserInfoWithJwt`;
var OAuthService = class {
  constructor(client) {
    this.client = client;
    console.log("[OAuth] Initialized with baseURL:", ENV.oAuthServerUrl);
    if (!ENV.oAuthServerUrl) {
      console.error(
        "[OAuth] ERROR: OAUTH_SERVER_URL is not configured! Set OAUTH_SERVER_URL environment variable."
      );
    }
  }
  decodeState(state) {
    return decodeOAuthState(state).redirectUri;
  }
  async getTokenByCode(code, state) {
    const payload = {
      clientId: ENV.appId,
      grantType: "authorization_code",
      code,
      redirectUri: this.decodeState(state)
    };
    const { data } = await this.client.post(
      EXCHANGE_TOKEN_PATH,
      payload
    );
    return data;
  }
  async getUserInfoByToken(token) {
    const { data } = await this.client.post(
      GET_USER_INFO_PATH,
      {
        accessToken: token.accessToken
      }
    );
    return data;
  }
};
var createOAuthHttpClient = () => axios.create({
  baseURL: ENV.oAuthServerUrl,
  timeout: AXIOS_TIMEOUT_MS
});
var SDKServer = class {
  client;
  oauthService;
  constructor(client = createOAuthHttpClient()) {
    this.client = client;
    this.oauthService = new OAuthService(this.client);
  }
  deriveLoginMethod(platforms, fallback) {
    if (fallback && fallback.length > 0) return fallback;
    if (!Array.isArray(platforms) || platforms.length === 0) return null;
    const set = new Set(
      platforms.filter((p) => typeof p === "string")
    );
    if (set.has("REGISTERED_PLATFORM_EMAIL")) return "email";
    if (set.has("REGISTERED_PLATFORM_GOOGLE")) return "google";
    if (set.has("REGISTERED_PLATFORM_APPLE")) return "apple";
    if (set.has("REGISTERED_PLATFORM_MICROSOFT") || set.has("REGISTERED_PLATFORM_AZURE"))
      return "microsoft";
    if (set.has("REGISTERED_PLATFORM_GITHUB")) return "github";
    const first = Array.from(set)[0];
    return first ? first.toLowerCase() : null;
  }
  /**
   * Exchange OAuth authorization code for access token
   * @example
   * const tokenResponse = await sdk.exchangeCodeForToken(code, state);
   */
  async exchangeCodeForToken(code, state) {
    return this.oauthService.getTokenByCode(code, state);
  }
  /**
   * Get user information using access token
   * @example
   * const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);
   */
  async getUserInfo(accessToken) {
    const data = await this.oauthService.getUserInfoByToken({
      accessToken
    });
    const loginMethod = this.deriveLoginMethod(
      data?.platforms,
      data?.platform ?? data.platform ?? null
    );
    return {
      ...data,
      platform: loginMethod,
      loginMethod
    };
  }
  parseCookies(cookieHeader) {
    if (!cookieHeader) {
      return /* @__PURE__ */ new Map();
    }
    const parsed = parseCookieHeader(cookieHeader);
    return new Map(Object.entries(parsed));
  }
  getSessionSecret() {
    const secret = ENV.cookieSecret;
    return new TextEncoder().encode(secret);
  }
  /**
   * Create a session token for a Manus user openId
   * @example
   * const sessionToken = await sdk.createSessionToken(userInfo.openId);
   */
  async createSessionToken(openId, options = {}) {
    return this.signSession(
      {
        openId,
        appId: ENV.appId,
        name: options.name || ""
      },
      options
    );
  }
  async signSession(payload, options = {}) {
    const issuedAt = Date.now();
    const expiresInMs = options.expiresInMs ?? ONE_YEAR_MS;
    const expirationSeconds = Math.floor((issuedAt + expiresInMs) / 1e3);
    const secretKey = this.getSessionSecret();
    return new SignJWT({
      openId: payload.openId,
      appId: payload.appId,
      name: payload.name
    }).setProtectedHeader({ alg: "HS256", typ: "JWT" }).setExpirationTime(expirationSeconds).sign(secretKey);
  }
  async verifySession(cookieValue) {
    if (!cookieValue) {
      console.warn("[Auth] Missing session cookie");
      return null;
    }
    try {
      const secretKey = this.getSessionSecret();
      const { payload } = await jwtVerify(cookieValue, secretKey, {
        algorithms: ["HS256"]
      });
      const { openId, appId, name } = payload;
      if (!isNonEmptyString2(openId) || !isNonEmptyString2(appId) || !isNonEmptyString2(name)) {
        console.warn("[Auth] Session payload missing required fields");
        return null;
      }
      return {
        openId,
        appId,
        name
      };
    } catch (error) {
      console.warn("[Auth] Session verification failed", String(error));
      return null;
    }
  }
  async getUserInfoWithJwt(jwtToken) {
    const payload = {
      jwtToken,
      projectId: ENV.appId
    };
    const { data } = await this.client.post(
      GET_USER_INFO_WITH_JWT_PATH,
      payload
    );
    const loginMethod = this.deriveLoginMethod(
      data?.platforms,
      data?.platform ?? data.platform ?? null
    );
    return {
      ...data,
      platform: loginMethod,
      loginMethod
    };
  }
  async authenticateRequest(req) {
    const cookies = this.parseCookies(req.headers.cookie);
    let sessionToken = cookies.get(COOKIE_NAME);
    if (!sessionToken) {
      const authHeader = req.headers.authorization;
      if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
        sessionToken = authHeader.slice(7);
      }
    }
    const session = await this.verifySession(sessionToken);
    if (!session) {
      throw ForbiddenError("Invalid session cookie");
    }
    if (session.openId.startsWith(CRON_OPEN_ID_PREFIX)) {
      const userInfo = await this.getUserInfoWithJwt(sessionToken ?? "");
      const taskUid = userInfo.taskUid ?? null;
      if (!taskUid) {
        throw ForbiddenError("Cron session missing task_uid");
      }
      return buildCronUser(userInfo);
    }
    const sessionUserId = session.openId;
    const signedInAt = /* @__PURE__ */ new Date();
    let user = await getUserByOpenId(sessionUserId);
    if (!user) {
      try {
        const userInfo = await this.getUserInfoWithJwt(sessionToken ?? "");
        await upsertUser({
          openId: userInfo.openId,
          name: userInfo.name || null,
          email: userInfo.email ?? null,
          loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
          lastSignedIn: signedInAt
        });
        user = await getUserByOpenId(userInfo.openId);
      } catch (error) {
        console.error("[Auth] Failed to sync user from OAuth:", error);
        throw ForbiddenError("Failed to sync user info");
      }
    }
    if (!user) {
      throw ForbiddenError("User not found");
    }
    await upsertUser({
      openId: user.openId,
      lastSignedIn: signedInAt
    });
    return user;
  }
};
var CRON_OPEN_ID_PREFIX = "cron_";
function buildCronUser(userInfo) {
  const now = /* @__PURE__ */ new Date();
  return {
    id: -1,
    openId: userInfo.openId,
    name: userInfo.name || "Manus Scheduled Task",
    email: null,
    loginMethod: null,
    role: "user",
    createdAt: now,
    updatedAt: now,
    lastSignedIn: now,
    taskUid: userInfo.taskUid ?? void 0,
    isCron: true
  };
}
var sdk = new SDKServer();

// server/_core/context.ts
async function createContext(opts) {
  let user = null;
  try {
    user = await sdk.authenticateRequest(opts.req);
  } catch (error) {
    user = null;
  }
  return {
    req: opts.req,
    res: opts.res,
    user
  };
}

// server/vercelTrpcHandler.ts
var app = express();
app.use(express.json({ limit: "2mb" }));
app.use(
  createExpressMiddleware({
    router: appRouter,
    createContext
  })
);
function handler(req, res) {
  return app(req, res);
}
export {
  handler as default
};
