import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { logger } from "npm:hono/logger";
import * as kv from "./kv_store.ts";

/** Pinned model for vision + chat (stable vs unversioned "gpt-4o" alias). */
const OPENAI_MODEL = "gpt-4o-2024-08-06";

/** Bump when changing extraction shape — proves which bundle Supabase is running. */
const UPLOAD_SCREENSHOT_BUILD_ID = "extract-v2-fn-make-server-078eec38-20250417";

const ALLOWED_CURRENCY = new Set(["NOK", "SEK", "DKK", "EUR", "USD", "GBP", "UNKNOWN"]);

function normalizeCurrency(value: unknown): string {
  if (typeof value !== "string") return "UNKNOWN";
  const u = value.trim().toUpperCase();
  return ALLOWED_CURRENCY.has(u) ? u : "UNKNOWN";
}

/** OpenAI image_url.url must be a data URL or http(s) URL; raw base64 is invalid. */
function toOpenAIImageDataUrl(imageBase64: unknown): string {
  if (typeof imageBase64 !== "string" || !imageBase64.trim()) {
    throw new Error("Missing or invalid imageBase64");
  }
  const s = imageBase64.trim();
  if (s.startsWith("data:image/")) return s;
  const b64 = s.replace(/\s/g, "");
  const mime = b64.startsWith("iVBOR") ? "image/png" : "image/jpeg";
  return `data:${mime};base64,${b64}`;
}

const app = new Hono();

// Enable logger
app.use('*', logger(console.log));

// Enable CORS for all routes and methods
app.use(
  "/*",
  cors({
    origin: "*",
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    exposeHeaders: ["Content-Length", "X-Stockportfolio-Extract-Build"],
    maxAge: 600,
  }),
);

// Health check endpoint
app.get("/make-server-078eec38/health", (c) => {
  return c.json({ status: "ok", uploadScreenshotBuild: UPLOAD_SCREENSHOT_BUILD_ID });
});

// Get all portfolio holdings
app.get("/make-server-078eec38/portfolio", async (c) => {
  try {
    const holdings = await kv.getByPrefix("portfolio:");
    return c.json({ success: true, data: holdings });
  } catch (error) {
    console.log("Error fetching portfolio:", error);
    return c.json({ success: false, error: String(error) }, 500);
  }
});

// Add new stock to portfolio
app.post("/make-server-078eec38/portfolio", async (c) => {
  try {
    const body = await c.req.json();
    const id = `portfolio:${Date.now()}`;
    const purchasePrice = body.purchasePrice ?? body.gavPrice;
    const gavPrice = body.gavPrice ?? body.purchasePrice ?? purchasePrice;

    const holding = {
      id,
      symbol: body.symbol,
      name: body.name,
      shares: body.shares,
      purchasePrice,
      gavPrice,
      currentPrice: body.currentPrice ?? purchasePrice,
      dividendYield: body.dividendYield ?? 0,
      currency: normalizeCurrency(body.currency),
      valueNOK: body.valueNOK ?? null,
      returnPercent: body.returnPercent ?? null,
      returnNOK: body.returnNOK ?? null,
      changeTodayPercent: body.changeTodayPercent ?? null,
      changeTodayAmount: body.changeTodayAmount ?? null,
      createdAt: new Date().toISOString(),
    };
    await kv.set(id, holding);
    return c.json({ success: true, data: holding });
  } catch (error) {
    console.log("Error adding stock to portfolio:", error);
    return c.json({ success: false, error: String(error) }, 500);
  }
});

// Update stock in portfolio
app.put("/make-server-078eec38/portfolio/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const body = await c.req.json();
    const existing = await kv.get(id);
    if (!existing) {
      return c.json({ success: false, error: "Stock not found" }, 404);
    }
    const merged = { ...existing, ...body, id };

    if ("currency" in body) {
      merged.currency = normalizeCurrency(body.currency);
    } else {
      merged.currency = normalizeCurrency(existing.currency ?? "UNKNOWN");
    }

    if ("valueNOK" in body) merged.valueNOK = body.valueNOK;

    if (body.gavPrice !== undefined && body.purchasePrice === undefined) {
      merged.purchasePrice = body.gavPrice;
    }
    if (body.purchasePrice !== undefined && body.gavPrice === undefined) {
      merged.gavPrice = body.purchasePrice;
    }

    const updated = merged;
    await kv.set(id, updated);
    return c.json({ success: true, data: updated });
  } catch (error) {
    console.log("Error updating stock in portfolio:", error);
    return c.json({ success: false, error: String(error) }, 500);
  }
});

