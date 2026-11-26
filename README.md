 <div align="center">

# 💰 FINOVA

### Community Savings & Loans Platform

**Building trust through transparent community finance.**

A community-focused platform designed to simplify savings circles, manage contributions, and improve financial transparency through secure software architecture.

<p>
  <img src="https://img.shields.io/badge/React-Frontend-61DAFB?style=for-the-badge&logo=react&logoColor=black">
  <img src="https://img.shields.io/badge/TypeScript-Language-3178C6?style=for-the-badge&logo=typescript&logoColor=white">
  <img src="https://img.shields.io/badge/Supabase-Backend-3FCF8E?style=for-the-badge&logo=supabase&logoColor=white">
  <img src="https://img.shields.io/badge/Vercel-Deployment-000000?style=for-the-badge&logo=vercel&logoColor=white">
</p>

<p>
  <a href="https://github.com/Astuti5/Finova">
    <img src="https://img.shields.io/badge/GitHub-Repository-181717?style=for-the-badge&logo=github">
  </a>
  <a href="https://github.com/Astuti5">
    <img src="https://img.shields.io/badge/Developer-Astuti5-0A66C2?style=for-the-badge&logo=github">
  </a>
</p>

**🌐 Live Application:** [finova-rust.vercel.app](https://finova-rust.vercel.app/)

</div>

---

# 🚀 About Finova

Finova is a web-based community savings and loans platform designed to help groups organize savings circles, manage membership, and maintain transparent financial records.

The project explores how secure web development, database-backed workflows, and tamper-evident records can support more transparent community finance.

### 🎯 Core Objectives

- Simplify community savings management.
- Improve transparency in contribution records.
- Support controlled membership and invitations.
- Maintain verifiable financial activity records.
- Explore blockchain-based ledger anchoring.
- Introduce explainable, ML-powered financial activity insights.

---

# ✨ Key Features

### 🔐 Authentication
- Supabase-powered user authentication.
- User registration and login.
- Protected application workflows.

### 👥 Community Savings Circles
- Create and manage savings circles.
- Invite users through invitation codes.
- Request-to-join and admin approval workflow.
- Controlled membership management.

### 💳 Demo Payments
- Simulated contribution payment flows.
- Success, failed, and pending payment states.
- Contribution records stored in the database.
- One contribution per cycle.

### 🔗 Tamper-Evident Ledger
- PostgreSQL-based SHA-256 hash-chained ledger.
- Append-only ledger rules.
- Ledger checkpoint cross-verification.
- In-app chain verification.
- Ethereum verification interface for future deployed contract integration.

### 🏦 Loans & Repayments
- Loan request and management interface.
- Two-admin approval workflow for large loans.
- Optional interest configuration.
- Overdue loan tracking.
- Simulated repayment workflows.

### 🤖 AI-Powered Insights
- Advisory what-if analysis.
- Synthetic-data-based ML service.
- Financial activity insights.
- Explainable risk indicators.
- Not used for automated loan approval or creditworthiness decisions.

### 📊 Dashboard
- Centralized application dashboard.
- Navigation across platform modules.
- Access to savings, loans, contributions, and ledger features.

---

# 🛠️ Technology Stack

| Category | Technologies |
|---|---|
| Frontend | React, Vite, TypeScript |
| Styling | Tailwind CSS |
| Backend | Supabase |
| Database | PostgreSQL |
| Authentication | Supabase Auth |
| Database Security | Row Level Security (RLS) |
| Ledger | SHA-256 Hash Chaining |
| Smart Contracts | Solidity, Hardhat |
| Blockchain Network | Ethereum Sepolia (planned deployment) |
| Machine Learning | Python |
| Deployment | Vercel |

---

# 🏗️ Project Architecture

```text
Finova/
│
├── contracts/       # Smart contract development
├── docs/            # Project documentation
├── ml-service/      # Machine learning service
├── security/        # Security-related resources and tests
├── server/          # Database migrations
├── supabase/        # Supabase Edge Functions
│
└── web/             # React + Vite frontend
```

---

# ⚙️ Getting Started

## 1. Clone the Repository

```bash
git clone https://github.com/Astuti5/Finova.git
cd Finova
```

## 2. Configure Supabase

Create a Supabase project:

https://supabase.com/

Run the database migrations in the Supabase SQL Editor in the following order:

```text
server/migrations/001_init.sql
server/migrations/002_invites_payments_ledger.sql
server/migrations/003_anchors_ml.sql
server/migrations/004_loans.sql
server/migrations/005_hardening_and_circle_rules.sql
server/migrations/007_fix_gateway_cycle.sql
server/migrations/006_schedule_anchoring.sql  (optional, run last)
```

**Important:**
- Run migrations in the specified order.
- Migration 003 introduces additional anchoring and ML schema.
- Migration 007 should be executed immediately after migration 005.
- Migration 006 is optional and should be run last.

## 3. Configure Environment Variables

Create a `.env` file inside the `web` directory.

```env
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_publishable_or_anon_key
```

Use your Supabase project's public client key. Never expose service-role keys or private secrets in frontend code.

## 4. Install Dependencies

```bash
cd web
npm install
```

## 5. Run the Development Server

```bash
npm run dev
```

Open the local URL shown in your terminal.

---

# 🔬 Development Status

| Module | Status |
|---|---|
| Authentication | Implemented |
| Dashboard | Implemented |
| Savings circles | Implemented |
| Invitation workflow | Implemented |
| Simulated payments | Implemented |
| Database schema and RLS | Implemented; 46 local database checks pass |
| Hash-chained ledger backend | Implemented with checkpoint cross-check and append-only rules |
| Ledger verification UI | Implemented |
| Ethereum ledger verification | UI implemented; requires deployed contract |
| Loans interface | Implemented |
| Two-admin loan approval | Implemented for large loans |
| Contributions | Implemented; one per cycle |
| Repayments | Implemented (demo payments) |
| ML service integration | Advisory what-if page implemented; requires ML service deployment |
| Blockchain anchoring | Code complete; live deployment and verification pending |
| Wallet connection | Read-only connection (address and network) |
| Database security testing | 46 local checks passing |
| Smart contract testing | 8 local tests passing |
| Browser and Edge Function testing | Pending |
| Penetration testing | Pending |

**Development note:** The repository contains additional modules and infrastructure for future integration. Their presence does not mean those services are deployed or functional.

---

# 🔗 Blockchain Integration

Finova explores the possibility of anchoring ledger records to the Ethereum Sepolia testnet.

### Planned Workflow

1. Develop and test a Solidity smart contract.
2. Deploy the contract to Sepolia.
3. Verify the PostgreSQL ledger before anchoring.
4. Anchor the ledger's latest hash on-chain.
5. Enable transaction verification.

Only the ledger's head hash is intended to be anchored, rather than storing complete financial records on the blockchain.

### Current Implementation

- PostgreSQL-based hash chaining implemented.
- Ledger verification functionality implemented.
- Smart contract code and local tests available.
- Manual and scheduled checkpoint workflows implemented in code.

**Current limitation:** Ledger records are not currently stored on Ethereum. Live blockchain anchoring requires a deployed contract, configured server secrets, and a funded wallet. It has not yet been verified on Sepolia.

---

# 🤖 Machine Learning — Advisory Demo

The project includes a Python-based ML service (`ml-service/`) used by the AI insights page once deployed.

### Potential Applications

- Anomaly detection.
- Unusual contribution pattern analysis.
- Financial activity insights.
- Explainable risk indicators.
- What-if scenario analysis.

The models use synthetic data only. Their outputs are advisory and must not be treated as financial advice, creditworthiness assessments, or automated loan decisions.

---

# 🔐 Security & Privacy

Security considerations in the project include:

- Supabase authentication.
- Database Row Level Security (RLS).
- Environment-based configuration.
- Security headers.
- SHA-256 hash-chained record design.
- Append-only ledger rules.
- Checkpoint cross-verification.
- Separation of frontend and backend secrets.
- Automated database security checks.
- Smart contract testing.

### Security Testing

- 46 local database security checks passing.
- 8 local smart contract tests passing.
- Browser security testing pending.
- Edge Function security testing pending.
- Penetration testing pending.

**Important:** Contributions and loans are platform records. Payments are simulated; the application does not transfer or pool real money.

---

# 🚧 Roadmap

- [x] Initial React + Vite application
- [x] Supabase project integration
- [x] Authentication workflow
- [x] Savings circle functionality
- [x] Invitation and approval workflow
- [x] Simulated payment workflow
- [x] Database schema and RLS implementation
- [x] Hash-chained ledger backend
- [x] Ledger interface and chain verification
- [x] Loans and repayment workflows
- [x] Two-admin approval for large loans
- [x] Advisory ML insights interface
- [x] Automated database security tests
- [x] Smart contract development and local tests
- [ ] ML service deployment and connection
- [ ] Smart contract deployment to Sepolia
- [ ] Live blockchain anchoring verification
- [ ] Browser and Edge Function security testing
- [ ] Comprehensive penetration testing

---

# 🤝 Contributing

Contributions, suggestions, and feedback are welcome!

1. Fork the repository.
2. Create a feature branch.
3. Make your changes.
4. Submit a pull request.

---

# 👩‍💻 Developer

**Astuti Kumari**

B.Tech Computer Science Engineering | Cybersecurity | Application Security | Secure Software Development

<p>
  <a href="https://github.com/Astuti5">
    <img src="https://img.shields.io/badge/GitHub-Astuti5-181717?style=for-the-badge&logo=github">
  </a>
  <a href="https://astuti-portfolio.vercel.app">
    <img src="https://img.shields.io/badge/Portfolio-Visit-0A66C2?style=for-the-badge">
  </a>
  <a href="https://linkedin.com/in/astuti-kumari-224526289">
    <img src="https://img.shields.io/badge/LinkedIn-Connect-0077B5?style=for-the-badge&logo=linkedin">
  </a>
</p>

---

<div align="center">

### 💡 Building transparent systems. Designing for trust.

⭐ If you find Finova interesting, consider starring the repository!

</div>