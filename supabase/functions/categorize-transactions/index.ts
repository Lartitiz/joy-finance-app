import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { transactions, categories } = await req.json();

    if (!transactions || !Array.isArray(transactions) || transactions.length === 0) {
      return new Response(
        JSON.stringify({ error: "No transactions provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const categoryList = categories
      .map((c: any) => `- ID: "${c.id}" | Nom: "${c.emoji || ''} ${c.name}" | Type: ${c.type}`)
      .join("\n");

    const transactionList = transactions
      .map((t: any) => `- ID: "${t.id}" | Date: ${t.date} | Libellé: "${t.label}" | Montant: ${t.amount}`)
      .join("\n");

    const systemPrompt = `Tu es un assistant comptable expert pour solopreneur·es et freelances.

Voici les catégories disponibles de l'utilisateur :
${categoryList}

RÈGLES :
- Pour chaque transaction, suggère la catégorie la plus probable parmi celles listées ci-dessus.
- Si le montant est positif, privilégie les catégories de type "revenue". Si négatif, privilégie les catégories de type "expense". Les catégories de type "both" peuvent être utilisées dans les deux cas.
- Évalue ta confiance : "high" si tu es très sûr, "medium" si probable, "low" si incertain.
- Réponds UNIQUEMENT avec un tableau JSON valide, sans texte autour, sans markdown.

FORMAT DE RÉPONSE (JSON strict) :
[{"transaction_id": "uuid", "suggested_category_id": "uuid", "confidence": "high|medium|low"}]`;

    const userPrompt = `Catégorise ces transactions :\n${transactionList}`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        stream: false,
        tools: [
          {
            type: "function",
            function: {
              name: "categorize_transactions",
              description: "Return categorization suggestions for each transaction",
              parameters: {
                type: "object",
                properties: {
                  suggestions: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        transaction_id: { type: "string" },
                        suggested_category_id: { type: "string" },
                        confidence: { type: "string", enum: ["high", "medium", "low"] },
                      },
                      required: ["transaction_id", "suggested_category_id", "confidence"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["suggestions"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "categorize_transactions" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Trop de requêtes, réessaie dans quelques instants." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "Crédits IA insuffisants. Ajoute des crédits dans ton workspace Lovable." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errText = await response.text();
      console.error("AI gateway error:", response.status, errText);
      return new Response(
        JSON.stringify({ error: "Erreur du service IA" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const result = await response.json();

    // Extract from tool call response
    const toolCall = result.choices?.[0]?.message?.tool_calls?.[0];
    if (toolCall?.function?.arguments) {
      const parsed = JSON.parse(toolCall.function.arguments);
      return new Response(
        JSON.stringify({ suggestions: parsed.suggestions }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fallback: try to parse content directly
    const content = result.choices?.[0]?.message?.content || "";
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const suggestions = JSON.parse(jsonMatch[0]);
      return new Response(
        JSON.stringify({ suggestions }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.error("Unexpected AI response:", JSON.stringify(result));
    return new Response(
      JSON.stringify({ error: "Réponse IA inattendue" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("categorize-transactions error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Erreur inconnue" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