// Delete stock from portfolio
app.delete("/make-server-078eec38/portfolio/:id", async (c) => {
  try {
    const id = c.req.param("id");
    await kv.del(id);
    return c.json({ success: true });
  } catch (error) {
    console.log("Error deleting stock from portfolio:", error);
    return c.json({ success: false, error: String(error) }, 500);
  }
});

/** Strict JSON schema for OpenAI Structured Outputs (gpt-4o+). */
const PORTFOLIO_EXTRACTION_JSON_SCHEMA = {
  name: "brokerage_screenshot_holdings",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      holdings: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            symbol: {
              anyOf: [{ type: "string" }, { type: "null" }],
            },
            name: { type: "string" },
            shares: { type: "number" },
            currentPrice: { type: "number" },
            gavPrice: { type: "number" },
            currency: {
              type: "string",
              enum: ["NOK", "SEK", "DKK", "EUR", "USD", "GBP", "UNKNOWN"],
            },
            valueNOK: { type: "number" },
            returnPercent: { anyOf: [{ type: "number" }, { type: "null" }] },
            returnNOK: { anyOf: [{ type: "number" }, { type: "null" }] },
            changeTodayPercent: { anyOf: [{ type: "number" }, { type: "null" }] },
            changeTodayAmount: { anyOf: [{ type: "number" }, { type: "null" }] },
            dividendYield: { type: "number" },
          },
          required: [
            "symbol",
            "name",
            "shares",
            "currentPrice",
            "gavPrice",
            "currency",
            "valueNOK",
            "returnPercent",
            "returnNOK",
            "changeTodayPercent",
            "changeTodayAmount",
            "dividendYield",
          ],
        },
      },
    },
    required: ["holdings"],
  },
} as const;

const EXTRACTION_SYSTEM_PROMPT =
  "You extract structured portfolio rows from Norwegian brokerage screenshots. " +
  "Follow the user's rules exactly. Never invent or infer ticker symbols: use null unless a ticker is explicitly visible. " +
  "Never guess numbers: if a numeric cell is unreadable or missing, omit that entire holding from the holdings array (do not partially invent a row). " +
  "Parse Scandinavian formats: comma as decimal separator (47,59 -> 47.59); spaces as thousands separators (11 898 -> 11898). " +
  "Output JSON numbers only (no strings for numeric fields). " +
  "currency must come from the price label next to Siste/GAV (same currency for currentPrice and gavPrice), never from Verdi. " +
  "valueNOK is always from the Verdi column in NOK. " +
  "dividendYield is 0 if not visible. " +
  "Siste/GAV: first number = currentPrice, second = gavPrice. " +
  "Avkast.: first = returnPercent, second = returnNOK (use null for either if that part is not visible). " +
  "I dag: first = changeTodayPercent, second = changeTodayAmount (use null for either if not visible).";

const EXTRACTION_USER_PROMPT =
  "Extract every complete visible stock holding row from this screenshot. " +
  "Include symbol only if a ticker is explicitly shown; otherwise null. " +
  "Use currency enum NOK|SEK|DKK|EUR|USD|GBP|UNKNOWN (UNKNOWN only if the currency label cannot be read).";

function parseLocaleNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  let s = trimmed.replace(/\s/g, "").replace(/[^\d,.-]/g, "");
  if (!s || s === "-" || s === "-.") return null;

  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma > lastDot) {
    // Decimal comma (e.g. 1.234,56 or 47,59): drop thousand dots, comma → dot
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (lastDot > lastComma) {
    // Decimal dot (e.g. 1,234.56): drop thousand commas
    s = s.replace(/,/g, "");
  } else if (lastComma !== -1) {
    s = s.replace(",", ".");
  }

  const num = Number(s);
  return Number.isFinite(num) ? num : null;
}

/** Finite number from JSON number or Scandinavian string; null if invalid. */
function coerceFiniteNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") return parseLocaleNumber(value);
  return null;
}

function coerceNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  return coerceFiniteNumber(value);
}

