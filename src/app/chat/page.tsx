"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link"; 
import { api } from "~/trpc/react";

export default function ChatListPage() {
  const router = useRouter();
  const [newChatPrompt, setNewChatPrompt] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Get all chats
  const { data: chats, isLoading, refetch } = api.chat.getChats.useQuery();

  // Create new chat mutation
  const createChatMutation = api.chat.createChat.useMutation({
    onSuccess: (data) => {
      setIsCreating(false);
      void refetch();
      // Redirect to the new chat
      router.push(`/chat/${data.id}`);
    },
    onError: (error) => {
      setIsCreating(false);
      setError(error.message || "Failed to create chat. Please try again.");
    }
  });

  // Delete chat mutation
  const deleteChatMutation = api.chat.deleteChat.useMutation({
    onSuccess: () => {
      void refetch();
    },
    onError: (error) => {
      setError(error.message || "Failed to delete chat. Please try again.");
    }
  });

  const handleCreateChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newChatPrompt.trim() || isCreating) return;

    setIsCreating(true);
    setError(null);

    // Create a new chat with first message
    createChatMutation.mutate({
      title: "New Chat", // Will be updated automatically based on the first message
      firstMessage: newChatPrompt,
    });
  };

  const handleDeleteChat = (chatId: string) => {
    if (confirm("Are you sure you want to delete this chat?")) {
      deleteChatMutation.mutate({ chatId });
    }
  };

  // Format date to a readable string
  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
    }).format(new Date(date));
  };

  return (
    <div className="flex flex-col min-h-screen max-w-4xl mx-auto p-4">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Your Chats</h1>
        <p className="text-gray-600">Ask Claude anything and get up-to-date information with web search.</p>
      </header>

      <div className="mb-8">
        <form onSubmit={handleCreateChat} className="flex flex-col gap-4">
          <div className="flex items-center gap-4">
            <input
              type="text"
              value={newChatPrompt}
              onChange={(e) => setNewChatPrompt(e.target.value)}
              placeholder="Ask Claude anything..."
              className="flex-1 p-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={isCreating}
            />
            <button
              type="submit"
              disabled={isCreating || !newChatPrompt.trim()}
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg disabled:bg-blue-300 transition-colors"
            >
              {isCreating ? "Creating..." : "New Chat"}
            </button>
          </div>
          {error && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-100 text-red-700">
              {error}
            </div>
          )}
        </form>
      </div>

      <div className="flex-1">
        <h2 className="text-xl font-semibold mb-4 text-gray-800">Recent Conversations</h2>
        
        {isLoading ? (
          <div className="flex justify-center items-center py-8">
            <div className="flex items-center space-x-2">
              <div className="w-3 h-3 rounded-full bg-blue-500 animate-pulse"></div>
              <div className="w-3 h-3 rounded-full bg-blue-500 animate-pulse delay-100"></div>
              <div className="w-3 h-3 rounded-full bg-blue-500 animate-pulse delay-200"></div>
            </div>
          </div>
        ) : chats && chats.length > 0 ? (
          <div className="grid gap-4">
            {chats.map((chat) => (
              <div key={chat.id} className="bg-white rounded-lg border p-4 hover:shadow-md transition-shadow flex justify-between items-center">
                <Link href={`/chat/${chat.id}`} className="flex-1">
                  <div className="font-medium text-lg text-blue-700 hover:text-blue-900 transition-colors">
                    {chat.title}
                  </div>
                  <div className="text-sm text-gray-500 mt-1">
                    {chat.updatedAt ? formatDate(chat.updatedAt) : "Just now"}
                  </div>
                </Link>
                <button
                  onClick={() => handleDeleteChat(chat.id)}
                  className="p-2 text-gray-500 hover:text-red-500 transition-colors"
                  aria-label="Delete chat"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-10 bg-gray-50 rounded-lg">
            <p className="text-gray-600 mb-4">No conversations yet. Start a new chat above!</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-2xl mx-auto">
              <button 
                onClick={() => setNewChatPrompt("What are the latest advancements in AI technology?")}
                className="p-3 rounded-lg bg-gray-100 hover:bg-gray-200 text-left text-sm"
              >
                "What are the latest advancements in AI technology?"
              </button>
              <button 
                onClick={() => setNewChatPrompt("Explain the current situation in Ukraine")}
                className="p-3 rounded-lg bg-gray-100 hover:bg-gray-200 text-left text-sm"
              >
                "Explain the current situation in Ukraine"
              </button>
              <button 
                onClick={() => setNewChatPrompt("What is the current price of Bitcoin and why has it changed recently?")}
                className="p-3 rounded-lg bg-gray-100 hover:bg-gray-200 text-left text-sm"
              >
                "What is the current price of Bitcoin?"
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}