export type CampusBuilding = {
  id: string;
  name: string;
  floors: string[];
  footprint: MapPoint[];
};

export type MeasurementDraft = {
  building_id: string;
  floor_name: string;
  x: number;
  y: number;
  rssi_dbm: number;
};

export type MapPoint = { x: number; y: number };

const mapPoint = (latitude: number, longitude: number): MapPoint => ({
  x: 500 + (longitude - 76.6321) * 220_000,
  y: 50 + (8.9155 - latitude) * 221_000,
});

const fromLatLng = (coordinates: [number, number][]): MapPoint[] =>
  coordinates.map(([latitude, longitude]) => mapPoint(latitude, longitude));

export const CAMPUS_BOUNDARY = fromLatLng([
  [8.9155382, 76.6320583],
  [8.9118006, 76.6309711],
  [8.9120427, 76.6331849],
  [8.9128672, 76.6331706],
  [8.9140377, 76.6333405],
  [8.914174, 76.6326164],
  [8.9144854, 76.63263],
  [8.9154612, 76.6326875],
  [8.9155232, 76.6321317],
]);

export const CAMPUS_CONTEXT = [
  {
    name: "Ground",
    footprint: fromLatLng([
      [8.9135876, 76.6326315],
      [8.9126577, 76.6324097],
      [8.9125445, 76.633052],
      [8.9134427, 76.6332183],
    ]),
  },
  {
    name: "Workshop Block",
    footprint: fromLatLng([
      [8.9140246, 76.6327056],
      [8.9137007, 76.6326273],
      [8.9136685, 76.6327699],
      [8.9135578, 76.6327481],
      [8.9134475, 76.6331976],
      [8.9139589, 76.6333333],
      [8.9140447, 76.6330309],
      [8.9139398, 76.6329926],
    ]),
  },
  {
    name: "Auditorium",
    footprint: fromLatLng([
      [8.9139762, 76.6320602],
      [8.9136512, 76.6319724],
      [8.9135912, 76.6322505],
      [8.9138995, 76.6323255],
    ]),
  },
];

export const CAMPUS_BUILDINGS: CampusBuilding[] = [
  {
    id: "civil",
    name: "Civil Block",
    floors: ["Ground Floor", "1st Floor"],
    footprint: fromLatLng([
      [8.9148353, 76.632567],
      [8.9149693, 76.6321473],
      [8.9143868, 76.6319771],
      [8.914344, 76.6321219],
      [8.9144828, 76.6321579],
      [8.9144009, 76.6324475],
    ]),
  },
  {
    id: "main",
    name: "Main Building",
    floors: ["Ground Floor", "1st Floor", "2nd Floor"],
    footprint: fromLatLng([
      [8.9142725, 76.6319348],
      [8.9143005, 76.6318471],
      [8.9141681, 76.6318082],
      [8.9141403, 76.6319013],
      [8.9134781, 76.6317042],
      [8.9133402, 76.6321169],
      [8.9135944, 76.6322035],
      [8.913651, 76.6319581],
      [8.9138242, 76.6320122],
      [8.9138338, 76.6319882],
      [8.9139957, 76.632038],
      [8.9139382, 76.6322355],
      [8.913997, 76.6322514],
      [8.9139615, 76.6323825],
      [8.9142352, 76.6323815],
      [8.9143839, 76.632362],
    ]),
  },
  {
    id: "arch",
    name: "Arch Block",
    floors: ["Ground Floor", "1st Floor", "2nd Floor"],
    footprint: fromLatLng([
      [8.9137333, 76.6322558],
      [8.9131723, 76.6320798],
      [8.9131136, 76.6323169],
      [8.9136775, 76.6324571],
    ]),
  },
  {
    id: "mech",
    name: "Mechanical Block",
    floors: ["Ground Floor", "1st Floor", "2nd Floor", "3rd Floor"],
    footprint: fromLatLng([
      [8.9132468, 76.6316432],
      [8.9126969, 76.6314829],
      [8.9125414, 76.6320592],
      [8.9130646, 76.632265],
    ]),
  },
  {
    id: "chem",
    name: "Chemical Block",
    floors: ["Ground Floor", "1st Floor", "2nd Floor", "3rd Floor"],
    footprint: fromLatLng([
      [8.9126975, 76.6314509],
      [8.9123258, 76.6313456],
      [8.9122044, 76.6318227],
      [8.9125573, 76.6319424],
    ]),
  },
];

export const campusLandmarks = [
  { name: "Library", ...mapPoint(8.916439, 76.633177) },
  { name: "Bookstore", ...mapPoint(8.915936, 76.632676) },
  { name: "Hostel Mess", ...mapPoint(8.913887, 76.632228) },
];

export function polygonPoints(points: MapPoint[]): string {
  return points.map(({ x, y }) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
}

export function signalBand(rssi: number): "strong" | "good" | "fair" | "weak" | "poor" {
  if (rssi >= -50) return "strong";
  if (rssi >= -60) return "good";
  if (rssi >= -70) return "fair";
  if (rssi >= -80) return "weak";
  return "poor";
}

export function isMeasurementDraftValid(draft: MeasurementDraft): boolean {
  const building = CAMPUS_BUILDINGS.find(({ id }) => id === draft.building_id);
  return Boolean(
    building &&
      building.floors.includes(draft.floor_name) &&
      Number.isFinite(draft.x) &&
      draft.x >= 0 &&
      draft.x <= 1000 &&
      Number.isFinite(draft.y) &&
      draft.y >= 0 &&
      draft.y <= 900 &&
      Number.isInteger(draft.rssi_dbm) &&
      draft.rssi_dbm >= -120 &&
      draft.rssi_dbm <= 0,
  );
}