/** Drop bad rows instead of emitting zeros. */
function normalizeExtractedRow(s: Record<string, unknown>): Record<string, unknown> | null {
  const name = typeof s.name === "string" ? s.name.trim() : "";
  if (!name) {
    console.log("[upload-screenshot] dropped row: empty name");
    return null;
  }

  const shares = coerceFiniteNumber(s.shares);
  const currentPrice = coerceFiniteNumber(s.currentPrice);
  const gavPrice = coerceFiniteNumber(s.gavPrice);
  const valueNOK = coerceFiniteNumber(s.valueNOK);
  if (shares === null || currentPrice === null || gavPrice === null || valueNOK === null) {
    console.log("[upload-screenshot] dropped row: non-finite core number", {
      name,
      shares,
      currentPrice,
      gavPrice,
      valueNOK,
    });
    return null;
  }

  const symbolRaw = s.symbol;
  const symbolStr =
    symbolRaw === null || symbolRaw === undefined
      ? ""
      : typeof symbolRaw === "string"
        ? symbolRaw.trim().toUpperCase()
        : "";
  const symbol = symbolStr.length > 0 ? symbolStr : null;

  const currency = normalizeCurrency(s.currency);

  const dividendYield = coerceFiniteNumber(s.dividendYield) ?? 0;

  return {
    symbol,
    name,
    shares,
    currentPrice,
    gavPrice,
    purchasePrice: gavPrice,
    currency,
    valueNOK,
    returnPercent: coerceNullableNumber(s.returnPercent),
    returnNOK: coerceNullableNumber(s.returnNOK),
    changeTodayPercent: coerceNullableNumber(s.changeTodayPercent),
    changeTodayAmount: coerceNullableNumber(s.changeTodayAmount),
    dividendYield,
  };
}

// Upload screenshot and extract portfolio data
app.post("/make-server-078eec38/upload-screenshot", async (c) => {
  try {
    const body = await c.req.json();
    const { imageBase64 } = body;
    const debugRequested =
      body?.debug === true || Deno.env.get("SCREENSHOT_EXTRACT_DEBUG") === "1";

    console.log(
      `[upload-screenshot] hit build=${UPLOAD_SCREENSHOT_BUILD_ID} debug=${debugRequested}`,
    );

    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) {
      return c.json({ success: false, error: "OpenAI API key not configured" }, 500);
    }

    let imageDataUrl: string;
    try {
      imageDataUrl = toOpenAIImageDataUrl(imageBase64);
    } catch (e) {
      console.log("[upload-screenshot] bad image input:", e);
      return c.json({ success: false, error: String(e) }, 400);
    }

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        temperature: 0,
        messages: [
          { role: "system", content: EXTRACTION_SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              { type: "text", text: EXTRACTION_USER_PROMPT },
              {
                type: "image_url",
                image_url: {
                  url: imageDataUrl,
                  detail: "high",
                },
              },
            ],
          },
        ],
        max_tokens: 16384,
        response_format: {
          type: "json_schema",
          json_schema: PORTFOLIO_EXTRACTION_JSON_SCHEMA,
        },
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.log("OpenAI API error:", data);
      return c.json({ success: false, error: data.error?.message || "OpenAI API error" }, 500);
    }

    const choice = data.choices?.[0];
    const msg = choice?.message;

    if (msg?.refusal) {
      console.log("[upload-screenshot] OpenAI refusal:", msg.refusal);
      return c.json({ success: false, error: "OpenAI refused to analyze this image." }, 422);
    }

    if (choice?.finish_reason === "length") {
      console.warn("[upload-screenshot] OpenAI finish_reason=length (response may be truncated)");
    }

    const content = msg?.content;
    if (typeof content !== "string" || !content.trim()) {
      console.log("[upload-screenshot] missing content:", { choice, msg });
      return c.json({ success: false, error: "OpenAI response missing content" }, 500);
    }

    console.log(
      "[upload-screenshot] OpenAI raw content:",
      `length=${content.length}`,
      `preview=${JSON.stringify(content.slice(0, 280))}`,
    );

    let parsed: { holdings?: unknown[] };
    try {
      let raw = content.trim();
      if (raw.startsWith("```")) {
        raw = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
      }
      parsed = JSON.parse(raw) as { holdings?: unknown[] };
    } catch (parseError) {
      console.log("Error parsing OpenAI response:", parseError, "Content:", content);
      return c.json({ success: false, error: "Failed to parse portfolio data from image" }, 500);
    }

    const stocks = Array.isArray(parsed.holdings) ? parsed.holdings : [];
    console.log(
      "[upload-screenshot] parsed JSON holdings length:",
      stocks.length,
      "top-level keys:",
      parsed && typeof parsed === "object" ? Object.keys(parsed) : [],
    );
    if (debugRequested && stocks[0] && typeof stocks[0] === "object") {
      console.log(
        "[upload-screenshot] first raw holding keys:",
        Object.keys(stocks[0] as object),
      );
    }
    const normalizedStocks: Record<string, unknown>[] = [];
    let dropped = 0;

    for (const raw of stocks) {
      if (!raw || typeof raw !== "object") {
        dropped++;
        continue;
      }
      const row = normalizeExtractedRow(raw as Record<string, unknown>);
      if (row) normalizedStocks.push(row);
      else dropped++;
    }

    if (dropped > 0) {
      console.log(`[upload-screenshot] dropped ${dropped} invalid / incomplete row(s), kept ${normalizedStocks.length}`);
    }

    const firstNorm = normalizedStocks[0];
    console.log(
      "[upload-screenshot] normalizedStocks count:",
      normalizedStocks.length,
      "first row keys:",
      firstNorm ? Object.keys(firstNorm).sort().join(",") : "(none)",
    );

    c.header("X-Stockportfolio-Extract-Build", UPLOAD_SCREENSHOT_BUILD_ID);

    const payload: Record<string, unknown> = { success: true, data: normalizedStocks };
    if (debugRequested) {
      const raw0 = stocks[0];
      payload._debug = {
        build: UPLOAD_SCREENSHOT_BUILD_ID,
        openaiModel: OPENAI_MODEL,
        finishReason: choice?.finish_reason ?? null,
        rawContentLength: content.length,
        rawContentPreview: content.slice(0, 400),
        parsedHoldingsCount: stocks.length,
        normalizedCount: normalizedStocks.length,
        droppedInvalidRows: dropped,
        firstRawHoldingKeys:
          raw0 && typeof raw0 === "object" ? Object.keys(raw0 as object) : [],
        firstNormalizedKeys: firstNorm ? Object.keys(firstNorm) : [],
      };
      console.log("[upload-screenshot] _debug:", JSON.stringify(payload._debug));
    }

    return c.json(payload);
  } catch (error) {
    console.log("Error processing screenshot upload:", error);
    return c.json({ success: false, error: String(error) }, 500);
  }
});

