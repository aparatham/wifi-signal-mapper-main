import { useCallback, useEffect, useRef, useState } from "react";
import { Minus, Plus, RotateCcw } from "lucide-react";

import { renderHeatDataUrl } from "@/lib/survey";

import {
  CAMPUS_BOUNDARY,
  CAMPUS_BUILDINGS,
  CAMPUS_CONTEXT,
  campusLandmarks,
  OPEN_AREA_ID,
  polygonPoints,
  signalBand,
  type MapPoint,
} from "@/lib/wifi-map-data";
import type { Tables } from "@/integrations/supabase/types";

type Measurement = Tables<"wifi_measurements">;

type WifiCampusMapProps = {
  activeBuildingId: string;
  measurements: Measurement[];
  editing: boolean;
  isDeveloper: boolean;
  placingPoint: boolean;
  selectedPointId: string | null;
  onBuildingSelect: (buildingId: string) => void;
  onMapPoint: (point: MapPoint) => void;
  onPointSelect: (point: Measurement) => void;
  onPointDrop: (pointId: string, point: MapPoint) => void;
  survey?: { pos: MapPoint; heading: number; track: MapPoint[] } | null;
  onSurveyTap?: (point: MapPoint) => void;
  gpsLocation?: {
    mapPoint: MapPoint;
    accuracyMeters: number | null;
    isInsideCampus: boolean;
  } | null;
  showHeatmap?: boolean;
};

const MAP_WIDTH = 1000;
const MAP_HEIGHT = 900;
const MAX_ZOOM = 6;
const MIN_VIEW_WIDTH = MAP_WIDTH / MAX_ZOOM;
const ASPECT = MAP_HEIGHT / MAP_WIDTH;

type View = { x: number; y: number; w: number };
const FULL_VIEW: View = { x: 0, y: 0, w: MAP_WIDTH };

function clampView(view: View): View {
  const w = Math.min(MAP_WIDTH, Math.max(MIN_VIEW_WIDTH, view.w));
  const h = w * ASPECT;
  return {
    w,
    x: Math.min(MAP_WIDTH - w, Math.max(0, view.x)),
    y: Math.min(MAP_HEIGHT - h, Math.max(0, view.y)),
  };
}

function centroid(points: MapPoint[]): MapPoint {
  const total = points.reduce((sum, point) => ({ x: sum.x + point.x, y: sum.y + point.y }), {
    x: 0,
    y: 0,
  });
  return { x: total.x / points.length, y: total.y / points.length };
}

