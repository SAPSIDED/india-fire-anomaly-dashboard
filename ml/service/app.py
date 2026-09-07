from flask import Flask, request, jsonify
from xgboost import XGBClassifier
import os

app = Flask(__name__)

MODEL_PATH = os.path.join(
    os.path.dirname(__file__),
    "..",
    "model",
    "fire_classifier.json"
)

FEATURES = [
    "frpMw",
    "brightness",
    "brightT31",
    "confidence",
    "dayNightRatio",
    "sevenDayDetectionCount"
]

CLASS_NAMES = {
    0: "wildfire",
    1: "industrial_facility",
    2: "agricultural_burning",
    3: "mining"
}

model = XGBClassifier()
model.load_model(MODEL_PATH)


@app.route("/health", methods=["GET"])
def health():
    return jsonify({
        "status": "ok",
        "model": "xgboost",
        "classes": list(CLASS_NAMES.values()),
        "features": FEATURES
    })


@app.route("/predict", methods=["POST"])
def predict():
    data = request.get_json()

    row = {
        "frpMw": float(data.get("frpMw", 0)),
        "brightness": float(data.get("brightness", 0)),
        "brightT31": float(data.get("brightT31", 0)),
        "confidence": float(data.get("confidence", 0)),
        "dayNightRatio": float(data.get("dayNightRatio", 0)),
        "sevenDayDetectionCount": float(
            data.get("sevenDayDetectionCount", 1)
        )
    }

    features = [[
        row["frpMw"],
        row["brightness"],
        row["brightT31"],
        row["confidence"],
        row["dayNightRatio"],
        row["sevenDayDetectionCount"]
    ]]

    probabilities = model.predict_proba(features)[0]
    prediction = int(model.predict(features)[0])

    return jsonify({
        "prediction": prediction,
        "classification": CLASS_NAMES[prediction],

        "wildfireProbability": float(probabilities[0]),
        "industrialProbability": float(probabilities[1]),
        "agriculturalProbability": float(probabilities[2]),
        "miningProbability": float(probabilities[3])
    })


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5001)