// Get AI portfolio analysis and advice
app.post("/make-server-078eec38/analyze-portfolio", async (c) => {
  try {
    const body = await c.req.json();
    const { holdings } = body;
    
    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) {
      return c.json({ success: false, error: "OpenAI API key not configured" }, 500);
    }

    if (!Array.isArray(holdings)) {
      return c.json({ success: false, error: "holdings must be an array" }, 400);
    }

    const portfolioSummary = holdings
      .map((h: any) => {
        const ccy = normalizeCurrency(h.currency);
        const sym = h.symbol != null && String(h.symbol).trim() !== "" ? String(h.symbol) : "(no ticker)";
        const gav = h.gavPrice ?? h.purchasePrice;
        const verdi =
          h.valueNOK != null && Number.isFinite(Number(h.valueNOK))
            ? `, Verdi (NOK): ${h.valueNOK}`
            : "";
        return `${sym} (${h.name}): ${h.shares} sh — Siste ${h.currentPrice} ${ccy}, GAV ${gav} ${ccy}${verdi}, Div yield ${h.dividendYield ?? 0}%`;
      })
      .join("\n");

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        messages: [
          {
            role: "system",
            content: "You are a professional financial advisor. Analyze stock portfolios and provide detailed, actionable advice on diversification, risk management, potential opportunities, and overall portfolio health. Be specific and consider factors like sector allocation, dividend income, and growth potential."
          },
          {
            role: "user",
            content: `Please analyze my stock portfolio and provide advice:\n\n${portfolioSummary}\n\nProvide insights on: 1) Portfolio diversification, 2) Risk assessment, 3) Dividend strategy, 4) Potential improvements, 5) Overall portfolio health.`
          }
        ],
        max_tokens: 1500
      })
    });

    const data = await response.json();

    if (!response.ok) {
      console.log("OpenAI API error for portfolio analysis:", data);
      return c.json({ success: false, error: data.error?.message || "OpenAI API error" }, 500);
    }

    const aMsg = data.choices?.[0]?.message;
    if (aMsg?.refusal) {
      console.log("[analyze-portfolio] OpenAI refusal:", aMsg.refusal);
      return c.json({ success: false, error: "OpenAI refused to analyze this portfolio." }, 422);
    }

    const advice = typeof aMsg?.content === "string" ? aMsg.content : null;
    if (!advice) {
      return c.json({ success: false, error: "OpenAI response missing analysis content" }, 500);
    }

    return c.json({ success: true, data: { advice } });
  } catch (error) {
    console.log("Error analyzing portfolio:", error);
    return c.json({ success: false, error: String(error) }, 500);
  }
});

Deno.serve(app.fetch);