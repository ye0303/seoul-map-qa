// 실행 ID와 git 태그. 배치가 만들고 화면이 과거 버전을 찾을 때 쓴다.

/** 실행 ID("2026-10-08T14:58") → git 태그("snap-2026-10-08-1458"). 태그 이름에는 ":"를 쓸 수 없다. */
export function runTag(runId: string): string {
  return `snap-${runId.replace("T", "-").replace(":", "")}`;
}

/** 한국 시각 기준 "YYYY-MM-DDTHH:mm". 실행 ID이자 버전 이름(실행 시작 시각 기준). */
export function koreanMinute(date: Date): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(date)
      .map((part) => [part.type, part.value]),
  );
  return `${parts["year"]}-${parts["month"]}-${parts["day"]}T${parts["hour"]}:${parts["minute"]}`;
}
