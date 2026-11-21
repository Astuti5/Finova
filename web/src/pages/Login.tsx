import { useState, FormEvent } from "react"; import { Navigate } from "react-router-dom";
import { supabase, configured } from "../services/supabase"; import { authSchema } from "../utils/schemas"; import { useAuth } from "../context/AuthContext";
export default function Login() {
  const { session } = useAuth(); const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState(""); const [password, setPassword] = useState(""); const [msg, setMsg] = useState("");
  if (session) return <Navigate to="/" replace />;
  async function submit(e: FormEvent) {
    e.preventDefault(); setMsg("");
    const p = authSchema.safeParse({ email, password }); if (!p.success) return setMsg(p.error.issues[0].message);
    const { error } = mode === "in" ? await supabase.auth.signInWithPassword(p.data) : await supabase.auth.signUp(p.data);
    setMsg(error ? "Could not complete that request. Check your details and try again." : mode === "up" ? "Check your email to confirm your account." : "");
  }
  return (<div className="min-h-screen grid place-items-center p-4"><form onSubmit={submit} className="card w-full max-w-sm p-6 space-y-4">
    <h1 className="text-xl font-bold text-white">{mode === "in" ? "Log in to Finova" : "Create your account"}</h1>
    {!configured && <p className="text-warn text-sm">Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.</p>}
    <label className="block text-sm">Email<input className="input mt-1" type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} required /></label>
    <label className="block text-sm">Password<input className="input mt-1" type="password" autoComplete={mode === "in" ? "current-password" : "new-password"} value={password} onChange={e => setPassword(e.target.value)} required /></label>
    {msg && <p role="alert" className="text-sm text-warn">{msg}</p>}
    <button className="btn w-full">{mode === "in" ? "Log in" : "Sign up"}</button>
    <button type="button" className="text-sm text-cyan" onClick={() => setMode(mode === "in" ? "up" : "in")}>{mode === "in" ? "Need an account? Sign up" : "Have an account? Log in"}</button>
  </form></div>);
}
