# PayMi: AI-Powered Shared Expense and Decentralized Settlement Platform

**Author:** Alan Sanjit & Pranav Chopra

## Abstract
PayMi is a full-stack social finance application engineered to automate the extraction, allocation, and settlement of shared expenses. By leveraging machine vision via large language models (LLMs), the system parses unstructured physical receipts into structured, itemized financial data. It features a proprietary relational debt ledger to track interpersonal balances and integrates a Solana Web3 backend to facilitate instant, low-fee decentralized settlements using Phantom Wallet infrastructure.

## 1. Introduction
The traditional process of splitting bills—manually transcribing items, calculating proportional taxes, and waiting for fiat banking settlements—is highly inefficient. PayMi introduces an automated pipeline that eliminates this friction. By utilizing state-of-the-art optical character recognition (OCR) and context-aware LLMs, PayMi processes complex receipt hierarchies (including regional tax codes). Coupled with blockchain-based settlement, it provides a seamless transition from physical point-of-sale to fully reconciled digital debt.

## 2. System Architecture
PayMi operates on a decoupled microservices architecture to ensure scalability and separation of concerns.

*   **Client Interface (Next.js & React):** A responsive, client-side rendered frontend utilizing custom CSS for a distinct UI. It handles state management for complex receipt splitting and client-side transaction signing.
*   **Authentication & Social Graph (FastAPI / Python):** Two isolated services (`auth_backend.py`, `contact_backend.py`) managing user registration, SHA-256 password hashing, and contact relationships within a MongoDB Atlas cluster.
*   **Machine Vision Engine (FastAPI / Python):** A dedicated service (`receipt_backend.py`) handling image ingestion and interacting with the Gemini 2.0 Flash API to perform structured data extraction.
*   **Web3 Settlement Engine (Express.js / Node.js):** A standalone backend (`solana_backend.js`) utilizing `@solana/web3.js` to build, serialize, and broadcast transactions to the Solana Devnet.

## 3. Core Technical Components

### 3.1 AI-Driven Receipt Parsing & Tax Logic
Instead of relying on rigid, template-based OCR, PayMi utilizes zero-shot LLM prompting to understand unstructured receipt data. The parsing engine is specifically engineered with Ontario tax rate logic:
*   Dynamically maps regional tax codes (e.g., Code A for 13% HST, Code B for 8% PST, Code Y for 5% GST).
*   Reconstructs item subtotals and applies the correct fractional tax weighting to individual line items.
*   Outputs strictly typed JSON mapped to a Pydantic `ReceiptResponse` schema.

### 3.2 Asynchronous Relational Debt Ledger
To manage complex social finances, PayMi uses a continuous ledger system stored in MongoDB (`user_debts` collection). 
*   **Double-Entry Tracking:** Balances are tracked bidirectionally (`owes_me` vs `i_owe`).
*   **Partial Settlements:** The backend logic dynamically distributes partial payments against the oldest outstanding debt records first, recalculating the aggregate remaining balance in real-time.
*   **Polymorphic Splitting:** Users can allocate expenses via precise line-item selection, fractional percentages (50%), or custom quantitative amounts.

### 3.3 Decentralized Payment Protocol (Solana Pay)
PayMi ensures non-custodial financial security by strictly isolating transaction building from transaction signing:
1.  **Build:** The Node.js backend verifies balances and constructs an unsigned serialized transaction block mapping the exact lamports required.
2.  **Sign:** The serialized block is passed back to the Next.js client, where the user's Phantom Wallet signs the payload locally. Private keys never touch the PayMi servers.
3.  **Broadcast:** The signed base64 payload is returned to the Node.js backend for network broadcasting and confirmation monitoring.

## 4. Operational Workflow & User Guide

### Phase 1: Profile Initialization & Social Graph Construction
1.  **Authentication:** Users create an account or log in, associating their profile with a Phantom Wallet address.
2.  **Network Building:** Navigate to the "Contacts" portal to add friends via their registered email address. This establishes the relational nodes required for the debt ledger.

### Phase 2: Automated Ingestion & Expense Allocation
1.  **Receipt Upload:** On the main dashboard, users drag and drop a receipt image (JPG/PNG) or PDF. The Gemini vision model parses the document and displays an interactive, itemized breakdown including calculated taxes.
2.  **Item Selection:** Users toggle the checkboxes next to specific items they wish to split (expanding items with a quantity > 1 into individual selectable rows).
3.  **Bill Splitting:** Upon clicking "Split Bill", a modal allows the user to allocate the selected total. Users select the target contacts and apply a split logic (e.g., 50/50, 100%, or a custom fiat amount). Confirming this action updates the asynchronous debt ledger for all involved parties.

### Phase 3: Ledger Reconciliation & Web3 Settlement
1.  **Ledger Review:** Users navigate to the "Contacts" portal to view aggregate balances categorized by "Owes Me", "I Owe", and "Neutral". 
2.  **Execution:** To settle an outstanding debt, the user clicks "PayMi" on a contact they owe.
3.  **Transaction:** The system calculates the remaining debt. The user inputs a payment amount, which triggers a Phantom Wallet signature request. Upon local approval, the Solana transaction is broadcasted, and the MongoDB ledger is instantly reconciled to reflect the new balance.

## 5. Technical Implementation & Deployment

### Prerequisites
*   Node.js (v18+)
*   Python 3.10+
*   MongoDB Atlas Cluster
*   Google Gemini API Key
*   Phantom Wallet (Browser Extension)

### 5.1 Environment Configuration
Create `.env` files in the respective backend directories containing:
*   `MONGODB_URI` = `mongodb+srv://<user>:<password>@cluster.mongodb.net/PayMi`
*   `GEMINI_API_KEY` = `your_gemini_api_key`
*   `NEXT_PUBLIC_AUTH_API_URL` = `http://127.0.0.1:8003`

### 5.2 Initializing the Microservices
The application requires running multiple isolated backend processes alongside the frontend. Open separate terminal instances for each of the following commands:

*   **Machine Vision Backend** (Port `8002`): Run `uvicorn receipt_backend:app --port 8002 --reload`
*   **Auth Backend** (Port `8003`): Run `uvicorn auth_backend:app --port 8003 --reload`
*   **Ledger Backend** (Port `8005`): Run `uvicorn contact_backend:app --port 8005 --reload`
*   **Solana Web3 Engine** (Port `8004`): Run `npm run solana:dev`
*   **Next.js Client Interface** (Port `3000`): Run `npm run dev`

## 6. Future Development
*   **Mainnet Transition:** Migrating from the Solana Devnet to Mainnet for real-world `USDC` stablecoin settlements.
*   **Multi-Region Tax Support:** Expanding the LLM prompt engineering to handle diverse North American tax jurisdictions.
*   **Batch Invoicing:** Aggregating multiple receipt debts into a single, unified smart contract settlement to minimize network fees.
