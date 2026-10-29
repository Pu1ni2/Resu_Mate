import { useState, useRef, useEffect, useCallback } from 'react';
import { authFetch, responseError } from '../services/authFetch';

export default function useFocusChat({ apiBase, focusCandidate, scanProfiles, scanContact, anonymize, getCandidatePayload, speakText }) {
  const [chatInput, setChatInput] = useState('');
  const [messages, setMessages] = useState([]);
  const [isTyping, setIsTyping] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [pendingAutoSpeak, setPendingAutoSpeak] = useState(false);
  const msgEndRef = useRef(null);
  const requestVersion = useRef(0);

  useEffect(() => {
    setIsTyping(false);
    setPendingAutoSpeak(false);
    return () => { requestVersion.current += 1; };
  }, [focusCandidate?.id]);

  useEffect(() => {
    msgEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  // Auto-speak last assistant message when pending
  useEffect(() => {
    if (pendingAutoSpeak && messages.length > 0 && !isTyping) {
      const lastMsg = messages[messages.length - 1];
      if (lastMsg.role === 'assistant') {
        speakText?.(lastMsg.content, messages.length - 1);
        setPendingAutoSpeak(false);
      }
    }
  }, [messages, isTyping, pendingAutoSpeak, speakText]);

  const sendMessage = useCallback(async (msg, { autoSpeak = false } = {}) => {
    const text = msg || chatInput.trim();
    if (!text || !focusCandidate || isTyping) return;
    const version = requestVersion.current;

    setChatInput('');
    setPendingAutoSpeak(autoSpeak);
    setMessages(prev => [...prev, { role: 'user', content: text }]);
    setSuggestions([]);
    setIsTyping(true);

    try {
      const response = await authFetch(`${apiBase}/api/chat/focus`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          candidate_id: focusCandidate.id,
          candidate_data: getCandidatePayload(),
          scan_data: scanProfiles || null,
          scan_contact: scanContact || null,
          conversation_history: messages.slice(-20).map(m => ({ role: m.role, content: m.content })),
          anonymize,
        }),
      });
      if (version !== requestVersion.current) return;
      if (!response.ok) {
        const message = await responseError(response, 'Sorry, I could not generate a response.');
        if (version !== requestVersion.current) return;
        setMessages(prev => [...prev, { role: 'assistant', content: `**Error:** ${message}` }]);
        return;
      }
      const data = await response.json();
      if (version !== requestVersion.current) return;
      setMessages(prev => [...prev, { role: 'assistant', content: data.response || 'Sorry, I could not generate a response.' }]);
      if (data.suggestions?.length) setSuggestions(data.suggestions);
    } catch (_) {
      if (version !== requestVersion.current) return;
      setMessages(prev => [...prev, { role: 'assistant', content: '**Error:** Could not reach the server. Please check your backend is running.' }]);
    } finally {
      if (version === requestVersion.current) setIsTyping(false);
    }
  }, [chatInput, focusCandidate, isTyping, messages, scanProfiles, scanContact, anonymize, getCandidatePayload, apiBase]);

  return {
    chatInput, setChatInput, messages, setMessages,
    isTyping, suggestions, setSuggestions,
    sendMessage, msgEndRef,
  };
}
