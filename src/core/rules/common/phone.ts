import { text } from "../../model/row.ts";
import type { FindingDraft, Rule, Severity } from "../types.ts";

// 2026-10-08 공개 테마 전체의 전화번호 값 419가지 형태를 보고 정했다.

const URL_ENCODED = /%[0-9A-Fa-f]{2}/;

/** 시민 화면에 깨진 값으로 보이는 것들. */
const BROKEN_VALUES: readonly { pattern: RegExp; reason: string }[] = [
  { pattern: URL_ENCODED, reason: "URL 인코딩된 문자(%XX)가 섞여 있습니다" },
  { pattern: /https?:\/\/|www\.|\.(com|kr|net|org)\b/i, reason: "링크(URL)가 들어 있습니다" },
  { pattern: /&[a-z]+;|nbsp/i, reason: "HTML 특수문자가 섞여 있습니다" },
  { pattern: /\uFFFD/, reason: "글자가 깨져 있습니다" },
  { pattern: /^(null|undefined|nan)$/i, reason: "번호 대신 'null' 같은 값이 들어 있습니다" },
  { pattern: /en-?cry-?pt|cipher/i, reason: "암호화된 값이 그대로 들어 있습니다" },
];

/** 번호가 없다는 뜻으로 넣은 표시. 잘못은 아니지만 비워 두는 편이 낫다. */
const PLACEHOLDER = /^([-.\s]+|없음|전화없음|번호없음|미제공|업체미제공|정보없음|해당없음|비공개)$/;

/** 숫자만 남긴 번호의 올바른 구조. */
const VALID_NUMBERS: readonly RegExp[] = [
  /^02\d{7,8}$/, // 서울
  /^0(3[1-3]|4[1-4]|5[1-5]|6[1-4])\d{7,8}$/, // 지역번호
  /^01[016789]\d{7,8}$/, // 휴대전화
  /^070\d{7,8}$/, // 인터넷전화
  /^050[2-8]\d{7,8}$/, // 안심번호
  /^080\d{7,8}$/, // 수신자 부담
  /^1[5-9]\d{6}$/, // 대표번호 (1588-0000 등)
];

/** 특수번호(112, 120, 1330 등)와 휴대전화에서 거는 지역번호 + 특수번호(02-120 등). 끝자리 4자리 규칙을 따르지 않는다. */
const SPECIAL_NUMBER = /^((02|0[3-6][1-5])1\d{2}|1\d{2,3})$/;

type Issue = { readonly severity: Severity; readonly reason: string; readonly suggestion?: string };

export const phoneFormat: Rule = {
  id: "C-10",
  title: "전화번호 형식",
  check: ({ facts }) =>
    facts.flatMap((fact): FindingDraft[] => {
      const value = text(fact.row, "COT_TEL_NO");
      const issue = checkPhone(value);
      if (!issue) return [];
      return [
        {
          severity: issue.severity,
          contsId: fact.key,
          field: "COT_TEL_NO",
          value,
          ...(issue.suggestion ? { suggestion: issue.suggestion } : {}),
          message: `전화번호: ${issue.reason}.`,
        },
      ];
    }),
};

/** 전화번호 값 하나를 판정한다. 문제가 없으면 null. */
export function checkPhone(raw: string): Issue | null {
  const value = raw.trim();
  if (value === "") return null;
  const broken = BROKEN_VALUES.find(({ pattern }) => pattern.test(value));
  if (broken) {
    const decoded = URL_ENCODED.test(value) ? decodeUrlText(value) : null;
    return { severity: "error", reason: broken.reason, ...(decoded ? { suggestion: decoded } : {}) };
  }
  if (PLACEHOLDER.test(value)) return { severity: "info", reason: "번호 대신 '-'·'없음' 같은 표시가 들어 있습니다" };

  const parts = value
    .replace(/\([^)]*[가-힣A-Za-z][^)]*\)/g, " ") // (관리사무소) 같은 설명
    .replace(/(?<=\d)\s*\(\s*\d{1,5}\s*\)/g, " ") // 02-431-3535(3206) 같은 내선
    .replace(/[~∼～]\s*\d{1,4}(?!\d)/g, " ") // 02-2627-2503~4 같은 범위
    .split(/[,/]|\s+(?=0\d)/)
    .map((part) => ({ part, digits: part.replace(/\D/g, "") }))
    .filter(({ digits }) => digits !== "");
  if (parts.length === 0) return { severity: "suspect", reason: "번호가 없습니다" };

  const hasValidNumber = parts.some(({ digits }) => isValidNumber(digits) || SPECIAL_NUMBER.test(digits));
  const issues = parts.flatMap(({ part, digits }): Issue[] => {
    if (SPECIAL_NUMBER.test(digits)) return [];
    if (isValidNumber(digits)) {
      const groups = part.split(/\D+/).filter(Boolean);
      return groups.length >= 2 && groups.at(-1)!.length < 4 ? [{ severity: "suspect", reason: "끝자리가 4자리가 아닙니다" }] : [];
    }
    // 앞 번호의 지역번호를 생략한 줄임 표기 (02-2258-4300,4100 / 02-820-9818,832-2445)
    if (hasValidNumber && (digits.length <= 4 || (/^[2-9]/.test(digits) && digits.length <= 8))) return [];
    if (/^[1-9]/.test(digits) && digits.length >= 9 && isValidNumber(`0${digits}`)) {
      return [{ severity: "suspect", reason: "앞자리 0이 빠진 것 같습니다", suggestion: formatNumber(`0${digits}`) }];
    }
    if (/^[2-9]/.test(digits) && digits.length >= 7 && digits.length <= 8) {
      return [{ severity: "suspect", reason: "지역번호가 없습니다" }];
    }
    return [{ severity: "suspect", reason: "자릿수가 맞지 않습니다" }];
  });
  return issues[0] ?? null;
}

/** `02%29+364-4686` → `02) 364-4686`. 풀 수 없으면 null. */
function decodeUrlText(value: string): string | null {
  try {
    return decodeURIComponent(value.replace(/\+/g, " ")).trim();
  } catch {
    return null;
  }
}

function isValidNumber(digits: string): boolean {
  return VALID_NUMBERS.some((pattern) => pattern.test(digits));
}

/** 숫자만 있는 올바른 번호를 하이픈 형식으로. */
function formatNumber(digits: string): string {
  const prefixLength = digits.startsWith("02") ? 2 : /^050/.test(digits) ? 4 : /^1/.test(digits) ? 4 : 3;
  const prefix = digits.slice(0, prefixLength);
  const rest = digits.slice(prefixLength);
  if (rest.length <= 4) return `${prefix}-${rest}`;
  return `${prefix}-${rest.slice(0, -4)}-${rest.slice(-4)}`;
}
