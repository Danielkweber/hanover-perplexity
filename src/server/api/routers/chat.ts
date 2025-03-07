import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import { callLLM } from "~/utils/llm";
import { searchWeb } from "~/utils/search";

// System prompt for answering with search results
const SYSTEM_PROMPT = `You are Claude, an AI assistant with access to search results.

When responding to the user:
1. Carefully review all the search results provided.
2. Synthesize the information to create a comprehensive, informative answer.
3. Include 2-3 relevant source URLs at the end of your response in a "Sources:" section.
4. If the search results don't contain relevant information, acknowledge this and provide your best response based on your training.
5. Be helpful, accurate, and concise.

Example format:
[Your comprehensive answer based on search results]

Sources:
- example.com/page1
- example2.org/article`;

export const chatRouter = createTRPCRouter({
  sendMessage: publicProcedure
    .input(z.object({ content: z.string() }))
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
          
          // Prepare the full context for Claude
          const prompt = `User question: "${input.content}"

Here are search results that may help answer this question:

${formattedResults}

Please answer the user's question based on these search results. Include relevant source URLs at the end.`;
          
          // Get response from Claude with the search results
          const response = await callLLM(prompt, SYSTEM_PROMPT);
          
          return {
            success: true,
            response,
          };
        } catch (searchError) {
          console.error("Error during search:", searchError);
          
          // Fallback to regular response without search
          const response = await callLLM(
            input.content, 
            `${SYSTEM_PROMPT}\n\nNOTE: Web search is currently unavailable. Please answer based on your training data.`
          );
          
          return {
            success: true,
            response,
          };
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