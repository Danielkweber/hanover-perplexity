import Anthropic from "@anthropic-ai/sdk";
import { env } from "~/env";

// Initialize the Anthropic client
const anthropic = new Anthropic({
  apiKey: env.ANTHROPIC_API_KEY,
});

// Default system prompt if none is provided
const DEFAULT_SYSTEM_PROMPT = "You are Claude, an AI assistant created by Anthropic. You are helpful, harmless, and honest.";

export async function callLLM(userMessage: string, systemPrompt: string = DEFAULT_SYSTEM_PROMPT): Promise<string> {
  try {
    // Create the messages array with proper typing - only user and assistant roles
    const messages: Array<{ role: "user" | "assistant"; content: string }> = [];
    
    // Add user message
    messages.push({
      role: "user",
      content: userMessage,
    });

    // Call Anthropic API with system as a top-level parameter
    const response = await anthropic.messages.create({
      model: "claude-3-haiku-20240307", // Use a faster model for chat
      max_tokens: 1000,
      messages,
      system: systemPrompt, // System prompt as a top-level parameter
      temperature: 0.7, // Add some creativity to responses
    });

    // Return the assistant's response
    if (response.content && response.content.length > 0 && response.content[0].type === 'text') {
      return response.content[0].text;
    }
    
    return "No response from AI. Please try again.";
  } catch (error) {
    console.error("Error calling Anthropic API:", error);
    throw new Error("Failed to get response from LLM. Please check your API key and try again.");
  }
}