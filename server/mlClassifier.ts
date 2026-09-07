import axios from "axios";

export type MLResult = {
  prediction: number;
  classification:
    | "wildfire"
    | "industrial_facility"
    | "agricultural_burning"
    | "mining";

  wildfireProbability: number;
  industrialProbability: number;
  agriculturalProbability: number;
  miningProbability: number;
};

const ML_SERVICE_URL =
  process.env.ML_SERVICE_URL ?? "http://127.0.0.1:5001";

export async function classifyWithML(
  frpMw: number,
  brightness: number,
  brightT31: number,
  confidence: number,
  dayNightRatio: number,
  sevenDayDetectionCount: number,
): Promise<MLResult | null> {
  try {
    const response = await axios.post<MLResult>(
      `${ML_SERVICE_URL}/predict`,
      {
        frpMw,
        brightness,
        brightT31,
        confidence,
        dayNightRatio,
        sevenDayDetectionCount,
      },
      {
        timeout: 1500,
      },
    );

    return response.data;
  } catch {
    return null;
  }
}

export default classifyWithML;