export function WifiCampusMap({
  activeBuildingId,
  measurements,
  editing,
  isDeveloper,
  placingPoint,
  selectedPointId,
  onBuildingSelect,
  onMapPoint,
  onPointSelect,
  onPointDrop,
  survey = null,
  onSurveyTap,
  gpsLocation = null,
  showHeatmap = true,
}: WifiCampusMapProps) {
  const [heatUrl, setHeatUrl] = useState<string | null>(null);
  useEffect(() => setHeatUrl(renderHeatDataUrl(measurements)), [measurements]);
  const svgRef = useRef<SVGSVGElement>(null);
  const dragPointId = useRef<string | null>(null);
  const dragPosition = useRef<MapPoint | null>(null);
  const [previewDrag, setPreviewDrag] = useState<{ id: string; point: MapPoint } | null>(null);
  const [view, setView] = useState<View>(FULL_VIEW);
  const pointers = useRef(new Map<number, MapPoint>());
  const panOrigin = useRef<MapPoint | null>(null);
  const lastPinchDistance = useRef<number | null>(null);
  const didPan = useRef(false);

  // Start from the full map whenever a different building/area is chosen.
  useEffect(() => setView(FULL_VIEW), [activeBuildingId]);

  const screenToMap = useCallback((clientX: number, clientY: number): MapPoint | null => {
    const svg = svgRef.current;
    if (!svg) return null;
    const svgPoint = svg.createSVGPoint();
    svgPoint.x = clientX;
    svgPoint.y = clientY;
    const screenTransform = svg.getScreenCTM();
    if (!screenTransform) return null;
    const mapPoint = svgPoint.matrixTransform(screenTransform.inverse());
    return {
      x: Math.min(1000, Math.max(0, mapPoint.x)),
      y: Math.min(900, Math.max(0, mapPoint.y)),
    };
  }, []);

  const zoomBy = useCallback((factor: number, focus?: MapPoint) => {
    setView((current) => {
      const f = focus ?? { x: current.x + current.w / 2, y: current.y + (current.w * ASPECT) / 2 };
      const w = Math.min(MAP_WIDTH, Math.max(MIN_VIEW_WIDTH, current.w / factor));
      const ratio = w / current.w;
      return clampView({
        w,
        x: f.x - (f.x - current.x) * ratio,
        y: f.y - (f.y - current.y) * ratio,
      });
    });
  }, []);

  // Mouse wheel / trackpad pinch zoom (needs a non-passive listener to stop page scrolling).
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const focus = screenToMap(event.clientX, event.clientY) ?? undefined;
      zoomBy(Math.exp(-event.deltaY * 0.0015), focus);
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, [screenToMap, zoomBy]);

  const handlePointerDown = useCallback((event: React.PointerEvent<SVGSVGElement>) => {
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    panOrigin.current = { x: event.clientX, y: event.clientY };
    didPan.current = false;
  }, []);

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<SVGSVGElement>) => {
      if (dragPointId.current) {
        const point = screenToMap(event.clientX, event.clientY);
        if (!point) return;
        dragPosition.current = point;
        setPreviewDrag({ id: dragPointId.current, point });
        return;
      }
      const previous = pointers.current.get(event.pointerId);
      const matrix = svgRef.current?.getScreenCTM();
      if (!previous || !matrix) return;
      const current = { x: event.clientX, y: event.clientY };
      pointers.current.set(event.pointerId, current);

      if (pointers.current.size === 2) {
        // Two-finger pinch zoom.
        const [a, b] = [...pointers.current.values()];
        if (!a || !b) return;
        const distance = Math.hypot(a.x - b.x, a.y - b.y);
        if (lastPinchDistance.current && distance > 0) {
          const focus = screenToMap((a.x + b.x) / 2, (a.y + b.y) / 2) ?? undefined;
          zoomBy(distance / lastPinchDistance.current, focus);
        }
        lastPinchDistance.current = distance;
        didPan.current = true;
        return;
      }

      lastPinchDistance.current = null;
      const origin = panOrigin.current;
      if (pointers.current.size !== 1 || !origin) return;
      if (!didPan.current && Math.hypot(current.x - origin.x, current.y - origin.y) < 6) return;
      didPan.current = true;
      const dx = (current.x - previous.x) / matrix.a;
      const dy = (current.y - previous.y) / matrix.d;
      setView((v) => clampView({ ...v, x: v.x - dx, y: v.y - dy }));
    },
    [screenToMap, zoomBy],
  );

  const endPan = useCallback((event: React.PointerEvent<SVGSVGElement>) => {
    pointers.current.delete(event.pointerId);
    lastPinchDistance.current = null;
  }, []);

  const handlePointerUp = useCallback(
    (event: React.PointerEvent<SVGSVGElement>) => {
      if (dragPointId.current && dragPosition.current) {
        onPointDrop(dragPointId.current, dragPosition.current);
      }
      dragPointId.current = null;
      dragPosition.current = null;
      setPreviewDrag(null);
      endPan(event);
    },
    [onPointDrop, endPan],
  );

  return (
    <>
      <svg
        ref={svgRef}
        aria-label="TKM campus Wi-Fi signal map"
        className={`wifi-map-svg ${placingPoint ? "cursor-crosshair" : ""}`}
        viewBox={`${view.x} ${view.y} ${view.w} ${view.w * ASPECT}`}
        role="group"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onPointerLeave={endPan}
        onClick={(event) => {
          if (didPan.current) return;
          const point = screenToMap(event.clientX, event.clientY);
          if (!point) return;
          if (placingPoint) onMapPoint(point);
          else if (survey) onSurveyTap?.(point);
        }}
      >
        <defs>
          <filter id="wifi-heat-blur" x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur stdDeviation="23" />
          </filter>
          <radialGradient id="heat-strong">
            <stop offset="0%" stopColor="var(--signal-strong)" stopOpacity=".82" />
            <stop offset="52%" stopColor="var(--signal-good)" stopOpacity=".52" />
            <stop offset="100%" stopColor="var(--signal-good)" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="heat-good">
            <stop offset="0%" stopColor="var(--signal-good)" stopOpacity=".82" />
            <stop offset="55%" stopColor="var(--signal-fair)" stopOpacity=".5" />
            <stop offset="100%" stopColor="var(--signal-fair)" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="heat-fair">
            <stop offset="0%" stopColor="var(--signal-fair)" stopOpacity=".84" />
            <stop offset="55%" stopColor="var(--signal-weak)" stopOpacity=".5" />
            <stop offset="100%" stopColor="var(--signal-weak)" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="heat-weak">
            <stop offset="0%" stopColor="var(--signal-weak)" stopOpacity=".84" />
            <stop offset="55%" stopColor="var(--signal-poor)" stopOpacity=".5" />
            <stop offset="100%" stopColor="var(--signal-poor)" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="heat-poor">
            <stop offset="0%" stopColor="var(--signal-poor)" stopOpacity=".84" />
            <stop offset="62%" stopColor="var(--signal-poor)" stopOpacity=".48" />
            <stop offset="100%" stopColor="var(--signal-poor)" stopOpacity="0" />
          </radialGradient>
          <pattern id="campus-dots" width="16" height="16" patternUnits="userSpaceOnUse">
            <circle cx="2" cy="2" r="1" fill="var(--map-outline)" opacity=".4" />
          </pattern>
        </defs>

        <rect width={MAP_WIDTH} height={MAP_HEIGHT} fill="url(#campus-dots)" />
        <polygon
          className={`wifi-map-boundary ${activeBuildingId === OPEN_AREA_ID ? "selected" : ""}`}
          points={polygonPoints(CAMPUS_BOUNDARY)}
          stroke={activeBuildingId === OPEN_AREA_ID ? "var(--map-selected)" : undefined}
          strokeWidth={activeBuildingId === OPEN_AREA_ID ? "3.5" : undefined}
        />
        <path
          className="wifi-map-road"
          d="M270 175 C 400 230, 600 230, 710 300 S 700 500, 610 590 S 430 700, 330 740"
        />
        <path className="wifi-map-road" d="M310 245 C 450 370, 540 410, 680 430" />

        {CAMPUS_CONTEXT.map((landmark) => (
          <g key={landmark.name}>
            <polygon
              points={polygonPoints(landmark.footprint)}
              fill="var(--secondary)"
              stroke="var(--map-outline)"
              strokeWidth="2"
              strokeDasharray="5 4"
            />
            <text
              x={centroid(landmark.footprint).x}
              y={centroid(landmark.footprint).y}
              className="wifi-building-number"
              textAnchor="middle"
            >
              {landmark.name}
            </text>
          </g>
        ))}

        {CAMPUS_BUILDINGS.map((building) => {
          const center = centroid(building.footprint);
          return (
            <g
              key={building.id}
              className="wifi-building-hit"
              role="button"
              tabIndex={0}
              aria-label={`Select ${building.name}`}
              onClick={(event) => {
                event.stopPropagation();
                if (didPan.current) return;
                if (survey && !placingPoint) {
                  const point = screenToMap(event.clientX, event.clientY);
                  if (point) onSurveyTap?.(point);
                } else if (placingPoint && isDeveloper) {
                  const point = screenToMap(event.clientX, event.clientY);
                  if (point) onMapPoint(point);
                } else {
                  onBuildingSelect(building.id);
                }
              }}
              onKeyDown={(event) => {
                if (event.key !== "Enter" && event.key !== " ") return;
                if (placingPoint && isDeveloper) {
                  const center = centroid(building.footprint);
                  onMapPoint(center);
                } else {
                  onBuildingSelect(building.id);
                }
              }}
            >
              <polygon
                className={`wifi-building ${activeBuildingId === building.id ? "selected" : ""}`}
                points={polygonPoints(building.footprint)}
              />
              <text className="wifi-building-name" x={center.x} y={center.y}>
                {building.name}
              </text>
            </g>
          );
        })}

        {campusLandmarks.map((landmark) => (
          <g key={landmark.name}>
            <circle cx={landmark.x} cy={landmark.y} r="4" fill="var(--muted-foreground)" />
            <text x={landmark.x + 10} y={landmark.y + 3} className="wifi-building-number">
              {landmark.name}
            </text>
          </g>
        ))}

        {showHeatmap && heatUrl && (
          <image
            className="wifi-heatmap"
            href={heatUrl}
            x="0"
            y="0"
            width="1000"
            height="900"
            preserveAspectRatio="none"
            opacity=".85"
          />
        )}

        {measurements.map((measurement) => {
          const band = signalBand(measurement.rssi_dbm);
          const isSelected = selectedPointId === measurement.id;
          const point = previewDrag?.id === measurement.id ? previewDrag.point : measurement;
          return (
            <g
              key={measurement.id}
              className="wifi-point"
              role="button"
              tabIndex={0}
              aria-label={`${measurement.rssi_dbm} dBm at measurement point`}
              onPointerDown={(event) => {
                if (!editing) return;
                event.stopPropagation();
                event.currentTarget.setPointerCapture(event.pointerId);
                dragPointId.current = measurement.id;
                dragPosition.current = null;
                onPointSelect(measurement);
              }}
              onClick={(event) => {
                event.stopPropagation();
                if (!dragPosition.current && !didPan.current) onPointSelect(measurement);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") onPointSelect(measurement);
              }}
            >
              {isSelected && (
                <circle className="wifi-point-ring" cx={point.x} cy={point.y} r="18" />
              )}
              <circle
                className={`wifi-point-core signal-${band}`}
                cx={point.x}
                cy={point.y}
                r="12"
              />
              <text className="wifi-point-label" x={point.x} y={point.y + 5}>
                {measurement.rssi_dbm}
              </text>
            </g>
          );
        })}

        {survey && (
          <g pointerEvents="none">
            <polyline
              points={polygonPoints(survey.track)}
              fill="none"
              stroke="var(--map-selected)"
              strokeWidth="3"
              strokeDasharray="6 4"
            />
            <g transform={`translate(${survey.pos.x} ${survey.pos.y}) rotate(${survey.heading})`}>
              <polygon
                points="0,-20 -13,15 0,8 13,15"
                fill="var(--primary)"
                stroke="#fff"
                strokeWidth="2.5"
              />
            </g>
          </g>
        )}

        {gpsLocation?.mapPoint && (
          <g pointerEvents="none" className="wifi-gps-marker">
            {gpsLocation.accuracyMeters != null && (
              <circle
                cx={gpsLocation.mapPoint.x}
                cy={gpsLocation.mapPoint.y}
                r={Math.min(120, Math.max(12, gpsLocation.accuracyMeters * 2))}
                fill="oklch(0.55 0.18 250 / 0.15)"
                stroke="oklch(0.55 0.18 250 / 0.5)"
                strokeWidth="1.5"
                strokeDasharray="4 3"
              />
            )}
            <circle
              cx={gpsLocation.mapPoint.x}
              cy={gpsLocation.mapPoint.y}
              r="16"
              fill="none"
              stroke="oklch(0.55 0.18 250)"
              strokeWidth="2"
              opacity="0.8"
            >
              <animate attributeName="r" values="8;24;8" dur="2.5s" repeatCount="indefinite" />
              <animate
                attributeName="opacity"
                values="0.8;0.1;0.8"
                dur="2.5s"
                repeatCount="indefinite"
              />
            </circle>
            <circle
              cx={gpsLocation.mapPoint.x}
              cy={gpsLocation.mapPoint.y}
              r="7"
              fill="oklch(0.55 0.18 250)"
              stroke="#ffffff"
              strokeWidth="2.5"
            />
            <text
              x={gpsLocation.mapPoint.x}
              y={gpsLocation.mapPoint.y - 14}
              textAnchor="middle"
              fill="var(--foreground)"
              fontSize="11"
              fontWeight="700"
            >
              Live GPS
              {gpsLocation.accuracyMeters != null
                ? ` (±${Math.round(gpsLocation.accuracyMeters)}m)`
                : ""}
            </text>
          </g>
        )}

        {!measurements.length && !placingPoint && (
          <foreignObject x="360" y="390" width="280" height="110">
            <div className="wifi-empty-state">
              <h3>
                {activeBuildingId === OPEN_AREA_ID
                  ? "No outdoor readings yet"
                  : "No readings on this floor yet"}
              </h3>
              <p>
                {activeBuildingId === OPEN_AREA_ID
                  ? "Developers can log outdoor signal measurements across campus open areas."
                  : "Measurements will appear here as developers add signal-strength points."}
              </p>
            </div>
          </foreignObject>
        )}

        {placingPoint && <rect x="1" y="1" width="998" height="898" fill="transparent" />}
      </svg>
      <div
        className="absolute bottom-10 right-4 z-[2] flex flex-col overflow-hidden rounded-md border border-border bg-card shadow-md"
        role="group"
        aria-label="Map zoom controls"
      >
        <button
          type="button"
          aria-label="Zoom in"
          title="Zoom in"
          className="flex h-9 w-9 items-center justify-center hover:bg-accent disabled:opacity-40"
          disabled={view.w <= MIN_VIEW_WIDTH + 0.01}
          onClick={() => zoomBy(1.5)}
        >
          <Plus size={16} />
        </button>
        <button
          type="button"
          aria-label="Zoom out"
          title="Zoom out"
          className="flex h-9 w-9 items-center justify-center border-t border-border hover:bg-accent disabled:opacity-40"
          disabled={view.w >= MAP_WIDTH - 0.01}
          onClick={() => zoomBy(1 / 1.5)}
        >
          <Minus size={16} />
        </button>
        <button
          type="button"
          aria-label="Reset zoom"
          title="Reset zoom"
          className="flex h-9 w-9 items-center justify-center border-t border-border hover:bg-accent disabled:opacity-40"
          disabled={view.w >= MAP_WIDTH - 0.01}
          onClick={() => setView(FULL_VIEW)}
        >
          <RotateCcw size={14} />
        </button>
      </div>
    </>
  );
}