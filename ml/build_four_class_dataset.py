import json
import math
import os
import re
import zipfile
import xml.etree.ElementTree as ET
from collections import defaultdict
from datetime import datetime, timedelta

import shapefile


# ============================================================
# CONFIGURATION
# ============================================================

RAW_DIR = os.path.join("ml", "data", "raw")
OUTPUT_DIR = os.path.join("ml", "data")

OUTPUT_FILE = os.path.join(
    OUTPUT_DIR,
    "four_class_training_dataset.json",
)

IND_FILE = os.path.join(
    RAW_DIR,
    "IND.docx",
)

SHAPEFILES = [
    "fire_nrt_J1V-C2_791872.shp",
    "fire_nrt_J2V-C2_791873.shp",
    "fire_nrt_M-C61_791870.shp",
    "fire_nrt_SV-C2_791874.shp",
]

# Distance used to associate a FIRMS detection
# with an industrial facility.
INDUSTRIAL_RADIUS_KM = 5.0

# Mining proxy thresholds.
MINING_MIN_FRP = 5.0
MINING_MIN_RECENT = 2
MINING_MIN_NIGHT_RATIO = 0.35

# Agricultural proxy thresholds.
AGRI_MAX_NIGHT_RATIO = 0.30
AGRI_MAX_RECENT = 2
AGRI_MIN_FRP = 1.0


# ============================================================
# HELPERS
# ============================================================

def safe_float(value, default=0.0):
    try:
        if value is None:
            return default

        text = str(value).strip()

        if not text:
            return default

        return float(text)

    except (ValueError, TypeError):
        return default


def haversine_km(lat1, lon1, lat2, lon2):
    radius = 6371.0

    p1 = math.radians(lat1)
    p2 = math.radians(lat2)

    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)

    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(p1)
        * math.cos(p2)
        * math.sin(dlon / 2) ** 2
    )

    return radius * 2 * math.atan2(
        math.sqrt(a),
        math.sqrt(1 - a),
    )


def normalize_daynight(value):
    value = str(value or "").strip().lower()

    if value in {"d", "day"}:
        return "D"

    if value in {"n", "night"}:
        return "N"

    return "U"


def normalize_confidence(value):
    text = str(value or "").strip().lower()

    if text == "h":
        return 1.0

    if text == "n":
        return 0.5

    if text == "l":
        return 0.25

    number = safe_float(value, 0.5)

    if number > 1:
        number /= 100.0

    return max(0.0, min(1.0, number))


# ============================================================
# READ IND.DOCX
# ============================================================

def extract_docx_text(path):
    """
    Reads all visible text from an OpenXML Word document
    without requiring python-docx.
    """

    if not os.path.exists(path):
        raise FileNotFoundError(
            f"Industrial facility file not found: {path}"
        )

    with zipfile.ZipFile(path, "r") as archive:
        xml_bytes = archive.read("word/document.xml")

    root = ET.fromstring(xml_bytes)

    namespace = {
        "w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
    }

    paragraphs = []

    for paragraph in root.findall(".//w:p", namespace):
        pieces = []

        for text_node in paragraph.findall(".//w:t", namespace):
            if text_node.text:
                pieces.append(text_node.text)

        text = "".join(pieces).strip()

        if text:
            paragraphs.append(text)

    return paragraphs


