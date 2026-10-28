import { useCallback, useEffect, useRef, useState } from "react";

import { CAMPUS_BUILDINGS, type MapPoint } from "@/lib/wifi-map-data";

/** The SVG map is ~0.5 m per unit (derived from the lat/lng projection in wifi-map-data). */
export const METERS_PER_UNIT = 0.5;
export const WALL_LOSS_DB = 5;
const STEP_THRESHOLD = 11.8;
const STEP_GAP_MS = 330;

export type RssiSource = "simulated" | "manual" | "native";
export type WifiNetwork = { ssid: string; bssid: string; rssi: number; channel: number };

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const centroid = (pts: MapPoint[]): MapPoint => ({
  x: pts.reduce((s, p) => s + p.x, 0) / pts.length,
  y: pts.reduce((s, p) => s + p.y, 0) / pts.length,
});

/** Dead reckoning: heading 0° = north = up the map (SVG y grows downward). */
export function advance(p: MapPoint, headingDeg: number, meters: number): MapPoint {
  const r = (headingDeg * Math.PI) / 180;
  const u = meters / METERS_PER_UNIT;
  return { x: clamp(p.x + Math.sin(r) * u, 0, 1000), y: clamp(p.y - Math.cos(r) * u, 0, 900) };
}

/* Building outlines act as walls for the simulated signal and the heatmap. */
type Wall = [MapPoint, MapPoint];
const WALLS: Wall[] = CAMPUS_BUILDINGS.flatMap(({ footprint }) =>
  footprint.map((p, i) => [p, footprint[(i + 1) % footprint.length]] as Wall),
);
const cross = (a: MapPoint, b: MapPoint, c: MapPoint) =>
  (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
export function wallsBetween(a: MapPoint, b: MapPoint): number {
  let n = 0;
  for (const [c, d] of WALLS)
    if (cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0) n++;
  return n;
}

/* ---- RSSI sources ---- */
const SIM_APS = CAMPUS_BUILDINGS.map((b, i) => ({
  ssid: "TKM-WiFi",
  bssid: `SIM:0${i + 1}`,
  channel: [1, 6, 11, 36, 44][i % 5] ?? 1,
  ...centroid(b.footprint),
}));

export function simulateScan(p: MapPoint): WifiNetwork[] {
  return SIM_APS.map((ap) => {
    const d = Math.max(Math.hypot(p.x - ap.x, p.y - ap.y) * METERS_PER_UNIT, 0.5);
    const rssi =
      -38 - 21.5 * Math.log10(d) + (Math.random() * 6 - 3) - WALL_LOSS_DB * wallsBetween(p, ap);
    return {
      ssid: ap.ssid,
      bssid: ap.bssid,
      channel: ap.channel,
      rssi: Math.round(clamp(rssi, -100, -25)),
    };
  });
}

export function frequencyToChannel(freq: number): number {
  if (freq >= 2412 && freq <= 2484) return Math.round((freq - 2407) / 5);
  if (freq >= 5170 && freq <= 5825) return Math.round((freq - 5000) / 5);
  return 0;
}

export function normalizeNativeScanResults(raw: unknown): WifiNetwork[] {
  if (!raw) return [];
  let parsed = raw;
  if (typeof raw === "string") {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return [];
    }
  }

  if (typeof parsed === "number" && Number.isFinite(parsed)) {
    return [{ ssid: "Connected Wi-Fi", bssid: "CURRENT", channel: 0, rssi: Math.round(parsed) }];
  }

  const items: unknown[] = Array.isArray(parsed)
    ? parsed
    : typeof parsed === "object" && parsed !== null
      ? ((parsed as Record<string, unknown>).networks ??
        (parsed as Record<string, unknown>).results ??
        (parsed as Record<string, unknown>).scanResults ??
        [])
      : [];

  if (!Array.isArray(items)) return [];

  return items
    .map((item): WifiNetwork | null => {
      if (!item || typeof item !== "object") return null;
      const rec = item as Record<string, unknown>;
      const ssid = String(rec.SSID ?? rec.ssid ?? rec.networkName ?? "Wi-Fi");
      const bssid = String(rec.BSSID ?? rec.bssid ?? rec.macAddress ?? "00:00:00:00:00:00");
      let rssi = Number(rec.level ?? rec.rssi ?? rec.signalLevel ?? rec.signal ?? -70);
      if (rssi > 0 && rssi <= 100) {
        // Convert percentage scale to dBm
        rssi = Math.round((rssi / 100) * 60 - 95);
      }
      const rawChannel = Number(rec.channel ?? 0);
      const frequency = Number(rec.frequency ?? 0);
      const channel =
        rawChannel > 0 ? rawChannel : frequency > 0 ? frequencyToChannel(frequency) : 0;
      return {
        ssid,
        bssid,
        rssi: Math.round(clamp(rssi, -120, 0)),
        channel,
      };
    })
    .filter((n): n is WifiNetwork => n !== null);
}

