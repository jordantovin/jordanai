export default {
  async fetch(request, env) {
    // CORS (so your HTML can call this)
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    if (request.method !== "POST") {
      return new Response(JSON.stringify({ error: "Use POST" }), {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    try {
      const { question, context, topMatches } = await request.json();

      if (!question) {
        return new Response(JSON.stringify({ error: "Missing question" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Keep the system message strict: answer from provided context, otherwise say you don't know.
      const instructions =
        "You are Satchel's assistant. Answer using ONLY the provided CONTEXT from the user's CSV exports. " +
        "If the context doesn't contain the answer, say what you'd need (which source/fields) and do NOT invent. " +
        "When you use a detail, cite it like [source:ROW] (example: [fieldNotes:12]). Keep it tight and practical.";

      // Bundle the user content
      const userInput =
        `QUESTION:\n${question}\n\n` +
        `CONTEXT (snippets from CSV rows):\n${context || "(none)"}\n\n` +
        `MATCH METADATA:\n${JSON.stringify(topMatches || [], null, 2)}\n`;

      // Call OpenAI Responses API
      const oaRes = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${env.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: env.OPENAI_MODEL || "gpt-5-mini",
          instructions,
          input: userInput,
          max_output_tokens: 700,
        }),
      });

      const json = await oaRes.json();

      if (!oaRes.ok) {
        return new Response(JSON.stringify({ error: json?.error?.message || "OpenAI error", raw: json }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Robustly extract text from Responses API
      let answer = "";
      if (typeof json.output_text === "string") {
        answer = json.output_text;
      } else if (Array.isArray(json.output)) {
        // Try to find message content text
        for (const item of json.output) {
          if (item?.type === "message" && Array.isArray(item?.content)) {
            for (const c of item.content) {
              if (c?.type === "output_text" && typeof c?.text === "string") {
                answer += c.text;
              }
            }
          }
        }
      }
      if (!answer) answer = "(No text output found.)";

      return new Response(JSON.stringify({
        answer,
        model: env.OPENAI_MODEL || "gpt-5-mini",
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

    } catch (e) {
      return new Response(JSON.stringify({ error: e?.message || String(e) }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }
  }
};