def parse_industrial_facilities():
    """
    Parse the uploaded IND.docx.

    Expected records resemble:

    IND,India,WADI CEMENT PLANT,WRI1019937,75.0,
    17.0552,76.9775,Coal,...

    The parser searches for:
        country
        latitude
        longitude
        facility name
        fuel/type

    It is deliberately tolerant of extra columns.
    """

    print("\nReading industrial facility database:")
    print(IND_FILE)

    paragraphs = extract_docx_text(IND_FILE)

    facilities = []

    for line in paragraphs:

        # Ignore obvious headings.
        if not line:
            continue

        if "," not in line:
            continue

        parts = [
            part.strip()
            for part in line.split(",")
        ]

        if len(parts) < 7:
            continue

        # We expect Indian records.
        if parts[0].strip().upper() != "IND":
            continue

        if parts[1].strip().lower() != "india":
            continue

        name = parts[2].strip()

        # In the supplied data the coordinates occur after
        # facility ID and capacity.
        #
        # Search for two consecutive numeric fields that
        # look like valid India latitude/longitude.

        latitude = None
        longitude = None
        coordinate_index = None

        for i in range(3, len(parts) - 1):

            lat_candidate = safe_float(parts[i], None)
            lon_candidate = safe_float(parts[i + 1], None)

            if lat_candidate is None or lon_candidate is None:
                continue

            if (
                6 <= lat_candidate <= 37
                and 68 <= lon_candidate <= 98
            ):
                latitude = lat_candidate
                longitude = lon_candidate
                coordinate_index = i
                break

        if latitude is None or longitude is None:
            continue

        facility_id = (
            parts[3]
            if len(parts) > 3
            else ""
        )

        capacity = (
            safe_float(parts[4], 0.0)
            if len(parts) > 4
            else 0.0
        )

        fuel_type = ""

        if coordinate_index is not None:
            if coordinate_index + 2 < len(parts):
                fuel_type = parts[
                    coordinate_index + 2
                ].strip()

        facilities.append(
            {
                "name": name,
                "facilityId": facility_id,
                "capacity": capacity,
                "latitude": latitude,
                "longitude": longitude,
                "fuelType": fuel_type,
            }
        )

    print(
        f"Loaded {len(facilities)} Indian industrial/power facilities."
    )

    if not facilities:
        raise RuntimeError(
            "No Indian facilities could be parsed from IND.docx."
        )

    return facilities


def nearest_facility(lat, lon, facilities):
    best = None

    for facility in facilities:

        distance = haversine_km(
            lat,
            lon,
            facility["latitude"],
            facility["longitude"],
        )

        if best is None or distance < best["distanceKm"]:

            best = {
                "distanceKm": distance,
                "facility": facility,
            }

    return best


# ============================================================
# READ FIRMS SHAPEFILES
# ============================================================

def read_firms_file(filename):

    path = os.path.join(
        RAW_DIR,
        filename,
    )

    print(f"\nReading {filename}...")

    reader = shapefile.Reader(path)

    field_names = [
        field[0]
        for field in reader.fields
        if field[0] != "DeletionFlag"
    ]

    records = []

    for shape_record in reader.iterShapeRecords():

        record = dict(
            zip(
                field_names,
                list(shape_record.record),
            )
        )

        points = shape_record.shape.points

        if not points:
            continue

        lon, lat = points[0]

        record["_latitude"] = float(lat)
        record["_longitude"] = float(lon)
        record["_source_file"] = filename

        records.append(record)

    print(
        f"  {len(records)} records"
    )

    return records


# ============================================================
# FEATURE ENGINEERING
# ============================================================

def build_features(records):

    print("\nBuilding FIRMS-only ML features...")

    # Group observations by approximately 100 m.
    location_groups = defaultdict(list)

    for row in records:

        lat = row["_latitude"]
        lon = row["_longitude"]

        key = (
            round(lat, 3),
            round(lon, 3),
        )

        location_groups[key].append(row)

    dataset = []

    for row in records:

        lat = row["_latitude"]
        lon = row["_longitude"]

        date_text = str(
            row.get("ACQ_DATE", "")
        ).strip()

        try:
            acquisition_date = datetime.strptime(
                date_text,
                "%Y-%m-%d",
            ).date()

        except ValueError:
            continue

        key = (
            round(lat, 3),
            round(lon, 3),
        )

        history = location_groups[key]

        seven_day_start = (
            acquisition_date
            - timedelta(days=6)
        )

        recent = []

        for other in history:

            try:
                other_date = datetime.strptime(
                    str(
                        other.get(
                            "ACQ_DATE",
                            "",
                        )
                    ).strip(),
                    "%Y-%m-%d",
                ).date()

            except ValueError:
                continue

            if (
                seven_day_start
                <= other_date
                <= acquisition_date
            ):
                recent.append(other)

        day_count = sum(
            normalize_daynight(
                x.get("DAYNIGHT")
            )
            == "D"
            for x in recent
        )

        night_count = sum(
            normalize_daynight(
                x.get("DAYNIGHT")
            )
            == "N"
            for x in recent
        )

        total_recent = (
            day_count
            + night_count
        )

        if total_recent:
            day_night_ratio = (
                night_count
                / total_recent
            )
        else:
            day_night_ratio = 0.0

        active_dates = set()

        for other in history:

            date_value = str(
                other.get(
                    "ACQ_DATE",
                    "",
                )
            ).strip()

            if date_value:
                active_dates.add(
                    date_value
                )

        active_months = len(
            {
                value[:7]
                for value in active_dates
            }
        )

        frp = safe_float(
            row.get("FRP"),
            0.0,
        )

        brightness = safe_float(
            row.get("BRIGHTNESS"),
            safe_float(
                row.get("BRIGHT_T4"),
                0.0,
            ),
        )

        bright_t31 = safe_float(
            row.get("BRIGHT_T31"),
            0.0,
        )

        confidence = normalize_confidence(
            row.get("CONFIDENCE")
        )

        dataset.append(
            {
                "latitude": lat,
                "longitude": lon,
                "date": date_text,

                # ONLY satellite-derived / temporal
                # values go into ML features.
                "features": {
                    "frpMw": frp,
                    "brightness": brightness,
                    "brightT31": bright_t31,
                    "confidence": confidence,
                    "dayNightRatio": day_night_ratio,
                    "sevenDayDetectionCount": len(recent),
                    "activeMonths": active_months,
                },
            }
        )

    print(
        f"Feature records created: {len(dataset)}"
    )

    return dataset


