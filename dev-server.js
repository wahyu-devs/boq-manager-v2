const rootDirectory = Deno.cwd();
const hostname = "127.0.0.1";
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();
const reloadClients = new Set();

const contentTypes = {
  css: "text/css; charset=utf-8",
  gif: "image/gif",
  html: "text/html; charset=utf-8",
  ico: "image/x-icon",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  js: "text/javascript; charset=utf-8",
  json: "application/json; charset=utf-8",
  pdf: "application/pdf",
  png: "image/png",
  svg: "image/svg+xml",
  webp: "image/webp",
  woff: "font/woff",
  woff2: "font/woff2",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

const reloadClient = `
<script data-live-preview>
  (() => {
    const events = new EventSource("/__live_reload");
    events.addEventListener("open", () => {
      console.info("[Live preview] connected.");
    });
    events.addEventListener("reload", () => {
      console.info("[Live preview] change detected; reloading.");
      window.location.reload();
    });
  })();
</script>`;

function optionValue(name) {
  const prefix = `--${name}=`;
  const inline = Deno.args.find((argument) => argument.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = Deno.args.indexOf(`--${name}`);
  return index >= 0 ? Deno.args[index + 1] : undefined;
}

function previewPort() {
  const value = optionValue("port") || "8080";
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid port: ${value}`);
  }
  return port;
}

function requestedPath(pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch (_error) {
    return null;
  }
  if (decoded.includes("\\") || decoded.includes("\0")) return null;
  const parts = decoded.split("/").filter(Boolean);
  if (
    parts.some((part) => part === "." || part === ".." || part.startsWith("."))
  ) return null;
  if (!parts.length || decoded.endsWith("/")) parts.push("index.html");
  return `${rootDirectory}/${parts.join("/")}`;
}

function extension(path) {
  const filename = path.split("/").at(-1) || "";
  const dot = filename.lastIndexOf(".");
  return dot < 0 ? "" : filename.slice(dot + 1).toLowerCase();
}

function injectReloadClient(html) {
  const closingBody = html.lastIndexOf("</body>");
  return closingBody >= 0
    ? `${html.slice(0, closingBody)}${reloadClient}\n${html.slice(closingBody)}`
    : `${html}${reloadClient}`;
}

function liveReloadResponse(request) {
  let clientController;
  const body = new ReadableStream({
    start(controller) {
      clientController = controller;
      reloadClients.add(controller);
      controller.enqueue(textEncoder.encode(": connected\n\n"));
    },
    cancel() {
      reloadClients.delete(clientController);
    },
  });
  request.signal.addEventListener("abort", () => {
    reloadClients.delete(clientController);
  }, { once: true });
  return new Response(body, {
    headers: {
      "cache-control": "no-cache, no-transform",
      "connection": "keep-alive",
      "content-type": "text/event-stream",
    },
  });
}

async function staticResponse(request, pathname) {
  let path = requestedPath(pathname);
  if (!path) return new Response("Bad request", { status: 400 });

  try {
    const information = await Deno.stat(path);
    if (information.isDirectory) path = `${path}/index.html`;
    const file = await Deno.readFile(path);
    const type = extension(path);
    const body = type === "html"
      ? textEncoder.encode(injectReloadClient(textDecoder.decode(file)))
      : file;
    return new Response(request.method === "HEAD" ? null : body, {
      headers: {
        "cache-control": "no-store",
        "content-type": contentTypes[type] || "application/octet-stream",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      return new Response("Not found", { status: 404 });
    }
    console.error(error);
    return new Response("Unable to read file", { status: 500 });
  }
}

async function handleRequest(request) {
  const url = new URL(request.url);
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method not allowed", {
      status: 405,
      headers: { allow: "GET, HEAD" },
    });
  }
  if (url.pathname === "/__live_reload") {
    return request.method === "GET"
      ? liveReloadResponse(request)
      : new Response(null, { status: 405, headers: { allow: "GET" } });
  }
  return await staticResponse(request, url.pathname);
}

function relevantChange(paths) {
  return paths.some((path) =>
    !path.includes("/.git/") &&
    !path.endsWith("/.DS_Store") &&
    !path.endsWith("~")
  );
}

function notifyReload() {
  const message = textEncoder.encode("event: reload\ndata: changed\n\n");
  reloadClients.forEach((controller) => {
    try {
      controller.enqueue(message);
    } catch (_error) {
      reloadClients.delete(controller);
    }
  });
}

async function watchForChanges() {
  const watcher = Deno.watchFs(rootDirectory, { recursive: true });
  let reloadTimer;
  for await (const event of watcher) {
    if (!relevantChange(event.paths)) continue;
    clearTimeout(reloadTimer);
    reloadTimer = setTimeout(notifyReload, 120);
  }
}

const port = previewPort();
Deno.serve({ hostname, port }, handleRequest);
console.log(`BOQ Manager preview: http://${hostname}:${port}`);
console.log("Live reload is active. Press Ctrl+C to stop.");
await watchForChanges();
