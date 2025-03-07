import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import { callLLM } from "~/utils/llm";

export const chatRouter = createTRPCRouter({
  sendMessage: publicProcedure
    .input(z.object({ content: z.string() }))
    .mutation(async ({ input }) => {
      try {
        // Call the LLM API with the user's message
        const response = await callLLM(input.content);
        
        return {
          success: true,
          response,
        };
      } catch (error) {
        console.error("Error in sendMessage:", error);
        throw new Error("Failed to send message to LLM");
      }
    }),
});