type NativePlugin = {
  scan(): Promise<{ networks?: WifiNetwork[] } | WifiNetwork[]>;
  getConnectedInfo(): Promise<Partial<WifiNetwork>>;
};

/** Checks if native Android Wi-Fi scanning interface is available (Capacitor, Cordova, or Android WebView). */
export function isNativeAndroidWifiAvailable(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as unknown as Record<string, unknown>;
  const C = w.Capacitor as
    | {
        isPluginAvailable?: (n: string) => boolean;
        Plugins?: { WifiScan?: unknown; WifiWizard2?: unknown };
        getPlatform?: () => string;
      }
    | undefined;

  return Boolean(
    C?.Plugins?.WifiScan ||
    C?.Plugins?.WifiWizard2 ||
    C?.isPluginAvailable?.("WifiScan") ||
    C?.isPluginAvailable?.("WifiWizard2") ||
    w.WifiWizard2 ||
    w.AndroidWifi ||
    w.Android ||
    w.__NATIVE_WIFI_RESULTS__,
  );
}

/** Only exists inside the Android (Capacitor) app that registers the WifiScan plugin. */
export function nativePlugin(): NativePlugin | null {
  if (typeof window === "undefined") return null;
  const C = (
    window as unknown as {
      Capacitor?: {
        isPluginAvailable?: (n: string) => boolean;
        registerPlugin?: <T>(n: string) => T;
        Plugins?: { WifiScan?: NativePlugin };
      };
    }
  ).Capacitor;
  try {
    if (C?.Plugins?.WifiScan) return C.Plugins.WifiScan;
    return C?.isPluginAvailable?.("WifiScan") && C.registerPlugin
      ? C.registerPlugin<NativePlugin>("WifiScan")
      : null;
  } catch {
    return null;
  }
}

export async function scanNativeWifi(): Promise<WifiNetwork[]> {
  if (typeof window === "undefined") {
    throw new Error("Native Wi-Fi scanning is only available on the client device.");
  }
  const w = window as unknown as Record<string, unknown>;

  // 1. Check Capacitor WifiScan plugin
  const plugin = nativePlugin();
  if (plugin && typeof plugin.scan === "function") {
    const r = await plugin.scan();
    const normalized = normalizeNativeScanResults(r);
    if (normalized.length > 0) return normalized;
  }

  // 2. Check Capacitor / Cordova WifiWizard2
  const C = w.Capacitor as
    | {
        Plugins?: {
          WifiWizard2?: { getScanResults?: () => Promise<unknown>; scan?: () => Promise<unknown> };
        };
      }
    | undefined;
  const wifiWizard2 =
    C?.Plugins?.WifiWizard2 ??
    (w.WifiWizard2 as
      { getScanResults?: () => Promise<unknown>; scan?: () => Promise<unknown> } | undefined);

  if (wifiWizard2) {
    if (typeof wifiWizard2.getScanResults === "function") {
      const res = await wifiWizard2.getScanResults();
      const normalized = normalizeNativeScanResults(res);
      if (normalized.length > 0) return normalized;
    }
  }

  // 3. Check Android WebView JavaScriptInterface (e.g. window.AndroidWifi or window.Android)
  const androidWifi = w.AndroidWifi as
    | {
        scan?: () => unknown;
        getWifiScanResults?: () => unknown;
        getRssi?: () => unknown;
      }
    | undefined;
  if (androidWifi) {
    const raw =
      typeof androidWifi.getWifiScanResults === "function"
        ? androidWifi.getWifiScanResults()
        : typeof androidWifi.scan === "function"
          ? androidWifi.scan()
          : typeof androidWifi.getRssi === "function"
            ? androidWifi.getRssi()
            : null;
    const normalized = normalizeNativeScanResults(raw);
    if (normalized.length > 0) return normalized;
  }

  const android = w.Android as
    | {
        getWifiScanResults?: () => unknown;
        scanWifi?: () => unknown;
        getRssi?: () => unknown;
      }
    | undefined;
  if (android) {
    const raw =
      typeof android.getWifiScanResults === "function"
        ? android.getWifiScanResults()
        : typeof android.scanWifi === "function"
          ? android.scanWifi()
          : typeof android.getRssi === "function"
            ? android.getRssi()
            : null;
    const normalized = normalizeNativeScanResults(raw);
    if (normalized.length > 0) return normalized;
  }

  // 4. Check global mock / custom scan results
  if (w.__NATIVE_WIFI_RESULTS__) {
    const normalized = normalizeNativeScanResults(w.__NATIVE_WIFI_RESULTS__);
    if (normalized.length > 0) return normalized;
  }

  throw new Error(
    "Native Android Wi-Fi scan: ensure you are running in the Android app with Location Services and permissions enabled.",
  );
}

