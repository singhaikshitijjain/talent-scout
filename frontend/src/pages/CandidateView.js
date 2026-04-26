import React, { useState, useRef, useEffect } from 'react';
import { api } from '../utils/api';

const STEPS = ['jd', 'profile', 'upload', 'analyzing', 'chat', 'done'];

export default function CandidateView() {
  const [step, setStep] = useState('jd');
  const [jds, setJds] = useState([]);
  const [selectedJD, setSelectedJD] = useState(null);
  const [jdId, setJdId] = useState('');
  const [username, setUsername] = useState('');
  const [highlightDetails, setHighlightDetails] = useState('');
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [candidateId, setCandidateId] = useState('');
  const [analysis, setAnalysis] = useState(null);
  const [parsedResume, setParsedResume] = useState(null);
  const [githubData, setGithubData] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputMsg, setInputMsg] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [convoComplete, setConvoComplete] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [loadingText, setLoadingText] = useState('');
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    api.listJDs().then(r => setJds(r.data)).catch(() => { });
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSelectJD = (jd) => {
    setSelectedJD(jd);
    setJdId(jd.id);
    setStep('profile');
  };

  const handleProfileSubmit = () => {
    if (!username.trim() || !highlightDetails.trim()) {
      setError('Please fill in both fields');
      return;
    }
    setError('');
    setStep('upload');
  };

  const handleUpload = async () => {
    if (!file || !jdId) return;
    setLoading(true);
    setStep('analyzing');
    setError('');

    const texts = [
      'Extracting resume content...',
      'Fetching GitHub repositories...',
      'Analyzing technical depth...',
      'Matching with job requirements...',
      'Building candidate profile...',
    ];
    let i = 0;
    setLoadingText(texts[0]);
    const interval = setInterval(() => {
      i = (i + 1) % texts.length;
      setLoadingText(texts[i]);
    }, 2500);

    try {
      const res = await api.uploadResume(file, jdId);
      const d = res.data;
      setCandidateId(d.candidate_id);

      // Update candidate with username and highlight details
      await api.updateCandidateProfile(d.candidate_id, username, highlightDetails);

      setAnalysis(d.analysis);
      setParsedResume(d.parsed_resume);
      setGithubData(d.github_data);
      setMessages([{ role: 'assistant', content: d.opening_message }]);
      setStep('chat');
    } catch (e) {
      setError(e.response?.data?.detail || 'Upload failed. Please check backend.');
      setStep('upload');
    } finally {
      setLoading(false);
      clearInterval(interval);
    }
  };

  const handleSend = async () => {
    if (!inputMsg.trim() || chatLoading) return;
    const userMsg = inputMsg.trim();
    setInputMsg('');
    setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setChatLoading(true);

    try {
      const res = await api.chat(candidateId, userMsg);
      const d = res.data;
      setMessages(prev => [...prev, { role: 'assistant', content: d.message }]);
      if (d.conversation_complete) setConvoComplete(true);
    } catch (e) {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Sorry, I had a connection issue. Please try again.' }]);
    } finally {
      setChatLoading(false);
    }
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      await api.submitCandidate(candidateId);
      setSubmitted(true);
      setStep('done');
    } catch (e) {
      setError('Submission failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // ─── JD SELECTION ───
  if (step === 'jd') {
    return (
      <div style={{ maxWidth: 700, margin: '0 auto' }}>
        <div className="mb-6">
          <h1 style={{ marginBottom: 6 }}>Find Your Match</h1>
          <p className="text-muted">Select a job you're interested in, then upload your resume for an AI-powered evaluation.</p>
        </div>

        {jds.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: 48 }}>
            <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>📋</div>
            <p style={{ color: 'var(--text-secondary)', marginBottom: 16 }}>No job openings available yet.</p>
            <p className="text-xs text-muted">Ask a recruiter to post a job description first.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {jds.map(jd => (
              <div
                key={jd.id}
                className="card"
                style={{ cursor: 'pointer', borderColor: selectedJD?.id === jd.id ? 'var(--accent)' : 'var(--border)' }}
                onClick={() => handleSelectJD(jd)}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h3 style={{ marginBottom: 4 }}>{jd.title}</h3>
                    <span className="text-xs text-muted">Posted {new Date(jd.created_at * 1000).toLocaleDateString()}</span>
                  </div>
                  <button className="btn btn-outline btn-sm">Apply →</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ─── PROFILE ───
  if (step === 'profile') {
    return (
      <div style={{ maxWidth: 600, margin: '0 auto' }}>
        <button className="btn btn-ghost btn-sm mb-4" onClick={() => setStep('jd')}>← Back</button>
        <div className="mb-6">
          <h1 style={{ marginBottom: 6 }}>Tell Us About Yourself</h1>
          <p className="text-muted">Applying for: <strong>{selectedJD?.title}</strong></p>
        </div>

        <div className="card">
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>
              🔤 Username <span style={{ color: 'var(--danger)' }}>*</span>
            </label>
            <input
              type="text"
              placeholder="Your professional username (GitHub, Twitter, etc.)"
              value={username}
              onChange={e => setUsername(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 12px',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius)',
                fontSize: '0.95rem',
                fontFamily: 'inherit',
                boxSizing: 'border-box'
              }}
            />
          </div>

          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>
              ⭐ Highlight Details <span style={{ color: 'var(--danger)' }}>*</span>
            </label>
            <textarea
              placeholder="Share key achievements, awards, unique skills, or notable accomplishments that make you stand out..."
              value={highlightDetails}
              onChange={e => setHighlightDetails(e.target.value)}
              rows={5}
              style={{
                width: '100%',
                padding: '10px 12px',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius)',
                fontSize: '0.95rem',
                fontFamily: 'inherit',
                boxSizing: 'border-box',
                resize: 'vertical'
              }}
            />
            <p className="text-xs text-muted" style={{ marginTop: 6 }}>These details will be analyzed by AI to boost your score</p>
          </div>

          {error && (
            <div style={{ marginBottom: 12, padding: '10px 14px', background: 'var(--danger-light)', borderRadius: 'var(--radius)', color: 'var(--danger)', fontSize: '0.875rem' }}>
              ⚠️ {error}
            </div>
          )}

          <button
            className="btn btn-primary btn-lg"
            style={{ width: '100%' }}
            onClick={handleProfileSubmit}
          >
            Continue to Upload →
          </button>
        </div>
      </div>
    );
  }

  // ─── UPLOAD ───
  if (step === 'upload') {
    return (
      <div style={{ maxWidth: 600, margin: '0 auto' }}>
        <button className="btn btn-ghost btn-sm mb-4" onClick={() => setStep('jd')}>← Back</button>
        <div className="mb-6">
          <h1 style={{ marginBottom: 6 }}>Upload Your Resume</h1>
          <p className="text-muted">Applying for: <strong>{selectedJD?.title}</strong></p>
        </div>

        <div className="card">
          <div
            style={{
              border: '2px dashed var(--border-strong)',
              borderRadius: 'var(--radius)',
              padding: 40,
              textAlign: 'center',
              cursor: 'pointer',
              background: file ? 'var(--success-light)' : 'var(--bg-subtle)',
              transition: 'var(--transition)'
            }}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const f = e.dataTransfer.files[0];
              if (f?.type === 'application/pdf') setFile(f);
            }}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf"
              style={{ display: 'none' }}
              onChange={e => setFile(e.target.files[0])}
            />
            {file ? (
              <>
                <div style={{ fontSize: '2rem', marginBottom: 8 }}>✅</div>
                <p style={{ fontWeight: 500 }}>{file.name}</p>
                <p className="text-sm text-muted">{(file.size / 1024).toFixed(0)} KB · PDF</p>
              </>
            ) : (
              <>
                <div style={{ fontSize: '2rem', marginBottom: 8 }}>📄</div>
                <p style={{ fontWeight: 500, marginBottom: 4 }}>Drop your PDF resume here</p>
                <p className="text-sm text-muted">or click to browse</p>
              </>
            )}
          </div>

          {error && (
            <div style={{ marginTop: 12, padding: '10px 14px', background: 'var(--danger-light)', borderRadius: 'var(--radius)', color: 'var(--danger)', fontSize: '0.875rem' }}>
              ⚠️ {error}
            </div>
          )}

          <div style={{ marginTop: 20, display: 'flex', gap: 10 }}>
            <button
              className="btn btn-primary btn-lg"
              style={{ flex: 1 }}
              disabled={!file || loading}
              onClick={handleUpload}
            >
              {loading ? <><span className="spinner" style={{ width: 16, height: 16 }} /> Processing...</> : 'Analyze My Resume →'}
            </button>
          </div>

          <p className="text-xs text-muted" style={{ marginTop: 12, textAlign: 'center' }}>
            Your GitHub and LinkedIn will be automatically discovered from your resume links.
          </p>
        </div>
      </div>
    );
  }

  // ─── ANALYZING ───
  if (step === 'analyzing') {
    return (
      <div style={{ maxWidth: 520, margin: '80px auto', textAlign: 'center' }}>
        <div style={{
          width: 72, height: 72,
          border: '3px solid var(--border)',
          borderTop: '3px solid var(--accent)',
          borderRadius: '50%',
          animation: 'spin 0.8s linear infinite',
          margin: '0 auto 24px'
        }} />
        <h2 style={{ marginBottom: 8 }}>Analyzing Your Profile</h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', minHeight: 24 }}>{loadingText}</p>
        <div style={{ marginTop: 32, display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
          {['Resume Parsing', 'GitHub Analysis', 'JD Matching', 'AI Evaluation'].map((t, i) => (
            <span key={i} className="badge badge-blue">{t}</span>
          ))}
        </div>
      </div>
    );
  }

  // ─── CHAT ───
  if (step === 'chat') {
    return (
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1.6fr',
        gap: 24,
        height: 'calc(100vh - 40px)'
      }}>
          {/* Left: Analysis Panel */}
          <div>
            <div className="card mb-4">
              <div className="flex items-center gap-3 mb-4">
                <div style={{
                  width: 48, height: 48, borderRadius: '50%',
                  background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: 'white', fontSize: '1.2rem', fontWeight: 700
                }}>
                  {parsedResume?.name?.charAt(0) || 'C'}
                </div>
                <div>
                  <h3 style={{ marginBottom: 2 }}>{parsedResume?.name || 'Candidate'}</h3>
                  <p className="text-xs text-muted">{parsedResume?.email || ''}</p>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
                <div style={{ textAlign: 'center', flex: 1 }}>
                  <div style={{
                    fontFamily: 'var(--font-serif)',
                    fontSize: '1.8rem',
                    color: analysis?.match_score >= 70 ? 'var(--success)' : analysis?.match_score >= 50 ? 'var(--warning)' : 'var(--danger)'
                  }}>
                    {analysis?.match_score || 0}
                  </div>
                  <div className="text-xs text-muted">Match Score</div>
                </div>
                <div style={{ width: 1, background: 'var(--border)' }} />
                <div style={{ textAlign: 'center', flex: 1 }}>
                  <div style={{ fontFamily: 'var(--font-serif)', fontSize: '1.8rem', color: 'var(--accent)' }}>
                    {analysis?.project_quality_score || 0}
                  </div>
                  <div className="text-xs text-muted">Project Score</div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {analysis?.has_live_demos && <span className="badge badge-green">🌐 Live Demos</span>}
                {analysis?.has_github_repos && <span className="badge badge-blue">⚙️ GitHub Active</span>}
                {parsedResume?.publications?.length > 0 && <span className="badge badge-purple">📄 Publications</span>}
              </div>
            </div>

            {/* Notable Projects */}
            {analysis?.notable_projects?.length > 0 && (
              <div className="card mb-4">
                <h3 style={{ marginBottom: 12, fontSize: '1rem' }}>Notable Projects</h3>
                {analysis.notable_projects.slice(0, 3).map((p, i) => (
                  <div key={i} style={{ marginBottom: 12, paddingBottom: 12, borderBottom: i < 2 ? '1px solid var(--border)' : 'none' }}>
                    <div className="flex justify-between items-center" style={{ marginBottom: 4 }}>
                      <span style={{ fontWeight: 500, fontSize: '0.875rem' }}>{p.name}</span>
                      <div style={{ display: 'flex', gap: 4 }}>
                        {[1, 2, 3, 4, 5].map(s => (
                          <span key={s} style={{ color: s <= (p.rank || 3) ? 'var(--warning)' : 'var(--border)', fontSize: '0.65rem' }}>★</span>
                        ))}
                      </div>
                    </div>
                    <p className="text-xs text-muted">{p.why_notable}</p>
                    <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                      {p.live_link && (
                        <a href={p.live_link} target="_blank" rel="noreferrer" className="text-xs text-accent">🌐 Demo</a>
                      )}
                      {p.github_link && (
                        <a href={p.github_link} target="_blank" rel="noreferrer" className="text-xs text-muted">⚙️ GitHub</a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* GitHub Stats */}
            {githubData?.profile?.username && (
              <div className="card">
                <h3 style={{ marginBottom: 12, fontSize: '1rem' }}>GitHub Profile</h3>
                <div className="flex gap-3 mb-3">
                  <span className="text-xs text-muted">📦 {githubData.profile.public_repos} repos</span>
                  <span className="text-xs text-muted">👥 {githubData.profile.followers} followers</span>
                </div>
                {githubData.repos?.slice(0, 3).map((r, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: '0.8rem' }}>
                    <a href={r.url} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)', textDecoration: 'none' }}>
                      {r.name}
                    </a>
                    <span className="text-muted">⭐{r.stars} · {r.language}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Right: Chat */}
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
            overflow: 'hidden'
          }}>
            <div style={{ marginBottom: 14 }}>
              <h2 style={{ marginBottom: 4 }}>Recruiter Screening</h2>
              <p className="text-sm text-muted">Alex from Recruiting · {messages.filter(m => m.role === 'assistant').length} / 8 questions</p>
            </div>

            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
              <div style={{
                flex: 1,
                minHeight: 0,
                overflowY: 'auto',
                paddingRight: 8,
                marginBottom: 16,
                display: 'flex',
                flexDirection: 'column',
                gap: 10
              }}>
                {messages.map((m, i) => (
                  <div key={i} className="fade-in">
                    {m.role === 'assistant' && (
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                        <div style={{
                          width: 30, height: 30, borderRadius: '50%',
                          background: 'var(--accent)', color: 'white',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: '0.75rem', fontWeight: 700, flexShrink: 0
                        }}>A</div>
                        <div style={{ flex: 1 }}>
                          <div className="msg-bubble msg-recruiter">{m.content}</div>
                          <div className="msg-meta">Alex · Recruiter</div>
                        </div>
                      </div>
                    )}
                    {m.role === 'user' && (
                      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                        <div style={{ maxWidth: '70%' }}>
                          <div className="msg-bubble msg-candidate">{m.content}</div>
                          <div className="msg-meta" style={{ textAlign: 'right' }}>You</div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
                {chatLoading && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{
                      width: 30, height: 30, borderRadius: '50%',
                      background: 'var(--accent)', color: 'white',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '0.75rem', fontWeight: 700
                    }}>A</div>
                    <div className="msg-bubble msg-recruiter" style={{ padding: '8px 16px' }}>
                      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                        {[0, 1, 2].map(i => (
                          <div key={i} style={{
                            width: 6, height: 6, borderRadius: '50%',
                            background: 'var(--text-muted)',
                            animation: `spin 1s ${i * 0.2}s ease infinite`
                          }} />
                        ))}
                      </div>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {!convoComplete ? (
                <div className="chat-input-area">
                  <textarea
                    className="chat-input"
                    placeholder="Type your response... (Enter to send)"
                    value={inputMsg}
                    onChange={e => setInputMsg(e.target.value)}
                    onKeyDown={handleKeyDown}
                    rows={2}
                    disabled={chatLoading}
                  />
                  <button
                    className="btn btn-primary"
                    onClick={handleSend}
                    disabled={!inputMsg.trim() || chatLoading}
                    style={{ alignSelf: 'flex-end' }}
                  >
                    Send
                  </button>
                </div>
              ) : (
                <div style={{ padding: '16px', borderTop: '1px solid var(--border)', background: 'var(--success-light)' }}>
                  <p style={{ color: 'var(--success)', fontSize: '0.875rem', fontWeight: 500, marginBottom: 10 }}>
                    ✅ Conversation complete! Submit your profile to the recruiter.
                  </p>
                  <button
                    className="btn btn-success"
                    style={{ width: '100%' }}
                    onClick={handleSubmit}
                    disabled={submitting}
                  >
                    {submitting ? 'Submitting...' : '🚀 Submit Profile to Recruiter'}
                  </button>
                </div>
              )}
            </div>

            {convoComplete && !submitted && (
              <p className="text-xs text-muted" style={{ marginTop: 8, textAlign: 'center' }}>
                Your profile will be visible to the recruiter after submission
              </p>
            )}
          </div>
        </div>
    );
  }

  // ─── DONE ───
  if (step === 'done') {
    return (
      <div style={{ maxWidth: 520, margin: '80px auto', textAlign: 'center' }}>
        <div style={{ fontSize: '4rem', marginBottom: 16 }}>🎉</div>
        <h1 style={{ marginBottom: 12 }}>Profile Submitted!</h1>
        <p style={{ color: 'var(--text-secondary)', marginBottom: 24 }}>
          Your profile and conversation have been submitted to the recruiter. They'll reach out if there's a match.
        </p>
        <div className="card" style={{ textAlign: 'left', marginBottom: 20 }}>
          <h3 style={{ marginBottom: 12 }}>What happens next?</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[
              '🤖 AI generates your comprehensive evaluation report',
              '📊 Recruiter reviews your match & interest scores',
              '🏆 You\'re ranked among all applicants',
              '📧 Recruiter reaches out if you\'re shortlisted'
            ].map((t, i) => (
              <div key={i} className="flex gap-3 items-center text-sm">
                <span>{t}</span>
              </div>
            ))}
          </div>
        </div>
        <button className="btn btn-outline" onClick={() => { setStep('jd'); setFile(null); setCandidateId(''); setMessages([]); setConvoComplete(false); setSubmitted(false); }}>
          Apply to Another Role
        </button>
      </div>
    );
  }

  return null;
}
