import React, { useState } from 'react';
import Navbar from './components/Navbar';
import RecruiterView from './pages/RecruiterView';
import CandidateView from './pages/CandidateView';
import './styles/global.css';

export default function App() {
  const [role, setRole] = useState('candidate'); // 'recruiter' | 'candidate'

  return (
    <div className="app">
      <Navbar role={role} setRole={setRole} />
      <main className="main-content">
        {role === 'recruiter' ? (
          <RecruiterView />
        ) : (
          <CandidateView />
        )}
      </main>
    </div>
  );
}