export async function scanNetworks(
  source: RssiSource,
  pos: MapPoint,
  manual: number,
): Promise<WifiNetwork[]> {
  if (source === "native") {
    return scanNativeWifi();
  }
  if (source === "manual") {
    if (!Number.isFinite(manual) || manual < -100 || manual > -20)
      throw new Error("Enter a value between −100 and −20 dBm.");
    return [{ ssid: "Manual reading", bssid: "MANUAL", channel: 0, rssi: Math.round(manual) }];
  }
  return simulateScan(pos);
}

/* ---- heatmap: inverse-distance weighting with wall attenuation ---- */
const BAND_RGB = [
  [56, 178, 107],
  [201, 198, 58],
  [230, 154, 46],
  [217, 88, 43],
  [184, 50, 42],
];
const bandIndex = (r: number) => (r >= -50 ? 0 : r >= -60 ? 1 : r >= -70 ? 2 : r >= -80 ? 3 : 4);

export function renderHeatDataUrl(
  points: { x: number; y: number; rssi_dbm: number }[],
  radius = 70,
): string | null {
  if (typeof document === "undefined" || !points.length) return null;
  const CELL = 8,
    W = 125,
    H = 113;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const img = ctx.createImageData(W, H);
  for (let j = 0; j < H; j++)
    for (let i = 0; i < W; i++) {
      const q = { x: (i + 0.5) * CELL, y: (j + 0.5) * CELL };
      let sw = 0,
        sv = 0;
      for (const p of points) {
        const d2 = (q.x - p.x) ** 2 + (q.y - p.y) ** 2;
        if (d2 > radius * radius) continue;
        const wt = 1 / Math.max(d2, 16);
        sv += (p.rssi_dbm - WALL_LOSS_DB * wallsBetween(p, q)) * wt;
        sw += wt;
      }
      if (!sw) continue;
      const [r = 0, g = 0, b = 0] = BAND_RGB[bandIndex(sv / sw)] ?? [];
      img.data.set([r, g, b, 165], (j * W + i) * 4);
    }
  ctx.putImageData(img, 0, 0);
  return canvas.toDataURL();
}

