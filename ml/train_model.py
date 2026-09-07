import json
import os

import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report, confusion_matrix
from xgboost import XGBClassifier


# ============================================================
# CONFIGURATION
# ============================================================

DATASET = "ml/data/four_class_training_dataset.json"
MODEL_PATH = "ml/model/fire_classifier.json"

FEATURES = [
    "frpMw",
    "brightness",
    "brightT31",
    "confidence",
    "dayNightRatio",
    "sevenDayDetectionCount",
    "activeMonths",
]

LABELS = [
    "wildfire",
    "industrial_facility",
    "agricultural_burning",
    "mining",
]

LABEL_TO_ID = {
    "wildfire": 0,
    "industrial_facility": 1,
    "agricultural_burning": 2,
    "mining": 3,
}


# ============================================================
# LOAD DATASET
# ============================================================

print("=" * 60)
print("FOUR-CLASS XGBOOST FIRE CLASSIFIER TRAINING")
print("=" * 60)

print(f"\nLoading dataset:")
print(DATASET)

with open(DATASET, "r", encoding="utf-8") as f:
    dataset = json.load(f)

records = dataset.get("records", [])

print(f"Records loaded: {len(records)}")


# ============================================================
# BUILD TRAINING TABLE
# ============================================================

rows = []

for item in records:

    features = item.get("features", {})
    label = item.get("label")

    if label not in LABEL_TO_ID:
        continue

    row = {}

    for feature in FEATURES:
        row[feature] = features.get(feature)

    row["label"] = label
    rows.append(row)


df = pd.DataFrame(rows)

print(f"Usable records: {len(df)}")


# ============================================================
# CHECK CLASS DISTRIBUTION
# ============================================================

print("\nClass distribution:")

for label in LABELS:
    count = int((df["label"] == label).sum())
    print(f"  {label}: {count}")


# ============================================================
# NUMERIC CONVERSION
# ============================================================

for feature in FEATURES:
    df[feature] = pd.to_numeric(
        df[feature],
        errors="coerce",
    )


# Fill missing numeric values using training-data medians.
df[FEATURES] = df[FEATURES].fillna(
    df[FEATURES].median()
)


# Remove features that contain no usable variation.
usable_features = []

for feature in FEATURES:

    if df[feature].nunique(dropna=False) > 1:
        usable_features.append(feature)
    else:
        print(
            f"\nRemoving constant feature: {feature}"
        )


FEATURES = usable_features


if not FEATURES:
    raise RuntimeError(
        "No usable ML features remain."
    )


# ============================================================
# PREPARE X AND Y
# ============================================================

X = df[FEATURES].copy()

y = df["label"].map(
    LABEL_TO_ID
)


# ============================================================
# TRAIN / TEST SPLIT
# ============================================================

X_train, X_test, y_train, y_test = train_test_split(
    X,
    y,
    test_size=0.20,
    random_state=42,
    stratify=y,
)


print("\nTraining records:")
print(len(X_train))

print("Testing records:")
print(len(X_test))


# ============================================================
# XGBOOST MODEL
# ============================================================

model = XGBClassifier(
    n_estimators=150,
    max_depth=4,
    learning_rate=0.05,
    subsample=0.8,
    colsample_bytree=0.8,

    objective="multi:softprob",
    num_class=4,

    eval_metric="mlogloss",

    random_state=42,
)


print("\nTraining XGBoost model...")

model.fit(
    X_train,
    y_train,
)


# ============================================================
# EVALUATION
# ============================================================

pred = model.predict(
    X_test
)


print("\n" + "=" * 60)
print("MODEL EVALUATION")
print("=" * 60)

print("\nFeatures used:")

for feature in FEATURES:
    print(f"  - {feature}")


print("\nClassification report:")

print(
    classification_report(
        y_test,
        pred,
        labels=[0, 1, 2, 3],
        target_names=LABELS,
        zero_division=0,
    )
)


print("\nConfusion matrix:")

print(
    confusion_matrix(
        y_test,
        pred,
        labels=[0, 1, 2, 3],
    )
)


# ============================================================
# FEATURE IMPORTANCE
# ============================================================

print("\nFeature importance:")

for feature, importance in zip(
    FEATURES,
    model.feature_importances_,
):

    print(
        f"{feature}: {importance:.4f}"
    )


# ============================================================
# SAVE MODEL
# ============================================================

os.makedirs(
    "ml/model",
    exist_ok=True,
)

model.save_model(
    MODEL_PATH
)


print("\n" + "=" * 60)
print("MODEL SAVED")
print("=" * 60)

print(
    f"\nModel saved to:"
    f"\n{MODEL_PATH}"
)

print("\nClass mapping:")

for label, class_id in LABEL_TO_ID.items():
    print(
        f"  {class_id} = {label}"
    )

print("\nTraining complete.")