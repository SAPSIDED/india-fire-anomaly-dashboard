import { describe, expect, it } from "vitest";
import { persistenceCoordinateKey } from "./db";

describe("persistence alert coordinate grouping", () => {
  it("groups small FIRMS geolocation drift into one approximately 1 km cell", () => {
    expect(persistenceCoordinateKey(21.10648, 72.64751)).toBe("21.11,72.65");
    expect(persistenceCoordinateKey(21.10649, 72.64752)).toBe("21.11,72.65");
  });

  it("keeps materially separate regions in separate cells", () => {
    expect(persistenceCoordinateKey(21.10648, 72.64751)).not.toBe(
      persistenceCoordinateKey(20.91288, 71.4604),
    );
  });
});
