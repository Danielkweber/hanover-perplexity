import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import {
  createChat,
  addMessageToChat,
  addSearchResultsToMessage,
  getAllChats,
  getChatById,
  updateChatTitle,
  deleteChat,
} from "~/server/db/chat-service";
import {
  processUserMessage,
  generateChatTitle,
  LLMResponseSchema,
  CitationSchema
} from "~/server/api/llm-service";

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
      try {
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
        
        // Return the chat ID immediately, without waiting for the LLM processing
        // This allows the frontend to redirect to the chat page right away
        // The LLM processing will happen asynchronously in the background
        
        // Start the LLM processing in the background without awaiting it
        (async () => {
          try {
            // Process the user message to get a response
            const response = await processUserMessage(input.firstMessage);
            
            // Save assistant message with response and citations
            const messageId = await addMessageToChat(chatId, {
              role: "assistant",
              content: response.answer,
              searchQuery: response.searchQuery,
              citations: response.citations,
              orderIndex: 1
            });
            
            // Save raw search results if they exist
            if (response.searchQuery && response.searchResults) {
              await addSearchResultsToMessage(
                messageId,
                response.searchQuery,
                response.searchResults
              );
            }
            
            // Generate a title based on the conversation
            const title = await generateChatTitle(input.firstMessage);
            
            // Update the chat title
            await updateChatTitle(chatId, title);
            
          } catch (processingError) {
            console.error("Error processing first message:", processingError);
            
            // Fallback to a simple answer without search
            const fallbackResponse = {
              answer: "I'm sorry, I couldn't process your question properly. Could you please try rephrasing it?"
            };
            
            // Save assistant message with the fallback response
            await addMessageToChat(chatId, {
              role: "assistant",
              content: fallbackResponse.answer,
              orderIndex: 1
            });
          }
        })().catch(err => {
          console.error("Background LLM processing error:", err);
        });
        
        // Return the chat info right away, without waiting for LLM processing
        const chat = await getChatById(chatId);
        return chat;
      } catch (error) {
        console.error("Error in createChat:", error);
        throw new Error("Failed to create chat");
      }
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
        // Save user message to database first
        await addMessageToChat(input.chatId, {
          role: "user",
          content: input.content,
        });
        
        // Process the user message with conversation history
        const response = await processUserMessage(input.content, input.conversationHistory);
        
        // Save assistant message with response and citations
        const messageId = await addMessageToChat(input.chatId, {
          role: "assistant",
          content: response.answer,
          searchQuery: response.searchQuery,
          citations: response.citations,
        });
        
        // Save raw search results if they exist
        if (response.searchQuery && response.searchResults) {
          await addSearchResultsToMessage(
            messageId,
            response.searchQuery,
            response.searchResults
          );
        }
        
        // Update chat title if this is one of the first messages
        const chat = await getChatById(input.chatId);
        if (chat && chat.messages.length <= 3) {
          const title = await generateChatTitle(input.content);
          await updateChatTitle(input.chatId, title);
        }
        
        return {
          success: true,
          chatId: input.chatId,
          response: response.answer,
          citations: response.citations || [],
          searchQuery: response.searchQuery,
        };
      } catch (error) {
        console.error("Error in sendMessage:", error);
        
        // Try to provide a fallback response even if processing failed
        try {
          // Save a fallback assistant message
          await addMessageToChat(input.chatId, {
            role: "assistant",
            content: "I'm sorry, I encountered an error processing your request. Could you please try asking in a different way?",
          });
          
          return {
            success: false,
            chatId: input.chatId,
            response: "I'm sorry, I encountered an error processing your request. Could you please try asking in a different way?",
            citations: [],
          };
        } catch (fallbackError) {
          // If we can't even save a fallback message, just throw the error
          throw new Error("Failed to send message to LLM");
        }
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