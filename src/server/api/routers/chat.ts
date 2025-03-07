import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import { callLLM } from "~/utils/llm";
import { searchWeb } from "~/utils/search";
import {
  createChat,
  addMessageToChat,
  addSearchResultsToMessage,
  getAllChats,
  getChatById,
  updateChatTitle,
  deleteChat,
} from "~/server/db/chat-service";

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
  // Get all chats
  getChats: publicProcedure
    .query(async () => {
      const allChats = await getAllChats();
      return allChats;
    }),
  
  // Get a chat by ID
  getChat: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      const chat = await getChatById(input.id);
      if (!chat) {
        throw new Error(`Chat with ID ${input.id} not found`);
      }
      return chat;
    }),
  
  // Create a new chat
  createChat: publicProcedure
    .input(z.object({ 
      title: z.string(),
      firstMessage: z.string(),
    }))
    .mutation(async ({ input }) => {
      // Create a new chat with the first user message
      const chatId = await createChat({
        title: input.title,
        messages: [
          {
            role: "user",
            content: input.firstMessage,
            orderIndex: 0,
          }
        ]
      });
      
      // Now get the chat to return
      return await getChatById(chatId);
    }),
  
  // Update chat title
  updateChatTitle: publicProcedure
    .input(z.object({
      chatId: z.string(),
      title: z.string(),
    }))
    .mutation(async ({ input }) => {
      await updateChatTitle(input.chatId, input.title);
      return { success: true };
    }),
  
  // Delete a chat
  deleteChat: publicProcedure
    .input(z.object({ chatId: z.string() }))
    .mutation(async ({ input }) => {
      await deleteChat(input.chatId);
      return { success: true };
    }),
  
  // Send a message in a chat
  sendMessage: publicProcedure
    .input(z.object({ 
      content: z.string(),
      chatId: z.string(), // Now mandatory
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
            // Clean the response of any control characters and ensure it's valid JSON
            const cleanedResponse = llmResponse
              .replace(/[\u0000-\u0019]+/g, "") // Remove control characters
              .replace(/\\n/g, " ")           // Replace escaped newlines with space
              .replace(/\\"/g, '"')           // Handle escaped quotes properly
              .trim();
            
            // Try to extract JSON if it's wrapped in markdown code blocks
            const jsonMatch = cleanedResponse.match(/```(?:json)?([\s\S]*?)```/) || 
                             [null, cleanedResponse];
            const jsonContent = jsonMatch[1].trim();
            
            // Parse and validate the JSON response
            const jsonResponse = JSON.parse(jsonContent);
            const validatedResponse = LLMResponseSchema.parse(jsonResponse);
            
            // Save user message to database first
            await addMessageToChat(input.chatId, {
              role: "user",
              content: input.content,
            });
              
            // Then save assistant message with response and citations
            const messageId = await addMessageToChat(input.chatId, {
              role: "assistant",
              content: validatedResponse.answer,
              searchQuery,
              citations: validatedResponse.citations,
            });
              
            // Save raw search results
            await addSearchResultsToMessage(
              messageId,
              searchQuery,
              searchResults
            );

            // Update chat title if this is one of the first messages
            const chat = await getChatById(input.chatId);
            if (chat && chat.messages.length <= 3) {
              // Generate a title based on the conversation
              const titleGeneration = await callLLM(
                `Generate a short, descriptive title (max 6 words) for a conversation that starts with this message: "${input.content}"`,
                "You are a helpful assistant that generates concise, descriptive titles. Keep it under 6 words."
              );
              
              // Update the chat title
              await updateChatTitle(input.chatId, titleGeneration.trim().replace(/^"(.+)"$/, '$1'));
            }
              
            return {
              success: true,
              chatId: input.chatId,
              response: validatedResponse.answer,
              citations: validatedResponse.citations,
              searchQuery,
            };
          } catch (parseError) {
            console.error("Error parsing LLM response as JSON:", parseError);
            console.log("Raw LLM response:", llmResponse);
            
            // Try to extract a response even if JSON parsing failed
            let extractedAnswer = llmResponse;
            let extractedCitations = [];
            
            // Try to extract answer text if it looks like JSON but couldn't be parsed
            const answerMatch = llmResponse.match(/"answer"\s*:\s*"([^"]*)"/);
            if (answerMatch && answerMatch[1]) {
              extractedAnswer = answerMatch[1]
                .replace(/\\n/g, "\n")
                .replace(/\\"/g, '"');
            }
            
            // Fallback: Return the extracted answer without citations
            // Save user message to database 
            await addMessageToChat(input.chatId, {
              role: "user",
              content: input.content,
            });

            // Save assistant message with extracted answer
            await addMessageToChat(input.chatId, {
              role: "assistant",
              content: extractedAnswer,
              searchQuery,
            });

            return {
              success: true,
              chatId: input.chatId,
              response: extractedAnswer,
              citations: extractedCitations,
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
            // Clean the response of any control characters and ensure it's valid JSON
            const cleanedResponse = llmResponse
              .replace(/[\u0000-\u0019]+/g, "") // Remove control characters
              .replace(/\\n/g, " ")           // Replace escaped newlines with space
              .replace(/\\"/g, '"')           // Handle escaped quotes properly
              .trim();
            
            // Try to extract JSON if it's wrapped in markdown code blocks
            const jsonMatch = cleanedResponse.match(/```(?:json)?([\s\S]*?)```/) || 
                             [null, cleanedResponse];
            const jsonContent = jsonMatch[1].trim();
            
            // Parse and validate the JSON response
            const jsonResponse = JSON.parse(jsonContent);
            const validatedResponse = LLMResponseSchema.parse(jsonResponse);
            
            // Save user message to database 
            await addMessageToChat(input.chatId, {
              role: "user",
              content: input.content,
            });

            // Save assistant message without search results
            await addMessageToChat(input.chatId, {
              role: "assistant",
              content: validatedResponse.answer,
            });

            return {
              success: true,
              chatId: input.chatId,
              response: validatedResponse.answer,
              citations: [],
            };
          } catch (parseError) {
            console.error("Error parsing fallback LLM response as JSON:", parseError);
            console.log("Raw fallback LLM response:", llmResponse);
            
            // Try to extract a response even if JSON parsing failed
            let extractedAnswer = llmResponse;
            
            // Try to extract answer text if it looks like JSON but couldn't be parsed
            const answerMatch = llmResponse.match(/"answer"\s*:\s*"([^"]*)"/);
            if (answerMatch && answerMatch[1]) {
              extractedAnswer = answerMatch[1]
                .replace(/\\n/g, "\n")
                .replace(/\\"/g, '"');
            }
            
            // Return the extracted answer without citations
            // Save user message to database 
            await addMessageToChat(input.chatId, {
              role: "user",
              content: input.content,
            });

            // Save assistant message with extracted answer
            await addMessageToChat(input.chatId, {
              role: "assistant",
              content: extractedAnswer,
            });

            return {
              success: true,
              chatId: input.chatId,
              response: extractedAnswer,
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