/* ---- survey walk hook (port of SignalMap's useSurveyWalk + useDeviceSensors) ---- */
export function useSurveyWalk() {
  const [active, setActive] = useState(false);
  const [pos, setPosState] = useState<MapPoint>({ x: 500, y: 450 });
  const [track, setTrack] = useState<MapPoint[]>([]);
  const [heading, setHeadingState] = useState(180);
  const [steps, setSteps] = useState(0);
  const [stepCm, setStepCm] = useState(70);
  const [sensors, setSensors] = useState(false);
  const [invert, setInvert] = useState(true);
  const [source, setSource] = useState<RssiSource>("simulated");
  const [manual, setManual] = useState(-60);
  const [live, setLive] = useState<number | null>(null);
  const [sampling, setSampling] = useState("");
  const [error, setError] = useState("");
  const posRef = useRef(pos);
  const headRef = useRef(heading);
  const stepRef = useRef(stepCm);
  stepRef.current = stepCm;

  const setPos = useCallback((p: MapPoint) => {
    posRef.current = p;
    setPosState(p);
  }, []);
  const setHeading = useCallback((h: number) => {
    const v = ((h % 360) + 360) % 360;
    headRef.current = v;
    setHeadingState(v);
  }, []);
  const step = useCallback(() => {
    const next = advance(posRef.current, headRef.current, stepRef.current / 100);
    posRef.current = next;
    setPosState(next);
    setTrack((t) => [...t.slice(-2000), next]);
    setSteps((s) => s + 1);
  }, []);

  const start = useCallback(
    (p: MapPoint) => {
      setPos(p);
      setTrack([p]);
      setSteps(0);
      setError("");
      setActive(true);
    },
    [setPos],
  );
  const stop = useCallback(() => {
    setActive(false);
    setSensors(false);
    setLive(null);
  }, []);

  useEffect(() => {
    if (!sensors || !active) return;
    let prev = 9.8,
      rising = false,
      last = 0;
    const onMotion = (e: DeviceMotionEvent) => {
      const a = e.accelerationIncludingGravity;
      if (!a || a.x == null || a.y == null || a.z == null) return;
      const mag = Math.hypot(a.x, a.y, a.z),
        now = Date.now();
      if (mag > prev) rising = true;
      else if (rising && prev >= STEP_THRESHOLD) {
        rising = false;
        if (now - last >= STEP_GAP_MS) {
          last = now;
          step();
        }
      }
      prev = mag;
    };
    const evt =
      "ondeviceorientationabsolute" in window ? "deviceorientationabsolute" : "deviceorientation";
    const onOrient = (e: Event) => {
      const o = e as DeviceOrientationEvent & { webkitCompassHeading?: number };
      const raw =
        typeof o.webkitCompassHeading === "number"
          ? o.webkitCompassHeading
          : o.alpha != null
            ? (360 - o.alpha) % 360
            : null;
      if (raw != null) setHeading(Math.round(invert ? raw + 180 : raw));
    };
    window.addEventListener("devicemotion", onMotion);
    window.addEventListener(evt, onOrient);
    return () => {
      window.removeEventListener("devicemotion", onMotion);
      window.removeEventListener(evt, onOrient);
    };
  }, [sensors, active, invert, step, setHeading]);

  const toggleSensors = useCallback(async () => {
    if (sensors) return setSensors(false);
    try {
      const types = [window.DeviceOrientationEvent, window.DeviceMotionEvent] as unknown as {
        requestPermission?: () => Promise<string>;
      }[];
      for (const E of types)
        if (
          typeof E?.requestPermission === "function" &&
          (await E.requestPermission()) !== "granted"
        )
          throw new Error("Motion and compass permission was denied.");
      if (!("DeviceMotionEvent" in window))
        throw new Error("This device has no motion sensors. Use the Step button.");
      setError("");
      setSensors(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sensors unavailable.");
    }
  }, [sensors]);

  /* live signal at the current position */
  useEffect(() => {
    if (!active) return;
    const t = setTimeout(
      async () => {
        try {
          const nets = await scanNetworks(source, posRef.current, manual);
          setLive(Math.max(...nets.map((n) => n.rssi)));
        } catch {
          setLive(null);
        }
      },
      source === "native" ? 1500 : 300,
    );
    return () => clearTimeout(t);
  }, [active, pos, source, manual]);

  /** 5 scans, strongest network per scan, mean and standard deviation (same as SignalMap). */
  const measure = useCallback(async () => {
    setError("");
    try {
      const s: number[] = [];
      for (let i = 0; i < 5; i++) {
        setSampling(`Sampling ${i + 1}/5…`);
        const best = (await scanNetworks(source, posRef.current, manual)).sort(
          (a, b) => b.rssi - a.rssi,
        )[0];
        if (best) s.push(best.rssi);
        if (source === "native" && i < 4) await sleep(400);
      }
      if (!s.length) throw new Error("No Wi-Fi networks found.");
      const mean = s.reduce((a, b) => a + b, 0) / s.length;
      const std = Math.sqrt(s.reduce((a, b) => a + (b - mean) ** 2, 0) / s.length);
      return { mean: Math.round(mean), std: Math.round(std * 10) / 10 };
    } catch (e) {
      setError(e instanceof Error ? e.message : "Measurement failed.");
      return null;
    } finally {
      setSampling("");
    }
  }, [source, manual]);

  return {
    active,
    pos,
    track,
    heading,
    steps,
    stepCm,
    sensors,
    invert,
    source,
    manual,
    live,
    sampling,
    error,
    start,
    stop,
    step,
    setPos,
    setHeading,
    setStepCm,
    setInvert,
    setSource,
    setManual,
    toggleSensors,
    measure,
    getPos: () => posRef.current,
  };
}
export type SurveyWalk = ReturnType<typeof useSurveyWalk>;
