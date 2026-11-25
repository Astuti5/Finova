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

</div>

---

# 🚀 About Finova

Finova is a web-based community savings and loans platform designed to help groups organize savings circles, manage membership, and maintain transparent financial records.

The project explores how secure web development, database-backed workflows, and tamper-evident records can support more transparent community finance.

url link:- https://vercel.com/astutis-projects-113521c7/finova/3XygbzA2oUAAPzNmP2FmAXnSg56C

### 🎯 Core Objectives

- Simplify community savings management.
- Improve transparency in contribution records.
- Support controlled membership and invitations.
- Maintain verifiable financial activity records.
- Explore blockchain-based ledger anchoring.

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

### 💳 Demo Payments
- Simulated contribution payment flows.
- Success, failed, and pending payment states.
- Contribution records stored in the database.

### 🔗 Tamper-Evident Ledger
- PostgreSQL-based hash-chained ledger design.
- Record verification concept.
- Designed for future blockchain anchoring.

### 📊 Dashboard
- Centralized application dashboard.
- Navigation across available platform modules.

---

# 🛠️ Technology Stack

| Category | Technologies |
|---|---|
| Frontend | React, Vite, TypeScript |
| Styling | Tailwind CSS |
| Backend | Supabase |
| Database | PostgreSQL |
| Authentication | Supabase Auth |
| Ledger | SHA-256 hash chaining |
| Smart Contracts | Solidity, Hardhat (planned integration) |
| Machine Learning | Python (planned integration) |
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

Run the database migrations in the Supabase SQL Editor:

```text
server/migrations/001_init.sql
server/migrations/002_invites_payments_ledger.sql
server/migrations/003_anchors_ml.sql
```

Run the migrations in order. Migration 003 is for the additional anchoring and ML schema.

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
| Database schema and RLS | Added; testing pending |
| Hash-chained ledger backend | Schema and design added |
| Ledger verification UI | Not yet completed |
| Loans interface | Not yet implemented |
| Contributions form | Not yet implemented |
| Repayments | Not yet implemented |
| ML service integration | Not yet implemented |
| Blockchain anchoring | Not yet implemented |
| Wallet connection | Not yet implemented |
| Security testing | Pending |

**Development note:** The repository contains additional modules and infrastructure for future integration. Their presence does not mean those services are deployed or functional.

---

# 🔗 Blockchain Integration — Future Scope

Finova explores the possibility of anchoring ledger records to the Ethereum Sepolia testnet.

Planned workflow:

1. Develop and test a Solidity smart contract.
2. Deploy the contract to Sepolia.
3. Verify the PostgreSQL ledger before anchoring.
4. Anchor the ledger's latest hash on-chain.
5. Enable transaction verification.

Only the ledger's head hash is intended to be anchored.

**Current limitation:** Ledger records are not currently stored on Ethereum. The existing ledger design uses PostgreSQL hash chaining.

---

# 🤖 Machine Learning — Future Scope

The project includes a planned Python-based ML service.

Potential extensions:

- Anomaly detection.
- Unusual contribution pattern analysis.
- Financial activity insights.
- Explainable risk indicators.

ML predictions are not currently integrated into the application and should not be treated as financial advice or creditworthiness decisions.

---

# 🔐 Security & Privacy

Security considerations in the project include:

- Supabase authentication.
- Database Row Level Security (RLS).
- Environment-based configuration.
- Security headers.
- Hash-chained record design.
- Separation of frontend and backend secrets.

**Important:** Contributions and loans are platform records. Payments are simulated; the application does not transfer or pool real money.

---

# 🚧 Roadmap

- [x] Initial React + Vite application
- [x] Supabase project integration
- [x] Authentication workflow
- [x] Savings circle functionality
- [x] Invitation and approval workflow
- [x] Simulated payment workflow
- [ ] Complete ledger interface and verification testing
- [ ] Loans and repayment workflows
- [ ] ML service integration
- [ ] Smart contract deployment to Sepolia
- [ ] Secure backend blockchain anchoring
- [ ] Automated security and RLS testing

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
