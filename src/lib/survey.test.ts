import { describe, expect, it } from "vitest";

import {
  advance,
  centroid,
  frequencyToChannel,
  normalizeNativeScanResults,
  simulateScan,
  wallsBetween,
} from "@/lib/survey";
import { CAMPUS_BUILDINGS } from "@/lib/wifi-map-data";

describe("survey walk", () => {
  it("walks north up the map and east to the right (0.5 m per map unit)", () => {
    const n = advance({ x: 500, y: 450 }, 0, 10);
    const e = advance({ x: 500, y: 450 }, 90, 10);
    expect(n.y).toBeCloseTo(430);
    expect(n.x).toBeCloseTo(500);
    expect(e.x).toBeCloseTo(520);
  });

  it("keeps the walker inside the map", () => {
    expect(advance({ x: 2, y: 2 }, 315, 100)).toEqual({ x: 0, y: 0 });
  });

  it("counts building outlines as walls and attenuates the simulated signal", () => {
    const inside = centroid(CAMPUS_BUILDINGS[2]!.footprint);
    expect(wallsBetween(inside, { x: 0, y: 0 })).toBeGreaterThanOrEqual(1);
    expect(wallsBetween({ x: 0, y: 0 }, { x: 1, y: 1 })).toBe(0);
    const best = Math.max(...simulateScan(inside).map((n) => n.rssi));
    expect(best).toBeGreaterThan(-60);
  });

  it("normalizes native Android Wi-Fi scan results correctly", () => {
    // Android ScanResult format
    const androidRaw = [
      {
        SSID: "TKM-CAMPUS-WIFI",
        BSSID: "aa:bb:cc:dd:ee:ff",
        level: -62,
        frequency: 2437,
      },
      {
        ssid: "TKM-5G",
        bssid: "11:22:33:44:55:66",
        rssi: -55,
        frequency: 5180,
      },
    ];

    const result = normalizeNativeScanResults(androidRaw);
    expect(result).toHaveLength(2);
    expect(result[0]!.ssid).toBe("TKM-CAMPUS-WIFI");
    expect(result[0]!.rssi).toBe(-62);
    expect(result[0]!.channel).toBe(6);
    expect(result[1]!.channel).toBe(36);
  });

  it("handles stringified JSON and single RSSI numbers from Android bridge", () => {
    const jsonStr = JSON.stringify([{ SSID: "Test-AP", level: -73, channel: 1 }]);
    const parsed = normalizeNativeScanResults(jsonStr);
    expect(parsed[0]!.rssi).toBe(-73);

    const singleNumber = normalizeNativeScanResults(-67);
    expect(singleNumber[0]!.rssi).toBe(-67);
  });
});
