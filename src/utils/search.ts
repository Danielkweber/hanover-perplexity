import Exa from "exa-js";
import { env } from "~/env";

// Initialize the Exa search client
let exaClient: Exa | null = null;

// Function to get the Exa client (initializing if needed)
function getExaClient(): Exa {
  if (!exaClient) {
    if (!env.EXA_API_KEY) {
      throw new Error("EXA_API_KEY is not set in environment variables");
    }
    
    exaClient = new Exa(env.EXA_API_KEY);
  }
  
  return exaClient;
}

export interface SearchResult {
  title: string;
  url: string;
  content: string;
  publishedDate?: string;
}

/**
 * Searches the web using Exa's API and retrieves content from pages
 * @param query The search query
 * @param numResults The number of results to return (default: 3)
 * @returns Array of search results with title, URL, and content
 */
export async function searchWeb(query: string, numResults: number = 3): Promise<SearchResult[]> {
  try {
    const client = getExaClient();
    
    // Perform the search and get contents
    const results = await client.searchAndContents(
      query,
      {
        numResults,
        text: true,
        highlights: true
      }
    );
    
    // Format the results
    return results.results.map(result => ({
      title: result.title || "No title",
      url: result.url,
      content: result.text || result.highlight || "No content available",
      publishedDate: result.publishedDate,
    }));
  } catch (error) {
    console.error("Error searching with Exa:", error);
    throw new Error("Failed to search the web. Please try again.");
  }
}