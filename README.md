# RoleReady

**AI-Powered Onboarding for the Modern Workforce**

RoleReady transforms company knowledge from GitHub repositories, Jira issues, Confluence pages, and internal documents into intelligent, interactive training content for new hires and employees. Built by team of 10 developers in USC CSCI 577A - Software Engineering (Spring 2026).

---

## 🎯 Project Overview

RoleReady is an intelligent onboarding platform that automatically converts organizational knowledge into structured training materials. Managers create training projects by linking data sources, and the system generates AI-powered content including summaries, mind maps, infographics, and video walkthroughs.

### Key Features

- **Automated Data Ingestion**: Extract knowledge from GitHub, Jira, Confluence, and documents
- **AI Content Generation**: Transform raw data into training materials using Google Gemini
- **Semantic Search**: Vector embeddings enable intelligent content retrieval
- **Role-Based Access**: Separate dashboards for Managers (creators) and Employees (learners)
- **Progress Tracking**: Monitor training completion and employee progress
- **Interactive Learning**: Video walkthroughs, mind maps, and infographics

---

## 🏗️ System Architecture

RoleReady is built on a four-layer architecture:

### Layer 1: Data Ingestion
Ingests raw company data from multiple sources and converts it into vector embeddings for semantic search:
- **GitHub**: Repository code, README files, documentation
- **Jira**: Issues, comments, descriptions (ADF to plaintext)
- **Confluence**: Pages, spaces (HTML to plaintext)
- **Documents**: PDF, DOCX, TXT files

### Layer 2: AI Processing
- **LangChain**: Orchestrates RAG (Retrieval-Augmented Generation) workflows
- **Vector Embeddings**: Ollama (local) or OpenAI for semantic search
- **LLMs**: Google Gemini for content generation (summaries, infographics, mind maps)

### Layer 3: Backend Services
- **FastAPI**: REST API with async support
- **Supabase**: PostgreSQL database with PGVector extension
- **Authentication**: JWT-based auth with organization-level access control
- **Job Tracking**: Background task monitoring for long-running operations

### Layer 4: Frontend
- **Angular 21**: Modern, reactive UI framework
- **Tailwind CSS**: Utility-first styling
- **Role-Specific Dashboards**: Employee (learning) and Manager (admin) views

---

## 🛠️ Tech Stack

| Category | Technologies |
|----------|-------------|
| **Frontend** | Angular 21, Tailwind CSS, TypeScript |
| **Backend** | FastAPI (Python 3.12+), Pydantic |
| **Database** | Supabase (PostgreSQL), PGVector extension |
| **AI/ML** | Google Gemini, Ollama, LangChain, OpenAI (optional) |
| **Data Sources** | GitHub API, Jira Cloud API, Confluence Cloud API |
| **Infrastructure** | Google Cloud Platform (GCP), Docker, GitHub Actions |
| **Libraries** | atlassian-python-api, html2text, langchain-text-splitters |

---

