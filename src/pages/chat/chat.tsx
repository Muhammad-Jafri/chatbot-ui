
import { ChatInput } from "@/components/custom/chatinput";
import { PreviewMessage, ThinkingMessage } from "../../components/custom/message";
import { useScrollToBottom } from '@/components/custom/use-scroll-to-bottom';
import { useState, useRef, useEffect } from "react";
import { message } from "../../interfaces/interfaces";
import { Overview } from "@/components/custom/overview";
import { Header } from "@/components/custom/header";
import { v4 as uuidv4 } from 'uuid';

const post_endpoint = 'https://whiteduckai.duckdns.org/agent/chat'; // TODO resolve the endpoint issue
const ws_endpoint = 'wss://whiteduckai.duckdns.org/agent/chat/stream'; // Make sure this is correct

export function Chat() {
  const [messagesContainerRef, messagesEndRef] = useScrollToBottom<HTMLDivElement>();
  const [messages, setMessages] = useState<message[]>([]);
  const [question, setQuestion] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [conversationId] = useState<string>(uuidv4()); // Generate conversation ID on component mount
  const wsRef = useRef<WebSocket | null>(null);
  const [wsReady, setWsReady] = useState<boolean>(false);
  const [wsError, setWsError] = useState<boolean>(false);

  // Garbage usage to avoid TS6133 errors
  // eslint-disable-next-line @typescript-eslint/no-unused-expressions
  void wsReady;
  // eslint-disable-next-line @typescript-eslint/no-unused-expressions
  void wsError;

  // --- Streaming state ---
  const assistantMessageRef = useRef<string>("");
  const assistantMessageIdRef = useRef<string | null>(null);

  // --- Open WebSocket on mount, close on unmount ---
  useEffect(() => {
    let wsUrl = ws_endpoint;
    if (wsUrl.startsWith('http')) {
      wsUrl = wsUrl.replace(/^http/, 'ws');
    }
    const ws = new window.WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setWsReady(true);
      setWsError(false);
      // Optionally, you can send a ping or handshake here if needed
    };

    ws.onerror = (event) => {
      // Garbage usage to avoid TS6133 error
      void event;
      setWsError(true);
      setWsReady(false);
      setIsLoading(false);
      // Optionally, show error to user
    };

    ws.onclose = () => {
      setWsReady(false);
      setIsLoading(false);
    };

    // Clean up on unmount
    return () => {
      ws.close();
      wsRef.current = null;
      setWsReady(false);
    };
  }, []);

  // Helper to add a message
  const addMessage = (msg: message) => setMessages(prev => [...prev, msg]);

  // Helper to update the last assistant message (for streaming)
  const updateAssistantMessage = (id: string, content: string) => {
    setMessages(prev => {
      // If the last message is the assistant message with this id, update it
      if (prev.length > 0 && prev[prev.length - 1].id === id && prev[prev.length - 1].role === "assistant") {
        return [
          ...prev.slice(0, prev.length - 1),
          { ...prev[prev.length - 1], content }
        ];
      } else {
        // Otherwise, append a new assistant message
        return [...prev, { content, role: "assistant", id }];
      }
    });
  };

  async function handleSubmit(text?: string) {
    if (isLoading) return;

    const messageText = text || question;
    if (!messageText.trim()) return;

    setIsLoading(true);

    const traceId = uuidv4(); // Generate unique ID for this message pair

    // Add user message to the state immediately
    addMessage({ content: messageText, role: "user", id: traceId });
    setQuestion(""); // Clear input field

    // --- Use WebSocket if ready ---
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      // Reset assistant message ref for new message
      assistantMessageRef.current = "";
      const assistantMessageId = uuidv4();
      assistantMessageIdRef.current = assistantMessageId;

      // Add a placeholder assistant message to show streaming
      addMessage({ content: "", role: "assistant", id: assistantMessageId });

      // Handler for streaming tokens
      const handleWSMessage = (event: MessageEvent) => {
        const data = event.data;
        if (data === "[END]") {
          setIsLoading(false);
          wsRef.current?.removeEventListener("message", handleWSMessage);
        } else {
          assistantMessageRef.current += data;
          updateAssistantMessage(assistantMessageId, assistantMessageRef.current);
        }
      };

      wsRef.current.addEventListener("message", handleWSMessage);

      // Send the user message and conversation id
      wsRef.current.send(JSON.stringify({
        message: messageText,
        conversation_id: conversationId
      }));

      // If the socket closes before [END], clean up
      const handleWSClose = () => {
        setIsLoading(false);
        wsRef.current?.removeEventListener("message", handleWSMessage);
        wsRef.current?.removeEventListener("close", handleWSClose);
      };
      wsRef.current.addEventListener("close", handleWSClose);

      // If error, fallback to REST
      wsRef.current.addEventListener("error", () => {
        setIsLoading(false);
        addMessage({ content: "Sorry, there was an error processing your request.", role: "assistant", id: uuidv4() });
        wsRef.current?.removeEventListener("message", handleWSMessage);
        wsRef.current?.removeEventListener("close", handleWSClose);
      });

    } else {
      // Fallback to REST if WebSocket is not ready
      try {
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
        addMessage({ content: data.bot, role: "assistant", id: uuidv4() });

      } catch (error) {
        addMessage({ content: "Sorry, there was an error processing your request.", role: "assistant", id: uuidv4() });
      } finally {
        setIsLoading(false);
      }
    }
  }

  return (
    <div className="flex flex-col min-w-0 h-dvh bg-background">
      <Header/>
      <div className="flex flex-col min-w-0 gap-6 flex-1 overflow-y-scroll pt-4" ref={messagesContainerRef}>
        {messages.length == 0 && <Overview />}
        {messages.map((message, index) => (
          <PreviewMessage key={message.id || index} message={message} />
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