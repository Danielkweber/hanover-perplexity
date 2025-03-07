import { z } from "zod";
import { callLLM } from "~/utils/llm";
import { searchWeb } from "~/utils/search";

// Define a more specific type for search results
type SearchResult = {
  title: string;
  url: string;
  content: string;
  publishedDate?: string;
};

// Zod schema for LLM response validation
export const CitationSchema = z.object({
  title: z.string(),
  url: z.string().url(),
  relevance: z.string().optional(),
});

export type Citation = z.infer;

export const LLMResponseSchema = z.object({
  answer: z.string(),
  citations: z.array(CitationSchema).min(0).max(5),
});

export type LLMResponse = z.infer;

// System prompt for determining if a search is needed
export const SEARCH_DECISION_PROMPT = `You are Claude, an AI assistant that can decide whether a user question requires up-to-date information from the web.

ALWAYS SEARCH UNLESS THE NECESSARY INFO IS ALREADY PRESENT IN CONTEXT 
Return ONLY "true" if a web search would be helpful, or "false" if you can answer reliably from your training.`;

// System prompt for generating search queries
export const SEARCH_QUERY_PROMPT = `You are a helpful assistant that generates effective search queries. Keep your response brief and focused.
Return ONLY the search query text, nothing else.`;

// System prompt for answering with search results in JSON format
export const ANSWER_PROMPT = `You are Claude, an AI assistant with access to search results.

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

// System prompt for generating titles
export const TITLE_GENERATION_PROMPT = `You are a helpful assistant that generates concise, descriptive titles. Keep it under 6 words.`;

// System prompt for fallback responses without search
export const FALLBACK_PROMPT = `You are Claude, an AI assistant. Web search is currently unavailable.

YOUR RESPONSE MUST STRICTLY FOLLOW THIS JSON FORMAT:
{
  "answer": "Your comprehensive answer to the user's question based on your training",
  "citations": []
}

DO NOT include any text outside the JSON structure.`;

// Define a type for conversation history messages
type ConversationMessage = {
  role: string;
  content: string;
};

/**
 * Determines if a search is needed for the given user query
 */
export async function shouldSearchForQuery(
  query: string,
  conversationHistory?: ConversationMessage[],
): Promise {
  // Always return true to ensure we always perform a web search for all queries
  // This ensures we always get real citations from the web
  return true;
}

/**
 * Generates a search query for a user question
 */
export async function generateSearchQuery(userQuestion: string): Promise {
  const prompt = `Generate a search query to find information about: "${userQuestion}". 
                  Return ONLY the search query text, nothing else.`;

  const searchQueryGeneration = await callLLM(prompt, SEARCH_QUERY_PROMPT);

  // Clean up the search query
  return searchQueryGeneration
    .replace(/^["']|["']$/g, "") // Remove surrounding quotes
    .replace(/^Search query: /i, "") // Remove prefixes
    .trim();
}

/**
 * Formats search results for Claude
 */
export function formatSearchResults(searchResults: SearchResult[]): string {
  return searchResults
    .map((result, index) => {
      return `[SEARCH RESULT ${index + 1}]
Title: ${result.title}
URL: ${result.url}
Content: ${result.content.substring(0, 800)}${result.content.length > 800 ? "..." : ""}
${result.publishedDate ? `Published: ${result.publishedDate}` : ""}`;
    })
    .join("\n\n");
}

/**
 * Format conversation history for the LLM
 */
export function formatConversationHistory(
  conversationHistory?: ConversationMessage[],
): string {
  if (!conversationHistory || conversationHistory.length === 0) {
    return "";
  }

  return (
    "Previous conversation:\n" +
    conversationHistory
      .map(
        (msg) =>
          `${msg.role === "user" ? "User" : "Assistant"}: ${msg.content}`,
      )
      .join("\n\n") +
    "\n\n"
  );
}

/**
 * Process a user query with search results
 */
export async function processQueryWithSearch(
  query: string,
  searchResults: SearchResult[],
  conversationHistory?: ConversationMessage[],
): Promise {
  // Format the search results
  const formattedResults = formatSearchResults(searchResults);

  // Format conversation history
  const conversationContext = formatConversationHistory(conversationHistory);

  // Prepare the prompt for Claude
  const prompt = `${conversationContext}User's current question: "${query}"

Here are search results that may help answer this question:

${formattedResults}

Please answer the user's latest question based on these search results and the conversation history (if any).

