import { Footprints, Play, Radio, RotateCcw, RotateCw, Smartphone, Square } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { centroid, nativePlugin, type RssiSource, type SurveyWalk } from "@/lib/survey";
import { CAMPUS_BUILDINGS, signalBand, type MapPoint } from "@/lib/wifi-map-data";

type Props = {
  survey: SurveyWalk;
  buildingId: string;
  floor: string;
  busy: boolean;
  onSave: (rssi: number, point: MapPoint) => Promise<boolean>;
};

export function SurveyControls({ survey: s, buildingId, floor, busy, onSave }: Props) {
  const building = CAMPUS_BUILDINGS.find((b) => b.id === buildingId);

  async function measure() {
    const result = await s.measure();
    if (result) await onSave(result.mean, s.getPos());
  }

  return (
    <div className="mb-4 space-y-3 border-b border-border pb-4">
      <div className="flex items-center justify-between text-xs font-semibold">
        <span className="flex items-center gap-2">
          <Footprints size={14} /> Survey walk
        </span>
        <span className="text-muted-foreground">
          {building?.name} · {floor}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="wifi-form-label" htmlFor="survey-source">
            Signal source
          </Label>
          <select
            id="survey-source"
            className="h-9 w-full border border-input bg-background px-2 text-xs"
            value={s.source}
            onChange={(e) => s.setSource(e.target.value as RssiSource)}
          >
            <option value="simulated">Simulated</option>
            <option value="manual">Manual dBm</option>
            <option value="native" disabled={!nativePlugin()}>
              Native Wi-Fi (Android app)
            </option>
          </select>
        </div>
        {s.source === "manual" && (
          <div>
            <Label className="wifi-form-label" htmlFor="survey-manual">
              Signal (dBm)
            </Label>
            <Input
              id="survey-manual"
              type="number"
              min={-100}
              max={-20}
              value={s.manual}
              onChange={(e) => s.setManual(Number(e.target.value))}
            />
          </div>
        )}
      </div>

      {!s.active ? (
        <Button
          className="w-full"
          disabled={busy || !building}
          onClick={() => building && s.start(centroid(building.footprint))}
        >
          <Play /> Start walk in {building?.name}
        </Button>
      ) : (
        <>
          <p className="text-[11px] text-muted-foreground">
            Tap the map to correct your position. {s.steps} steps · heading {Math.round(s.heading)}°
            {s.live !== null && (
              <>
                {" "}
                ·{" "}
                <span
                  className="font-semibold"
                  style={{ color: `var(--signal-${signalBand(s.live)})` }}
                >
                  {s.live} dBm here
                </span>
              </>
            )}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant={s.sensors ? "default" : "outline"}
              onClick={() => void s.toggleSensors()}
            >
              <Smartphone /> Auto-track {s.sensors ? "on" : "off"}
            </Button>
            {s.sensors && (
              <Button size="sm" variant="outline" onClick={() => s.setInvert(!s.invert)}>
                {s.invert ? "Un-invert" : "Flip 180°"}
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={s.step}>
              <Footprints /> Step
            </Button>
            <Button
              size="sm"
              variant="outline"
              aria-label="Turn left 15 degrees"
              onClick={() => s.setHeading(s.heading - 15)}
            >
              <RotateCcw />
            </Button>
            <Button
              size="sm"
              variant="outline"
              aria-label="Turn right 15 degrees"
              onClick={() => s.setHeading(s.heading + 15)}
            >
              <RotateCw />
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="wifi-form-label" htmlFor="survey-heading">
                Heading (°)
              </Label>
              <Input
                id="survey-heading"
                type="number"
                min={0}
                max={359}
                value={Math.round(s.heading)}
                onChange={(e) => s.setHeading(Number(e.target.value) || 0)}
              />
            </div>
            <div>
              <Label className="wifi-form-label" htmlFor="survey-step">
                Step (cm)
              </Label>
              <Input
                id="survey-step"
                type="number"
                min={30}
                max={120}
                value={s.stepCm}
                onChange={(e) =>
                  s.setStepCm(Math.min(120, Math.max(30, Number(e.target.value) || 70)))
                }
              />
            </div>
          </div>
          <Button className="w-full" disabled={busy || !!s.sampling} onClick={() => void measure()}>
            <Radio /> {s.sampling || "Measure & save here"}
          </Button>
          <Button className="w-full" variant="outline" onClick={s.stop}>
            <Square /> Stop walk
          </Button>
        </>
      )}
      {s.error && (
        <p className="wifi-status" role="alert">
          {s.error}
        </p>
      )}
    </div>
  );
}
