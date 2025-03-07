"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";

export default function ChatHome() {
  const [selectedPrompt, setSelectedPrompt] = useState("");
  const router = useRouter();

  const samplePrompts = [
    "What are the latest advancements in AI technology?",
    "Explain the current situation in Ukraine",
    "What is the current price of Bitcoin and why has it changed recently?",
    "Tell me about the health benefits of intermittent fasting",
    "What are the most promising renewable energy technologies?",
    "Explain quantum computing for beginners"
  ];
  
  // Function to set the prompt in the sidebar
  const usePrompt = (prompt: string) => {
    router.push(`/chat?prompt=${encodeURIComponent(prompt)}`);
  };

  return (
    <div className="flex flex-col h-screen">
      <header className="p-4 border-b bg-gradient-to-r from-blue-600 to-purple-600">
        <h1 className="text-2xl font-bold text-white">Chat with Claude + Web Search</h1>
      </header>

      <div className="flex-1 flex flex-col items-center justify-center p-6 bg-gray-50">
        <div className="max-w-2xl w-full bg-white rounded-xl shadow-sm p-6 text-center">
          <div className="mb-6">
            <div className="w-24 h-24 rounded-full bg-gradient-to-r from-blue-400 to-purple-500 mx-auto flex items-center justify-center">
              <svg 
                xmlns="http://www.w3.org/2000/svg" 
                viewBox="0 0 24 24" 
                fill="white" 
                className="w-12 h-12"
              >
                <path d="M11.97 22c-4.4 0-8.48-2.42-10.57-6.32a1 1 0 0 1 1.35-1.36c2.76 1.75 6.37 1.5 8.79-.59 2.46-2.12 3.13-5.78 1.62-8.66a1 1 0 0 1 1.43-1.32c3.41 2.66 5.4 6.75 5.38 11.12a11.23 11.23 0 0 1-8 7.13Z" />
                <path d="M11.97 14a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold mt-4 text-gray-800">Welcome to Claude</h2>
            <p className="text-gray-600 mt-2">
              Ask me anything and I'll provide helpful answers using the latest information from the web.
            </p>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium text-gray-700 text-left mb-2">Try asking about:</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {samplePrompts.map((prompt, index) => (
                <button 
                  key={index}
                  className="p-3 bg-gray-100 hover:bg-gray-200 rounded-lg text-left text-sm transition-colors"
                  onClick={() => {
                    setSelectedPrompt(prompt);
                    // Short delay to show the selected prompt before navigating
                    setTimeout(() => usePrompt(prompt), 300);
                  }}
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
          
          {selectedPrompt && (
            <div className="mt-6 p-3 bg-blue-50 border border-blue-100 rounded-lg">
              <p className="text-sm text-blue-700">
                <span className="font-medium">Selected:</span> {selectedPrompt}
              </p>
              <p className="text-xs text-blue-500 mt-1">
                Use the form in the sidebar to start a new chat with this prompt
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}