# ============================================================
# FOUR-CLASS LABELING
# ============================================================

def facility_is_thermal(facility):

    text = (
        facility["name"]
        + " "
        + facility["fuelType"]
    ).lower()

    thermal_keywords = [
        "coal",
        "cement",
        "steel",
        "refinery",
        "oil",
        "gas",
        "thermal",
        "power",
        "sugar",
        "biomass",
        "coke",
        "petroleum",
        "lignite",
    ]

    return any(
        keyword in text
        for keyword in thermal_keywords
    )


def assign_labels(
    dataset,
    facilities,
):

    print("\nGenerating four proxy classes...")

    labeled = []

    counts = defaultdict(int)

    for item in dataset:

        lat = item["latitude"]
        lon = item["longitude"]

        features = item["features"]

        frp = features["frpMw"]
        night_ratio = features[
            "dayNightRatio"
        ]
        recent_count = features[
            "sevenDayDetectionCount"
        ]
        confidence = features[
            "confidence"
        ]

        nearest = nearest_facility(
            lat,
            lon,
            facilities,
        )

        industrial_match = (
            nearest is not None
            and nearest["distanceKm"]
            <= INDUSTRIAL_RADIUS_KM
            and facility_is_thermal(
                nearest["facility"]
            )
        )

        # ----------------------------------------------------
        # 1. INDUSTRIAL FACILITY
        # ----------------------------------------------------

        if industrial_match:

            label = "industrial_facility"

            evidence = {
                "labelMethod":
                    "IND_docx_spatial_match",

                "industrialMatch":
                    True,

                "industrialDistanceKm":
                    round(
                        nearest["distanceKm"],
                        3,
                    ),

                "industrialFacility":
                    nearest["facility"]["name"],
            }

        # ----------------------------------------------------
        # 2. MINING PROXY
        # ----------------------------------------------------
        #
        # This is deliberately conservative.
        # It identifies persistent, relatively strong,
        # night-dominant anomalies outside known facilities.
        #
        # These are PROXY labels, not official mine records.
        # ----------------------------------------------------

        elif (
            recent_count
            >= MINING_MIN_RECENT
            and night_ratio
            >= MINING_MIN_NIGHT_RATIO
            and frp
            >= MINING_MIN_FRP
            and confidence
            >= 0.25
        ):

            label = "mining"

            evidence = {
                "labelMethod":
                    "persistent_thermal_proxy",

                "industrialMatch":
                    False,

                "miningProxy":
                    True,
            }

        # ----------------------------------------------------
        # 3. AGRICULTURAL BURNING
        # ----------------------------------------------------
        #
        # Day-dominant, isolated detections are treated as
        # agricultural-burning proxies.
        # ----------------------------------------------------

        elif (
            night_ratio
            <= AGRI_MAX_NIGHT_RATIO
            and recent_count
            <= AGRI_MAX_RECENT
            and frp
            >= AGRI_MIN_FRP
            and confidence
            >= 0.25
        ):

            label = "agricultural_burning"

            evidence = {
                "labelMethod":
                    "daytime_isolated_thermal_proxy",

                "industrialMatch":
                    False,

                "agriculturalProxy":
                    True,
            }

        # ----------------------------------------------------
        # 4. WILDFIRE
        # ----------------------------------------------------

        elif confidence >= 0.25:

            label = "wildfire"

            evidence = {
                "labelMethod":
                    "remaining_confident_thermal_proxy",

                "industrialMatch":
                    False,

                "wildfireProxy":
                    True,
            }

        else:

            # Do not train on very uncertain observations.
            continue

        item["label"] = label
        item["labelEvidence"] = evidence

        counts[label] += 1

        labeled.append(item)

    print("\nProxy-label distribution:")

    for label in [
        "wildfire",
        "industrial_facility",
        "agricultural_burning",
        "mining",
    ]:
        print(
            f"  {label}: {counts[label]}"
        )

    return labeled


