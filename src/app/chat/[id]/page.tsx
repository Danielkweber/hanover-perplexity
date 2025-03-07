"use client";

import { useState, useRef, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import { api } from "~/trpc/react";

interface Citation {
  title: string;
  url: string;
  relevance?: string;
}

interface Message {
  id?: string;
  role: "user" | "assistant";
  content: string;
  citations?: Citation[];
  searchQuery?: string;
}

export default function ChatPage({ params }: { params: Promise<{ id: string }> }) {
  // Unwrap the params using React.use()
  const unwrappedParams = use(params);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const router = useRouter();

  // Refs for auto-scrolling and input focus
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  
  // Auto-scroll to bottom of messages
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };
  
  // Scroll when messages change
  useEffect(() => {
    scrollToBottom();
  }, [messages]);
  
  // Focus input on load
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Get chat data
  const { 
    data: chatData, 
    refetch: refetchChat,
    error: chatError,
    isSuccess,
    isLoading: isChatLoading,
    isFetching 
  } = api.chat.getChat.useQuery(
    { id: unwrappedParams.id },
    {
      enabled: !!unwrappedParams.id,
      retry: 1,
      refetchInterval: (data) => {
        // If we have messages but the last one is a user message, keep polling
        // This handles the case where we're waiting for the LLM to respond
        // @ts-ignore - data.messages is defined in the Chat type
        if (data?.messages && data.messages.length > 0) {
          // @ts-ignore - accessing messages array
          const lastMessage = data.messages[data.messages.length - 1];
          // @ts-ignore - lastMessage is defined
          if (lastMessage?.role === "user") {
            return 2000; // Poll every 2 seconds
          }
        }
        
        // Also poll if title is still "New Chat" or hasn't been updated yet
        // @ts-ignore - data.title is defined in the Chat type
        if (data?.title === "New Chat") {
          return 2000; // Poll every 2 seconds for title updates
        }
        
        return false; // Stop polling once we have an assistant response and a proper title
      },
      // Force refetch when this component mounts to ensure we have fresh data
      refetchOnMount: true,
      // Don't stale data for very long, we want to refetch often
      staleTime: 1000,
      // Refresh when window gets focus
      refetchOnWindowFocus: true
    }
  );

  // Use useEffect to handle loading state and data
  useEffect(() => {
    if (chatData) {
      // Set messages from chatData
      setMessages(chatData.messages);
      
      // Show loading indicator while the first message is processing
      const hasAssistantResponse = chatData.messages.some(msg => msg.role === "assistant");
      const hasUserMessageOnly = chatData.messages.length === 1 && chatData.messages[0].role === "user";
      
      if (hasAssistantResponse) {
        // We have at least one assistant response, so we can show the chat
        setIsInitializing(false);
      } else if (hasUserMessageOnly && !isFetching) {
        // We just have a single user message and we're not actively fetching,
        // so we need to force a refetch to look for updates
        void refetchChat();
      } else if (!hasUserMessageOnly && !isChatLoading) {
        // Non-standard state, but we're not loading, so show the chat
        setIsInitializing(false);
      }
    }
    
    if (chatError) {
      setError(`Error loading chat: ${chatError.message}`);
      setIsInitializing(false);
    }
    
    if (isSuccess && !chatData) {
      setError("Could not load chat data");
      setIsInitializing(false);
    }
  }, [chatData, chatError, isSuccess, isChatLoading, isFetching, refetchChat]);
  
  // Set up polling for title updates after initialization
  useEffect(() => {
    if (!isInitializing && chatData?.id) {
      // Poll for updates every 2 seconds for up to 20 seconds (10 attempts)
      let attempts = 0;
      
      const pollInterval = setInterval(() => {
        attempts++;
        void refetchChat();
        
        // Stop polling after 10 attempts or if the user interacts with the chat
        if (attempts >= 10 || messages.length > 1) {
          clearInterval(pollInterval);
        }
      }, 2000);
      
      return () => clearInterval(pollInterval);
    }
  }, [isInitializing, chatData?.id, refetchChat, messages.length]);

  const chatMutation = api.chat.sendMessage.useMutation({
    onSuccess: () => {
      // Refresh the entire chat to ensure we have the latest data
      void refetchChat();
      setIsLoading(false);
      setError(null);
    },
    onError: (error) => {
      console.error("Error sending message:", error);
      setIsLoading(false);
      setError(error.message ?? "Failed to get a response. Please try again.");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    // Optimistically add user message to the chat
    const newMessage: Message = { 
      role: "user", 
      content: input 
    };
    setMessages((prev) => [...prev, newMessage]);
    
    // Clear input, set loading state, and clear any previous errors
    setInput("");
    setIsLoading(true);
    setError(null);
    
    // Focus the input field again
    inputRef.current?.focus();
    
    // Format conversation history for the API
    const conversationHistory = messages.map(msg => ({
      role: msg.role,
      content: msg.content
    }));
    
    // Send message and conversation history to API
    chatMutation.mutate({ 
      content: input,
      chatId: unwrappedParams.id,
      conversationHistory: conversationHistory 
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  // Create a loading indicator variable that shows when initializing or waiting for a message
  const isShowingLoadingIndicator = isLoading || 
                                   (isInitializing && 
                                    chatData?.messages && 
                                    chatData.messages.length > 0 && 
                                    chatData.messages[chatData.messages.length - 1]?.role === "user");
                                    
  // Don't show the full page loading anymore, instead immediately render the chat UI

  return (
    <div className="flex flex-col h-screen w-full">
      <header className="p-4 border-b bg-gradient-to-r from-blue-600 to-purple-600">
        <h1 className="text-2xl font-bold text-white">
          {chatData?.title || "Chat with Claude + Web Search"}
        </h1>
      </header>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50">
        {messages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center p-8 rounded-lg bg-white shadow-sm max-w-md">
              <h2 className="text-xl font-semibold mb-2">This conversation is empty</h2>
              <p className="text-gray-600 mb-4">
                Start by asking Claude a question below.
              </p>
              <div className="grid grid-cols-1 gap-2 text-sm">
                <button 
                  onClick={() => setInput("What are the latest advancements in AI technology?")}
                  className="p-2 rounded bg-gray-100 hover:bg-gray-200 cursor-pointer text-left"
                >
                  &quot;What are the latest advancements in AI technology?&quot;
                </button>
                <button 
                  onClick={() => setInput("Explain the current situation in Ukraine")}
                  className="p-2 rounded bg-gray-100 hover:bg-gray-200 cursor-pointer text-left"
                >
                  &quot;Explain the current situation in Ukraine&quot;
                </button>
                <button 
                  onClick={() => setInput("What is the current price of Bitcoin and why has it changed recently?")}
                  className="p-2 rounded bg-gray-100 hover:bg-gray-200 cursor-pointer text-left"
                >
                  &quot;What is the current price of Bitcoin and why has it changed recently?&quot;
                </button>
              </div>
            </div>
          </div>
        ) : (
          <>
            {messages.map((message, index) => (
              <div
                key={message.id || index}
                className={`p-4 rounded-lg max-w-3xl ${
                  message.role === "user"
                    ? "bg-blue-100 ml-auto text-blue-900"
                    : "bg-white shadow-sm border border-gray-100"
                }`}
              >
                <div className="font-medium mb-1">
                  {message.role === "user" ? "You" : "Claude"}
                </div>
                
                {/* Message content */}
                <div className="whitespace-pre-wrap">{message.content}</div>
                
                {/* Citations section */}
                {message.citations && message.citations.length > 0 && (
                  <div className="mt-4 pt-3 border-t border-gray-200">
                    <div className="text-sm font-medium text-gray-700 mb-2">Sources:</div>
                    <div className="space-y-2">
                      {message.citations.map((citation, i) => (
                        <div key={i} className="text-sm">
                          <a 
                            href={citation.url} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:text-blue-800 hover:underline flex items-start"
                          >
                            <span className="mr-1">🔗</span>
                            <span>{citation.title || citation.url}</span>
                          </a>
                          {citation.relevance && (
                            <p className="text-gray-600 text-xs ml-5 mt-1">{citation.relevance}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                
                {/* Search query info (optional, for debugging) */}
                {message.searchQuery && (
                  <div className="mt-2 text-xs text-gray-400">
                    Search query: {message.searchQuery}
                  </div>
                )}
              </div>
            ))}
            {isShowingLoadingIndicator && (
              <div className="p-4 rounded-lg bg-white shadow-sm border border-gray-100 max-w-3xl">
                <div className="font-medium mb-1">Claude</div>
                <div className="flex flex-col">
                  <div className="flex items-center space-x-2 mb-2">
                    <div className="w-2 h-2 rounded-full bg-gray-400 animate-pulse"></div>
                    <div className="w-2 h-2 rounded-full bg-gray-400 animate-pulse delay-100"></div>
                    <div className="w-2 h-2 rounded-full bg-gray-400 animate-pulse delay-200"></div>
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm text-gray-500">Searching the web for information...</p>
                    <p className="text-xs text-gray-400">I'll find relevant sources and cite them in my response.</p>
                  </div>
                </div>
              </div>
            )}
            {error && (
              <div className="p-4 rounded-lg bg-red-50 border border-red-100 text-red-700 max-w-3xl">
                <div className="font-medium mb-1">Error</div>
                <p>{error}</p>
              </div>
            )}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      <form onSubmit={handleSubmit} className="p-4 border-t bg-white">
        <div className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type your message..."
            className="flex-1 p-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg disabled:bg-blue-300 transition-colors"
          >
            {isLoading ? "Sending..." : "Send"}
          </button>
        </div>
        <div className="text-xs text-gray-500 mt-2 text-center">
          Press Enter to send, Shift+Enter for a new line
        </div>
      </form>
    </div>
  );
}