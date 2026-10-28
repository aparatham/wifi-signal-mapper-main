import { useCallback, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
  ChevronDown,
  ChevronUp,
  LockKeyhole,
  LogIn,
  LogOut,
  MapPinned,
  Navigation,
  Plus,
  RadioTower,
  Save,
  Signal,
  Trash2,
  Wifi,
  X,
} from "lucide-react";

import { SurveyControls } from "@/components/survey-controls";
import { WifiCampusMap } from "@/components/wifi-campus-map";
import { useSurveyWalk } from "@/lib/survey";
import { useGpsLocation } from "@/lib/use-gps";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { lovable } from "@/integrations/lovable";
import { supabase } from "@/integrations/supabase/client";
import {
  ALL_CAMPUS_AREAS,
  CAMPUS_BUILDINGS,
  isMeasurementDraftValid,
  OPEN_AREA,
  OPEN_AREA_ID,
  signalBand,
  type MapPoint,
} from "@/lib/wifi-map-data";
import type { Tables } from "@/integrations/supabase/types";

type Measurement = Tables<"wifi_measurements">;
type AuthUser = { id: string; email: string | null };

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "TKM Wi-Fi Signal Map | Campus RSSI Heatmap" },
      {
        name: "description",
        content:
          "Browse building and floor-level Wi-Fi signal measurements across TKM College of Engineering, Kollam.",
      },
      { property: "og:title", content: "TKM Wi-Fi Signal Map" },
      {
        property: "og:description",
        content: "Explore campus Wi-Fi signal readings by building and floor.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: WifiMapPage,
});

