import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../AuthContext';
import { useSettings } from '../SettingsContext';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, query, orderBy, onSnapshot, addDoc, serverTimestamp, where, limit } from 'firebase/firestore';
import { aiChatAssistant } from '../lib/gemini';
import { encryptForRecipient, decryptMessage } from '../lib/encryption';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Send, Bot, User, Loader2, Sparkles, Info, HelpCircle, Lightbulb } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '@/lib/utils';

function renderFormattedMessage(text: string) {
  if (!text) return null;

  // Split content by lines
  const lines = text.split('\n');
  const renderedElements: React.ReactNode[] = [];
  
  let currentListItems: { key: string; element: React.ReactNode }[] = [];
  let currentListType: 'ul' | 'ol' | null = null;

  const flushList = (keyPrefix: string) => {
    if (currentListItems.length > 0) {
      if (currentListType === 'ul') {
        renderedElements.push(
          <ul key={`ul-${keyPrefix}`} className="text-inherit">
            {currentListItems.map((item) => item.element)}
          </ul>
        );
      } else if (currentListType === 'ol') {
        renderedElements.push(
          <ol key={`ol-${keyPrefix}`} className="text-inherit">
            {currentListItems.map((item) => item.element)}
          </ol>
        );
      }
      currentListItems = [];
      currentListType = null;
    }
  };

  const parseInlineStyles = (lineText: string) => {
    const parts = [];
    let currentIndex = 0;
    const boldRegex = /\*\*(.*?)\*\*/g;
    let match;

    while ((match = boldRegex.exec(lineText)) !== null) {
      const matchIndex = match.index;
      if (matchIndex > currentIndex) {
        parts.push(
          <React.Fragment key={`text-pre-${matchIndex}`}>
            {lineText.substring(currentIndex, matchIndex)}
          </React.Fragment>
        );
      }
      parts.push(<strong key={`bold-${matchIndex}`} className="font-extrabold text-slate-900 dark:text-white">{match[1]}</strong>);
      currentIndex = boldRegex.lastIndex;
    }

    if (currentIndex < lineText.length) {
      parts.push(
        <React.Fragment key={`text-post-${currentIndex}`}>
          {lineText.substring(currentIndex)}
        </React.Fragment>
      );
    }

    return parts.length > 0 ? parts : lineText;
  };

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    
    const ulMatch = trimmed.match(/^[-*]\s+(.*)$/);
    const olMatch = trimmed.match(/^\d+\.\s+(.*)$/);

    if (ulMatch) {
      if (currentListType !== 'ul') {
        flushList(`flush-${index}`);
        currentListType = 'ul';
      }
      currentListItems.push({
        key: `li-${index}`,
        element: (
          <li key={`li-${index}`}>
            {parseInlineStyles(ulMatch[1])}
          </li>
        )
      });
    } else if (olMatch) {
      if (currentListType !== 'ol') {
        flushList(`flush-${index}`);
        currentListType = 'ol';
      }
      currentListItems.push({
        key: `li-${index}`,
        element: (
          <li key={`li-${index}`}>
            {parseInlineStyles(olMatch[1])}
          </li>
        )
      });
    } else {
      flushList(`flush-${index}`);
      if (trimmed) {
        renderedElements.push(
          <p key={`p-${index}`} className="mb-2 last:mb-0 leading-relaxed">
            {parseInlineStyles(line)}
          </p>
        );
      } else if (index < lines.length - 1) {
        renderedElements.push(<div key={`br-${index}`} className="h-2" />);
      }
    }
  });

  flushList(`final`);

  return <div className="space-y-1">{renderedElements}</div>;
}

