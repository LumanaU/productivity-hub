import React, { useState, useEffect } from "react";
import ReactDOM from "react-dom/client";
import { supabase, supabaseReady } from "./supabase.js";
import App from "./App.jsx";

function AuthGate() {
  const [authUser, setAuthUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState("login");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!supabaseReady || !supabase) { setLoading(false); return; }
    supabase.auth.getSession().then(({ data: { session } }) => {
      setAuthUser(session?.user ?? null);
      if (session?.user) loadProfile(session.user.id);
      else setLoading(false);
    }).catch(() => setLoading(false));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_ev, session) => {
      setAuthUser(session?.user ?? null);
      if (session?.user) loadProfile(session.user.id);
      else { setProfile(null); setLoading(false); }
    });
    return () => subscription.unsubscribe();
  }, []);

  const loadProfile = async (uid) => {
    try {
      const { data } = await supabase.from("profiles").select("*").eq("id", uid).single();
      setProfile(data);
    } catch (e) { console.error("Profile load:", e); }
    setLoading(false);
  };

  const handleAuth = async (e) => {
    e.preventDefault();
    setError("");
    if (!email.trim() || !password) { setError("Enter email and password."); return; }
    if (!supabaseReady || !supabase) { setError("Supabase not configured."); return; }
    if (mode === "signup") {
      const { error: err } = await supabase.auth.signUp({ email: email.trim(), password });
      if (err) setError(err.message);
    } else {
      const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (err) setError(err.message);
    }
  };

  const handleLogout = async () => {
    if (supabase) await supabase.auth.signOut();
    setAuthUser(null);
    setProfile(null);
  };

  if (loading) return (
    <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:"#eef2ff",fontFamily:"sans-serif"}}>
      <div style={{textAlign:"center"}}>
        <div style={{fontSize:"48px",marginBottom:"12px"}}>⚡</div>
        <div style={{fontSize:"18px",fontWeight:600,color:"#1e1b4b"}}>Productivity Hub</div>
        <div style={{fontSize:"13px",color:"#6b7280",marginTop:"6px"}}>Loading…</div>
      </div>
    </div>
  );

  if (!authUser) return (
    <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:"#eef2ff",fontFamily:"sans-serif",padding:"20px"}}>
      <div style={{background:"#fff",borderRadius:"18px",padding:"40px 36px",maxWidth:"400px",width:"100%",boxShadow:"0 4px 24px rgba(0,0,0,0.08)",textAlign:"center"}}>
        <div style={{fontSize:"48px",marginBottom:"8px"}}>⚡</div>
        <div style={{fontSize:"22px",fontWeight:700,color:"#1e1b4b",marginBottom:"4px"}}>Productivity Hub</div>
        <div style={{fontSize:"13px",color:"#6b7280",marginBottom:"28px"}}>{mode==="signup"?"Create your account":"Sign in to continue"}</div>
        <input type="email" placeholder="you@company.com" value={email}
          onChange={e=>setEmail(e.target.value)}
          style={{width:"100%",padding:"12px 16px",borderRadius:"10px",border:"1.5px solid #e5e7eb",fontSize:"15px",outline:"none",marginBottom:"10px",boxSizing:"border-box"}} />
        <input type="password" placeholder="Password (min 6 characters)" value={password}
          onChange={e=>setPassword(e.target.value)}
          onKeyDown={e=>e.key==="Enter"&&handleAuth(e)}
          style={{width:"100%",padding:"12px 16px",borderRadius:"10px",border:"1.5px solid #e5e7eb",fontSize:"15px",outline:"none",marginBottom:"12px",boxSizing:"border-box"}} />
        {error && <div style={{color:"#ef4444",fontSize:"13px",marginBottom:"10px"}}>{error}</div>}
        <button onClick={handleAuth}
          style={{width:"100%",padding:"12px",borderRadius:"10px",border:"none",background:"#6366f1",color:"#fff",fontSize:"15px",fontWeight:600,cursor:"pointer"}}>
          {mode==="signup"?"Create account":"Sign in"}
        </button>
        <div style={{fontSize:"13px",color:"#6b7280",marginTop:"14px"}}>
          {mode==="signup"
            ? <>Already have an account? <button onClick={()=>{setMode("login");setError("");}} style={{background:"none",border:"none",color:"#6366f1",cursor:"pointer",fontWeight:600,fontSize:"13px",padding:0}}>Sign in</button></>
            : <>New here? <button onClick={()=>{setMode("signup");setError("");}} style={{background:"none",border:"none",color:"#6366f1",cursor:"pointer",fontWeight:600,fontSize:"13px",padding:0}}>Create account</button></>}
        </div>
      </div>
    </div>
  );

  return <App authUser={authUser} profile={profile} onLogout={handleLogout} />;
}

const root = document.getElementById("root");
async function startApp() {
  try {
    ReactDOM.createRoot(root).render(
      React.createElement(React.StrictMode, null, React.createElement(AuthGate))
    );
  } catch (e) {
    root.innerHTML = '<div style="padding:40px;font-family:sans-serif"><h1 style="color:#ef4444">App Error</h1><pre style="color:#ef4444;white-space:pre-wrap;font-size:14px">' + e.message + '\n\n' + e.stack + '</pre></div>';
  }
}
startApp();