function WifiMapPage() {
  const queryClient = useQueryClient();
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [activeBuildingId, setActiveBuildingId] = useState("main");
  const [activeFloor, setActiveFloor] = useState("Ground Floor");
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isDeveloper, setIsDeveloper] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [loadingMap, setLoadingMap] = useState(true);
  const [authPanelOpen, setAuthPanelOpen] = useState(false);
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [pointError, setPointError] = useState("");
  const [busy, setBusy] = useState(false);
  const [placingPoint, setPlacingPoint] = useState(false);
  const [selectedPointId, setSelectedPointId] = useState<string | null>(null);
  const [newPoint, setNewPoint] = useState<MapPoint | null>(null);
  const [rssiValue, setRssiValue] = useState("-60");
  const survey = useSurveyWalk();
  const gps = useGpsLocation();

  const availableAreas = useMemo(
    () => (isDeveloper ? ALL_CAMPUS_AREAS : CAMPUS_BUILDINGS),
    [isDeveloper],
  );

  const selectedBuilding =
    availableAreas.find((building) => building.id === activeBuildingId) ?? CAMPUS_BUILDINGS[0];
  const selectedMeasurement = measurements.find(({ id }) => id === selectedPointId) ?? null;
  const activeMeasurements = useMemo(
    () =>
      measurements.filter(
        (measurement) =>
          measurement.building_id === activeBuildingId && measurement.floor_name === activeFloor,
      ),
    [activeBuildingId, activeFloor, measurements],
  );
  const averageRssi =
    activeMeasurements.length > 0
      ? Math.round(
          activeMeasurements.reduce((sum, measurement) => sum + measurement.rssi_dbm, 0) /
            activeMeasurements.length,
        )
      : null;

  const fetchMeasurements = useCallback(async () => {
    const { data, error } = await supabase
      .from("wifi_measurements")
      .select("*")
      .order("measured_at", { ascending: false });
    if (error) {
      setPointError("Signal readings could not be loaded. Please refresh to try again.");
      return;
    }
    setMeasurements(data ?? []);
  }, []);

  const refreshUser = useCallback(async () => {
    const { data } = await supabase.auth.getUser();
    const nextUser = data.user ? { id: data.user.id, email: data.user.email ?? null } : null;
    setUser(nextUser);
    if (nextUser) {
      const { data: roleValue, error } = await supabase.rpc("is_developer");
      setIsDeveloper(!error && roleValue === true);
    } else {
      setIsDeveloper(false);
    }
    setAuthChecked(true);
  }, []);

  useEffect(() => {
    let mounted = true;
    void Promise.all([fetchMeasurements(), refreshUser()]).finally(() => {
      if (mounted) setLoadingMap(false);
    });
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted || !["SIGNED_IN", "SIGNED_OUT", "USER_UPDATED"].includes(event)) return;
      if (event === "SIGNED_OUT") {
        setUser(null);
        setIsDeveloper(false);
        setAuthPanelOpen(false);
      } else if (session?.user) {
        setUser({ id: session.user.id, email: session.user.email ?? null });
        queueMicrotask(() => void refreshUser());
      }
    });
    return () => {
      mounted = false;
      data.subscription.unsubscribe();
    };
  }, [fetchMeasurements, refreshUser]);

  useEffect(() => {
    if (selectedMeasurement) setRssiValue(String(selectedMeasurement.rssi_dbm));
  }, [selectedMeasurement]);

  useEffect(() => {
    if (!isDeveloper && activeBuildingId === OPEN_AREA_ID) {
      setActiveBuildingId("main");
      setActiveFloor("Ground Floor");
    }
  }, [isDeveloper, activeBuildingId]);

  function chooseBuilding(buildingId: string) {
    const building = availableAreas.find((item) => item.id === buildingId);
    if (!building) return;
    setActiveBuildingId(buildingId);
    if (!building.floors.includes(activeFloor))
      setActiveFloor(building.floors[0] ?? "Ground Floor");
    setSelectedPointId(null);
    setNewPoint(null);
    setPlacingPoint(false);
  }

  function chooseFloor(buildingId: string, floor: string) {
    setActiveBuildingId(buildingId);
    setActiveFloor(floor);
    setSelectedPointId(null);
    setNewPoint(null);
    setPlacingPoint(false);
  }

  function startLogin() {
    setAuthError("");
    setAuthPanelOpen(true);
  }

  async function signInWithPassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!authEmail.trim() || !authPassword) {
      setAuthError("Enter your email and password to continue.");
      return;
    }
    setBusy(true);
    setAuthError("");
    const { error } = await supabase.auth.signInWithPassword({
      email: authEmail.trim(),
      password: authPassword,
    });
    setBusy(false);
    if (error) {
      setAuthError("Sign-in was not accepted. Check the email and password, then try again.");
      return;
    }
    await refreshUser();
    setAuthPanelOpen(false);
  }

  async function signInWithProvider(provider: "google" | "lovable") {
    setBusy(true);
    setAuthError("");
    const { error } = await lovable.auth.signInWithOAuth(provider, {
      redirect_uri: window.location.origin,
    });
    setBusy(false);
    if (error)
      setAuthError("That sign-in option is unavailable right now. Try email and password.");
  }

  function beginAddingPoint() {
    if (!user || !isDeveloper) {
      startLogin();
      return;
    }
    setSelectedPointId(null);
    setNewPoint(null);
    setPointError("");
    setRssiValue("-60");
    setPlacingPoint(true);
  }

  async function saveMeasurement(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const rssi = Number(rssiValue);
    const location = newPoint ?? selectedMeasurement;
    if (!location || !selectedBuilding) return;
    const draft = {
      building_id: activeBuildingId,
      floor_name: activeFloor,
      x: location.x,
      y: location.y,
      rssi_dbm: rssi,
    };
    if (!isMeasurementDraftValid(draft)) {
      setPointError("Signal must be a whole number between −120 and 0 dBm.");
      return;
    }
    setBusy(true);
    setPointError("");
    const result = selectedMeasurement
      ? await supabase
          .from("wifi_measurements")
          .update({ rssi_dbm: rssi })
          .eq("id", selectedMeasurement.id)
      : await supabase.from("wifi_measurements").insert(draft);
    setBusy(false);
    if (result.error) {
      setPointError("This reading could not be saved. Please try again.");
      return;
    }
    setNewPoint(null);
    setSelectedPointId(null);
    setPlacingPoint(false);
    await fetchMeasurements();
  }

  async function saveSurveyReading(rssi: number, point: MapPoint): Promise<boolean> {
    const draft = {
      building_id: activeBuildingId,
      floor_name: activeFloor,
      x: point.x,
      y: point.y,
      rssi_dbm: rssi,
    };
    if (!isMeasurementDraftValid(draft)) {
      setPointError("Signal must be a whole number between −120 and 0 dBm.");
      return false;
    }
    setBusy(true);
    setPointError("");
    const { error } = await supabase.from("wifi_measurements").insert(draft);
    setBusy(false);
    if (error) {
      setPointError("This reading could not be saved. Please try again.");
      return false;
    }
    await fetchMeasurements();
    return true;
  }

  async function moveMeasurement(pointId: string, point: MapPoint) {
    if (!isDeveloper) return;
    const { error } = await supabase.from("wifi_measurements").update(point).eq("id", pointId);
    if (error) {
      setPointError("This point could not be moved. Please try again.");
      return;
    }
    setMeasurements((current) =>
      current.map((measurement) =>
        measurement.id === pointId ? { ...measurement, ...point } : measurement,
      ),
    );
  }

  async function deleteMeasurement() {
    if (!selectedMeasurement || !isDeveloper) return;
    setBusy(true);
    setPointError("");
    const { error } = await supabase
      .from("wifi_measurements")
      .delete()
      .eq("id", selectedMeasurement.id);
    setBusy(false);
    if (error) {
      setPointError("This reading could not be removed. Please try again.");
      return;
    }
    setMeasurements((current) => current.filter(({ id }) => id !== selectedMeasurement.id));
    setSelectedPointId(null);
  }

  function cancelEditing() {
    setSelectedPointId(null);
    setNewPoint(null);
    setPlacingPoint(false);
    setPointError("");
  }

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    const { error } = await supabase.auth.signOut();
    if (error) {
      setAuthError("Sign-out did not complete. Please try again.");
      return;
    }
    setUser(null);
    setIsDeveloper(false);
    setAuthPanelOpen(false);
    setAuthPassword("");
  }

  return (
    <div className="wifi-app">
      <header className="wifi-header">
        <div className="wifi-brand">
          <div className="wifi-brand-mark" aria-hidden="true">
            <RadioTower size={19} />
          </div>
          <div className="min-w-0">
            <h1 className="wifi-brand-title">Campus signal map</h1>
            <div className="wifi-brand-sub">TKM College of Engineering · Kollam</div>
          </div>
        </div>
        <div className="wifi-header-meta">
          <span className="wifi-live-dot" />
          <span>{loadingMap ? "Loading readings" : "Campus map"}</span>
          <span aria-hidden="true">·</span>
          <span>{measurements.length} readings</span>
        </div>
        {isDeveloper ? (
          <Button
            variant="outline"
            onClick={() => void signOut()}
            aria-label="Sign out of developer access"
          >
            <LogOut />
            <span className="hidden sm:inline">Sign out</span>
          </Button>
        ) : (
          <Button variant="outline" onClick={startLogin}>
            <LockKeyhole />
            Developer sign in
          </Button>
        )}
      </header>

      <main className="wifi-main">
        <section className="wifi-map-wrap" aria-label="Campus Wi-Fi heatmap">
          <div className="wifi-map-topline flex flex-wrap items-center gap-2">
            <span className="wifi-map-label">
              <MapPinned size={15} />
              {selectedBuilding?.name} <span aria-hidden="true">/</span> {activeFloor}
            </span>
            {isDeveloper && (
              <span className="wifi-map-label">
                <Signal size={14} /> Developer editing
              </span>
            )}
            <button
              type="button"
              className={`wifi-map-label cursor-pointer transition-colors ${
                gps.active ? "border-primary bg-primary text-primary-foreground font-semibold" : ""
              }`}
              onClick={gps.toggle}
              title={
                gps.active
                  ? `GPS live tracking active (${
                      gps.accuracyMeters != null
                        ? `±${Math.round(gps.accuracyMeters)}m`
                        : "Acquiring..."
                    })`
                  : "Click to track your live GPS position on campus"
              }
            >
              <Navigation size={14} className={gps.active ? "animate-pulse" : ""} />
              <span>
                {gps.active
                  ? gps.accuracyMeters != null
                    ? `GPS ±${Math.round(gps.accuracyMeters)}m`
                    : "GPS active"
                  : "Track live GPS"}
              </span>
            </button>
            {gps.active && !gps.isInsideCampus && gps.coords && (
              <span className="wifi-map-label text-destructive text-[11px]">
                Outside mapped campus area
              </span>
            )}
            {gps.error && (
              <span className="wifi-map-label text-destructive text-[11px]" title={gps.error}>
                GPS: {gps.error}
              </span>
            )}
          </div>

          <WifiCampusMap
            activeBuildingId={activeBuildingId}
            measurements={activeMeasurements}
            editing={isDeveloper}
            isDeveloper={isDeveloper}
            placingPoint={placingPoint}
            selectedPointId={selectedPointId}
            gpsLocation={
              gps.active && gps.mapPoint
                ? {
                    mapPoint: gps.mapPoint,
                    accuracyMeters: gps.accuracyMeters,
                    isInsideCampus: gps.isInsideCampus,
                  }
                : null
            }
            survey={
              survey.active
                ? { pos: survey.pos, heading: survey.heading, track: survey.track }
                : null
            }
            onSurveyTap={survey.setPos}
            onBuildingSelect={chooseBuilding}
            onMapPoint={(point) => {
              if (!placingPoint || !isDeveloper) return;
              setNewPoint(point);
              setRssiValue("-60");
              setPointError("");
            }}
            onPointSelect={(point) => {
              if (!isDeveloper) return;
              setSelectedPointId(point.id);
              setNewPoint(null);
              setPlacingPoint(false);
              setPointError("");
            }}
            onPointDrop={(pointId, point) => void moveMeasurement(pointId, point)}
          />

          {!authChecked && !loadingMap && (
            <div className="wifi-map-label absolute right-4 top-4">Checking editing access…</div>
          )}

          {authPanelOpen && !isDeveloper && (
            <div className="wifi-auth-panel" role="dialog" aria-labelledby="developer-signin-title">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 id="developer-signin-title">Developer sign in</h3>
                  <p>Sign in with one of the developer accounts to add or adjust readings.</p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Close sign-in panel"
                  onClick={() => setAuthPanelOpen(false)}
                >
                  <X />
                </Button>
              </div>
              <form onSubmit={(event) => void signInWithPassword(event)}>
                <div className="mb-3">
                  <Label className="wifi-form-label" htmlFor="developer-email">
                    Email address
                  </Label>
                  <Input
                    id="developer-email"
                    type="email"
                    autoComplete="username"
                    value={authEmail}
                    onChange={(event) => setAuthEmail(event.target.value)}
                    required
                  />
                </div>
                <div>
                  <Label className="wifi-form-label" htmlFor="developer-password">
                    Password
                  </Label>
                  <Input
                    id="developer-password"
                    type="password"
                    autoComplete="current-password"
                    value={authPassword}
                    onChange={(event) => setAuthPassword(event.target.value)}
                    required
                  />
                </div>
                <div className="wifi-auth-actions">
                  <Button type="submit" disabled={busy}>
                    <LogIn />
                    Sign in
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy}
                    onClick={() => void signInWithProvider("google")}
                  >
                    Continue with Google
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy}
                    onClick={() => void signInWithProvider("lovable")}
                  >
                    Continue with Lovable
                  </Button>
                </div>
              </form>
              {authError && (
                <p className="wifi-status" role="alert">
                  {authError}
                </p>
              )}
            </div>
          )}

          {placingPoint && !newPoint && (
            <div className="wifi-map-label absolute bottom-12 left-1/2 -translate-x-1/2 flex items-center gap-2">
              <span>Click the map to place a reading</span>
              {gps.active && gps.mapPoint && gps.isInsideCampus && (
                <>
                  <span>·</span>
                  <button
                    type="button"
                    className="underline font-semibold hover:text-primary cursor-pointer flex items-center gap-1"
                    onClick={() => {
                      if (gps.mapPoint) {
                        setNewPoint(gps.mapPoint);
                        setRssiValue(survey.live !== null ? String(survey.live) : "-60");
                        setPointError("");
                      }
                    }}
                  >
                    <Navigation size={12} /> Use GPS
                  </button>
                </>
              )}
            </div>
          )}
          <div className="wifi-map-note">
            Campus footprints are mapped from the provided survey.
          </div>
        </section>

        <aside className="wifi-sidebar" aria-label="Buildings, floors, and signal readings">
          <div className="wifi-sidebar-head">
            <p className="wifi-eyebrow">TKM · KOLLAM</p>
            <h2 className="wifi-heading">Wi-Fi coverage</h2>
          </div>

          <div className="wifi-selector-list">
            <p className="wifi-eyebrow px-1">Buildings &amp; floors</p>
            {availableAreas.map((building, index) => {
              const open = activeBuildingId === building.id;
              const isOutdoor = building.id === OPEN_AREA_ID;
              return (
                <section
                  key={building.id}
                  className={`wifi-building-row ${open ? "active" : ""} ${
                    isOutdoor ? "border-dashed" : ""
                  }`}
                >
                  <button
                    type="button"
                    className="wifi-building-select"
                    aria-expanded={open}
                    onClick={() => chooseBuilding(building.id)}
                  >
                    <span>
                      {isOutdoor ? (
                        <span className="wifi-building-number font-bold text-accent-foreground bg-accent/40 px-1 py-0.5 rounded text-[9px] uppercase tracking-wider">
                          Dev only
                        </span>
                      ) : (
                        <span className="wifi-building-number">
                          B{String(index + 1).padStart(2, "0")}
                        </span>
                      )}
                      <span className="ml-2 text-sm font-semibold">{building.name}</span>
                    </span>
                    {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </button>
                  {open && (
                    <div className="wifi-floor-list" aria-label={`${building.name} floors`}>
                      {building.floors.map((floor) => (
                        <button
                          key={floor}
                          type="button"
                          className="wifi-floor-button"
                          aria-pressed={activeFloor === floor}
                          onClick={() => chooseFloor(building.id, floor)}
                        >
                          {floor}
                        </button>
                      ))}
                    </div>
                  )}
                </section>
              );
            })}
          </div>

          <div className="wifi-summary" aria-live="polite">
            <div className="wifi-summary-item">
              <span className="wifi-summary-value">{activeMeasurements.length}</span>
              <span className="wifi-summary-label">Readings on this floor</span>
            </div>
            <div className="wifi-summary-item">
              <span className="wifi-summary-value">
                {averageRssi === null ? "—" : `${averageRssi} dBm`}
              </span>
              <span className="wifi-summary-label">Average signal</span>
            </div>
          </div>

          <div className="wifi-legend" aria-label="Signal strength legend">
            {[
              ["strong", "≥ −50"],
              ["good", "−50 to −60"],
              ["fair", "−60 to −70"],
              ["weak", "−70 to −80"],
              ["poor", "< −80"],
            ].map(([band, label]) => (
              <span className="wifi-legend-item" key={band}>
                <span className={`wifi-legend-dot ${band === "strong" ? "" : band}`} />
                {label} dBm
              </span>
            ))}
          </div>

          {isDeveloper && (
            <div className="wifi-editor">
              <div className="wifi-editor-title">
                <span>
                  {selectedMeasurement
                    ? "Adjust reading"
                    : newPoint
                      ? "New reading"
                      : "Developer tools"}
                </span>
                {selectedMeasurement && (
                  <span className={`wifi-legend-dot ${signalBand(selectedMeasurement.rssi_dbm)}`} />
                )}
              </div>
              {!selectedMeasurement && !newPoint && (
                <SurveyControls
                  survey={survey}
                  buildingId={activeBuildingId}
                  floor={activeFloor}
                  busy={busy}
                  onSave={saveSurveyReading}
                  gpsPoint={gps.active && gps.mapPoint ? gps.mapPoint : null}
                  gpsAccuracy={gps.accuracyMeters}
                />
              )}
              {!selectedMeasurement && !newPoint ? (
                <Button className="w-full" onClick={beginAddingPoint} disabled={busy}>
                  <Plus />
                  Add measurement point
                </Button>
              ) : (
                <form onSubmit={(event) => void saveMeasurement(event)}>
                  {placingPoint &&
                    !newPoint &&
                    gps.active &&
                    gps.mapPoint &&
                    gps.isInsideCampus && (
                      <Button
                        type="button"
                        variant="outline"
                        className="w-full mb-3 text-xs"
                        onClick={() => {
                          if (gps.mapPoint) {
                            setNewPoint(gps.mapPoint);
                            setRssiValue(survey.live !== null ? String(survey.live) : "-60");
                            setPointError("");
                          }
                        }}
                      >
                        <Navigation size={13} /> Set to current GPS location (±
                        {Math.round(gps.accuracyMeters ?? 0)}m)
                      </Button>
                    )}
                  <div className="wifi-form-row">
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <Label className="wifi-form-label mb-0" htmlFor="rssi-value">
                          Signal (dBm)
                        </Label>
                        {survey.live !== null && (
                          <button
                            type="button"
                            className="text-[10px] text-primary underline cursor-pointer"
                            onClick={() => setRssiValue(String(survey.live))}
                            title="Fill with latest live scanned Wi-Fi signal"
                          >
                            Live: {survey.live} dBm
                          </button>
                        )}
                      </div>
                      <Input
                        id="rssi-value"
                        type="number"
                        min={-120}
                        max={0}
                        step={1}
                        value={rssiValue}
                        onChange={(event) => setRssiValue(event.target.value)}
                        required
                      />
                    </div>
                    <div>
                      <span className="wifi-form-label">Position</span>
                      <span className="block pt-2 font-mono text-xs text-muted-foreground">
                        {Math.round((newPoint ?? selectedMeasurement)?.x ?? 0)},{" "}
                        {Math.round((newPoint ?? selectedMeasurement)?.y ?? 0)}
                      </span>
                    </div>
                  </div>
                  {pointError && (
                    <p className="wifi-status" role="alert">
                      {pointError}
                    </p>
                  )}
                  <div className="wifi-form-actions">
                    <Button type="submit" disabled={busy}>
                      <Save />
                      Save
                    </Button>
                    {selectedMeasurement && (
                      <Button
                        type="button"
                        variant="destructive"
                        size="icon"
                        aria-label="Delete reading"
                        disabled={busy}
                        onClick={() => void deleteMeasurement()}
                      >
                        <Trash2 />
                      </Button>
                    )}
                    <Button type="button" variant="outline" onClick={cancelEditing} disabled={busy}>
                      Cancel
                    </Button>
                  </div>
                  <p className="mt-2 text-[10px] text-muted-foreground">
                    Drag a point on the map to adjust its position.
                  </p>
                </form>
              )}
              {pointError && !selectedMeasurement && !newPoint && (
                <p className="wifi-status" role="alert">
                  {pointError}
                </p>
              )}
              {user?.email && (
                <p className="mt-3 truncate text-[10px] text-muted-foreground">
                  Editing as {user.email}
                </p>
              )}
            </div>
          )}

          {!isDeveloper && (
            <div className="wifi-editor">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Wifi size={15} />
                <span>Public view · measurements are read-only</span>
              </div>
              <Button variant="outline" className="mt-3 w-full" onClick={startLogin}>
                <LockKeyhole />
                Developer sign in
              </Button>
            </div>
          )}
        </aside>
      </main>
    </div>
  );
}