export default function ZathuAssistant() {
  const { user, profile, keys } = useAuth();
  const { t } = useSettings();
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, 'ai_chats'),
      where('userId', '==', user.uid),
      orderBy('createdAt', 'asc'),
      limit(50)
    );

    const unsubscribe = onSnapshot(q, async (snapshot) => {
      const messagesData = await Promise.all(snapshot.docs.map(async chatDoc => {
        const data = chatDoc.data();
        let text = data.text;

        if (data.isEncrypted && data.ciphertext && keys) {
          // If we have a stored public key, we can check if it matches our current keypair
          // to avoid errors, although we still can't decrypt if they don't match.
          if (data.recipientPubKey && data.recipientPubKey !== keys.publicKey) {
            text = "[Encrypted for a different key pair]";
          } else {
            text = await decryptMessage(data.ciphertext, keys);
          }
        }

        return {
          id: chatDoc.id,
          ...data,
          text
        };
      }));
      setMessages(messagesData);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'ai_chats');
    });

    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !user) return;

    const userText = newMessage;
    setNewMessage('');
    setLoading(true);

    try {
      let ciphertext = "";
      let isEncrypted = false;
      
      // Always use the public key from the profile for consistency
      const targetPubKey = profile?.publicKey || keys?.publicKey;
      
      if (targetPubKey && keys) {
        ciphertext = await encryptForRecipient(userText, targetPubKey);
        isEncrypted = true;
      }

      // Save user message
      await addDoc(collection(db, 'ai_chats'), {
        userId: user.uid,
        role: 'user',
        text: isEncrypted ? "[Encrypted]" : userText,
        ciphertext: isEncrypted ? ciphertext : null,
        recipientPubKey: isEncrypted ? keys.publicKey : null,
        isEncrypted,
        createdAt: serverTimestamp()
      });

      // Prepare history for Gemini
      const history = messages.slice(-10).map(m => ({
        role: m.role as "user" | "model",
        parts: [{ text: m.text }]
      }));

      // Get AI response
      const aiResponse = await aiChatAssistant(userText, history);

      let aiCiphertext = "";
      if (targetPubKey && keys) {
        aiCiphertext = await encryptForRecipient(aiResponse, targetPubKey);
      }

      // Save AI response
      await addDoc(collection(db, 'ai_chats'), {
        userId: user.uid,
        role: 'model',
        text: isEncrypted ? "[Encrypted]" : aiResponse,
        ciphertext: isEncrypted ? aiCiphertext : null,
        recipientPubKey: isEncrypted ? targetPubKey : null,
        isEncrypted,
        createdAt: serverTimestamp()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'ai_chats');
    } finally {
      setLoading(false);
    }
  };

  const suggestions = [
    { text: "Help me with agriculture in Malawi", icon: <Sparkles size={14} className="text-emerald-500" /> },
    { text: "Business registration advice", icon: <Lightbulb size={14} className="text-amber-500" /> },
    { text: "How to use Zathu Wallet", icon: <HelpCircle size={14} className="text-blue-500" /> },
    { text: "What's trending in Malawi?", icon: <Bot size={14} className="text-purple-500" /> }
  ];

  return (
    <div className="flex flex-col h-full bg-slate-50 dark:bg-slate-950 transition-colors">
      {/* Header */}
      <div className="p-4 bg-white dark:bg-slate-900 border-b border-border shadow-sm flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center text-white shadow-lg shadow-primary/20">
          <Bot size={24} />
        </div>
        <div>
          <h1 className="font-black text-lg">Zathu Smart Assistant</h1>
          <div className="flex items-center gap-1.5 text-[10px] text-primary font-bold uppercase tracking-widest">
            <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
            Active & Ready
          </div>
        </div>
      </div>

      {/* Chat History */}
      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-4 space-y-4 scroll-smooth"
      >
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center py-10 text-center space-y-6">
            <div className="w-20 h-20 rounded-[2.5rem] bg-white dark:bg-slate-900 border border-border shadow-soft flex items-center justify-center text-primary mb-2">
              <Bot size={40} />
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">Welcome to Zathu AI</h2>
              <p className="text-sm text-text-muted max-w-xs mx-auto">
                Your smart companion for community insights, Malawian business advice, and more.
              </p>
            </div>
            
            <div className="grid grid-cols-1 gap-2 w-full max-w-sm">
              {suggestions.map((s, idx) => (
                <button
                  key={idx}
                  onClick={() => setNewMessage(s.text)}
                  className="flex items-center gap-3 p-3.5 bg-white dark:bg-slate-900 border border-border rounded-2xl hover:border-primary/50 text-left text-sm font-medium transition-all hover:translate-x-1 active:scale-95"
                >
                  <div className="p-2 bg-slate-50 dark:bg-slate-800 rounded-xl">
                    {s.icon}
                  </div>
                  {s.text}
                </button>
              ))}
            </div>
          </div>
        )}

        <AnimatePresence initial={false}>
          {messages.map((m) => (
            <motion.div
              key={m.id}
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              className={cn(
                "flex w-full mb-4",
                m.role === 'user' ? "justify-end" : "justify-start"
              )}
            >
              <div className={cn(
                "flex max-w-[85%] gap-2.5 items-end",
                m.role === 'user' ? "flex-row-reverse" : "flex-row"
              )}>
                <div className={cn(
                  "w-8 h-8 rounded-xl flex items-center justify-center shrink-0 border border-border/50 shadow-sm",
                  m.role === 'user' ? "bg-white dark:bg-slate-800" : "bg-primary text-white"
                )}>
                  {m.role === 'user' ? <User size={14} /> : <Bot size={14} />}
                </div>
                <div className={cn(
                  "p-3.5 rounded-[1.25rem] text-sm leading-relaxed shadow-sm",
                  m.role === 'user' 
                    ? "bg-white dark:bg-slate-800 rounded-br-none border border-border text-slate-700 dark:text-slate-200" 
                    : "bg-primary/10 dark:bg-primary/20 border border-primary/20 text-slate-800 dark:text-slate-100 rounded-bl-none"
                )}>
                  {renderFormattedMessage(m.text)}
                </div>
              </div>
            </motion.div>
          ))}
          {loading && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex justify-start items-end gap-2.5"
            >
              <div className="w-8 h-8 rounded-xl bg-primary flex items-center justify-center text-white shrink-0">
                <Bot size={14} />
              </div>
              <div className="p-4 bg-primary/10 dark:bg-primary/20 rounded-[1.25rem] rounded-bl-none border border-primary/20">
                <Loader2 size={16} className="animate-spin text-primary" />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Input */}
      <div className="p-4 bg-white dark:bg-slate-900 border-t border-border sticky bottom-0">
        <form onSubmit={handleSendMessage} className="flex gap-2">
          <Input
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="Type your question..."
            className="flex-1 bg-slate-50 dark:bg-slate-800 border-none rounded-2xl h-12 text-sm focus-visible:ring-primary/30"
          />
          <Button 
            type="submit" 
            disabled={!newMessage.trim() || loading}
            className="w-12 h-12 rounded-2xl bg-primary hover:bg-primary/90 text-white shadow-lg shadow-primary/20 flex items-center justify-center shrink-0 active:scale-90 transition-all"
          >
            <Send size={20} />
          </Button>
        </form>
        <p className="text-[10px] text-center text-text-muted mt-3 font-medium uppercase tracking-[0.15em]">
          Powered by Gemini AI Intelligence
        </p>
      </div>
    </div>
  );
}
