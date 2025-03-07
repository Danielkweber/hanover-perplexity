import { redirect } from "next/navigation";

export default function Home() {
  // Redirect to the chat page
  redirect("/chat");
}
