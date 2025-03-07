"use client";

import { useState, useRef, useEffect } from "react";
import { api } from "~/trpc/react";

interface Citation {
  title: string;
  url: string;
  relevance?: string;
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: Citation[];
  searchQuery?: string;
}

export default function ChatPage() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const chatMutation = api.chat.sendMessage.useMutation({
    onSuccess: (data) => {
      setMessages((prev) => [
        ...prev,
        { 
          id: `assistant-${Date.now()}`, 
          role: "assistant", 
          content: data.response,
          citations: data.citations,
          searchQuery: data.searchQuery,
        },
      ]);
      setIsLoading(false);
      setError(null);
    },
    onError: (error) => {
      console.error("Error sending message:", error);
      setIsLoading(false);
      setError(error.message || "Failed to get a response. Please try again.");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    // Add user message to the chat
    const newMessage = { 
      id: `user-${Date.now()}`, 
      role: "user" as const, 
      content: input 
    };
    setMessages((prev) => [...prev, newMessage]);
    
    // Clear input, set loading state, and clear any previous errors
    setInput("");
    setIsLoading(true);
    setError(null);
    
    // Focus the input field again
    inputRef.current?.focus();
    
    // Send message to API
    chatMutation.mutate({ content: input });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <div className="flex flex-col h-screen max-w-4xl mx-auto">
      <header className="p-4 border-b bg-gradient-to-r from-blue-600 to-purple-600">
        <h1 className="text-2xl font-bold text-white">Chat with Claude + Web Search</h1>
      </header>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50">
        {messages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center p-8 rounded-lg bg-white shadow-sm max-w-md">
              <h2 className="text-xl font-semibold mb-2">Welcome to Claude with Search</h2>
              <p className="text-gray-600 mb-4">
                Ask Claude anything and get helpful, up-to-date responses from the internet.
              </p>
              <div className="grid grid-cols-1 gap-2 text-sm">
                <button 
                  onClick={() => setInput("What are the latest advancements in AI technology?")}
                  className="p-2 rounded bg-gray-100 hover:bg-gray-200 cursor-pointer text-left"
                >
                  "What are the latest advancements in AI technology?"
                </button>
                <button 
                  onClick={() => setInput("Explain the current situation in Ukraine")}
                  className="p-2 rounded bg-gray-100 hover:bg-gray-200 cursor-pointer text-left"
                >
                  "Explain the current situation in Ukraine"
                </button>
                <button 
                  onClick={() => setInput("What is the current price of Bitcoin and why has it changed recently?")}
                  className="p-2 rounded bg-gray-100 hover:bg-gray-200 cursor-pointer text-left"
                >
                  "What is the current price of Bitcoin and why has it changed recently?"
                </button>
              </div>
            </div>
          </div>
        ) : (
          <>
            {messages.map((message) => (
              <div
                key={message.id}
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
            {isLoading && (
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