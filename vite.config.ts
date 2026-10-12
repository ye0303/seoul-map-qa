import { cpSync, createReadStream, statSync } from "node:fs";
import { extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

const projectDir = fileURLToPath(new URL(".", import.meta.url));
const dataDir = join(projectDir, "data");
const outDir = join(projectDir, "dist");

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  ".json": "application/json; charset=utf-8",
  ".ndjson": "application/x-ndjson; charset=utf-8",
};

/** 개발 서버: 배치 결과 data/를 /data/로 내준다. 없는 파일은 index.html 대신 404. */
const serveData: Plugin = {
  name: "serve-data",
  apply: "serve",
  configureServer(server) {
    server.middlewares.use("/data", (request, response) => {
      const path = resolve(dataDir, `.${decodeURIComponent(new URL(request.url ?? "/", "http://localhost").pathname)}`);
      if (!path.startsWith(dataDir + sep) || !statSync(path, { throwIfNoEntry: false })?.isFile()) {
        response.statusCode = 404;
        response.end();
        return;
      }
      response.setHeader("Content-Type", CONTENT_TYPES[extname(path)] ?? "application/octet-stream");
      createReadStream(path).pipe(response);
    });
  },
};

/** 빌드: data/를 dist/data/로 복사한다. Pages가 대시보드와 지금 버전 데이터를 함께 내준다. */
const copyData: Plugin = {
  name: "copy-data",
  apply: "build",
  writeBundle() {
    cpSync(dataDir, join(outDir, "data"), { recursive: true });
  },
};

export default defineConfig({
  root: "src/web",
  plugins: [react(), serveData, copyData],
  build: { outDir, emptyOutDir: true },
});
