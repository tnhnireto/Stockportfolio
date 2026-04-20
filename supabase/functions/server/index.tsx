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

// Function to search for company information
async function searchCompanyInfo(query: string): Promise<string> {
  try {
    // Use DuckDuckGo Instant Answer API for free company information
    const encodedQuery = encodeURIComponent(query + " stock financial information");
    const response = await fetch(`https://api.duckduckgo.com/?q=${encodedQuery}&format=json&no_html=1`);
    const data = await response.json();

    let info = '';
    if (data.Abstract) {
      info += data.Abstract + '\n';
    }
    if (data.RelatedTopics && data.RelatedTopics.length > 0) {
      const relevant = data.RelatedTopics.slice(0, 3);
      info += '\nRelated information:\n';
      relevant.forEach((topic: any) => {
        if (topic.Text) {
          info += `- ${topic.Text}\n`;
        }
      });
    }

    // Also search for financial data using a simple web scrape approach
    const financeQuery = encodeURIComponent(query + " dividend yield market cap PE ratio");
    const searchResponse = await fetch(`https://html.duckduckgo.com/html/?q=${financeQuery}`);

    return info || `Found information about ${query}. This appears to be a publicly traded company. For the most accurate and up-to-date financial data, please verify with official financial sources.`;
  } catch (error) {
    console.error('Error searching company info:', error);
    return `Unable to fetch real-time data for ${query}. Please verify information from official financial sources.`;
  }
}

// Chat endpoint
app.post("/make-server-078eec38/chat", async (c) => {
  try {
    const { message, holdings, chatHistory } = await c.req.json();

    if (!message || typeof message !== 'string') {
      return c.json({ success: false, error: 'Message is required' }, 400);
    }

    const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openaiApiKey) {
      console.error('Chat endpoint error: OPENAI_API_KEY not configured');
      return c.json({ success: false, error: 'OpenAI API key not configured' }, 500);
    }

    const portfolioContext = holdings && holdings.length > 0
      ? `\n\nCurrent Portfolio:\n${holdings.map((h: any) =>
          `- ${h.name} (${h.symbol}): ${h.shares} shares @ ${h.currentPrice} NOK, Purchase: ${h.purchasePrice} NOK, Dividend Yield: ${h.dividendYield}%`
        ).join('\n')}\n\nIMPORTANT: The dividend yield and prices shown in the portfolio may be outdated or incorrect. Always use the search_company tool to get current, accurate information before making recommendations.`
      : '\n\nThe user has no stocks in their portfolio yet.';

    const systemPrompt = `You are an expert financial advisor helping a Norwegian investor manage their stock portfolio. You have deep knowledge of:
- Portfolio strategies (dividends, growth, value, momentum, trading)
- Company fundamentals and financial analysis
- Norwegian and international stock markets
- Risk management and diversification
- Investment strategies for different goals

All monetary values are in Norwegian Kroner (NOK).

**CRITICAL**: When asked about specific companies, you MUST use the search_company tool to get current, accurate information. Do NOT rely on the portfolio data alone as it may be outdated or incorrect (e.g., dividend yields may show as 0% when the company actually pays dividends).

When discussing stocks, provide detailed analysis including:
- Company fundamentals and financial health (from real-time search)
- Current dividend information (from real-time search)
- Growth prospects and risks
- Valuation metrics
- How it fits different portfolio strategies
${portfolioContext}

Format your responses using markdown for better readability:
- Use **bold** for emphasis on key points
- Use bullet points for lists
- Use headings (##) to organize longer responses
- Use > blockquotes for important warnings or notes

Be conversational, helpful, and educational. Provide specific insights and actionable advice. Always search for current company data before making recommendations.`;

    const messages = [
      { role: 'system', content: systemPrompt },
      ...(chatHistory || []).map((msg: any) => ({
        role: msg.role,
        content: msg.content,
      })),
      { role: 'user', content: message },
    ];

    const tools = [
      {
        type: 'function',
        function: {
          name: 'search_company',
          description: 'Search for current information about a company including financial data, dividends, market cap, and other relevant information. Use this when the user asks about a specific company or stock.',
          parameters: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: 'The company name or stock symbol to search for',
              },
            },
            required: ['query'],
          },
        },
      },
    ];

    let conversationMessages = [...messages];
    let iterations = 0;
    const MAX_ITERATIONS = 5;

    while (iterations < MAX_ITERATIONS) {
      iterations++;

      const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${openaiApiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o',
          messages: conversationMessages,
          tools,
          temperature: 0.7,
          max_tokens: 1500,
        }),
      });

      if (!openaiResponse.ok) {
        const errorData = await openaiResponse.json();
        console.error('OpenAI API error during chat:', errorData);
        return c.json({ success: false, error: `OpenAI API error: ${errorData.error?.message || 'Unknown error'}` }, 500);
      }

      const completion = await openaiResponse.json();
      const assistantMessage = completion.choices[0]?.message;

      if (!assistantMessage) {
        console.error('No response from OpenAI API during chat');
        return c.json({ success: false, error: 'No response from AI' }, 500);
      }

      conversationMessages.push(assistantMessage);

      // Check if the AI wants to call a function
      if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
        for (const toolCall of assistantMessage.tool_calls) {
          if (toolCall.function.name === 'search_company') {
            const args = JSON.parse(toolCall.function.arguments);
            const searchResult = await searchCompanyInfo(args.query);

            conversationMessages.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              content: searchResult,
            });
          }
        }
      } else {
        // No more function calls, return the response
        const response = assistantMessage.content;

        if (!response) {
          console.error('No content in final response from OpenAI API');
          return c.json({ success: false, error: 'No response from AI' }, 500);
        }

        const existingHistory = Array.isArray(chatHistory) ? chatHistory : [];
        const updatedHistory = [
          ...existingHistory,
          { role: 'user', content: message, timestamp: Date.now() },
          { role: 'assistant', content: response, timestamp: Date.now() },
        ];

        await kv.set('chat_history', updatedHistory);

        return c.json({
          success: true,
          data: { response },
        });
      }
    }

    return c.json({ success: false, error: 'Max iterations reached' }, 500);
  } catch (error) {
    console.error('Error in chat endpoint:', error);
    return c.json({ success: false, error: error instanceof Error ? error.message : 'Failed to process chat' }, 500);
  }
});

// Get chat history
app.get("/make-server-078eec38/chat-history", async (c) => {
  try {
    const history = await kv.get('chat_history');

    if (!history) {
      return c.json({
        success: true,
        data: { messages: [] },
      });
    }

    if (Array.isArray(history)) {
      return c.json({
        success: true,
        data: { messages: history },
      });
    }

    console.error('Invalid chat history format, resetting:', history);
    await kv.set('chat_history', []);

    return c.json({
      success: true,
      data: { messages: [] },
    });
  } catch (error) {
    console.error('Error loading chat history:', error);
    return c.json({
      success: true,
      data: { messages: [] },
    });
  }
});

Deno.serve(app.fetch);