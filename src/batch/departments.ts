// 담당 부서는 OpenAPI에 없어 공개 갤러리가 쓰는 내부 엔드포인트에서 받는다(D-005, 보조 정보).
// 그 엔드포인트의 키는 갤러리 페이지 스크립트에 공개돼 있어, 저장소에 두지 않고 실행할 때마다 읽는다.

const GALLERY_SCRIPT_URL = "https://map.seoul.go.kr/smgis2/file/smgis3/themeGallery/index.js";
const GALLERY_API_URL = "https://map.seoul.go.kr/smgis/apps/theme.do";

export type Department = {
  /** 화면에 보일 담당: "서울시 관광정책과", "성북구 문화체육과", "세이브더칠드런" 등. 정보가 없으면 null. */
  readonly label: string | null;
  /** 갤러리 원본 값 THM_MNG_TYPE_01~03 (01: 1 서울시, 2 자치구, 0 외부 기관 등). */
  readonly codes: readonly [string, string, string];
};

/** 테마 ID → 담당 부서. 실패하면 오류를 던진다(배치가 이전 값을 쓴다). */
export async function fetchDepartments(fetchImpl: typeof fetch = fetch): Promise<Map<string, Department>> {
  const script = await (await fetchImpl(GALLERY_SCRIPT_URL, { signal: AbortSignal.timeout(30_000) })).text();
  const key = /key=([0-9a-f]{32})/.exec(script)?.[1];
  if (!key) throw new Error("갤러리 스크립트에서 키를 찾지 못했습니다");
  const response = await fetchImpl(GALLERY_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8" },
    body: new URLSearchParams({ cmd: "themeGalleryListPage", key, sort: "0", theme_type: "'1','2','4','5'" }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok) throw new Error(`갤러리 HTTP ${response.status}`);
  const parsed: unknown = await response.json();
  const body = typeof parsed === "object" && parsed !== null && "body" in parsed ? parsed.body : null;
  if (!Array.isArray(body)) throw new Error("갤러리 응답 형식 오류");
  const departments = new Map<string, Department>();
  for (const item of body as Record<string, unknown>[]) {
    const id = String(item["THM_THEME_ID"] ?? "");
    if (id) departments.set(id, toDepartment(item));
  }
  return departments;
}

export function toDepartment(item: Readonly<Record<string, unknown>>): Department {
  const [kind, district, office] = (["THM_MNG_TYPE_01", "THM_MNG_TYPE_02", "THM_MNG_TYPE_03"] as const).map((name) =>
    String(item[name] ?? "").trim(),
  ) as [string, string, string];
  const label = [kind === "1" ? "서울시" : district, office].filter(Boolean).join(" ");
  return { label: label || null, codes: [kind, district, office] };
}
