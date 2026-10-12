import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // 화면 테스트(tests/web/*.test.tsx)의 JSX 변환.
  plugins: [react()],
  test: {
    include: ["tests/**/*.test.{ts,tsx}"],
    // 배치 테스트는 임시 폴더에 data/를 여러 번 쓴다. Windows에서 병렬 실행 시 5초 기본값을 넘길 때가 있다.
    testTimeout: 30_000,
  },
});
