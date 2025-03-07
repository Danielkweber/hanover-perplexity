"use client";

import ChatSidebar from "~/app/_components/chat-sidebar";

export default function ChatLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen bg-white">
      <ChatSidebar />
      <main className="flex-1 overflow-hidden">{children}</main>
    </div>
  );
}