# ============================================================
# BALANCE DATASET
# ============================================================

def balance_dataset(dataset):

    required = [
        "wildfire",
        "industrial_facility",
        "agricultural_burning",
        "mining",
    ]

    groups = defaultdict(list)

    for item in dataset:
        groups[item["label"]].append(item)

    print("\nClass availability:")

    for label in required:
        print(
            f"  {label}: "
            f"{len(groups[label])}"
        )

    missing = [
        label
        for label in required
        if len(groups[label]) == 0
    ]

    if missing:

        raise RuntimeError(
            "\nCould not produce all four classes.\n"
            "Missing: "
            + ", ".join(missing)
            + "\n\n"
            "This means the available FIRMS observations "
            "do not contain enough evidence for one of "
            "the proxy classes. Do NOT fabricate records."
        )

    minimum = min(
        len(groups[label])
        for label in required
    )

    print(
        f"\nBalancing to {minimum} "
        "records per class."
    )

    balanced = []

    for label in required:

        selected = sorted(
            groups[label],
            key=lambda x: (
                x["latitude"],
                x["longitude"],
                x["date"],
            ),
        )[:minimum]

        balanced.extend(selected)

    return balanced


# ============================================================
# SAVE
# ============================================================

def save_dataset(dataset):

    os.makedirs(
        OUTPUT_DIR,
        exist_ok=True,
    )

    output = {

        "datasetVersion":
            "four_class_weak_supervision_v2",

        "description": (
            "India FIRMS thermal anomaly "
            "dataset with four proxy classes. "
            "Industrial labels use spatial "
            "matching against IND.docx. "
            "Other classes are proxy labels."
        ),

        "classes": [
            "wildfire",
            "industrial_facility",
            "agricultural_burning",
            "mining",
        ],

        "featureNames": [
            "frpMw",
            "brightness",
            "brightT31",
            "confidence",
            "dayNightRatio",
            "sevenDayDetectionCount",
            "activeMonths",
        ],

        "trainingNotes": [
            "Latitude and longitude are metadata only.",
            "Label evidence is not an ML feature.",
            "Classes are weak/proxy labels.",
            "Industrial labels come from IND.docx.",
        ],

        "records": dataset,
    }

    with open(
        OUTPUT_FILE,
        "w",
        encoding="utf-8",
    ) as f:

        json.dump(
            output,
            f,
            indent=2,
        )

    print(
        "\n============================================================"
    )

    print(
        "DATASET CREATED SUCCESSFULLY"
    )

    print(
        "============================================================"
    )

    print(
        f"Saved to: {OUTPUT_FILE}"
    )

    print(
        f"Total records: {len(dataset)}"
    )


# ============================================================
# MAIN
# ============================================================

def main():

    print(
        "=" * 60
    )

    print(
        "FIRMS FOUR-CLASS TRAINING DATASET BUILDER"
    )

    print(
        "=" * 60
    )

    os.makedirs(
        RAW_DIR,
        exist_ok=True,
    )

    # 1. Read industrial facilities.
    facilities = (
        parse_industrial_facilities()
    )

    # 2. Read FIRMS observations.
    all_records = []

    for filename in SHAPEFILES:

        path = os.path.join(
            RAW_DIR,
            filename,
        )

        if not os.path.exists(path):

            raise FileNotFoundError(
                f"Missing FIRMS shapefile: {path}"
            )

        all_records.extend(
            read_firms_file(filename)
        )

    print(
        "\nTotal FIRMS records loaded: "
        f"{len(all_records)}"
    )

    # 3. Restrict to India.
    india_records = [
        row
        for row in all_records
        if (
            6
            <= row["_latitude"]
            <= 37
            and
            68
            <= row["_longitude"]
            <= 98
        )
    ]

    print(
        "India-bounded records: "
        f"{len(india_records)}"
    )

    # 4. Build satellite features.
    dataset = build_features(
        india_records
    )

    # 5. Generate labels.
    labeled = assign_labels(
        dataset,
        facilities,
    )

    # 6. Balance.
    balanced = balance_dataset(
        labeled
    )

    # 7. Save.
    save_dataset(
        balanced
    )


if __name__ == "__main__":
    main()