import { db } from "./index";
import { chats, messages, citations, searchResults } from "./schema";
import { eq, desc } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";

export interface Citation {
  title: string;
  url: string;
  relevance?: string;
}

export interface SearchResult {
  query: string;
  results: unknown;
}

export interface ChatMessage {
  id?: string;
  role: "user" | "assistant";
  content: string;
  searchQuery?: string;
  citations?: Citation[];
  orderIndex?: number;
}

export interface Chat {
  id?: string;
  title: string;
  messages: ChatMessage[];
}

/**
 * Creates a new chat with initial messages
 */
export async function createChat(chat: Chat): Promise<string> {
  // Insert the chat
  const chatId = chat.id || uuidv4();
  await db.insert(chats).values({
    id: chatId,
    title: chat.title,
  });
  
  // Insert all messages
  if (chat.messages.length > 0) {
    await Promise.all(
      chat.messages.map((message, index) => {
        return addMessageToChat(chatId, {
          ...message,
          orderIndex: message.orderIndex || index,
        });
      })
    );
  }
  
  return chatId;
}

/**
 * Adds a message to an existing chat
 */
export async function addMessageToChat(
  chatId: string, 
  message: ChatMessage
): Promise<string> {
  const messageId = message.id || uuidv4();
  
  // Insert the message
  await db.insert(messages).values({
    id: messageId,
    chatId,
    role: message.role,
    content: message.content,
    searchQuery: message.searchQuery,
    orderIndex: message.orderIndex || 0,
  });
  
  // Insert citations if any
  if (message.citations && message.citations.length > 0) {
    await Promise.all(
      message.citations.map(citation => {
        return db.insert(citations).values({
          id: uuidv4(),
          messageId,
          title: citation.title,
          url: citation.url,
          relevance: citation.relevance,
        });
      })
    );
  }
  
  return messageId;
}

/**
 * Adds search results to a message
 */
export async function addSearchResultsToMessage(
  messageId: string,
  query: string,
  results: unknown
): Promise<void> {
  await db.insert(searchResults).values({
    id: uuidv4(),
    messageId,
    query,
    results,
  });
}

/**
 * Gets a chat by ID with all messages and citations
 */
export async function getChatById(chatId: string): Promise<Chat | null> {
  // Get the chat
  const chatResult = await db
    .select()
    .from(chats)
    .where(eq(chats.id, chatId));
  
  if (chatResult.length === 0) {
    return null;
  }
  
  const chat = chatResult[0];
  
  // Get all messages for this chat
  const messagesResult = await db
    .select()
    .from(messages)
    .where(eq(messages.chatId, chatId))
    .orderBy(messages.orderIndex);
  
  // Get all citations for these messages
  const messageIds = messagesResult.map(m => m.id);
  const citationsResult = await db
    .select()
    .from(citations)
    .where(messageIds.length > 0 ? 
      citeIn(citations.messageId, messageIds) : 
      eq(citations.messageId, "")
    );
  
  // Map citations to their messages
  const citationsByMessageId = new Map<string, Citation[]>();
  citationsResult.forEach(citation => {
    if (!citationsByMessageId.has(citation.messageId)) {
      citationsByMessageId.set(citation.messageId, []);
    }
    citationsByMessageId.get(citation.messageId)?.push({
      title: citation.title || "",
      url: citation.url,
      relevance: citation.relevance || undefined,
    });
  });
  
  // Construct the chat with messages and citations
  return {
    id: chat.id,
    title: chat.title,
    messages: messagesResult.map(message => ({
      id: message.id,
      role: message.role as "user" | "assistant",
      content: message.content,
      searchQuery: message.searchQuery || undefined,
      citations: citationsByMessageId.get(message.id) || [],
      orderIndex: message.orderIndex,
    })),
  };
}

/**
 * Gets all chats
 */
export async function getAllChats(): Promise<{ id: string; title: string; updatedAt: Date }[]> {
  return await db
    .select({
      id: chats.id,
      title: chats.title,
      updatedAt: chats.updatedAt,
    })
    .from(chats)
    .orderBy(desc(chats.updatedAt));
}

/**
 * Updates a chat's title
 */
export async function updateChatTitle(chatId: string, newTitle: string): Promise<void> {
  await db
    .update(chats)
    .set({ title: newTitle })
    .where(eq(chats.id, chatId));
}

/**
 * Deletes a chat and all its messages
 */
export async function deleteChat(chatId: string): Promise<void> {
  await db.delete(chats).where(eq(chats.id, chatId));
}

// Helper for 'in' queries
function citeIn(column: any, values: string[]) {
  return {
    operator: "in" as const,
    column,
    value: values,
  };
}