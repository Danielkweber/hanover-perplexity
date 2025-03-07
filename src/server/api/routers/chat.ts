import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import { callLLM } from "~/utils/llm";
import { searchWeb } from "~/utils/search";

// Zod schema for LLM response validation
const CitationSchema = z.object({
  title: z.string(),
  url: z.string().url(),
  relevance: z.string().optional(),
});

const LLMResponseSchema = z.object({
  answer: z.string(),
  citations: z.array(CitationSchema).min(0).max(5),
});

// System prompt for answering with search results in JSON format
const SYSTEM_PROMPT = `You are Claude, an AI assistant with access to search results.

When responding to the user, you MUST:
1. Carefully review all the search results provided.
2. Synthesize the information to create a comprehensive, informative answer.
3. Return your response in the EXACT JSON format specified below.
4. Include 2-3 relevant citations from the search results.
5. If the search results don't contain relevant information, acknowledge this and provide your best response based on your training.
6. Be helpful, accurate, and concise.

YOUR RESPONSE MUST STRICTLY FOLLOW THIS JSON FORMAT:
{
  "answer": "Your comprehensive answer to the user's question",
  "citations": [
    {
      "title": "Title of the source",
      "url": "Full URL of the source",
      "relevance": "Brief explanation of how this source supports your answer"
    }
  ]
}

The "citations" array must contain 2-3 of the most relevant sources that directly inform your answer.
DO NOT include any text outside the JSON structure.
DO NOT format the JSON with markdown code blocks.`;

// Type for conversation history messages
const ConversationMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string(),
});

export const chatRouter = createTRPCRouter({
  sendMessage: publicProcedure
    .input(z.object({ 
      content: z.string(),
      conversationHistory: z.array(ConversationMessageSchema).optional()
    }))
    .mutation(async ({ input }) => {
      try {
        try {
          // First, use Claude to generate a good search query
          const searchQueryGeneration = await callLLM(
            `Generate a search query to find information about: "${input.content}". 
             Return ONLY the search query text, nothing else.`,
            "You are a helpful assistant that generates effective search queries. Keep your response brief and focused."
          );
          
          // Remove any extra quotes or formatting that Claude might add
          const searchQuery = searchQueryGeneration
            .replace(/^["']|["']$/g, '')  // Remove surrounding quotes
            .replace(/^Search query: /i, '')  // Remove prefixes
            .trim();
          
          // Perform the search
          const searchResults = await searchWeb(searchQuery);
          
          // Format the search results for Claude
          const formattedResults = searchResults.map((result, index) => {
            return `[SEARCH RESULT ${index + 1}]
Title: ${result.title}
URL: ${result.url}
Content: ${result.content.substring(0, 800)}${result.content.length > 800 ? '...' : ''}
${result.publishedDate ? `Published: ${result.publishedDate}` : ''}`;
          }).join('\n\n');
          
          // Format conversation history if available
          let conversationContext = "";
          if (input.conversationHistory && input.conversationHistory.length > 0) {
            conversationContext = "Previous conversation:\n" + 
              input.conversationHistory.map(msg => 
                `${msg.role === "user" ? "User" : "Assistant"}: ${msg.content}`
              ).join("\n\n") + "\n\n";
          }

          // Prepare the full context for Claude
          const prompt = `${conversationContext}User's current question: "${input.content}"

Here are search results that may help answer this question:

${formattedResults}

Please answer the user's latest question based on these search results and the conversation history (if any).

IMPORTANT: Your response MUST be a valid JSON object with an "answer" field containing your response and a "citations" array with 2-3 relevant sources. Follow the exact JSON format specified in your instructions.`;
          
          // Get response from Claude with the search results
          const llmResponse = await callLLM(prompt, SYSTEM_PROMPT);
          
          try {
            // Parse and validate the JSON response
            const jsonResponse = JSON.parse(llmResponse);
            const validatedResponse = LLMResponseSchema.parse(jsonResponse);
            
            return {
              success: true,
              response: validatedResponse.answer,
              citations: validatedResponse.citations,
              searchQuery,
            };
          } catch (parseError) {
            console.error("Error parsing LLM response as JSON:", parseError);
            console.log("Raw LLM response:", llmResponse);
            
            // Fallback: Return the raw response without citations
            return {
              success: true,
              response: `${llmResponse}\n\n(Note: I encountered an issue with formatting my response properly. The information is still accurate.)`,
              citations: [],
              searchQuery,
            };
          }
        } catch (searchError) {
          console.error("Error during search:", searchError);
          
          // Format conversation history for fallback
          let conversationContext = "";
          if (input.conversationHistory && input.conversationHistory.length > 0) {
            conversationContext = "Previous conversation:\n" + 
              input.conversationHistory.map(msg => 
                `${msg.role === "user" ? "User" : "Assistant"}: ${msg.content}`
              ).join("\n\n") + "\n\n";
          }

          // Fallback to regular response without search
          const fallbackSystemPrompt = `You are Claude, an AI assistant. Web search is currently unavailable.
          
YOUR RESPONSE MUST STRICTLY FOLLOW THIS JSON FORMAT:
{
  "answer": "Your comprehensive answer to the user's question based on your training",
  "citations": []
}

DO NOT include any text outside the JSON structure.`;

          const fallbackPrompt = `${conversationContext}User's question: "${input.content}"
          
Please answer the user's question based on your training data.`;

          const llmResponse = await callLLM(fallbackPrompt, fallbackSystemPrompt);
          
          try {
            // Parse and validate the JSON response
            const jsonResponse = JSON.parse(llmResponse);
            const validatedResponse = LLMResponseSchema.parse(jsonResponse);
            
            return {
              success: true,
              response: validatedResponse.answer,
              citations: [],
            };
          } catch (parseError) {
            console.error("Error parsing fallback LLM response as JSON:", parseError);
            
            // Return raw response as fallback
            return {
              success: true,
              response: llmResponse,
              citations: [],
            };
          }
        }
      } catch (error) {
        console.error("Error in sendMessage:", error);
        throw new Error("Failed to send message to LLM");
      }
    }),
    
  // Endpoint for direct search (could be used for testing)
  search: publicProcedure
    .input(z.object({ query: z.string() }))
    .query(async ({ input }) => {
      try {
        const results = await searchWeb(input.query);
        return {
          success: true,
          results,
        };
      } catch (error) {
        console.error("Error in search:", error);
        throw new Error("Failed to search the web");
      }
    }),
});