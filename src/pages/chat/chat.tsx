import { ChatInput } from "@/components/custom/chatinput";
import { PreviewMessage, ThinkingMessage } from "../../components/custom/message";
import { useScrollToBottom } from '@/components/custom/use-scroll-to-bottom';
import { useState, useRef, useEffect } from "react";
import { message } from "../../interfaces/interfaces";
import { Overview } from "@/components/custom/overview";
import { Header } from "@/components/custom/header";
import { v4 as uuidv4 } from 'uuid';

const post_endpoint = import.meta.env.VITE_BOT_ENDPOINT || '/agent/chat'; // TODO resolve the endpoint issue

export function Chat() {
  const [messagesContainerRef, messagesEndRef] = useScrollToBottom<HTMLDivElement>();
  const [messages, setMessages] = useState<message[]>([]);
  const [question, setQuestion] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [conversationId, setConversationId] = useState<string>(uuidv4()); // Generate conversation ID on component mount

  async function handleSubmit(text?: string) {
    if (isLoading) return;

    const messageText = text || question;
    if (!messageText.trim()) return;
    
    setIsLoading(true);
    
    const traceId = uuidv4(); // Generate unique ID for this message pair
    
    // Add user message to the state immediately
    setMessages(prev => [...prev, { content: messageText, role: "user", id: traceId }]);
    setQuestion(""); // Clear input field
    
    try {
      // Make API request
      const response = await fetch(post_endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: messageText,
          conversation_id: conversationId
        })
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      
      // Add assistant's response to messages
      setMessages(prev => [
        ...prev, 
        { content: data.bot, role: "assistant", id: traceId }
      ]);
      
    } catch (error) {
      console.error("API request error:", error);
      // Optionally add an error message to the chat
      setMessages(prev => [
        ...prev, 
        { content: "Sorry, there was an error processing your request.", role: "assistant", id: traceId }
      ]);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="flex flex-col min-w-0 h-dvh bg-background">
      <Header/>
      <div className="flex flex-col min-w-0 gap-6 flex-1 overflow-y-scroll pt-4" ref={messagesContainerRef}>
        {messages.length == 0 && <Overview />}
        {messages.map((message, index) => (
          <PreviewMessage key={index} message={message} />
        ))}
        {isLoading && <ThinkingMessage />}
        <div ref={messagesEndRef} className="shrink-0 min-w-[24px] min-h-[24px]"/>
      </div>
      <div className="flex mx-auto px-4 bg-background pb-4 md:pb-6 gap-2 w-full md:max-w-3xl">
        <ChatInput  
          question={question}
          setQuestion={setQuestion}
          onSubmit={handleSubmit}
          isLoading={isLoading}
        />
      </div>
    </div>
  );
}