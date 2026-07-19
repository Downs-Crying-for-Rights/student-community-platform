import { createServer, type Server } from "node:http";

export interface Readiness {
  isReady(): boolean;
}

export function startHealthServer(host: string, port: number, readiness: Readiness): Server {
  const server = createServer((request, response) => {
    if (request.method === "GET" && request.url === "/livez") {
      response.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
      response.end('{"status":"live"}');
      return;
    }
    if (request.method === "GET" && request.url === "/healthz") {
      const ready = readiness.isReady();
      response.writeHead(ready ? 200 : 503, { "content-type": "application/json", "cache-control": "no-store" });
      response.end(ready ? '{"status":"ready"}' : '{"status":"not_ready"}');
      return;
    }
    response.writeHead(404, { "content-type": "application/json", "cache-control": "no-store" });
    response.end('{"error":"not_found"}');
  });
  server.listen(port, host);
  return server;
}
