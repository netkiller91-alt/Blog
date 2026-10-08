// src/ 를 묶어 _site/ 를 만듭니다. --serve 를 주면 로컬 서버도 띄웁니다.
//   npm run build   → _site/ 생성 (GitHub Pages 가 그대로 배포)
//   npm run dev     → 빌드 후 http://localhost:5173

import { build } from "esbuild";
import { cp, mkdir, rm, readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";

const OUT = "_site";

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });

await build({
  entryPoints: ["src/main.js"],
  bundle: true,
  format: "esm",
  target: "es2022",
  minify: true,
  outfile: join(OUT, "app.js"),
  logLevel: "warning",
});
await cp("src/index.html", join(OUT, "index.html"));
await cp("src/styles.css", join(OUT, "styles.css"));
await cp("public", OUT, { recursive: true });

console.log(`빌드 완료 → ${OUT}/`);

if (process.argv.includes("--serve")) {
  const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".xml": "application/xml", ".map": "application/json", ".txt": "text/plain" };
  const port = Number(process.env.PORT) || 5173;
  createServer(async (req, res) => {
    const path = new URL(req.url, "http://x").pathname;
    const file = join(OUT, normalize(path === "/" ? "/index.html" : path).replace(/^(\.\.[/\\])+/, ""));
    try {
      const body = await readFile(file);
      res.writeHead(200, { "Content-Type": types[extname(file)] || "application/octet-stream" });
      res.end(body);
    } catch {
      res.writeHead(404).end("not found");
    }
  }).listen(port, () => console.log(`http://localhost:${port}`));
}
