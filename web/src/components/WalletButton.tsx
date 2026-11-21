import { useState } from "react"; import { BrowserProvider } from "ethers"; import { Wallet } from "lucide-react";
export default function WalletButton() {
  const [acct, setAcct] = useState(""); const [chain, setChain] = useState<bigint | null>(null); const [err, setErr] = useState("");
  async function connect() {
    const eth = (window as any).ethereum; if (!eth) return setErr("No wallet found. Install MetaMask.");
    try { const p = new BrowserProvider(eth); const [a] = await p.send("eth_requestAccounts", []); setAcct(a); setChain((await p.getNetwork()).chainId); setErr(""); } catch { setErr("Connection cancelled."); }
  }
  return (<div className="text-xs text-right"><button className="btn !py-1.5" onClick={connect}><Wallet size={14} aria-hidden />{acct ? `${acct.slice(0, 6)}…${acct.slice(-4)}` : "Connect wallet"}</button>
    {acct && <p className={chain === 11155111n ? "text-ok" : "text-warn"}>{chain === 11155111n ? "Sepolia testnet" : "Wrong network: switch to Sepolia"}</p>}
    <p className="text-slate-500">Read-only. Finova never asks for your keys.</p>{err && <p role="alert" className="text-warn">{err}</p>}</div>);
}
