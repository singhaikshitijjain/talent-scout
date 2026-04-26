"""
TalentScout AI - Production Backend
FastAPI + Ollama/Mistral powered recruiter agent
"""

import json
import re
import uuid
import time
import requests
import pdfplumber
import fitz
from typing import Optional, List, Dict, Any
from pathlib import Path
from fastapi import FastAPI, UploadFile, File, HTTPException, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
import tempfile
import os

app = FastAPI(title="TalentScout AI", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

OLLAMA_URL = "http://localhost:11434/api/chat"
MODEL = "mistral"

# In-memory store (production would use a DB)
candidates_store: Dict[str, Any] = {}
conversations_store: Dict[str, List[Dict]] = {}
jd_store: Dict[str, Any] = {}


# ─────────────────────────────────────────────
# MODELS
# ─────────────────────────────────────────────

class JobDescription(BaseModel):
    title: str
    description: str
    requirements: str
    nice_to_have: Optional[str] = ""


class ChatMessage(BaseModel):
    candidate_id: str
    message: str


class CandidateProfile(BaseModel):
    candidate_id: str
    username: str
    highlight_details: str


class JDChat(BaseModel):
    jd_id: str
    candidate_id: str
    message: str


class SubmitCandidate(BaseModel):
    candidate_id: str


# ─────────────────────────────────────────────
# OLLAMA HELPERS
# ─────────────────────────────────────────────

def call_ollama(messages: List[Dict], system: str = "", temperature: float = 0.3, max_tokens: int = 2048) -> str:
    payload = {
        "model": MODEL,
        "messages": [{"role": "system", "content": system}] + messages if system else messages,
        "stream": False,
        "options": {
            "temperature": temperature,
            "num_predict": max_tokens,
        }
    }
    try:
        res = requests.post(OLLAMA_URL, json=payload, timeout=120)
        res.raise_for_status()
        data = res.json()
        return data.get("message", {}).get("content", "")
    except Exception as e:
        return f"[Ollama Error: {str(e)}]"


def call_ollama_json(messages: List[Dict], system: str = "") -> Dict:
    payload = {
        "model": MODEL,
        "messages": [{"role": "system", "content": system}] + messages if system else messages,
        "stream": False,
        "format": "json",
        "options": {
            "temperature": 0,
            "num_predict": 4096,
        }
    }
    try:
        res = requests.post(OLLAMA_URL, json=payload, timeout=120)
        res.raise_for_status()
        data = res.json()
        content = data.get("message", {}).get("content", "{}")
        try:
            return json.loads(content)
        except:
            start = content.find("{")
            end = content.rfind("}") + 1
            if start >= 0 and end > start:
                return json.loads(content[start:end])
            return {}
    except Exception as e:
        return {"error": str(e)}


# ─────────────────────────────────────────────
# PDF EXTRACTION
# ─────────────────────────────────────────────

def extract_pdf_text(pdf_path: str) -> str:
    full_text = ""
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            text = page.extract_text() or ""
            full_text += text + "\n\n"
    return full_text.strip()


# ─────────────────────────────────────────────
# GITHUB ENRICHMENT
# ─────────────────────────────────────────────

def fetch_github_profile(username: str) -> Dict:
    """Fetch GitHub user profile and repos"""
    headers = {"Accept": "application/vnd.github.v3+json"}
    
    profile = {}
    repos = []
    
    try:
        r = requests.get(f"https://api.github.com/users/{username}", headers=headers, timeout=10)
        if r.status_code == 200:
            d = r.json()
            profile = {
                "username": username,
                "name": d.get("name", ""),
                "bio": d.get("bio", ""),
                "public_repos": d.get("public_repos", 0),
                "followers": d.get("followers", 0),
                "following": d.get("following", 0),
                "location": d.get("location", ""),
                "blog": d.get("blog", ""),
            }
    except:
        pass

    try:
        r = requests.get(
            f"https://api.github.com/users/{username}/repos?sort=updated&per_page=10",
            headers=headers, timeout=10
        )
        if r.status_code == 200:
            for repo in r.json():
                repos.append({
                    "name": repo.get("name", ""),
                    "description": repo.get("description", "") or "",
                    "language": repo.get("language", "") or "",
                    "stars": repo.get("stargazers_count", 0),
                    "forks": repo.get("forks_count", 0),
                    "topics": repo.get("topics", []),
                    "url": repo.get("html_url", ""),
                    "updated_at": repo.get("updated_at", ""),
                })
    except:
        pass

    return {"profile": profile, "repos": repos}


def extract_github_username(links: List[str], text: str) -> Optional[str]:
    """Extract GitHub username from links or text"""
    patterns = [
        r"github\.com/([a-zA-Z0-9\-_]+)(?:/[^/\s]*)?",
    ]
    all_text = " ".join(links) + " " + text
    for pattern in patterns:
        matches = re.findall(pattern, all_text)
        for m in matches:
            if m.lower() not in ["orgs", "topics", "explore", "features"]:
                return m
    # Return first github link username
    for link in links:
        if "github.com/" in link:
            parts = link.split("github.com/")
            if len(parts) > 1:
                username = parts[1].split("/")[0]
                if username and len(username) > 1:
                    return username
    return None


def extract_linkedin_id(links: List[str], text: str) -> Optional[str]:
    all_text = " ".join(links) + " " + text
    patterns = [r"linkedin\.com/in/([a-zA-Z0-9\-_]+)"]
    for p in patterns:
        m = re.search(p, all_text)
        if m:
            return m.group(1)
    return None


# ─────────────────────────────────────────────
# RESUME PARSING
# ─────────────────────────────────────────────

def parse_resume_with_ai(text: str) -> Dict:
    system = (
        "You are a resume parser. Return ONLY valid JSON. "
        "Extract ALL information. Preserve all details."
    )
    prompt = f"""Parse this resume and return structured JSON:

{{
  "name": "",
  "email": "",
  "phone": "",
  "location": "",
  "github_username": "",
  "linkedin_id": "",
  "links": [],
  "summary": "",
  "skills": [],
  "experience": [
    {{"title": "", "company": "", "duration": "", "points": []}}
  ],
  "education": [
    {{"degree": "", "institution": "", "year": "", "score": ""}}
  ],
  "projects": [
    {{"name": "", "tech_stack": "", "points": [], "live_link": "", "github_link": ""}}
  ],
  "achievements": [],
  "publications": []
}}

RESUME TEXT:
{text}"""

    return call_ollama_json([{"role": "user", "content": prompt}], system)


def analyze_candidate_with_github(parsed_resume: Dict, github_data: Dict, jd: Dict) -> Dict:
    """Deep analysis of candidate using resume + github data + JD"""
    
    system = (
        "You are an expert technical recruiter and engineer. "
        "Analyze candidates deeply. Return ONLY valid JSON."
    )
    
    github_summary = ""
    if github_data.get("profile"):
        p = github_data["profile"]
        github_summary = f"GitHub: {p.get('public_repos',0)} repos, {p.get('followers',0)} followers\n"
        for repo in github_data.get("repos", [])[:8]:
            github_summary += f"  - {repo['name']} ({repo['language']}): {repo['description'][:100]} | ⭐{repo['stars']}\n"

    prompt = f"""Analyze this candidate for the job and return detailed JSON assessment:

JOB TITLE: {jd.get('title', '')}
JOB DESCRIPTION: {jd.get('description', '')}
REQUIREMENTS: {jd.get('requirements', '')}

CANDIDATE RESUME:
Name: {parsed_resume.get('name', '')}
Summary: {parsed_resume.get('summary', '')}
Skills: {', '.join(parsed_resume.get('skills', []))}
Experience: {json.dumps(parsed_resume.get('experience', []))}
Projects: {json.dumps(parsed_resume.get('projects', []))}
Achievements: {json.dumps(parsed_resume.get('achievements', []))}
Publications: {json.dumps(parsed_resume.get('publications', []))}

GITHUB DATA:
{github_summary}

Return this exact JSON:
{{
  "match_score": <0-100>,
  "skills_match_score": <0-100>,
  "experience_score": <0-100>,
  "project_quality_score": <0-100>,
  "github_activity_score": <0-100>,
  "has_live_demos": <true/false>,
  "has_github_repos": <true/false>,
  "key_strengths": ["strength1", "strength2", "strength3"],
  "skill_gaps": ["gap1", "gap2"],
  "notable_projects": [
    {{"name": "", "why_notable": "", "live_link": "", "github_link": "", "rank": <1-5>}}
  ],
  "conversation_focus_areas": ["area1", "area2", "area3"],
  "initial_assessment": "<2-3 sentence professional recruiter summary>",
  "red_flags": [],
  "green_flags": ["flag1", "flag2"]
}}"""

    return call_ollama_json([{"role": "user", "content": prompt}], system)


def boost_score_with_highlights(analysis: Dict, highlight_details: str) -> Dict:
    """Analyze highlight details and boost candidate score"""
    if not highlight_details or len(highlight_details.strip()) < 10:
        return analysis
    
    system = "You are an expert recruiter. Analyze highlight details and return JSON with score boost."
    
    prompt = f"""Analyze these highlight details and determine how much to boost the candidate's match score (0-15 points).

HIGHLIGHT DETAILS:
{highlight_details}

Return JSON:
{{
  "score_boost": <0-15>,
  "boost_reason": "<brief explanation of why scores were boosted>",
  "highlight_strengths": ["strength1", "strength2"]
}}"""
    
    boost_result = call_ollama_json([{"role": "user", "content": prompt}], system)
    
    if "score_boost" in boost_result:
        boost = min(15, max(0, boost_result.get("score_boost", 0)))
        analysis["match_score"] = min(100, analysis.get("match_score", 0) + boost)
        analysis["highlight_boost"] = boost
        analysis["highlight_strengths"] = boost_result.get("highlight_strengths", [])
    
    return analysis


# ─────────────────────────────────────────────
# CONVERSATION ENGINE
# ─────────────────────────────────────────────

def generate_recruiter_response(
    candidate_id: str,
    user_message: str,
    candidate_data: Dict,
    history: List[Dict],
    jd: Dict
) -> Dict:
    """Generate context-aware recruiter response"""
    
    analysis = candidate_data.get("analysis", {})
    parsed = candidate_data.get("parsed_resume", {})
    github = candidate_data.get("github_data", {})
    
    focus_areas = analysis.get("conversation_focus_areas", [])
    strengths = analysis.get("key_strengths", [])
    projects = analysis.get("notable_projects", [])
    
    # Count questions (assistant messages) in history
    question_count = sum(1 for h in history if h["role"] == "assistant")
    
    # Determine question category based on count (0-indexed)
    question_categories = [
        "project_deep_dive",       # Q1
        "project_technical",       # Q2
        "highlights_achievements", # Q3
        "highlights_unique",       # Q4
        "role_fit_motivation",     # Q5
        "culture_team_fit",        # Q6
        "follow_up",               # Q7
        "final_open"               # Q8
    ]
    current_category = question_categories[min(question_count, 7)]

    category_instructions = {
        "project_deep_dive": "Ask a DEEP technical question about one of their projects. Probe architecture, tech stack choices, or specific technical challenges they faced. Be specific—reference a project name if possible.",
        "project_technical": "Ask about another project OR dive deeper into technical decisions, trade-offs, scalability, or problem-solving in their work. Do NOT repeat the previous project question.",
        "highlights_achievements": "Ask about their key achievements, awards, or standout accomplishments. Reference their highlight details if available. Make them elaborate on impact and outcomes.",
        "highlights_unique": "Ask what makes them unique compared to other candidates. Probe their highlight details or any special skills, certifications, or experiences that set them apart.",
        "role_fit_motivation": "Ask why they're interested in THIS specific role and how it aligns with their career goals. Check genuine motivation and long-term fit with the company.",
        "culture_team_fit": "Ask about teamwork, collaboration style, or how they handle feedback and conflict. Assess cultural fit and communication style.",
        "follow_up": "Ask a smart follow-up question based on something they said earlier, or probe an area that wasn't covered well. Show you're listening.",
        "final_open": "THIS IS THE FINAL QUESTION: Ask 'What else would you like to tell me about yourself or why you're interested in this role?' - Make it warm and open-ended."
    }

    current_category_instruction = category_instructions[current_category]

    # End conversation after 8 questions
    if question_count >= 8:
        return {
            "message": "Thank you so much for this great conversation! Your profile has been submitted to our recruiting team. They will review your responses and reach out soon. Best of luck! 🌟",
            "interest_indicator": candidate_data.get("latest_interest", 50),
            "topics_covered": ["conversation_complete"],
            "question_category": "final_open",
            "conversation_complete": True,
            "assessment_notes": "Conversation reached 8 question limit. Ready for final evaluation."
        }
    
    system = f"""You are Alex, a senior technical recruiter at a top tech company conducting a professional but engaging screening interview.

CANDIDATE PROFILE:
- Name: {parsed.get('name', 'Candidate')}
- Username: {candidate_data.get('username', 'N/A')}
- Highlights: {candidate_data.get('highlight_details', 'N/A')}
- Match Score: {analysis.get('match_score', 0)}/100
- Key Strengths: {', '.join(strengths)}
- Notable Projects: {', '.join([p.get('name','') for p in projects])}
- Focus Areas: {', '.join(focus_areas)}
- Has Live Demos: {analysis.get('has_live_demos', False)}
- Has GitHub: {analysis.get('has_github_repos', False)}

JOB: {jd.get('title', 'Software Engineer')}

CONVERSATION PROGRESS:
- Questions Asked: {question_count} / 8
- Current Question Category: {current_category}

CRITICAL RULES:
1. Be professional, warm, and genuinely curious
2. Ask ONE focused question per response
3. Probe DEEPLY on projects and technical decisions
4. Reference candidate's GitHub/demos if applicable
5. NEVER EVER repeat any question already asked in this conversation
6. Keep responses 2-4 sentences + one clear question
7. FOLLOW THE CURRENT QUESTION CATEGORY INSTRUCTION BELOW STRICTLY
8. Track topics to avoid repetition

CURRENT QUESTION CATEGORY INSTRUCTION:
{current_category_instruction}

Respond in JSON:
{{
  "message": "<your recruiter message>",
  "interest_indicator": <0-100>,
  "topics_covered": ["topic1"],
  "question_category": "{current_category}",
  "conversation_complete": false,
  "assessment_notes": "<brief note>"
}}"""

    messages = [{"role": "system", "content": system}]
    
    # Add conversation history
    for h in history[-12:]:
        messages.append({"role": h["role"], "content": h["content"]})
    
    messages.append({"role": "user", "content": user_message})
    
    result = call_ollama_json(messages[1:], system)
    
    return result


def generate_opening_message(candidate_data: Dict, jd: Dict) -> str:
    """Generate personalized opening message"""
    parsed = candidate_data.get("parsed_resume", {})
    analysis = candidate_data.get("analysis", {})
    projects = analysis.get("notable_projects", [])
    
    name = parsed.get("name", "there").split()[0]
    top_project = projects[0].get("name", "") if projects else ""
    
    system = "You are Alex, a senior technical recruiter. Be warm, specific, and professional."
    
    prompt = f"""Write a personalized opening message for a recruiter screening call.

Candidate: {name}
Role: {jd.get('title', 'Engineer')}
Their top project: {top_project}
Key strength: {analysis.get('key_strengths', [''])[0] if analysis.get('key_strengths') else ''}
Has live demo: {analysis.get('has_live_demos', False)}

Write 2-3 sentences that:
1. Introduce yourself as Alex from the recruiting team
2. Reference something specific from their background (the project or skill)
3. Ask one opening question about their current focus or what drew them to this opportunity

Be genuine and specific, not generic. Just write the message directly."""

    return call_ollama([{"role": "user", "content": prompt}], system, temperature=0.5)


# ─────────────────────────────────────────────
# JD PARSING
# ─────────────────────────────────────────────

def parse_jd_with_ai(jd: Dict) -> Dict:
    system = "You are an expert recruiter. Parse job descriptions precisely. Return ONLY valid JSON."
    
    prompt = f"""Parse this job description and extract key criteria:

TITLE: {jd.get('title','')}
DESCRIPTION: {jd.get('description','')}
REQUIREMENTS: {jd.get('requirements','')}
NICE TO HAVE: {jd.get('nice_to_have','')}

Return JSON:
{{
  "required_skills": ["skill1", "skill2"],
  "preferred_skills": ["skill1"],
  "experience_level": "junior/mid/senior",
  "key_responsibilities": ["resp1", "resp2"],
  "technical_domains": ["domain1"],
  "screening_questions": ["question about most important requirement", "question2", "question3"]
}}"""
    
    return call_ollama_json([{"role": "user", "content": prompt}], system)


# ─────────────────────────────────────────────
# FINAL REPORT GENERATION  
# ─────────────────────────────────────────────

def generate_final_report(candidate_data: Dict, conversation_history: List[Dict], jd: Dict) -> Dict:
    """Generate comprehensive recruiter report after conversation"""
    
    parsed = candidate_data.get("parsed_resume", {})
    analysis = candidate_data.get("analysis", {})
    github = candidate_data.get("github_data", {})
    
    # Extract candidate responses from conversation
    candidate_responses = "\n".join([
        f"Q: {h['content']}" if h['role'] == 'assistant' else f"A: {h['content']}"
        for h in conversation_history
    ])
    
    system = "You are a senior technical recruiter writing evaluation reports. Be precise and evidence-based. Return ONLY valid JSON."
    
    prompt = f"""Generate a comprehensive candidate evaluation report.

CANDIDATE: {parsed.get('name', '')}
JOB: {jd.get('title', '')}
MATCH SCORE: {analysis.get('match_score', 0)}

RESUME ANALYSIS:
- Skills: {', '.join(parsed.get('skills', [])[:10])}
- Projects: {', '.join([p.get('name','') for p in parsed.get('projects', [])])}
- Achievements: {json.dumps(parsed.get('achievements', []))}
- Publications: {json.dumps(parsed.get('publications', []))}
- GitHub Repos: {len(github.get('repos', []))} repos
- Has Live Demos: {analysis.get('has_live_demos', False)}

CONVERSATION TRANSCRIPT:
{candidate_responses[:3000]}

Return this exact JSON:
{{
  "overall_score": <0-100>,
  "match_score": <0-100>,
  "interest_score": <0-100>,
  "technical_depth_score": <0-100>,
  "communication_score": <0-100>,
  "project_quality_score": <0-100>,
  "github_activity_score": <0-100>,
  "recommendation": "strong_hire/hire/maybe/pass",
  "recommendation_reason": "<2-3 sentences>",
  "executive_summary": "<3-4 sentence summary for recruiter>",
  "strengths": ["strength1", "strength2", "strength3"],
  "concerns": ["concern1"],
  "technical_assessment": "<paragraph on technical skills demonstrated>",
  "cultural_fit_notes": "<paragraph>",
  "notable_achievements": ["achievement1", "achievement2"],
  "live_demos": ["url1"],
  "github_repos": ["repo1"],
  "next_steps": "<recommended next action>",
  "salary_range_fit": "below/within/above expectation",
  "interview_highlights": ["highlight1", "highlight2"]
}}"""

    return call_ollama_json([{"role": "user", "content": prompt}], system)


# ─────────────────────────────────────────────
# API ROUTES
# ─────────────────────────────────────────────

@app.get("/health")
def health():
    # Test Ollama connection
    try:
        r = requests.get("http://localhost:11434/api/tags", timeout=5)
        ollama_ok = r.status_code == 200
    except:
        ollama_ok = False
    return {"status": "ok", "ollama": ollama_ok, "candidates": len(candidates_store)}


@app.post("/api/jd/submit")
def submit_jd(jd: JobDescription):
    jd_id = str(uuid.uuid4())
    parsed = parse_jd_with_ai(jd.dict())
    
    jd_data = {
        "id": jd_id,
        "title": jd.title,
        "description": jd.description,
        "requirements": jd.requirements,
        "nice_to_have": jd.nice_to_have,
        "parsed": parsed,
        "created_at": time.time()
    }
    jd_store[jd_id] = jd_data
    return {"jd_id": jd_id, "parsed": parsed}


@app.get("/api/jd/list")
def list_jds():
    return [{"id": v["id"], "title": v["title"], "created_at": v["created_at"]} 
            for v in jd_store.values()]


@app.get("/api/jd/{jd_id}")
def get_jd(jd_id: str):
    if jd_id not in jd_store:
        raise HTTPException(404, "JD not found")
    return jd_store[jd_id]


@app.post("/api/candidate/upload")
async def upload_resume(file: UploadFile = File(...), jd_id: str = Form(...)):
    """Parse resume, fetch GitHub, run analysis"""
    
    if jd_id not in jd_store:
        raise HTTPException(400, "Invalid JD ID")
    
    jd = jd_store[jd_id]
    
    # Save temp file
    suffix = Path(file.filename).suffix
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        content = await file.read()
        tmp.write(content)
        tmp_path = tmp.name
    
    try:
        # Extract text
        raw_text = extract_pdf_text(tmp_path)
        
        # Parse with AI
        parsed_resume = parse_resume_with_ai(raw_text)
        
        # Extract GitHub username
        links = parsed_resume.get("links", [])
        github_username = parsed_resume.get("github_username", "") or extract_github_username(links, raw_text)
        linkedin_id = parsed_resume.get("linkedin_id", "") or extract_linkedin_id(links, raw_text)
        
        # Fetch GitHub data
        github_data = {}
        if github_username:
            github_data = fetch_github_profile(github_username)
        
        # Run analysis vs JD
        analysis = analyze_candidate_with_github(parsed_resume, github_data, jd)
        
        # Generate opening message
        candidate_id = str(uuid.uuid4())
        
        candidate_data = {
            "id": candidate_id,
            "jd_id": jd_id,
            "raw_text": raw_text,
            "parsed_resume": parsed_resume,
            "github_username": github_username,
            "linkedin_id": linkedin_id,
            "github_data": github_data,
            "analysis": analysis,
            "status": "analyzing",  # analyzing -> conversing -> submitted
            "submitted": False,
            "report": None,
            "created_at": time.time()
        }
        
        opening = generate_opening_message(candidate_data, jd)
        
        candidate_data["status"] = "conversing"
        candidates_store[candidate_id] = candidate_data
        
        # Initialize conversation
        conversations_store[candidate_id] = [
            {"role": "assistant", "content": opening}
        ]
        
        return {
            "candidate_id": candidate_id,
            "name": parsed_resume.get("name", ""),
            "github_username": github_username,
            "linkedin_id": linkedin_id,
            "analysis": analysis,
            "opening_message": opening,
            "parsed_resume": parsed_resume,
            "github_data": github_data
        }
    finally:
        os.unlink(tmp_path)


@app.post("/api/candidate/chat")
def chat_with_recruiter(msg: ChatMessage):
    """Candidate chats with AI recruiter"""
    
    candidate_id = msg.candidate_id
    if candidate_id not in candidates_store:
        raise HTTPException(404, "Candidate not found")
    
    candidate = candidates_store[candidate_id]
    jd = jd_store.get(candidate["jd_id"], {})
    history = conversations_store.get(candidate_id, [])
    
    # Add user message to history
    history.append({"role": "user", "content": msg.message})
    
    # Generate response
    result = generate_recruiter_response(
        candidate_id, msg.message, candidate, history, jd
    )
    
    recruiter_msg = result.get("message", "Thank you for sharing that. Could you tell me more?")
    conversation_complete = result.get("conversation_complete", False)
    
    # Add recruiter response to history with metadata for tracking
    history.append({
        "role": "assistant",
        "content": recruiter_msg,
        "topics_covered": result.get("topics_covered", []),
        "question_category": result.get("question_category", "")
    })
    conversations_store[candidate_id] = history
    
    # Update candidate with latest interest score
    if "interest_indicator" in result:
        candidate["latest_interest"] = result["interest_indicator"]
    
    return {
        "message": recruiter_msg,
        "conversation_complete": conversation_complete,
        "interest_indicator": result.get("interest_indicator", 50),
        "topics_covered": result.get("topics_covered", [])
    }


@app.get("/api/candidate/{candidate_id}/conversation")
def get_conversation(candidate_id: str):
    if candidate_id not in candidates_store:
        raise HTTPException(404, "Not found")
    return {
        "history": conversations_store.get(candidate_id, []),
        "candidate": candidates_store[candidate_id]
    }


@app.post("/api/candidate/profile")
def update_candidate_profile(body: CandidateProfile):
    """Update candidate with username and highlight details"""
    
    candidate_id = body.candidate_id
    if candidate_id not in candidates_store:
        raise HTTPException(404, "Candidate not found")
    
    candidate = candidates_store[candidate_id]
    candidate["username"] = body.username
    candidate["highlight_details"] = body.highlight_details
    
    # Boost score based on highlight details
    analysis = candidate.get("analysis", {})
    if body.highlight_details:
        analysis = boost_score_with_highlights(analysis, body.highlight_details)
        candidate["analysis"] = analysis
    
    return {"success": True, "message": "Profile updated", "analysis": analysis}


@app.post("/api/candidate/submit")
def submit_candidate(body: SubmitCandidate):
    """Candidate submits profile to recruiter view - triggers final report"""
    
    candidate_id = body.candidate_id
    if candidate_id not in candidates_store:
        raise HTTPException(404, "Candidate not found")
    
    candidate = candidates_store[candidate_id]
    jd = jd_store.get(candidate["jd_id"], {})
    history = conversations_store.get(candidate_id, [])
    
    # Generate final comprehensive report
    report = generate_final_report(candidate, history, jd)
    
    candidate["status"] = "submitted"
    candidate["submitted"] = True
    candidate["report"] = report
    candidate["submitted_at"] = time.time()
    
    return {"success": True, "report": report}


@app.get("/api/recruiter/candidates")
def get_all_candidates(jd_id: Optional[str] = None):
    """Get all submitted candidates, optionally filtered by JD"""
    
    result = []
    for cid, c in candidates_store.items():
        if not c.get("submitted"):
            continue
        if jd_id and c.get("jd_id") != jd_id:
            continue
        
        report = c.get("report", {})
        parsed = c.get("parsed_resume", {})
        analysis = c.get("analysis", {})
        
        result.append({
            "id": cid,
            "name": parsed.get("name", "Unknown"),
            "email": parsed.get("email", ""),
            "jd_id": c.get("jd_id"),
            "jd_title": jd_store.get(c.get("jd_id", ""), {}).get("title", ""),
            "overall_score": report.get("overall_score", 0),
            "match_score": report.get("match_score", analysis.get("match_score", 0)),
            "interest_score": report.get("interest_score", 0),
            "technical_depth_score": report.get("technical_depth_score", 0),
            "project_quality_score": report.get("project_quality_score", 0),
            "github_activity_score": report.get("github_activity_score", 0),
            "recommendation": report.get("recommendation", "unknown"),
            "executive_summary": report.get("executive_summary", ""),
            "strengths": report.get("strengths", []),
            "concerns": report.get("concerns", []),
            "has_live_demos": analysis.get("has_live_demos", False),
            "has_github": analysis.get("has_github_repos", False),
            "github_username": c.get("github_username", ""),
            "skills": parsed.get("skills", [])[:8],
            "submitted_at": c.get("submitted_at", 0),
            "report": report
        })
    
    # Sort by overall_score desc
    result.sort(key=lambda x: x.get("overall_score", 0), reverse=True)
    
    return result


@app.get("/api/recruiter/candidate/{candidate_id}/full")
def get_full_candidate_report(candidate_id: str):
    if candidate_id not in candidates_store:
        raise HTTPException(404, "Not found")
    
    c = candidates_store[candidate_id]
    return {
        **c,
        "conversation": conversations_store.get(candidate_id, [])
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, reload=True)
