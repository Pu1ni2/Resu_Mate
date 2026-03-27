import React from 'react';
import { marked } from 'marked';
import {
  Send, Volume2, Mic, MicOff, Square, Bot, Users, Loader
} from 'lucide-react';

const AIAvatar = () => (
  <div className="avatar-sm" style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-dark))' }}>
    <Bot size={18} />
  </div>
);

export default function ChatPanel({
  messages, isTyping, suggestions, chatInput, setChatInput,
  onSend, scanDone, candidateName, anonymize,
  voice: { isRecording, isTranscribing, startRecording, stopRecording, speakText, speakingMsgIndex, loadingMsgIndex },
  msgEndRef,
}) {
  const displayName = anonymize ? 'this candidate' : (candidateName || 'this candidate');

  return (
    <div className="focus-chat-container">
      <div className="focus-chat-messages">
        {messages.map((m, i) => (
          <div key={i} className={`chat-message ${m.role}`}>
            {m.role === 'assistant' && <AIAvatar />}
            <div className={`chat-bubble ${m.role}`}>
              {m.role === 'user' ? <p>{m.content}</p> : <div className="md" dangerouslySetInnerHTML={{ __html: marked.parse(m.content) }} />}
            </div>
            {m.role === 'user' && <div className="avatar-sm" style={{ background: 'var(--bg3)' }}><Users size={16} /></div>}
            {m.role === 'assistant' && (
              <button
                className={`msg-speak-btn ${speakingMsgIndex === i ? 'speaking' : ''} ${loadingMsgIndex === i ? 'loading' : ''}`}
                onClick={() => speakText(m.content, i)}
                title={speakingMsgIndex === i ? 'Stop' : 'Read aloud'}
                disabled={loadingMsgIndex !== null && loadingMsgIndex !== i}
              >
                {loadingMsgIndex === i ? <Loader size={16} className="spin" /> : speakingMsgIndex === i ? <Square size={14} /> : <Volume2 size={16} />}
              </button>
            )}
          </div>
        ))}
        {isTyping && (
          <div className="chat-message assistant">
            <AIAvatar />
            <div className="chat-bubble assistant"><div className="typing"><span /><span /><span /></div></div>
          </div>
        )}
        <div ref={msgEndRef} />
      </div>

      {suggestions.length > 0 && !isTyping && (
        <div className="chat-suggestions">
          {suggestions.map((q, i) => <button key={i} className="chat-suggestion" onClick={() => onSend(q)}>{q}</button>)}
        </div>
      )}

      <div className="chat-input-area">
        <button
          className={`btn-icon voice-btn ${isRecording ? 'recording' : ''} ${isTranscribing ? 'transcribing' : ''}`}
          onClick={isRecording ? stopRecording : startRecording}
          disabled={isTranscribing || isTyping || !scanDone}
          title={isRecording ? 'Stop recording' : 'Voice input'}
        >
          {isTranscribing ? <Loader size={20} className="spin" /> : isRecording ? <MicOff size={20} /> : <Mic size={20} />}
        </button>
        <input
          type="text"
          className="input chat-input"
          value={chatInput}
          onChange={e => setChatInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSend(); } }}
          placeholder={!scanDone ? 'Scanning...' : isRecording ? '🎤 Listening...' : isTranscribing ? '⏳ Transcribing...' : `Ask about ${displayName}...`}
          disabled={isTyping || isRecording || isTranscribing || !scanDone}
        />
        <button onClick={() => onSend()} disabled={!chatInput.trim() || isTyping || !scanDone} className="btn btn-primary send-btn">
          <Send size={18} />
        </button>
      </div>
    </div>
  );
}
