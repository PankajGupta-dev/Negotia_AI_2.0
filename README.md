# Negotia AI — Enterprise Legal Negotiation Platform

Negotia AI is an autonomous, multi-agent AI-powered legal contract negotiation platform designed for General Counsel and Enterprise Legal teams. It analyzes counterparty redlines, synthesizes conformed fallback language, and safeguards enterprise leverage against 48,000+ public SEC EDGAR precedents with full cryptographic explainability and audit-proof provenance.

## Repository Architecture

This repository is structured as a monorepo containing the frontend client application and a scaffold for the upcoming backend services:

```text
negotia-ai/
├── frontend/                     # React + Vite + TypeScript web application
│   ├── src/
│   │   ├── components/           # Reusable typed UI components (StatCard, RiskChip, etc.)
│   │   ├── data/                 # Strongly-typed mock contracts, dockets & settings
│   │   ├── layouts/              # Persistent dark-ink SidebarLayout & public shell
│   │   ├── pages/                # 10 comprehensive legal negotiation screens
│   │   ├── styles/               # Custom CSS styles (paper grain, hairline rules)
│   │   ├── App.tsx               # Client-side router configuration
│   │   └── main.tsx              # Application entry point
│   ├── index.html
│   ├── tailwind.config.ts        # "Ink & Amber" design tokens & typography
│   └── package.json
├── backend/                      # FastAPI backend service (placeholder per SAD)
│   ├── README.md
│   └── .gitkeep
└── README.md                     # Root project documentation
```

## Design System: "Ink & Amber"

The interface bridges classical rare-book jurisprudence with high-density modern computational terminals:
- **Dark Ink Terminal**: `#161311` (mineral charcoal background), `#1E1B19` (panels), `#383432` (hairlines).
- **Parchment Folio Canvas**: `#F5F1E8` (warm cream background), `#FAF7F2` (card), `#EDE7DC` (recessed).
- **Burnt Amber Accent**: `#D97706` (primary wax-seal accent), `#B45309` (hover), `#FEF3C7` (soft tint).
- **Forest Green (Low Risk)**: `#166534` (forest green), `#DCFCE7` (tint).
- **Rust Red (High Risk)**: `#991B1B` (rust carmine), `#FEE2E2` (tint).
- **Typography**: `EB Garamond` / `Fraunces` for authoritative headlines & contract clauses, `Plus Jakarta Sans` / `Inter` for crisp UI controls, and `JetBrains Mono` for clause indices (`§ 14.2`), risk badges, and telemetry tokens.

## Getting Started

### Prerequisites
- Node.js (v18+ recommended, v22+ verified)
- npm (v9+)

### Frontend Setup & Development
```bash
# Navigate to frontend
cd frontend

# Install dependencies
npm install

# Start local development server
npm run dev

# Build for production
npm run build
```

The application will be served at `http://localhost:5173`.
