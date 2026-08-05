const path = require("path");

const readRequestBody = (req) =>
  new Promise((resolve, reject) => {
    if (req.body !== undefined && req.body !== null && req.body !== "") {
      resolve(req.body);
      return;
    }

    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw) {
        resolve(undefined);
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch {
        resolve(raw);
      }
    });
    req.on("error", reject);
  });

const invokeHandler = async (handler, req, res) => {
  const vercelReq = {
    method: req.method,
    url: req.originalUrl,
    headers: req.headers,
    query: { ...req.query },
    body: await readRequestBody(req),
  };

  let statusCode = 200;
  let ended = false;

  const vercelRes = {
    status(code) {
      statusCode = code;
      res.statusCode = code;
      return vercelRes;
    },
    setHeader(name, value) {
      res.setHeader(name, value);
      return vercelRes;
    },
    json(body) {
      if (ended) {
        return vercelRes;
      }
      ended = true;
      res.setHeader("Content-Type", "application/json");
      res.statusCode = statusCode;
      res.end(JSON.stringify(body));
      return vercelRes;
    },
    end(data) {
      if (ended) {
        return vercelRes;
      }
      ended = true;
      res.end(data);
      return vercelRes;
    },
  };

  await handler(vercelReq, vercelRes);

  if (!ended) {
    res.statusCode = statusCode;
    res.end();
  }
};

module.exports = function setupDevApiProxy(app) {
  const sharedLibrariesIndex = require(path.join(
    __dirname,
    "../api/shared-libraries/index.js"
  )).default;
  const sharedLibrariesCatchAll = require(path.join(
    __dirname,
    "../api/shared-libraries/[...path].js"
  )).default;
  const spotifyCatchAll = require(path.join(__dirname, "../api/spotify/[...path].js"))
    .default;

  app.use("/api", async (req, res, next) => {
    const originalUrl = req.originalUrl || req.url;

    try {
      if (
        originalUrl === "/api/shared-libraries" ||
        originalUrl.startsWith("/api/shared-libraries?")
      ) {
        await invokeHandler(sharedLibrariesIndex, req, res);
        return;
      }

      if (originalUrl.startsWith("/api/shared-libraries/")) {
        await invokeHandler(sharedLibrariesCatchAll, req, res);
        return;
      }

      if (originalUrl.startsWith("/api/spotify")) {
        await invokeHandler(spotifyCatchAll, req, res);
        return;
      }

      res.statusCode = 404;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "API route not found." }));
    } catch (error) {
      next(error);
    }
  });
};
