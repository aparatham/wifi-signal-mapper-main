import { describe, expect, it } from "vitest";

import { isMeasurementDraftValid, signalBand } from "@/lib/wifi-map-data";

describe("Wi-Fi map measurement rules", () => {
  it("accepts an RSSI reading from -120 through 0 dBm", () => {
    const base = {
      building_id: "main",
      floor_name: "Ground Floor",
      x: 500,
      y: 450,
    };

    expect(isMeasurementDraftValid({ ...base, rssi_dbm: -120 })).toBe(true);
    expect(isMeasurementDraftValid({ ...base, rssi_dbm: 0 })).toBe(true);
    expect(isMeasurementDraftValid({ ...base, rssi_dbm: -121 })).toBe(false);
    expect(isMeasurementDraftValid({ ...base, rssi_dbm: 1 })).toBe(false);
  });

  it("accepts only a listed floor and coordinates inside the campus map", () => {
    const base = {
      building_id: "main",
      floor_name: "Ground Floor",
      x: 500,
      y: 450,
      rssi_dbm: -60,
    };

    expect(isMeasurementDraftValid(base)).toBe(true);
    expect(isMeasurementDraftValid({ ...base, floor_name: "4th Floor" })).toBe(false);
    expect(isMeasurementDraftValid({ ...base, x: 1001 })).toBe(false);
    expect(isMeasurementDraftValid({ ...base, y: -1 })).toBe(false);
  });

  it("groups measured RSSI into the map legend's five signal bands", () => {
    expect(signalBand(-45)).toBe("strong");
    expect(signalBand(-55)).toBe("good");
    expect(signalBand(-65)).toBe("fair");
    expect(signalBand(-75)).toBe("weak");
    expect(signalBand(-85)).toBe("poor");
  });
});