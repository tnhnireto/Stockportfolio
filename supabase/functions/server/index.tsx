import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { logger } from "npm:hono/logger";
import * as kv from "./kv_store.tsx";

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
    exposeHeaders: ["Content-Length"],
    maxAge: 600,
  }),
);

// Health check endpoint
app.get("/make-server-078eec38/health", (c) => {
  return c.json({ status: "ok" });
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
    const holding = {
      id,
      symbol: body.symbol,
      name: body.name,
      shares: body.shares,
      purchasePrice: body.purchasePrice,
      currentPrice: body.currentPrice || body.purchasePrice,
      dividendYield: body.dividendYield || 0,
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
    const updated = { ...existing, ...body, id };
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

// Upload screenshot and extract portfolio data
app.post("/make-server-078eec38/upload-screenshot", async (c) => {
  try {
    const body = await c.req.json();
    const { imageBase64 } = body;
    
    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) {
      return c.json({ success: false, error: "OpenAI API key not configured" }, 500);
    }

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Analyze this stock portfolio screenshot and extract all visible stock holdings. For each stock, provide: symbol (ticker), name (company name), shares (number of shares), currentPrice (current price per share), and any dividend information if visible. Return the data as a JSON array with this exact structure: [{symbol: string, name: string, shares: number, currentPrice: number, dividendYield: number}]. If you cannot determine a value, use reasonable defaults (0 for dividendYield if not shown). Only return the JSON array, no additional text."
              },
              {
                type: "image_url",
                image_url: {
                  url: imageBase64
                }
              }
            ]
          }
        ],
        max_tokens: 1000
      })
    });

    const data = await response.json();
    
    if (!response.ok) {
      console.log("OpenAI API error:", data);
      return c.json({ success: false, error: data.error?.message || "OpenAI API error" }, 500);
    }

    const content = data.choices[0].message.content;
    let stocks;
    try {
      // Try to parse the JSON response
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        stocks = JSON.parse(jsonMatch[0]);
      } else {
        stocks = JSON.parse(content);
      }
    } catch (parseError) {
      console.log("Error parsing OpenAI response:", parseError, "Content:", content);
      return c.json({ success: false, error: "Failed to parse portfolio data from image" }, 500);
    }

    return c.json({ success: true, data: stocks });
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

    const portfolioSummary = holdings.map((h: any) => 
      `${h.symbol} (${h.name}): ${h.shares} shares at $${h.currentPrice}, Purchase price: $${h.purchasePrice}, Dividend yield: ${h.dividendYield}%`
    ).join('\n');

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o",
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

    const advice = data.choices[0].message.content;
    return c.json({ success: true, data: { advice } });
  } catch (error) {
    console.log("Error analyzing portfolio:", error);
    return c.json({ success: false, error: String(error) }, 500);
  }
});

Deno.serve(app.fetch);