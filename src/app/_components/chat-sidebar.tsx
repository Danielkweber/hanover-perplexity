"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { api } from "~/trpc/react";

export default function ChatSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const promptParam = searchParams.get('prompt');
  const [newChatPrompt, setNewChatPrompt] = useState(promptParam || "");
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  // Update input when the prompt param changes
  useEffect(() => {
    if (promptParam) {
      setNewChatPrompt(promptParam);
      setIsSidebarOpen(true); // Open sidebar when a prompt is provided
    }
  }, [promptParam]);

  // Get all chats with a short polling interval to get updated titles
  const { data: chats = [], isLoading, refetch } = api.chat.getChats.useQuery(
    undefined, // No input parameters
    {
      refetchInterval: 3000, // Poll every 3 seconds for updates
      refetchOnWindowFocus: true, // Also refetch when window gets focus
      staleTime: 1000 // Consider data stale after 1 second
    }
  );

  // Create new chat mutation
  const createChatMutation = api.chat.createChat.useMutation({
    onSuccess: (data) => {
      setIsCreating(false);
      setNewChatPrompt("");
      
      // Force a refetch to get the latest chat list with titles
      void refetch();
      
      // Set up periodic polling to catch title updates
      const pollForTitle = async () => {
        await refetch();
        // Check if the title has updated from "New Chat"
        const updatedChat = (await refetch()).data?.find(c => c.id === data.id);
        if (updatedChat && updatedChat.title !== "New Chat") {
          clearInterval(pollInterval);
        }
      };
      
      // Poll every second for title updates for a maximum of 15 seconds
      const pollInterval = setInterval(pollForTitle, 1000);
      setTimeout(() => clearInterval(pollInterval), 15000);
      
      // Redirect to the new chat with a small delay
      setTimeout(() => {
        router.push(`/chat/${data.id}`);
      }, 100);
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
      // If we're on the deleted chat page, redirect to home
      if (pathname.startsWith("/chat/") && chats && chats.length > 0) {
        const currentChatId = pathname.split("/").pop();
        const chatExists = chats.some(chat => chat.id === currentChatId);
        if (!chatExists) {
          router.push("/");
        }
      }
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

  const handleDeleteChat = (chatId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (confirm("Are you sure you want to delete this chat?")) {
      deleteChatMutation.mutate({ chatId });
    }
  };

  // Format date to a readable string
  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
    }).format(new Date(date));
  };

  // Determine if we're on a chat page and which chat is active
  const activeChatId = pathname.startsWith("/chat/") 
    ? pathname.split("/").pop() 
    : null;

  return (
    <div className={`flex flex-col h-screen bg-gray-50 border-r border-gray-200 transition-all ${isSidebarOpen ? 'w-80' : 'w-16'}`}>
      {/* Toggle button for mobile */}
      <button 
        onClick={() => setIsSidebarOpen(!isSidebarOpen)}
        className="md:hidden p-2 m-2 bg-gray-200 rounded"
        aria-label={isSidebarOpen ? "Close sidebar" : "Open sidebar"}
      >
        {isSidebarOpen ? '←' : '→'}
      </button>

      <div className={`flex-1 flex flex-col ${isSidebarOpen ? 'px-4' : 'px-2'} py-4 overflow-hidden`}>
        {/* New chat button and input */}
        <div className="mb-4">
          {isSidebarOpen ? (
            <form onSubmit={handleCreateChat} className="space-y-2">
              <input
                type="text"
                value={newChatPrompt}
                onChange={(e) => setNewChatPrompt(e.target.value)}
                placeholder="Ask Claude anything..."
                className="w-full p-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                disabled={isCreating}
              />
              <button
                type="submit"
                disabled={isCreating || !newChatPrompt.trim()}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-lg disabled:bg-blue-300 transition-colors text-sm"
              >
                {isCreating ? "Creating..." : "New Chat"}
              </button>
              {error && (
                <div className="p-2 rounded-lg bg-red-50 border border-red-100 text-red-700 text-xs">
                  {error}
                </div>
              )}
            </form>
          ) : (
            <button
              onClick={() => setIsSidebarOpen(true)}
              className="w-full p-2 bg-blue-600 text-white rounded-lg text-center"
              title="New Chat"
            >
              +
            </button>
          )}
        </div>
        
        {/* Chat list */}
        <div className="flex-1 overflow-y-auto">
          <h2 className={`text-sm font-medium text-gray-500 mb-2 ${!isSidebarOpen && 'sr-only'}`}>
            Recent Conversations
          </h2>
          
          {isLoading ? (
            <div className="flex justify-center items-center py-4">
              <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
            </div>
          ) : chats && chats.length > 0 ? (
            <div className="space-y-1">
              {chats.map((chat) => (
                <Link 
                  key={chat.id} 
                  href={`/chat/${chat.id}`}
                  className={`flex items-center justify-between p-2 rounded-lg transition-colors ${
                    activeChatId === chat.id 
                      ? 'bg-blue-100 text-blue-800' 
                      : 'hover:bg-gray-100'
                  }`}
                >
                  {isSidebarOpen ? (
                    <>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate">{chat.title}</div>
                        <div className="text-xs text-gray-500">
                          {chat.updatedAt ? formatDate(chat.updatedAt) : "Just now"}
                        </div>
                      </div>
                      <button
                        onClick={(e) => handleDeleteChat(chat.id, e)}
                        className="ml-2 p-1 text-gray-400 hover:text-red-500 transition-colors"
                        aria-label="Delete chat"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </>
                  ) : (
                    <div className="w-full text-center text-xs truncate" title={chat.title}>
                      {chat.title.charAt(0)}
                    </div>
                  )}
                </Link>
              ))}
            </div>
          ) : (
            <div className={`text-center py-6 ${!isSidebarOpen && 'sr-only'}`}>
              <p className="text-gray-500 text-sm">No conversations yet</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}