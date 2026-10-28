import { useCallback, useEffect, useRef, useState } from "react";
import { isCampusPoint, latLngToMapPoint, type MapPoint } from "@/lib/wifi-map-data";

export type GpsCoords = {
  latitude: number;
  longitude: number;
  accuracy: number;
  heading: number | null;
  speed: number | null;
};

export type GpsState = {
  active: boolean;
  coords: GpsCoords | null;
  mapPoint: MapPoint | null;
  isInsideCampus: boolean;
  accuracyMeters: number | null;
  error: string | null;
  start: () => void;
  stop: () => void;
  toggle: () => void;
};

type CapacitorGeolocation = {
  watchPosition(
    options: { enableHighAccuracy?: boolean; timeout?: number; maximumAge?: number },
    callback: (position: { coords: GpsCoords } | null, err?: Error) => void,
  ): Promise<string>;
  clearWatch(options: { id: string }): Promise<void>;
  getCurrentPosition(options?: { enableHighAccuracy?: boolean }): Promise<{ coords: GpsCoords }>;
};

function getCapacitorGeolocation(): CapacitorGeolocation | null {
  if (typeof window === "undefined") return null;
  const C = (
    window as unknown as {
      Capacitor?: {
        Plugins?: { Geolocation?: CapacitorGeolocation };
        isPluginAvailable?: (name: string) => boolean;
      };
    }
  ).Capacitor;

  if (C?.Plugins?.Geolocation) {
    return C.Plugins.Geolocation;
  }
  return null;
}

export function useGpsLocation(): GpsState {
  const [active, setActive] = useState(false);
  const [coords, setCoords] = useState<GpsCoords | null>(null);
  const [error, setError] = useState<string | null>(null);
  const watchIdRef = useRef<number | string | null>(null);

  const stop = useCallback(() => {
    setActive(false);
    setError(null);
    if (watchIdRef.current !== null) {
      const capGeo = getCapacitorGeolocation();
      if (typeof watchIdRef.current === "string" && capGeo) {
        void capGeo.clearWatch({ id: watchIdRef.current });
      } else if (
        typeof watchIdRef.current === "number" &&
        typeof navigator !== "undefined" &&
        navigator.geolocation
      ) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
      watchIdRef.current = null;
    }
  }, []);

  const start = useCallback(() => {
    if (typeof window === "undefined") return;
    setError(null);
    setActive(true);

    const capGeo = getCapacitorGeolocation();
    if (capGeo) {
      capGeo
        .watchPosition(
          { enableHighAccuracy: true, timeout: 10000, maximumAge: 1000 },
          (position, err) => {
            if (err) {
              setError(err.message || "Failed to receive native GPS coordinates.");
              return;
            }
            if (position?.coords) {
              setCoords({
                latitude: position.coords.latitude,
                longitude: position.coords.longitude,
                accuracy: position.coords.accuracy,
                heading: position.coords.heading ?? null,
                speed: position.coords.speed ?? null,
              });
              setError(null);
            }
          },
        )
        .then((id) => {
          watchIdRef.current = id;
        })
        .catch((e: unknown) => {
          setError(e instanceof Error ? e.message : "Capacitor GPS watch failed.");
        });
      return;
    }

    if (!("geolocation" in navigator)) {
      setError("Geolocation is not supported by your browser or device.");
      setActive(false);
      return;
    }

    const id = navigator.geolocation.watchPosition(
      (pos) => {
        setCoords({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          heading: pos.coords.heading,
          speed: pos.coords.speed,
        });
        setError(null);
      },
      (err) => {
        let msg = "Could not obtain GPS location.";
        if (err.code === 1) {
          msg = "Location permission was denied. Please allow GPS access in settings.";
        } else if (err.code === 2) {
          msg = "GPS position unavailable. Please check device location settings.";
        } else if (err.code === 3) {
          msg = "GPS location request timed out.";
        }
        setError(msg);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 1000,
      },
    );
    watchIdRef.current = id;
  }, []);

  const toggle = useCallback(() => {
    if (active) {
      stop();
    } else {
      start();
    }
  }, [active, start, stop]);

  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) {
        const capGeo = getCapacitorGeolocation();
        if (typeof watchIdRef.current === "string" && capGeo) {
          void capGeo.clearWatch({ id: watchIdRef.current });
        } else if (
          typeof watchIdRef.current === "number" &&
          typeof navigator !== "undefined" &&
          navigator.geolocation
        ) {
          navigator.geolocation.clearWatch(watchIdRef.current);
        }
      }
    };
  }, []);

  const mapPoint = coords ? latLngToMapPoint(coords.latitude, coords.longitude) : null;
  const isInsideCampus = mapPoint ? isCampusPoint(mapPoint) : false;

  return {
    active,
    coords,
    mapPoint,
    isInsideCampus,
    accuracyMeters: coords ? coords.accuracy : null,
    error,
    start,
    stop,
    toggle,
  };
}

