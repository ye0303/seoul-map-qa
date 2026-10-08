type Position = readonly number[];
type Ring = readonly Position[];
type PolygonRings = readonly Ring[];

/** seoul-go `seoulDistrictBoundaries.json`과 같은 형태의 자치구 경계 GeoJSON. */
export type DistrictGeoJson = {
  readonly features: readonly {
    readonly properties: { readonly name: string };
    readonly geometry:
      | { readonly type: "Polygon"; readonly coordinates: PolygonRings }
      | { readonly type: "MultiPolygon"; readonly coordinates: readonly PolygonRings[] };
  }[];
};

export type DistrictIndex = {
  /** 점(경도, 위도)이 속한 자치구 이름. 서울 밖이면 null. */
  districtAt(lng: number, lat: number): string | null;
  /** 점에서 해당 자치구까지의 거리(m). 안에 있으면 0, 모르는 이름이면 Infinity. */
  distanceToDistrictM(name: string, lng: number, lat: number): number;
  /** 점에서 서울(25개 구 전체)까지의 거리(m). 서울 안이면 0. */
  distanceToSeoulM(lng: number, lat: number): number;
};

type District = {
  readonly name: string;
  readonly polygons: readonly PolygonRings[];
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
};

const METERS_PER_DEGREE = (Math.PI / 180) * 6_371_008.8;

export function createDistrictIndex(geojson: DistrictGeoJson): DistrictIndex {
  const districts = geojson.features.map(toDistrict);
  const byName = new Map(districts.map((district) => [district.name, district]));
  const contains = (district: District, lng: number, lat: number) =>
    lng >= district.minX &&
    lng <= district.maxX &&
    lat >= district.minY &&
    lat <= district.maxY &&
    district.polygons.some((polygon) => insidePolygon(lng, lat, polygon));
  const distanceTo = (district: District, lng: number, lat: number) =>
    contains(district, lng, lat) ? 0 : distanceToEdges(district, lng, lat);

  return {
    districtAt(lng, lat) {
      return districts.find((district) => contains(district, lng, lat))?.name ?? null;
    },
    distanceToDistrictM(name, lng, lat) {
      const district = byName.get(name);
      return district ? distanceTo(district, lng, lat) : Infinity;
    },
    distanceToSeoulM(lng, lat) {
      if (districts.some((district) => contains(district, lng, lat))) return 0;
      // 경계 상자가 가까운 구부터 보고, 상자까지 거리가 지금까지의 최솟값 이상인 구는 건너뛴다.
      const byBox = districts.map((district) => ({ district, box: boxDistance(district, lng, lat) })).sort((a, b) => a.box - b.box);
      let best = Infinity;
      for (const { district, box } of byBox) {
        if (box >= best) break;
        best = Math.min(best, distanceToEdges(district, lng, lat));
      }
      return best;
    },
  };
}

function toDistrict(feature: DistrictGeoJson["features"][number]): District {
  const geometry = feature.geometry;
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const polygon of polygons) {
    for (const ring of polygon) {
      for (const [x = NaN, y = NaN] of ring) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }
  return { name: feature.properties.name, polygons, minX, minY, maxX, maxY };
}

/** 짝홀 규칙: 외곽선과 구멍을 모두 세어 홀수 번 감싸이면 안쪽. */
function insidePolygon(x: number, y: number, polygon: PolygonRings): boolean {
  let inside = false;
  for (const ring of polygon) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi = NaN, yi = NaN] = ring[i]!;
      const [xj = NaN, yj = NaN] = ring[j]!;
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
  }
  return inside;
}

/** 점에서 구의 경계 상자까지의 거리(m). 경계선까지의 거리보다 항상 작거나 같다. */
function boxDistance(district: District, lng: number, lat: number): number {
  const kx = Math.cos((lat * Math.PI) / 180) * METERS_PER_DEGREE;
  const dx = Math.max(district.minX - lng, 0, lng - district.maxX) * kx;
  const dy = Math.max(district.minY - lat, 0, lat - district.maxY) * METERS_PER_DEGREE;
  return Math.hypot(dx, dy);
}

/** 점에서 구 경계선까지의 최단 거리(m). 점 주변을 평면으로 근사한다. */
function distanceToEdges(district: District, lng: number, lat: number): number {
  const kx = Math.cos((lat * Math.PI) / 180) * METERS_PER_DEGREE;
  let best = Infinity;
  for (const polygon of district.polygons) {
    for (const ring of polygon) {
      for (let i = 1; i < ring.length; i++) {
        const [ax = NaN, ay = NaN] = ring[i - 1]!;
        const [bx = NaN, by = NaN] = ring[i]!;
        best = Math.min(
          best,
          distanceToSegment((ax - lng) * kx, (ay - lat) * METERS_PER_DEGREE, (bx - lng) * kx, (by - lat) * METERS_PER_DEGREE),
        );
      }
    }
  }
  return best;
}

/** 원점에서 선분 (ax, ay)–(bx, by)까지의 거리. */
function distanceToSegment(ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / lengthSquared));
  return Math.hypot(ax + t * dx, ay + t * dy);
}
