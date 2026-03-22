import { useState, useEffect, useRef } from 'react';
import { MessageSquare, X, Send } from 'lucide-react';

const faqs = [
  { q: "How do I cast my vote?", a: "To cast your vote, go to the 'Active Elections' tab, click on an open election, select your preferred candidate, and use the camera to verify your face. Once verified, your vote will be securely encrypted and submitted!" },
  { q: "Is my vote really secure?", a: "Yes! Your vote is mathematically encrypted using Homomorphic Encryption before it ever leaves your device. It is then securely anchored to a local blockchain ledger, making it tamper-proof and completely anonymous." },
  { q: "How do I track my vote?", a: "After you vote, you'll receive a unique Tracking ID. Go to the 'Track Vote' tab and enter this ID to independently verify that your vote was counted and hasn't been altered." },
  { q: "When will I see the results?", a: "Once the election administrator officially closes the election and tallies the votes, the final results will automatically appear in your 'Past Results' tab." }
];

const intents = [
  {
    keywords: ['vote', 'cast', 'choose', 'candidate', 'ballot', 'participate'],
    response: "To cast your vote, go to the 'Active Elections' tab, click on an open election, select your preferred candidate, and use the camera to verify your face."
  },
  {
    keywords: ['secure', 'safe', 'blockchain', 'hack', 'privacy', 'anonymous', 'homomorphic', 'encryption', 'tamper'],
    response: "Your vote is highly secure! It is mathematically encrypted using Homomorphic Encryption before it ever leaves your device, making it tamper-proof."
  },
  {
    keywords: ['track', 'receipt', 'id', 'verify', 'counted', 'proof'],
    response: "After you vote, you'll receive a unique Tracking ID. Go to the 'Track Vote' tab and enter this ID to verify your vote was safely counted!"
  },
  {
    keywords: ['result', 'winner', 'past', 'tally', 'outcome', 'concluded', 'finished'],
    response: "Once the election administrator officially closes the election and tallies the votes, the final results will automatically appear in your 'Past Results' tab."
  },
  {
    keywords: ['hi', 'hello', 'hey', 'greetings', 'help', 'guide', 'stov'],
    response: "Hello there! How can I help you navigate the STOV system today? Ask me about voting, security, tracking, or results."
  },
  {
    keywords: ['camera', 'face', 'blink', 'scan', 'biometric', 'detect', 'video', 'lens', 'liveness'],
    response: "The camera is used to verify your identity. Make sure you are in a well-lit room, face the camera directly, and blink when prompted for liveness detection."
  },
  {
    keywords: ['admin', 'create', 'setup', 'close', 'administrator', 'panel'],
    response: "Administrators can create elections, add candidates, and officially tally the results using their Master Access panel."
  },
  {
    keywords: ['register', 'sign up', 'account', 'login', 'mfa', 'authenticator', 'code', 'password', 'token'],
    response: "To access the system, you must log in with your Voter ID, Password, and a 6-digit MFA code from your authenticator app (like Google Authenticator)."
  }
];

