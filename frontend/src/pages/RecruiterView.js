import React, { useState, useEffect } from 'react';
import { api } from '../utils/api';
import { ScoreBar, ScoreBadge, RecommendationBadge } from '../components/ScoreBar';

export default function RecruiterView() {
  const [tab, setTab] = useState('post'); // post | candidates
  const [jds, setJds] = useState([]);
  const [candidates, setCandidates] = useState([]);
  const [selectedJD, setSelectedJD] = useState(null);
  const [selectedCandidate, setSelectedCandidate] = useState(null);
  const [fullReport, setFullReport] = useState(null);
  const [loadingReport, setLoadingReport] = useState(false);
  const [jdForm, setJdForm] = useState({ title: '', description: '', requirements: '', nice_to_have: '' });
  const [postingJD, setPostingJD] = useState(false);
  const [postSuccess, setPostSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchJDs();
  }, []);

  useEffect(() => {
    if (tab === 'candidates') fetchCandidates();
  }, [tab, selectedJD]);

  const fetchJDs = async () => {
    try {
      const r = await api.listJDs();
      setJds(r.data);
    } catch {}
  };

  const fetchCandidates = async () => {
    setLoading(true);
    try {
      const r = await api.getCandidates(selectedJD?.id);

      // 🔥 fetch usernames for all candidates
      const enriched = await Promise.all(
        r.data.map(async (c) => {
          try {
            const fr = await api.getFullReport(c.id);
            return {
              ...c,
              name: fr.data?.username || c.name
            };
          } catch {
            return c;
          }
        })
      );

      setCandidates(enriched);

    } catch {} finally {
      setLoading(false);
    }
  };

  const handlePostJD = async () => {
    if (!jdForm.title || !jdForm.description || !jdForm.requirements) return;
    setPostingJD(true);
    try {
      await api.submitJD(jdForm);
      setPostSuccess(true);
      fetchJDs();
      setJdForm({ title: '', description: '', requirements: '', nice_to_have: '' });
      setTimeout(() => setPostSuccess(false), 3000);
    } catch {} finally {
      setPostingJD(false);
    }
  };

  const handleViewCandidate = async (c) => {
    setSelectedCandidate(c);
    setFullReport(null);
    setLoadingReport(true);

    try {
      const r = await api.getFullReport(c.id);
      const username = r.data?.username;

      const updatedCandidate = {
        ...c,
        name: username || c.name
      };

      // ✅ update selected candidate (detail view)
      setSelectedCandidate(updatedCandidate);

      // ✅ update candidates list (THIS FIXES YOUR ISSUE)
      setCandidates(prev =>
        prev.map(item =>
          item.id === c.id
            ? { ...item, name: username || item.name }
            : item
        )
      );

      setFullReport(r.data);

    } catch {} finally {
      setLoadingReport(false);
    }
  };

  const getScoreColor = (s) => s >= 80 ? 'var(--success)' : s >= 60 ? 'var(--accent)' : s >= 40 ? 'var(--warning)' : 'var(--danger)';

  // ─── CANDIDATE DETAIL MODAL ───
  if (selectedCandidate) {
    const report = fullReport?.report || selectedCandidate.report || {};
    const parsed = fullReport?.parsed_resume || {};
    const analysis = fullReport?.analysis || {};
    const github = fullReport?.github_data || {};
    const conversation = fullReport?.conversation || [];

    return (
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <button className="btn btn-ghost btn-sm mb-4" onClick={() => { setSelectedCandidate(null); setFullReport(null); }}>
          ← Back to Candidates
        </button>

        <div className="grid-2" style={{ gap: 24, alignItems: 'start' }}>
          {/* Left column */}
          <div>
            {/* Header Card */}
            <div className="card mb-4">
              <div className="flex items-center gap-4 mb-4">
                <div style={{
                  width: 56, height: 56, borderRadius: '50%',
                  background: 'var(--accent)', color: 'white',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '1.4rem', fontFamily: 'var(--font-serif)', flexShrink: 0
                }}>
                  {selectedCandidate.name?.charAt(0)}
                </div>
                <div style={{ flex: 1 }}>
                  <h2 style={{ marginBottom: 4 }}>
                    {fullReport?.username && (
                      <>{fullReport.username}</>
                    )}
                    {parsed.email}
                  </h2>
                  {fullReport?.highlight_details && (
                    <p className="text-xs" style={{ color: 'var(--accent)', marginBottom: 8, fontStyle: 'italic' }}>
                      ⭐ {fullReport.highlight_details}
                    </p>
                  )}
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <RecommendationBadge rec={report.recommendation} />
                    {selectedCandidate.has_live_demos && <span className="badge badge-green">🌐 Live Demos</span>}
                    {selectedCandidate.has_github && <span className="badge badge-blue">⚙️ GitHub</span>}
                  </div>
                </div>
                <ScoreBadge score={report.overall_score || 0} size="lg" />
              </div>
              <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                {report.executive_summary || analysis.initial_assessment || ''}
              </p>
            </div>

            {/* Resume */}
            {fullReport?.raw_text && (
              <div className="card mb-4">
                <h3 style={{ marginBottom: 14, fontSize: '1rem' }}>📄 Resume</h3>
                <div style={{
                  maxHeight: 300,
                  overflowY: 'auto',
                  padding: 12,
                  background: 'var(--bg-subtle)',
                  borderRadius: 'var(--radius)',
                  fontSize: '0.8rem',
                  lineHeight: 1.6,
                  color: 'var(--text-secondary)',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word'
                }}>
                  {fullReport.raw_text}
                </div>
              </div>
            )}

            {/* Scores */}
            <div className="card mb-4">
              <h3 style={{ marginBottom: 14, fontSize: '1rem' }}>Score Breakdown</h3>
              <ScoreBar label="Overall Score" score={report.overall_score || 0} />
              <ScoreBar label="Job Match" score={report.match_score || selectedCandidate.match_score || 0} />
              <ScoreBar label="Interest Level" score={report.interest_score || 0} />
              <ScoreBar label="Technical Depth" score={report.technical_depth_score || 0} />
              <ScoreBar label="Project Quality" score={report.project_quality_score || 0} />
              <ScoreBar label="GitHub Activity" score={report.github_activity_score || 0} />
              <ScoreBar label="Communication" score={report.communication_score || 0} />
            </div>

            {/* Projects */}
            {analysis?.notable_projects?.length > 0 && (
              <div className="card mb-4">
                <h3 style={{ marginBottom: 14, fontSize: '1rem' }}>Ranked Projects</h3>
                {analysis.notable_projects.map((p, i) => (
                  <div key={i} style={{ marginBottom: 14, paddingBottom: 14, borderBottom: i < analysis.notable_projects.length - 1 ? '1px solid var(--border)' : 'none' }}>
                    <div className="flex justify-between items-center" style={{ marginBottom: 4 }}>
                      <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>
                        #{i+1} {p.name}
                      </span>
                      <div style={{ display: 'flex', gap: 3 }}>
                        {[1,2,3,4,5].map(s => (
                          <span key={s} style={{ color: s <= (p.rank||3) ? 'var(--warning)' : 'var(--border)', fontSize: '0.7rem' }}>★</span>
                        ))}
                      </div>
                    </div>
                    <p className="text-xs text-muted" style={{ marginBottom: 6 }}>{p.why_notable}</p>
                    <div style={{ display: 'flex', gap: 10 }}>
                      {p.live_link && (
                        <a href={p.live_link} target="_blank" rel="noreferrer" style={{ fontSize: '0.75rem', color: 'var(--success)', textDecoration: 'none' }}>
                          🌐 Live Demo
                        </a>
                      )}
                      {p.github_link && (
                        <a href={p.github_link} target="_blank" rel="noreferrer" style={{ fontSize: '0.75rem', color: 'var(--accent)', textDecoration: 'none' }}>
                          ⚙️ GitHub
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* GitHub */}
            {github?.repos?.length > 0 && (
              <div className="card mb-4">
                <h3 style={{ marginBottom: 14, fontSize: '1rem' }}>GitHub Activity</h3>
                <div className="flex gap-4 mb-3 text-sm text-muted">
                  <span>📦 {github.profile?.public_repos || 0} repos</span>
                  <span>👥 {github.profile?.followers || 0} followers</span>
                </div>
                {github.repos.slice(0, 5).map((r, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, alignItems: 'center' }}>
                    <div>
                      <a href={r.url} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)', fontSize: '0.85rem', textDecoration: 'none', fontWeight: 500 }}>
                        {r.name}
                      </a>
                      <p className="text-xs text-muted">{r.description?.slice(0, 60)}</p>
                    </div>
                    <div style={{ textAlign: 'right', fontSize: '0.75rem', color: 'var(--text-muted)', flexShrink: 0 }}>
                      ⭐{r.stars} · {r.language || '—'}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Right column */}
          <div>
            {/* Assessment */}
            <div className="card mb-4">
              <h3 style={{ marginBottom: 14, fontSize: '1rem' }}>Technical Assessment</h3>
              <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: 16 }}>
                {report.technical_assessment || '—'}
              </p>

              <div className="grid-2" style={{ gap: 16 }}>
                <div>
                  <p style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--success)', marginBottom: 8 }}>✅ Strengths</p>
                  {(report.strengths || analysis.key_strengths || []).map((s, i) => (
                    <p key={i} style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: 4 }}>• {s}</p>
                  ))}
                </div>
                <div>
                  <p style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--warning)', marginBottom: 8 }}>⚠️ Concerns</p>
                  {(report.concerns || analysis.skill_gaps || []).map((c, i) => (
                    <p key={i} style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: 4 }}>• {c}</p>
                  ))}
                  {(report.concerns || []).length === 0 && <p className="text-xs text-muted">No significant concerns</p>}
                </div>
              </div>
            </div>

            {/* Skills */}
            <div className="card mb-4">
              <h3 style={{ marginBottom: 14, fontSize: '1rem' }}>Skills</h3>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {(parsed.skills || selectedCandidate.skills || []).map((s, i) => (
                  <span key={i} className="badge badge-blue">{s}</span>
                ))}
              </div>
            </div>

            {/* Recruiter Recommendation */}
            <div className="card mb-4" style={{ borderColor: 'var(--accent)', borderWidth: 2 }}>
              <h3 style={{ marginBottom: 10, fontSize: '1rem' }}>Recruiter Decision</h3>
              <div className="flex items-center gap-3 mb-3">
                <RecommendationBadge rec={report.recommendation} />
                <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>{report.recommendation_reason}</span>
              </div>
              <div className="divider" />
              <p style={{ fontSize: '0.8rem', fontWeight: 500, marginBottom: 6 }}>Next Steps:</p>
              <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>{report.next_steps || 'Review conversation transcript before deciding.'}</p>
            </div>

            {/* Conversation Transcript */}
            <div className="card">
              <h3 style={{ marginBottom: 14, fontSize: '1rem' }}>Conversation Transcript</h3>
              {loadingReport && <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}><span className="spinner" /></div>}
              <div style={{ maxHeight: 380, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
                {conversation.map((m, i) => (
                  <div key={i} style={{ display: 'flex', gap: 8 }}>
                    <div style={{
                      width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
                      background: m.role === 'assistant' ? 'var(--accent)' : 'var(--bg-subtle)',
                      border: '1px solid var(--border)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '0.65rem', fontWeight: 700,
                      color: m.role === 'assistant' ? 'white' : 'var(--text-secondary)'
                    }}>
                      {m.role === 'assistant' ? 'A' : 'C'}
                    </div>
                    <div>
                      <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: 2 }}>
                        {m.role === 'assistant' ? 'Alex (Recruiter)' : 'Candidate'}
                      </p>
                      <p style={{ fontSize: '0.82rem', color: 'var(--text-primary)', lineHeight: 1.6 }}>{m.content}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ─── MAIN RECRUITER VIEW ───
  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      <div className="mb-6 flex justify-between items-center">
        <div>
          <h1 style={{ marginBottom: 4 }}>Recruiter Dashboard</h1>
          <p className="text-muted text-sm">Post jobs, review candidates, and make data-driven hiring decisions.</p>
        </div>
        <div className="flex gap-3">
          <button className="btn btn-ghost btn-sm" onClick={fetchCandidates}>↻ Refresh</button>
        </div>
      </div>

      <div className="tabs">
        <button className={`tab ${tab === 'post' ? 'active' : ''}`} onClick={() => setTab('post')}>
          📋 Post Job
        </button>
        <button className={`tab ${tab === 'candidates' ? 'active' : ''}`} onClick={() => setTab('candidates')}>
          👥 Candidates {candidates.length > 0 && `(${candidates.length})`}
        </button>
      </div>

      {/* ─── POST JD TAB ─── */}
      {tab === 'post' && (
        <div style={{ maxWidth: 680 }}>
          {postSuccess && (
            <div style={{ padding: '12px 16px', background: 'var(--success-light)', borderRadius: 'var(--radius)', color: 'var(--success)', marginBottom: 16, fontWeight: 500 }}>
              ✅ Job description posted successfully!
            </div>
          )}

          <div className="card">
            <h3 style={{ marginBottom: 20 }}>New Job Description</h3>

            <div className="form-group">
              <label className="form-label">Job Title *</label>
              <input
                className="input"
                placeholder="e.g. Senior AI/ML Engineer"
                value={jdForm.title}
                onChange={e => setJdForm(p => ({ ...p, title: e.target.value }))}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Job Description *</label>
              <textarea
                className="textarea"
                placeholder="Describe the role, team, and impact..."
                value={jdForm.description}
                onChange={e => setJdForm(p => ({ ...p, description: e.target.value }))}
                style={{ minHeight: 120 }}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Requirements *</label>
              <textarea
                className="textarea"
                placeholder="Required skills, experience, education..."
                value={jdForm.requirements}
                onChange={e => setJdForm(p => ({ ...p, requirements: e.target.value }))}
                style={{ minHeight: 100 }}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Nice to Have</label>
              <textarea
                className="textarea"
                placeholder="Bonus skills or experience..."
                value={jdForm.nice_to_have}
                onChange={e => setJdForm(p => ({ ...p, nice_to_have: e.target.value }))}
                style={{ minHeight: 80 }}
              />
            </div>

            <button
              className="btn btn-primary btn-lg"
              onClick={handlePostJD}
              disabled={postingJD || !jdForm.title || !jdForm.description || !jdForm.requirements}
            >
              {postingJD ? <><span className="spinner" style={{ width: 16, height: 16 }} /> Posting...</> : '🚀 Post Job'}
            </button>
          </div>

          {/* Posted JDs */}
          {jds.length > 0 && (
            <div style={{ marginTop: 24 }}>
              <h3 style={{ marginBottom: 14, fontSize: '1rem' }}>Active Positions</h3>
              {jds.map(jd => (
                <div key={jd.id} className="card" style={{ marginBottom: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <p style={{ fontWeight: 600, marginBottom: 2 }}>{jd.title}</p>
                    <p className="text-xs text-muted">Posted {new Date(jd.created_at * 1000).toLocaleDateString()}</p>
                  </div>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => { setSelectedJD(jd); setTab('candidates'); }}
                  >
                    View Candidates →
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ─── CANDIDATES TAB ─── */}
      {tab === 'candidates' && (
        <div>
          {/* Filter by JD */}
          <div className="flex gap-3 mb-5" style={{ flexWrap: 'wrap' }}>
            <button
              className={`btn ${!selectedJD ? 'btn-primary' : 'btn-ghost'} btn-sm`}
              onClick={() => setSelectedJD(null)}
            >All Positions</button>
            {jds.map(jd => (
              <button
                key={jd.id}
                className={`btn ${selectedJD?.id === jd.id ? 'btn-primary' : 'btn-ghost'} btn-sm`}
                onClick={() => setSelectedJD(selectedJD?.id === jd.id ? null : jd)}
              >{jd.title}</button>
            ))}
          </div>

          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
              <span className="spinner" style={{ width: 32, height: 32 }} />
            </div>
          ) : candidates.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: 60 }}>
              <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>👥</div>
              <h3 style={{ marginBottom: 8 }}>No candidates yet</h3>
              <p className="text-muted text-sm">Candidates will appear here after they complete their screening and submit their profile.</p>
            </div>
          ) : (
            <>
              {/* Stats Row */}
              <div className="grid-3 mb-5">
                {[
                  { label: 'Total Candidates', value: candidates.length, color: 'var(--accent)' },
                  { label: 'Strong Hire', value: candidates.filter(c => c.recommendation === 'strong_hire').length, color: 'var(--success)' },
                  { label: 'Avg Match Score', value: Math.round(candidates.reduce((a, c) => a + (c.match_score || 0), 0) / candidates.length), color: 'var(--purple)' },
                ].map((s, i) => (
                  <div key={i} className="card" style={{ textAlign: 'center', padding: '16px' }}>
                    <div style={{ fontFamily: 'var(--font-serif)', fontSize: '2rem', color: s.color, lineHeight: 1 }}>{s.value}</div>
                    <div className="text-xs text-muted" style={{ marginTop: 4 }}>{s.label}</div>
                  </div>
                ))}
              </div>

              {/* Candidates Table */}
              <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', background: 'var(--bg-subtle)' }}>
                  <p style={{ fontWeight: 600, fontSize: '0.875rem' }}>
                    Ranked Candidates — sorted by Overall Score
                  </p>
                </div>
                {candidates.map((c, idx) => (
                  <div
                    key={c.id}
                    style={{
                      padding: '16px 20px',
                      borderBottom: idx < candidates.length - 1 ? '1px solid var(--border)' : 'none',
                      cursor: 'pointer',
                      transition: 'var(--transition)'
                    }}
                    onClick={() => handleViewCandidate(c)}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-subtle)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'white'}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                      {/* Rank */}
                      <div style={{
                        width: 32, height: 32, borderRadius: '50%',
                        background: idx === 0 ? '#fbbf24' : idx === 1 ? '#94a3b8' : idx === 2 ? '#cd7c3a' : 'var(--bg-subtle)',
                        color: idx < 3 ? 'white' : 'var(--text-muted)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontWeight: 700, fontSize: '0.85rem', flexShrink: 0
                      }}>
                        #{idx + 1}
                      </div>

                      {/* Avatar */}
                      <div style={{
                        width: 40, height: 40, borderRadius: '50%',
                        background: 'var(--accent)', color: 'white',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontFamily: 'var(--font-serif)', fontSize: '1rem', flexShrink: 0
                      }}>
                        {c.name?.charAt(0)}
                      </div>

                      {/* Info */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="flex items-center gap-2 mb-1">
                          <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>{c.name}</span>
                          <RecommendationBadge rec={c.recommendation} />
                          {c.has_live_demos && <span className="badge badge-green" style={{ fontSize: '0.68rem' }}>🌐 Demo</span>}
                          {c.has_github && <span className="badge badge-blue" style={{ fontSize: '0.68rem' }}>⚙️ GitHub</span>}
                        </div>
                        <p className="text-xs text-muted truncate">{c.executive_summary?.slice(0, 100)}</p>
                        <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                          {c.skills?.slice(0, 4).map((s, i) => (
                            <span key={i} className="badge badge-gray" style={{ fontSize: '0.68rem' }}>{s}</span>
                          ))}
                        </div>
                      </div>

                      {/* Scores */}
                      <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexShrink: 0 }}>
                        {[
                          { label: 'Match', value: c.match_score || 0 },
                          { label: 'Interest', value: c.interest_score || 0 },
                          { label: 'Overall', value: c.overall_score || 0 }
                        ].map((s, i) => (
                          <div key={i} style={{ textAlign: 'center', minWidth: 46 }}>
                            <div style={{
                              fontFamily: 'var(--font-serif)',
                              fontSize: '1.3rem',
                              color: s.value >= 70 ? 'var(--success)' : s.value >= 50 ? 'var(--warning)' : 'var(--danger)',
                              lineHeight: 1
                            }}>
                              {s.value}
                            </div>
                            <div className="text-xs text-muted">{s.label}</div>
                          </div>
                        ))}
                        <div style={{ color: 'var(--text-muted)', fontSize: '1rem' }}>→</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
