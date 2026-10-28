import { describe, expect, it } from "vitest";

import {
  isMeasurementDraftValid,
  latLngToMapPoint,
  mapPointToLatLng,
  OPEN_AREA_ID,
  signalBand,
} from "@/lib/wifi-map-data";

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

  it("validates open area (out of building) measurements for Ground / Outdoor floor", () => {
    const outdoorDraft = {
      building_id: OPEN_AREA_ID,
      floor_name: "Ground / Outdoor",
      x: 450,
      y: 350,
      rssi_dbm: -65,
    };
    expect(isMeasurementDraftValid(outdoorDraft)).toBe(true);
    expect(isMeasurementDraftValid({ ...outdoorDraft, floor_name: "1st Floor" })).toBe(false);
  });

  it("converts GPS lat/lng to map coordinates and back reversibly", () => {
    const lat = 8.914;
    const lng = 76.6325;
    const point = latLngToMapPoint(lat, lng);
    expect(point.x).toBeGreaterThan(0);
    expect(point.y).toBeGreaterThan(0);

    const reversed = mapPointToLatLng(point);
    expect(reversed.latitude).toBeCloseTo(lat, 6);
    expect(reversed.longitude).toBeCloseTo(lng, 6);
  });
});