const Chatbot = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([
    { sender: 'bot', text: "Hi there! 👋 I'm the STOV assistant. How can I help you navigate the system today?" }
  ]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const chatEndRef = useRef(null);

  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen, isTyping]);

  const generateBotResponse = (userInput) => {
    const lowerInput = userInput.toLowerCase();
    let bestMatch = null;
    let maxScore = 0;

    intents.forEach(intent => {
      let score = 0;
      intent.keywords.forEach(kw => {
        // Use word boundaries (\b) to prevent partial matching (e.g. 'id' shouldn't match 'inside')
        const regex = new RegExp(`\\b${kw}\\b`, 'i');
        if (regex.test(lowerInput)) {
          score += kw.split(' ').length; // Multi-word matches score higher
        }
      });
      if (score > maxScore) {
        maxScore = score;
        bestMatch = intent;
      }
    });

    let response = "I'm a simple assistant, so I didn't quite catch that. Try asking me about how to vote, tracking your ballot, security, or camera issues!";
    if (bestMatch && maxScore > 0) {
      response = bestMatch.response;
    }

    setMessages(prev => [...prev, { sender: 'bot', text: response }]);
    setIsTyping(false);
  };

  const handleSend = (e) => {
    e.preventDefault();
    if (!input.trim() || isTyping) return;
    
    setMessages(prev => [...prev, { sender: 'user', text: input.trim() }]);
    setInput("");
    setIsTyping(true);
    
    setTimeout(() => generateBotResponse(input), 1000);
  };

  const handleFAQClick = (faq) => {
    setMessages(prev => [...prev, { sender: 'user', text: faq.q }]);
    setIsTyping(true);
    setTimeout(() => {
      setMessages(prev => [...prev, { sender: 'bot', text: faq.a }]);
      setIsTyping(false);
    }, 800);
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end">
      {/* Chat Window */}
      {isOpen && (
        <div className="mb-4 w-[calc(100vw-3rem)] sm:w-96 bg-white dark:bg-gray-800 rounded-3xl shadow-2xl border border-gray-200 dark:border-gray-700 flex flex-col overflow-hidden transition-all duration-300 transform origin-bottom-right">
          {/* Header */}
          <div className="bg-blue-600 dark:bg-blue-700 p-4 flex justify-between items-center text-white shadow-md z-10">
            <div className="flex items-center gap-2">
              <MessageSquare size={20} />
              <span className="font-bold tracking-wide">STOV Guide</span>
            </div>
            <button onClick={() => setIsOpen(false)} className="text-blue-100 hover:text-white transition-colors">
              <X size={20} />
            </button>
          </div>

          {/* Chat Area */}
          <div className="flex-1 p-4 overflow-y-auto bg-gray-50 dark:bg-gray-900 h-80 space-y-4 text-sm scroll-smooth">
            {messages.map((msg, idx) => (
              <div key={idx} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`p-3 rounded-2xl max-w-[85%] leading-relaxed ${msg.sender === 'user' ? 'bg-blue-600 text-white rounded-br-sm shadow-md' : 'bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 border border-gray-200 dark:border-gray-600 shadow-sm rounded-bl-sm'}`}>
                  {msg.text}
                </div>
              </div>
            ))}
            
            {/* Typing Indicator */}
            {isTyping && (
              <div className="flex justify-start">
                <div className="p-4 rounded-2xl bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 shadow-sm rounded-bl-sm flex items-center gap-1.5">
                  <div className="w-2 h-2 bg-gray-400 dark:bg-gray-500 rounded-full animate-bounce"></div>
                  <div className="w-2 h-2 bg-gray-400 dark:bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                  <div className="w-2 h-2 bg-gray-400 dark:bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></div>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* FAQ Quick Replies */}
          <div className="p-3 bg-gray-50 dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700">
            <div className="flex overflow-x-auto gap-2 pb-2 scrollbar-hide no-scrollbar">
              {faqs.map((faq, idx) => (
                <button key={idx} onClick={() => handleFAQClick(faq)} disabled={isTyping} className="whitespace-nowrap flex-shrink-0 text-xs font-medium bg-white hover:bg-gray-100 dark:bg-gray-800 dark:hover:bg-gray-700 text-blue-600 dark:text-blue-400 border border-gray-200 dark:border-gray-600 py-2 px-3 rounded-full transition-all active:scale-95 shadow-sm disabled:opacity-50">
                  {faq.q}
                </button>
              ))}
            </div>
          </div>

          {/* Text Input Area */}
          <form onSubmit={handleSend} className="p-3 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 flex gap-2 items-center z-10">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type your message..."
              className="flex-1 bg-gray-100 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-white transition-colors"
            />
            <button type="submit" disabled={!input.trim() || isTyping} className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 dark:disabled:bg-gray-700 text-white p-2.5 rounded-xl transition-colors shadow-sm flex-shrink-0">
              <Send size={18} />
            </button>
          </form>
        </div>
      )}

      {/* Toggle Bubble */}
      <button onClick={() => setIsOpen(!isOpen)} className={`w-14 h-14 rounded-full shadow-2xl flex items-center justify-center transition-all duration-300 hover:scale-110 active:scale-95 ${isOpen ? 'bg-red-500 hover:bg-red-600 text-white rotate-90' : 'bg-blue-600 hover:bg-blue-700 text-white'}`}>
        {isOpen ? <X size={28} /> : <MessageSquare size={28} />}
      </button>
    </div>
  );
};

export default Chatbot;