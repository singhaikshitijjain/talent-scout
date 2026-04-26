# TalentScout AI

An AI-powered recruiter agent that parses resumes, enriches candidate profiles with GitHub data, conducts intelligent screening conversations, and generates comprehensive hiring reports — all running locally with Ollama + Mistral.

---

## Tech Stack

### AI / Inference
| Component | Technology | Purpose |
|-----------|-----------|---------|
| LLM Runtime | [Ollama](https://ollama.com/) | Local inference server |
| Model | Mistral 7B | Resume parsing, conversation, scoring |
| Inference Mode | REST API (`/api/chat`) | Streaming & JSON-format responses |

### Backend
| Component | Technology | Purpose |
|-----------|-----------|---------|
| Framework | FastAPI (Python) | REST API server |
| Server | Uvicorn | ASGI server with hot-reload |
| PDF Parsing | pdfplumber + PyMuPDF (fitz) | Extract text from uploaded resumes |
| HTTP Client | requests | GitHub API calls + Ollama calls |
| Data Validation | Pydantic v2 | Request/response schema validation |
| File Handling | python-multipart, aiofiles | Async file upload handling |

### Frontend
| Component | Technology | Purpose |
|-----------|-----------|---------|
| Framework | React.js | Candidate & recruiter UI |
| Dev Server | Vite (recommended) or CRA | Hot module replacement |
| HTTP Client | fetch / axios | API calls to backend |
| State | React hooks (useState, useEffect) | Local state management |

### External APIs
| API | Purpose | Auth Required |
|-----|---------|---------------|
| GitHub REST API v3 | Fetch candidate repos, profile, stats | No (rate-limited), optional token |

### Storage
| Type | Implementation | Notes |
|------|---------------|-------|
| In-memory | Python dicts | Candidates, JDs, conversations — resets on restart |
| Temp files | `tempfile` module | PDF processing only, auto-deleted |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        TalentScout AI                            │
│                                                                   │
│  ┌─────────────┐    HTTP/JSON    ┌──────────────────────────┐   │
│  │  React.js   │◄──────────────►│   FastAPI Backend         │   │
│  │  Frontend   │   :3000→:8000  │   (main.py / Uvicorn)    │   │
│  │             │                │   :8000                   │   │
│  └─────────────┘                └────────────┬─────────────┘   │
│                                               │                   │
│                          ┌────────────────────┼───────────┐      │
│                          │                    │           │      │
│                          ▼                    ▼           ▼      │
│                   ┌────────────┐   ┌──────────────┐  ┌────────┐ │
│                   │  Ollama    │   │  PDF Parser  │  │ GitHub │ │
│                   │  Mistral   │   │  pdfplumber  │  │  API   │ │
│                   │  :11434    │   │  + PyMuPDF   │  │ (REST) │ │
│                   └────────────┘   └──────────────┘  └────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

---

## API Endpoints

### Job Descriptions
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/jd/create` | Create a new job description |
| `GET` | `/api/jd/list` | List all job descriptions |
| `GET` | `/api/jd/{jd_id}` | Get a specific JD |

### Candidates
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/candidate/upload` | Upload resume PDF + match to JD |
| `POST` | `/api/candidate/chat` | Send a message in the interview chat |
| `GET` | `/api/candidate/{id}/conversation` | Get full conversation history |
| `POST` | `/api/candidate/profile` | Update candidate profile/highlights |
| `POST` | `/api/candidate/submit` | Submit candidate, generate final report |

### Recruiter Dashboard
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/recruiter/candidates` | Get all submitted candidates (ranked) |
| `GET` | `/api/recruiter/candidate/{id}/full` | Get full report + conversation |

---

## Prerequisites

Make sure the following are installed on your machine:

- **Python 3.10+** — [python.org](https://python.org)
- **Node.js 18+** — [nodejs.org](https://nodejs.org)
- **Ollama** — [ollama.com/download](https://ollama.com/download)
- **Git** (optional)

---

## Setup & Installation

### 1. Clone the repository

```bash
git clone https://github.com/your-username/talentscout-ai.git
cd talentscout-ai
```

### 2. Install backend dependencies

```bash
cd backend
pip install -r requirements.txt
```

### 3. Install frontend dependencies

```bash
cd frontend
npm install
```

### 4. Pull the Mistral model via Ollama (one-time setup)

```bash
ollama pull mistral
```

This downloads ~4GB. Only needed once.

---

## Running the App (3 Terminals)

Open **three separate terminal windows** and run the following commands:

---

### Terminal 1 — Ollama (Local LLM Server)

```bash
ollama run mistral
```

Starts the Mistral model. Keep this running the entire time.
Ollama listens on `http://localhost:11434`.

> **Tip:** If you just want the server without the interactive prompt, you can use `ollama serve` instead. `ollama run mistral` does both.

---

### Terminal 2 — Backend (FastAPI)

```bash
cd backend
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

Starts the FastAPI server with hot-reload.
API available at `http://localhost:8000`.
Interactive API docs at `http://localhost:8000/docs`.

---

### Terminal 3 — Frontend (React)

```bash
cd frontend
npm run dev
```

Starts the React development server.
App available at `http://localhost:3000`.

> If you're using Create React App instead of Vite, use `npm start` — it also runs on port 3000 by default.

---

## Summary of All Three Commands

| Terminal | Command | URL |
|----------|---------|-----|
| **Terminal 1** | `cd backend` then `ollama run mistral` | `http://localhost:11434` |
| **Terminal 2** | `cd backend` then `python install -r requirements.txt`  then `uvicorn main:app --host 0.0.0.0 --port 8000 --reload` | `http://localhost:8000` |
| **Terminal 3** | `cd frontend` then `npm i` then `npm start` | `http://localhost:3000` |

---

## How It Works

1. **Recruiter creates a Job Description** — fills in title, requirements, nice-to-haves via the UI.
2. **Candidate uploads their resume PDF** — backend extracts text, parses it with Mistral, auto-detects GitHub/LinkedIn links.
3. **GitHub enrichment** — backend fetches the candidate's public repos, stars, languages, and bio from the GitHub API.
4. **AI analysis** — Mistral compares the parsed resume + GitHub data against the JD and computes match scores.
5. **AI interview** — candidate chats with an AI recruiter (powered by Mistral) that asks role-specific questions and tracks their interest level.
6. **Candidate submits** — triggers a final comprehensive report with overall score, strengths, concerns, and a hire/no-hire recommendation.
7. **Recruiter dashboard** — shows all submitted candidates ranked by score with full report details.

---

## License

MIT — see `LICENSE` for details.