IMPORTANT: Your response MUST be a valid JSON object with an "answer" field containing your response and a "citations" array with 2-3 relevant sources. Follow the exact JSON format specified in your instructions.`;

  // Get response from Claude with the search results
  const llmResponse = await callLLM(prompt, ANSWER_PROMPT);

  try {
    // Clean the response of any control characters and ensure it's valid JSON
    const cleanedResponse = llmResponse
      .replace(/[\u0000-\u0019]+/g, "") // Remove control characters
      .replace(/\\n/g, " ") // Replace escaped newlines with space
      .replace(/\\"/g, '"') // Handle escaped quotes properly
      .trim();

    // Try to extract JSON if it's wrapped in markdown code blocks
    const jsonMatch = cleanedResponse.match(/```(?:json)?([\s\S]*?)```/) || [
      null,
      cleanedResponse,
    ];
    const jsonContent = jsonMatch[1]?.trim() || cleanedResponse;

    // Parse and validate the JSON response
    const jsonResponse = JSON.parse(jsonContent);
    const validatedResponse = LLMResponseSchema.parse(jsonResponse);

    return {
      answer: validatedResponse.answer,
      citations: validatedResponse.citations,
      searchQuery: query,
    };
  } catch (parseError) {
    console.error("Error parsing LLM response as JSON:", parseError);

    // Try to extract a response even if JSON parsing failed
    let extractedAnswer = llmResponse;

    // Try to extract answer text if it looks like JSON but couldn't be parsed
    const answerMatch = llmResponse.match(/"answer"\s*:\s*"([^"]*)"/);
    if (answerMatch && answerMatch[1]) {
      extractedAnswer = answerMatch[1]
        .replace(/\\n/g, "\n")
        .replace(/\\"/g, '"');
    }

    return {
      answer: extractedAnswer,
      searchQuery: query,
    };
  }
}

/**
 * Process a user query without search (fallback)
 */
export async function processQueryWithoutSearch(
  query: string,
  conversationHistory?: ConversationMessage[],
): Promise {
  // Format conversation history
  const conversationContext = formatConversationHistory(conversationHistory);

  // Prepare the prompt for Claude
  const fallbackPrompt = `${conversationContext}User's question: "${query}"
  
Please answer the user's question based on your training data.`;

  // Get response from Claude
  const llmResponse = await callLLM(fallbackPrompt, FALLBACK_PROMPT);

  try {
    // Clean the response and parse JSON
    const cleanedResponse = llmResponse
      .replace(/[\u0000-\u0019]+/g, "") // Remove control characters
      .replace(/\\n/g, " ") // Replace escaped newlines with space
      .replace(/\\"/g, '"') // Handle escaped quotes properly
      .trim();

    // Try to extract JSON if it's wrapped in markdown code blocks
    const jsonMatch = cleanedResponse.match(/```(?:json)?([\s\S]*?)```/) || [
      null,
      cleanedResponse,
    ];
    const jsonContent = jsonMatch[1]?.trim() || cleanedResponse;

    // Parse and validate the JSON response
    const jsonResponse = JSON.parse(jsonContent);
    const validatedResponse = LLMResponseSchema.parse(jsonResponse);

    return {
      answer: validatedResponse.answer,
      citations: validatedResponse.citations || []
    };
  } catch (parseError) {
    console.error("Error parsing fallback LLM response as JSON:", parseError);

    // Try to extract a response even if JSON parsing failed
    let extractedAnswer = llmResponse;

    // Try to extract answer text if it looks like JSON but couldn't be parsed
    const answerMatch = llmResponse.match(/"answer"\s*:\s*"([^"]*)"/);
    if (answerMatch && answerMatch[1]) {
      extractedAnswer = answerMatch[1]
        .replace(/\\n/g, "\n")
        .replace(/\\"/g, '"');
    }

    return {
      answer: extractedAnswer,
      citations: []
    };
  }
}

/**
 * Generate a chat title based on the first message
 */
export async function generateChatTitle(firstMessage: string): Promise {
  const prompt = `Generate a short, descriptive title (max 6 words) for a conversation that starts with this message: "${firstMessage}"`;

  const titleGeneration = await callLLM(prompt, TITLE_GENERATION_PROMPT);

  // Clean up the title
  return titleGeneration.trim().replace(/^"(.+)"$/, "$1");
}

/**
 * Process a user message with smart search decision
 */
export async function processUserMessage(
  message: string,
  conversationHistory?: ConversationMessage[],
): Promise {
  try {
    // First determine if we need to search
    const needsSearch = await shouldSearchForQuery(
      message,
      conversationHistory,
    );

    if (needsSearch) {
      console.log("Search needed for query:", message);

      // Generate a search query
      const searchQuery = await generateSearchQuery(message);

      // Perform the search
      const searchResults = await searchWeb(searchQuery);

      // Process the query with search results
      const response = await processQueryWithSearch(
        message,
        searchResults,
        conversationHistory,
      );

      return {
        answer: response.answer,
        citations: response.citations,
        searchQuery,
        searchResults,
      };
    } else {
      console.log("No search needed for query:", message);

      // Process without search
      const response = await processQueryWithoutSearch(
        message,
        conversationHistory,
      );

      // Add empty citations array to be consistent
      return {
        answer: response.answer,
        citations: []
      };
    }
  } catch (error) {
    console.error("Error in processUserMessage:", error);

    // Fallback to processing without search
    const response = await processQueryWithoutSearch(
      message,
      conversationHistory,
    );

    return {
      answer: response.answer,
      citations: []
    };
  }
}
