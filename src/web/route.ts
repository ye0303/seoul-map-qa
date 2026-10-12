import { useEffect, useMemo, useState } from "react";

export type ThemeTab = "findings" | "versions";

export type Route =
  | { readonly page: "home" }
  | { readonly page: "department"; readonly department: string }
  | { readonly page: "theme"; readonly themeId: string; readonly tab: ThemeTab }
  | { readonly page: "diff"; readonly themeId: string; readonly from: string; readonly to: string }
  | { readonly page: "rules" }
  | { readonly page: "notFound" };

/** 해시 주소(`#/theme/123/versions`)를 화면으로. 정적 배포라 서버 라우팅 없이 해시만 쓴다. */
export function parseRoute(hash: string): Route {
  let parts: string[];
  try {
    parts = hash
      .replace(/^#\/?/, "")
      .split("/")
      .filter(Boolean)
      .map((part) => decodeURIComponent(part));
  } catch {
    return { page: "notFound" }; // 잘못된 %인코딩
  }
  const [first, second, third, fourth, fifth] = parts;
  if (!first) return { page: "home" };
  if (first === "rules" && !second) return { page: "rules" };
  if (first === "dept" && second && !third) return { page: "department", department: second };
  if (first === "theme" && second) {
    if (third === "diff" && fourth && fifth) return { page: "diff", themeId: second, from: fourth, to: fifth };
    if (!third) return { page: "theme", themeId: second, tab: "findings" };
    if (third === "versions" && !fourth) return { page: "theme", themeId: second, tab: "versions" };
  }
  return { page: "notFound" };
}

const encode = encodeURIComponent;

export const href = {
  home: () => "#/",
  rules: () => "#/rules",
  department: (name: string) => `#/dept/${encode(name)}`,
  theme: (themeId: string, tab: ThemeTab = "findings") => `#/theme/${encode(themeId)}${tab === "versions" ? "/versions" : ""}`,
  diff: (themeId: string, from: string, to: string) => `#/theme/${encode(themeId)}/diff/${encode(from)}/${encode(to)}`,
};

export function useRoute(): Route {
  const [hash, setHash] = useState(() => window.location.hash);
  useEffect(() => {
    const onChange = () => {
      setHash(window.location.hash);
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return useMemo(() => parseRoute(hash), [hash]);
}