## 📋 Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| Python | 3.12+ | Backend runtime |
| Node.js | 20+ | Frontend runtime |
| npm | 10+ | Frontend package manager |
| [Ollama](https://ollama.com/) | latest | Local embedding model (optional) |
| Git | latest | Version control |

---

## 🚀 Quick Start

### 1. Ollama Setup (Required for Data Ingestion)

Ollama provides local embeddings for data ingestion. Alternatively, you can use OpenAI embeddings.

**macOS/Linux:**
```bash
# Install Ollama
brew install ollama

# Start Ollama server (keep running in a separate terminal)
ollama serve

# Pull the embedding model
ollama pull nomic-embed-text
```

**Windows:**
```powershell
# Download and install from https://ollama.com/download
# Or use PowerShell (as Administrator):
irm https://ollama.com/install.ps1 | iex

# Pull the model
ollama pull nomic-embed-text
```

> **Note**: Ollama must be running (`ollama serve`) when using ingestion endpoints. Alternatively, set `OPENAI_API_KEY` in `.env` to use OpenAI embeddings.

---

### 2. Backend Setup

#### Step 1: Create Virtual Environment

```bash
cd backend
python3 -m venv venv

# Activate virtual environment
# macOS/Linux:
source venv/bin/activate
# Windows:
venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt
```

#### Step 2: Configure Environment Variables

Create `backend/.env` with the following:

```env
# Database (Supabase) - REQUIRED
SUPABASE_URL=https://ueqlcznphzyeyzieqhpj.supabase.co
SUPABASE_PUBLISHABLE_KEY=<your-publishable-key>
SUPABASE_SECRET_KEY=<your-secret-key>

# AI Services
# Required for embeddings, summaries, mindmaps, and infographics
GEMINI_API_KEY=<your-gemini-api-key>

# Optional: required only for TTS audio generation
OPENAI_API_KEY=<your-openai-api-key>

# Optional Gemini embedding tuning
GEMINI_EMBEDDING_MODEL=gemini-embedding-001
GEMINI_EMBEDDING_OUTPUT_DIMENSIONALITY=3072

# CORS (optional, defaults to http://localhost:4200)
CORS_ORIGINS=http://localhost:4200

# Optional background job settings
USE_CLOUD_TASKS=false
GCP_PROJECT_ID=<your-gcp-project-id>
GCP_REGION=europe-west1
CLOUD_TASKS_QUEUE=role-ready-jobs
WORKER_URL=<your-worker-url>
CLOUD_TASKS_SERVICE_ACCOUNT=<your-service-account-email>

# Jira Configuration (optional, for Jira ingestion)
JIRA_URL=https://your-domain.atlassian.net
JIRA_EMAIL=your-email@example.com
JIRA_API_TOKEN=<your-jira-api-token>

# Confluence Configuration (optional, for Confluence ingestion)
CONFLUENCE_URL=https://your-domain.atlassian.net/wiki
CONFLUENCE_EMAIL=your-email@example.com
CONFLUENCE_API_TOKEN=<your-confluence-api-token>
```

**Where to get the keys:**
- **SUPABASE_PUBLISHABLE_KEY**: Supabase Dashboard → Project Settings → API → `anon public`
- **SUPABASE_SECRET_KEY**: Supabase Dashboard → Project Settings → API → `service_role`
- **GEMINI_API_KEY**: [Google AI Studio](https://aistudio.google.com/apikey)
- **OPENAI_API_KEY**: [OpenAI API Keys](https://platform.openai.com/api-keys) if you want audio generation
- **JIRA/CONFLUENCE_API_TOKEN**: [Atlassian API Tokens](https://id.atlassian.com/manage-profile/security/api-tokens)
- If you don't have access to these, contact **Saiom** or **Ryuya** on Discord.

#### Step 3: Start the Backend Server

```bash
# From backend directory with venv activated
uvicorn app.main:app --reload
```

The API will be available at `http://localhost:8000`

#### Step 4: Verify Backend

```bash
# Health check (no auth required)
curl http://localhost:8000/health

# View API documentation
open http://localhost:8000/docs
```

---

### 3. Frontend Setup

```bash
cd frontend
npm install
npm run start
```

The app will be available at `http://localhost:4200`

---

## API Overview

### Projects & Assets

| Route | Auth | Description |
|-------|------|-------------|
| `GET /health` | No | Health check |
| `POST /api/v1/projects/` | Admin | Create project + trigger pipeline |
| `GET /api/v1/projects/` | Member | List projects for organization |
| `GET /api/v1/projects/{project_id}` | Member | Get single project |
| `PUT /api/v1/projects/{project_id}` | Admin | Update project |
| `DELETE /api/v1/projects/{project_id}` | Admin | Delete project |
| `GET /api/v1/projects/{project_id}/assets` | Member | List available generated assets for project |
| `POST /api/v1/projects/{project_id}/trainings` | Admin | Create training from project with modules and assignments |
| `POST /api/v1/projects/{project_id}/documents` | Admin | Upload single document |
| `POST /api/v1/projects/{project_id}/documents/bulk` | Admin | Upload multiple documents |
| `GET /api/v1/projects/{project_id}/documents` | Member | List documents for project |

### Data Ingestion

| Route | Auth | Description |
|-------|------|-------------|
| `POST /api/v1/ingestion/github` | Admin | Trigger GitHub repo ingestion |
| `POST /api/v1/ingestion/documents` | Admin | Trigger document ingestion |
| `POST /api/v1/ingestion/jira` | Admin | Trigger Jira ingestion |
| `POST /api/v1/ingestion/confluence` | Admin | Trigger Confluence ingestion |

### AI Content Generation

| Route | Auth | Description |
|-------|------|-------------|
| `GET /api/v1/infographics/{project_id}` | Member | Get infographic for project |
| `POST /api/v1/infographics/generate` | Admin | Generate infographic |
| `GET /api/v1/mindmap/{project_id}` | Member | Get mindmap for project |
| `POST /api/v1/mindmap/generate` | Admin | Generate mindmap |
| `POST /api/v1/summarization/generate` | Admin | Generate project summary from embeddings |
| `GET /api/v1/summarization/{project_id}` | Member | Retrieve existing project summary |
| `GET /api/v1/tts/{project_id}` | Member | Get audio for project |
| `POST /api/v1/tts/generate` | Admin | Generate TTS audio |
| `GET /api/v1/pinpoint/{project_id}` | Member | Get generated pinpoint clues for project |
| `POST /api/v1/pinpoint/generate` | Admin | Generate 10 technical clue/answer pinpoint items |
| `GET /api/v1/architecture/{project_id}` | Member | Get generated architecture buckets (frontend/application/data) |
| `POST /api/v1/architecture/generate` | Admin | Generate architecture buckets from project context |

### Training System

| Route | Auth | Description |
|-------|------|-------------|
| `POST /api/v1/trainings/` | Admin | Create training |
| `GET /api/v1/trainings/` | Member | List trainings (filter by `project_id` or `organization_id`) |
| `GET /api/v1/trainings/{training_id}` | Member | Get training metadata |
| `GET /api/v1/trainings/{training_id}/overview` | Member | Get canonical training view with modules, assignments, and viewer progress |
| `PUT /api/v1/trainings/{training_id}` | Admin | Update training |
| `DELETE /api/v1/trainings/{training_id}` | Admin | Delete training |
| `POST /api/v1/trainings/{training_id}/modules` | Admin | Add module to training |
| `GET /api/v1/trainings/{training_id}/modules` | Member | List modules for training |
| `PUT /api/v1/trainings/{training_id}/modules/{module_id}` | Admin | Update module |
| `DELETE /api/v1/trainings/{training_id}/modules/{module_id}` | Admin | Delete module |
| `PUT /api/v1/trainings/{training_id}/modules/reorder` | Admin | Reorder modules |
| `POST /api/v1/trainings/{training_id}/assignments` | Admin | Assign user to training |
| `GET /api/v1/trainings/{training_id}/assignments` | Admin | List assignments with user profiles and progress |

### Assignments & Progress

| Route | Auth | Description |
|-------|------|-------------|
| `GET /api/v1/assignments/{assignment_id}` | Assignee/Admin | Get assignment detail with progress |
| `PUT /api/v1/assignments/{assignment_id}` | Assignee/Admin | Update assignment status |
| `DELETE /api/v1/assignments/{assignment_id}` | Admin | Delete assignment |
| `GET /api/v1/assignments/{assignment_id}/progress` | Assignee/Admin | Get all module progress for assignment |
| `PUT /api/v1/assignments/{assignment_id}/modules/{module_id}/progress` | Assignee/Admin | Update module progress (complete, set score, etc.) |

### Prompts & Jobs

| Route | Auth | Description |
|-------|------|-------------|
| `GET /api/v1/prompts/defaults` | Member | Get default prompts |
| `GET /api/v1/prompts/{project_id}` | Member | Get prompts for project |
| `PUT /api/v1/prompts/` | Admin | Create or update prompt |
| `DELETE /api/v1/prompts/{project_id}/{prompt_type}` | Admin | Delete prompt override |
| `GET /api/v1/jobs/{project_id}` | Member | List jobs for project (`job_type` query is optional) |

All authenticated endpoints require: `Authorization: Bearer <supabase-access-token>`

---

## Branches

- **main**: Production branch. Deployable code only.
- **dev**: Development branch. Integration point for features.
- **feature/***: Feature branches. Created from `dev`, merged back into `dev`.

### Rules

1. **Never commit directly to `main`**
2. Create feature branches from `dev`: `git checkout -b feature/my-feature dev`
3. Open a Pull Request (PR) to merge `feature/my-feature` into `dev`
4. Once `dev` is stable and ready for release, merge `dev` into `main`

---

## 📚 Additional Resources

### API Documentation
- [Google Gen AI SDK](https://ai.google.dev/gemini-api/docs)
- [Supabase Python Client](https://supabase.com/docs/reference/python/introduction)
- [Jira Cloud REST API](https://developer.atlassian.com/cloud/jira/platform/rest/v3/intro/)
- [Confluence Cloud REST API](https://developer.atlassian.com/cloud/confluence/rest/v2/intro/)
- [LangChain Documentation](https://python.langchain.com/docs/integrations/)

### Libraries
- [atlassian-python-api](https://github.com/atlassian-api/atlassian-python-api)
- [Ollama](https://ollama.com/library/nomic-embed-text)
- [FastAPI](https://fastapi.tiangolo.com/)
- [Angular](https://angular.dev/)

---

## 👥 Team

**Team 2 · USC CSCI 577A · Spring 2026**

---

## 📄 License

This project is part of RoleReady organization. 
