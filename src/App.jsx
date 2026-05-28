import { useState, useEffect, useRef, useCallback } from "react";
import { supabase, supabaseReady } from "./supabase.js";

const TABS = ["Tasks","Calendar","Alarms","Timer","Integrations","Settings"];
const PRIORITIES = ["low","medium","high"];
const SHAPES = ["rounded","square","pill","bubble","banner"];
const SIZES = ["small","medium","large","fullscreen"];
const SOUNDS = ["chime","bell","beep","silent"];
const POPUP_COLORS = ["#6366f1","#0ea5e9","#10b981","#f59e0b","#ef4444","#ec4899"];
const SETTINGS_SECTIONS = ["Appearance","Popup","Enterprise","Notifications","Data"];

const LAYOUT_PALETTES = [
  { name:"Indigo", accent:"#6366f1", bg:"#eef2ff", card:"#ffffff", text:"#1e1b4b" },
  { name:"Ocean",  accent:"#0ea5e9", bg:"#e0f2fe", card:"#ffffff", text:"#0c4a6e" },
  { name:"Forest", accent:"#10b981", bg:"#ecfdf5", card:"#ffffff", text:"#064e3b" },
  { name:"Amber",  accent:"#f59e0b", bg:"#fffbeb", card:"#ffffff", text:"#78350f" },
  { name:"Rose",   accent:"#f43f5e", bg:"#fff1f2", card:"#ffffff", text:"#881337" },
  { name:"Slate",  accent:"#64748b", bg:"#f1f5f9", card:"#ffffff", text:"#0f172a" },
];
const LAYOUT_SHAPES = [
  { name:"Rounded", radius:"14px" },
  { name:"Square",  radius:"4px"  },
  { name:"Pill",    radius:"999px"},
  { name:"Sharp",   radius:"0px"  },
];
const MOCK_M365 = [
  { id:"m1", type:"meeting",  title:"Weekly Sync – Accenture Project Alpha", time:"Today 10:00 AM", source:"Teams" },
  { id:"m2", type:"deadline", title:"Deliverable: UX Review Report",          time:"Today 3:00 PM",  source:"Planner" },
  { id:"m3", type:"meeting",  title:"Client Stakeholder Call",                time:"Tomorrow 9:00 AM",source:"Outlook" },
  { id:"m4", type:"deadline", title:"Project Milestone – Phase 2",            time:"Fri, May 15",    source:"Planner" },
  { id:"m5", type:"meeting",  title:"Sprint Retrospective",                   time:"Thu 2:00 PM",    source:"Teams" },
];
const DEFAULT_ENT_EVENTS = [
  { id:"clock_in",    label:"Clock In",    icon:"🟢", color:"#10b981", time:"09:00", enabled:true, builtin:true },
  { id:"break_start", label:"Break Start", icon:"☕", color:"#f59e0b", time:"10:30", enabled:true, builtin:true },
  { id:"break_end",   label:"Break End",   icon:"🔄", color:"#0ea5e9", time:"10:45", enabled:true, builtin:true },
  { id:"lunch_start", label:"Lunch Start", icon:"🍽️", color:"#f43f5e", time:"12:30", enabled:true, builtin:true },
  { id:"lunch_end",   label:"Lunch End",   icon:"✅", color:"#6366f1", time:"13:30", enabled:true, builtin:true },
  { id:"clock_out",   label:"Clock Out",   icon:"🔴", color:"#ef4444", time:"18:00", enabled:true, builtin:true },
];
const ICON_OPTIONS  = ["🟢","🔴","☕","🍽️","🔔","⏰","📌","🎯","✅","🔄","⚡","🏁","💼","📅","🚀"];
const COLOR_OPTIONS = ["#6366f1","#0ea5e9","#10b981","#f59e0b","#ef4444","#ec4899","#64748b","#f43f5e","#8b5cf6","#06b6d4"];

const defaultSettings   = { darkMode:false, popupColor:"#6366f1", popupShape:"rounded", popupSize:"medium", popupSound:"chime", palette:0, layoutShape:0 };
const defaultEnterprise = { enabled:true, events:DEFAULT_ENT_EVENTS, log:[] };
const newAlarmTemplate  = () => ({ id:`custom_${Date.now()}`, label:"", icon:"🔔", color:"#6366f1", time:"09:00", enabled:true, builtin:false });

let audioCtx = null;
const playSound = sound => {
  if(sound==="silent") return;
  try {
    if(!audioCtx) audioCtx = new (window.AudioContext||window.webkitAudioContext)();
    const o=audioCtx.createOscillator(), g=audioCtx.createGain();
    o.connect(g); g.connect(audioCtx.destination);
    o.frequency.value = sound==="chime"?880:sound==="bell"?660:440;
    o.type = sound==="beep"?"square":"sine";
    g.gain.setValueAtTime(0.3,audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001,audioCtx.currentTime+0.8);
    o.start(); o.stop(audioCtx.currentTime+0.8);
  } catch(e){}
};
const shapeStyle = (shape,size,color) => {
  const pad=size==="small"?"8px 14px":size==="large"?"18px 32px":size==="fullscreen"?"24px 48px":"12px 22px";
  const r=shape==="square"?"4px":shape==="pill"?"999px":shape==="bubble"?"50%":shape==="banner"?"0px":"14px";
  const fs=size==="small"?"13px":size==="large"?"18px":size==="fullscreen"?"22px":"15px";
  return {padding:pad,borderRadius:r,fontSize:fs,background:color,color:"#fff",fontWeight:500,
    boxShadow:"0 4px 32px rgba(0,0,0,0.22)",maxWidth:size==="fullscreen"?"100%":size==="large"?"420px":size==="small"?"240px":"320px",
    width:size==="fullscreen"?"100%":"auto",textAlign:"center"};
};

export default function App() {
  // ── Auth state ───────────────────────────────────────────
  const [authUser, setAuthUser]       = useState(null);
  const [profile, setProfile]         = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authEmail, setAuthEmail]     = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authMode, setAuthMode]     = useState("login");
  const [authError, setAuthError]     = useState("");

  // Check session on mount + listen for auth changes
  useEffect(() => {
    if (!supabaseReady || !supabase) { setAuthLoading(false); return; }
    supabase.auth.getSession().then(({ data: { session } }) => {
      setAuthUser(session?.user ?? null);
      if (session?.user) loadProfile(session.user.id);
      else setAuthLoading(false);
    }).catch(() => setAuthLoading(false));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthUser(session?.user ?? null);
      if (session?.user) loadProfile(session.user.id);
      else { setProfile(null); setAuthLoading(false); }
    });
    return () => subscription.unsubscribe();
  }, []);

  const loadProfile = async (uid) => {
    try {
      const { data } = await supabase.from("profiles").select("*").eq("id", uid).single();
      setProfile(data);
    } catch(e) { console.error("Profile load error:", e); }
    setAuthLoading(false);
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setAuthError("");
    if (!authEmail.trim() || !authPassword) { setAuthError("Enter email and password."); return; }
    if (!supabaseReady || !supabase) { setAuthError("Supabase not configured — check environment variables."); return; }
    if (authMode === "signup") {
      const { error } = await supabase.auth.signUp({
        email: authEmail.trim(),
        password: authPassword,
      });
      if (error) setAuthError(error.message);
    } else {
      const { error } = await supabase.auth.signInWithPassword({
        email: authEmail.trim(),
        password: authPassword,
      });
      if (error) setAuthError(error.message);
    }
  };

  const handleLogout = async () => {
    if (supabase) await supabase.auth.signOut();
    setAuthUser(null);
    setProfile(null);
  };

  // ── Login screen ─────────────────────────────────────────
  if (authLoading) return (
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
        <div style={{fontSize:"13px",color:"#6b7280",marginBottom:"28px"}}>{authMode==="signup"?"Create your account":"Sign in to continue"}</div>
        <div>
            <input type="email" placeholder="you@company.com" value={authEmail}
              onChange={e=>setAuthEmail(e.target.value)}
              style={{width:"100%",padding:"12px 16px",borderRadius:"10px",border:"1.5px solid #e5e7eb",fontSize:"15px",outline:"none",marginBottom:"10px",boxSizing:"border-box"}} />
            <input type="password" placeholder="Password (min 6 characters)" value={authPassword}
              onChange={e=>setAuthPassword(e.target.value)}
              onKeyDown={e=>e.key==="Enter"&&handleLogin(e)}
              style={{width:"100%",padding:"12px 16px",borderRadius:"10px",border:"1.5px solid #e5e7eb",fontSize:"15px",outline:"none",marginBottom:"12px",boxSizing:"border-box"}} />
            {authError && <div style={{color:"#ef4444",fontSize:"13px",marginBottom:"10px"}}>{authError}</div>}
            <button onClick={handleLogin}
              style={{width:"100%",padding:"12px",borderRadius:"10px",border:"none",background:"#6366f1",color:"#fff",fontSize:"15px",fontWeight:600,cursor:"pointer"}}>
              {authMode==="signup"?"Create account":"Sign in"}
            </button>
            <div style={{fontSize:"13px",color:"#6b7280",marginTop:"14px"}}>
              {authMode==="signup"
                ? <>Already have an account? <button onClick={()=>{setAuthMode("login");setAuthError("");}} style={{background:"none",border:"none",color:"#6366f1",cursor:"pointer",fontWeight:600,fontSize:"13px",padding:0}}>Sign in</button></>
                : <>New here? <button onClick={()=>{setAuthMode("signup");setAuthError("");}} style={{background:"none",border:"none",color:"#6366f1",cursor:"pointer",fontWeight:600,fontSize:"13px",padding:0}}>Create account</button></>}
            </div>
        </div>
      </div>
    </div>
  );

  // ── Authenticated app starts here ────────────────────────
  const isAdmin = profile?.role === "admin";
  const [tab,setTab]                     = useState("Tasks");
  const [settingsTab,setSettingsTab]     = useState("Appearance");
  const [tasks,setTasks]                 = useState([]);
  const [newTask,setNewTask]             = useState({title:"",priority:"medium",dueDate:"",alarmTime:""});
  const [filter,setFilter]               = useState("all");
  const [sortBy,setSortBy]               = useState("created");
  const [settings,setSettings]           = useState(defaultSettings);
  const [enterprise,setEnterprise]       = useState(defaultEnterprise);
  const [popup,setPopup]                 = useState(null);
  const [entPopup,setEntPopup]           = useState(null);
  const [timerMode,setTimerMode]         = useState("pomodoro");
  const [timerSecs,setTimerSecs]         = useState(25*60);
  const [timerRunning,setTimerRunning]   = useState(false);
  const [customMin,setCustomMin]         = useState(25);
  const [calDate,setCalDate]             = useState(new Date().toISOString().slice(0,10));
  const [loaded,setLoaded]               = useState(false);
  const [suggestion,setSuggestion]       = useState(null);
  const [sugLoading,setSugLoading]       = useState(false);
  const [showEnterprise,setShowEnterprise] = useState(false);
  const [showAdminPanel,setShowAdminPanel] = useState(false);
  const [entTab,setEntTab]               = useState("quicklog");
  const [saveStatus,setSaveStatus]       = useState("saved");
  const [addingAlarm,setAddingAlarm]     = useState(false);
  const [wfmDate,setWfmDate]             = useState(new Date().toISOString().slice(0,10));
  const [wfmLogs,setWfmLogs]             = useState([]);
  const [wfmLoading,setWfmLoading]       = useState(false);
  const [analysts,setAnalysts]           = useState([]);
  const [newAnalyst,setNewAnalyst]       = useState({enterpriseId:"",fullName:""});
  const [adminDate,setAdminDate]         = useState(new Date().toISOString().slice(0,10));

  // ── Supabase: Load analysts + marks from database ────────
  const loadAnalystsFromDb = useCallback(async () => {
    if (!supabaseReady || !supabase) return;
    try {
      const { data } = await supabase.from("analysts").select("*").order("created_at");
      if (data) {
        const { data: marksData } = await supabase.from("marks").select("*").order("marked_at");
        const analystMap = data.map(a => {
          const aMarks = (marksData || []).filter(m => m.analyst_id === a.id);
          const marksByDate = {};
          aMarks.forEach(m => {
            if (!marksByDate[m.mark_date]) marksByDate[m.mark_date] = {};
            marksByDate[m.mark_date][m.mark_type] = m.marked_at;
          });
          return { ...a, enterpriseId: a.enterprise_id, fullName: a.full_name, marks: marksByDate };
        });
        setAnalysts(analystMap);
      }
    } catch(e) { console.error("Load analysts error:", e); }
  }, []);

  useEffect(() => { loadAnalystsFromDb(); }, [loadAnalystsFromDb]);

  // ── Supabase: Real-time subscription for live updates ────
  useEffect(() => {
    if (!supabaseReady || !supabase) return;
    const channel = supabase.channel("realtime-marks")
      .on("postgres_changes", { event: "*", schema: "public", table: "marks" }, () => { loadAnalystsFromDb(); })
      .on("postgres_changes", { event: "*", schema: "public", table: "analysts" }, () => { loadAnalystsFromDb(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [loadAnalystsFromDb]);

  // ── Supabase: Auto-link current user to their analyst record ─
  const [currentAnalystId,setCurrentAnalystId] = useState("");
  useEffect(() => {
    if (!authUser || !analysts.length) return;
    const match = analysts.find(a =>
      a.email === authUser.email ||
      (a.enterpriseId && authUser.email?.startsWith(a.enterpriseId))
    );
    if (match) setCurrentAnalystId(match.id);
    else if (isAdmin) setCurrentAnalystId("");
  }, [authUser, analysts, isAdmin]);
  const [showM365Sync,setShowM365Sync]       = useState(false);
  const [m365Groups,setM365Groups]           = useState([]);
  const [m365Members,setM365Members]         = useState([]);
  const [m365Loading,setM365Loading]         = useState(false);
  const [m365Search,setM365Search]           = useState("");
  const [selectedGroup,setSelectedGroup]     = useState("");
  const [selectedMembers,setSelectedMembers] = useState([]);
  const [analystToDelete,setAnalystToDelete] = useState("");
  const [newAlarm,setNewAlarm]           = useState(newAlarmTemplate());
  const [showDoneLog,setShowDoneLog]     = useState(false);
  const [taskPopup,setTaskPopup]         = useState(null);
  const [editingTask,setEditingTask]     = useState(null);
  const [liveTick,setLiveTick]           = useState(0);
  const [refreshInterval,setRefreshInterval] = useState(()=>{
    try { const v=localStorage.getItem("ph_refresh_interval"); return v?parseInt(v):0; } catch(e){ return 0; }
  });
  const [resetTime,setResetTime]         = useState(()=>{
    try { return localStorage.getItem("ph_reset_time")||""; } catch(e){ return ""; }
  });
  const [downloadModal,setDownloadModal] = useState(null); // {filename, content}
  const [confirmAction,setConfirmAction] = useState(null); // {title, body, onConfirm}
  const [customMarkKeys,setCustomMarkKeys] = useState(()=>{
    try { const s=localStorage.getItem("ph_custom_marks"); return s?JSON.parse(s):[]; } catch(e){ return []; }
  });
  const [addingCustomMark,setAddingCustomMark] = useState(false);
  const [newCustomMark,setNewCustomMark] = useState({key:"",label:"",icon:"📌",color:"#6366f1"});
  const timerRef = useRef(null);
  const firedRef = useRef({});

  const pal  = LAYOUT_PALETTES[settings.palette];
  const lr   = LAYOUT_SHAPES[settings.layoutShape].radius;
  const dm   = settings.darkMode;
  const bg   = dm?"#18181b":pal.bg;
  const card = dm?"#27272a":pal.card;
  const bdr  = dm?"#3f3f46":"#e5e7eb";
  const txt  = dm?"#f4f4f5":pal.text;
  const txt2 = dm?"#a1a1aa":"#6b7280";
  const inp  = dm?"#3f3f46":"#f3f4f6";
  const acc  = dm?"#818cf8":pal.accent;

  useEffect(()=>{
    try{
      const t=localStorage.getItem("ph_tasks5"),sv=localStorage.getItem("ph_settings5"),e=localStorage.getItem("ph_ent5");
      if(t) setTasks(JSON.parse(t));
      if(sv) setSettings(JSON.parse(sv));
      if(e) setEnterprise(JSON.parse(e));
    }catch(err){}
    setLoaded(true);
  },[]);
  useEffect(()=>{ try{localStorage.setItem("ph_refresh_interval",refreshInterval.toString());}catch(e){} },[refreshInterval]);
  useEffect(()=>{ try{localStorage.setItem("ph_reset_time",resetTime);}catch(e){} },[resetTime]);
  useEffect(()=>{ try{localStorage.setItem("ph_custom_marks",JSON.stringify(customMarkKeys));}catch(e){} },[customMarkKeys]);

  // Safe download — tries real download, falls back to copy-to-clipboard modal
  const safeDownload = (content, filename, mimeType="text/csv") => {
    try {
      const blob = new Blob([content], {type:mimeType+";charset=utf-8;"});
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(()=>URL.revokeObjectURL(url),200);
      setPopup({title:"⬇ Downloaded",body:filename});
      setTimeout(()=>setPopup(null),3000);
    } catch(e) {
      // Fallback: show in modal for manual copy
      setDownloadModal({filename, content});
    }
  };

  // Safe confirm — replaces window.confirm which is blocked in iframe
  const safeConfirm = (title, body, onConfirm) => {
    setConfirmAction({title, body, onConfirm});
  };

  // Live tick for elapsed time bubbles (1s)
  useEffect(()=>{
    const iv = setInterval(()=>setLiveTick(t=>t+1),1000);
    return()=>clearInterval(iv);
  },[]);

  const syncMarkToRoster = (eventId) => {
    if(!currentAnalystId) return false;
    const today = new Date().toISOString().slice(0,10);
    let didSync = false;

    setAnalysts(prev=>prev.map(a=>{
      if(a.id!==currentAnalystId) return a;
      const dateMarks = a.marks?.[today] || {};

      let markKey = null;
      if(eventId==="clock_in"   && !dateMarks.clock_in)   markKey = "clock_in";
      else if(eventId==="clock_out"  && !dateMarks.clock_out)  markKey = "clock_out";
      else if(eventId==="lunch_in"   || eventId==="lunch_start") {
        if(!dateMarks.lunch_in)  markKey = "lunch_in";
      }
      else if(eventId==="lunch_out"  || eventId==="lunch_end") {
        if(!dateMarks.lunch_out) markKey = "lunch_out";
      }
      else if(eventId==="break_in_1" || eventId==="break_start") {
        if(!dateMarks.break_in_1)      markKey = "break_in_1";
        else if(!dateMarks.break_in_2) markKey = "break_in_2";
      }
      else if(eventId==="break_out_1" || eventId==="break_end") {
        if(!dateMarks.break_out_1)      markKey = "break_out_1";
        else if(!dateMarks.break_out_2) markKey = "break_out_2";
      }
      else if(eventId==="break_in_2"  && !dateMarks.break_in_2)  markKey = "break_in_2";
      else if(eventId==="break_out_2" && !dateMarks.break_out_2) markKey = "break_out_2";

      if(!markKey) return a;
      didSync = true;
      return {...a, marks:{...a.marks, [today]:{...dateMarks, [markKey]:new Date().toISOString()}}};
    }));

    return didSync;
  };

  const eventToMarkKey = (eventId) => eventId;

  const MARK_KEYS = [
    {key:"clock_in",   label:"Clock In",    icon:"🟢", color:"#10b981"},
    {key:"break_out_1",label:"Break Out 1", icon:"🔄", color:"#0ea5e9"},
    {key:"break_in_1", label:"Break In 1",  icon:"☕", color:"#f59e0b"},
    {key:"lunch_out",  label:"Lunch Out",   icon:"✅", color:"#6366f1"},
    {key:"lunch_in",   label:"Lunch In",    icon:"🍽️", color:"#f43f5e"},
    {key:"break_out_2",label:"Break Out 2", icon:"🔄", color:"#0ea5e9"},
    {key:"break_in_2", label:"Break In 2",  icon:"☕", color:"#f59e0b"},
    {key:"clock_out",  label:"Clock Out",   icon:"🔴", color:"#ef4444"},
    ...customMarkKeys,
  ];

  const importRosterCSV = (e) => {
    const file = e.target.files?.[0]; if(!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const text = ev.target.result;
        const lines = text.split(/\r?\n/).filter(l=>l.trim());
        if(lines.length < 2) {
          setPopup({title:"⚠ Empty file", body:"CSV must have a header row and at least one analyst."});
          setTimeout(()=>setPopup(null),3500);
          return;
        }
        const headerLine = lines[0].toLowerCase();
        const cols = headerLine.split(",").map(c=>c.trim().replace(/^"|"$/g,""));
        const idIdx   = cols.findIndex(c=>c.includes("enterprise")||c==="id"||c.includes("upn")||c.includes("username")||c.includes("login"));
        const nameIdx = cols.findIndex(c=>c.includes("name")||c.includes("display"));
        if(nameIdx === -1) {
          setPopup({title:"⚠ Invalid CSV", body:"Missing 'Full Name' or 'Display Name' column."});
          setTimeout(()=>setPopup(null),3500);
          return;
        }
        const existing = new Set(analysts.map(a=>(a.enterpriseId||"").toLowerCase()));
        let added = 0, skipped = 0;
        const newOnes = [];
        for(let i=1; i<lines.length; i++) {
          const parts = lines[i].split(",").map(c=>c.trim().replace(/^"|"$/g,""));
          const id   = idIdx>=0 ? (parts[idIdx]||"").trim() : "";
          const name = (parts[nameIdx]||"").trim();
          if(!name) continue;
          if(id && existing.has(id.toLowerCase())) { skipped++; continue; }
          newOnes.push({
            id: `${Date.now()}_${i}`,
            enterpriseId: id,
            fullName: name,
            marks: {},
          });
          if(id) existing.add(id.toLowerCase());
          added++;
        }
        if(newOnes.length>0) setAnalysts(prev=>[...prev, ...newOnes]);
        setPopup({
          title: `✅ Imported ${added} analyst${added!==1?"s":""}`,
          body: skipped>0 ? `${skipped} skipped (already in roster).` : "Roster updated successfully.",
        });
        setTimeout(()=>setPopup(null),4500);
      } catch(err) {
        setPopup({title:"❌ Import failed", body:err.message||"Invalid file format."});
        setTimeout(()=>setPopup(null),4000);
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const downloadRosterTemplate = () => {
    const csv = "Enterprise ID,Full Name,Email,Team\njane.smith,Jane Smith,jane.smith@company.com,Operations\njohn.doe,John Doe,john.doe@company.com,Operations\n";
    safeDownload(csv, "roster-template.csv");
  };

  const addAnalyst = async () => {
    const {enterpriseId,fullName} = newAnalyst;
    if(!enterpriseId.trim() && !fullName.trim()) return;
    if(analysts.some(a=>a.enterpriseId===enterpriseId.trim()&&enterpriseId.trim())) return;
    if (supabaseReady && supabase) {
      const { error } = await supabase.from("analysts").insert({
        enterprise_id: enterpriseId.trim(),
        full_name: fullName.trim() || enterpriseId.trim(),
        email: "",
        created_by: authUser?.id,
      });
      if (!error) loadAnalystsFromDb();
    } else {
      setAnalysts(prev=>[...prev,{
        id: Date.now().toString(), enterpriseId: enterpriseId.trim(),
        fullName: fullName.trim() || enterpriseId.trim(), marks: {},
      }]);
    }
    setNewAnalyst({enterpriseId:"",fullName:""});
  };

  const removeAnalyst = async (id) => {
    const target = analysts.find(a=>a.id===id);
    if (supabaseReady && supabase) {
      await supabase.from("marks").delete().eq("analyst_id", id);
      await supabase.from("analysts").delete().eq("id", id);
      loadAnalystsFromDb();
    } else {
      setAnalysts(prev=>prev.filter(a=>a.id!==id));
    }
    if(currentAnalystId===id) setCurrentAnalystId("");
    if(target){
      setPopup({title:`🗑 ${target.fullName} removed`, body:"Analyst deleted from tracking."});
      setTimeout(()=>setPopup(null),3500);
    }
  };

  const clearAnalystDay = (analystId) => {
    setAnalysts(prev=>prev.map(a=>{
      if(a.id!==analystId) return a;
      const newMarks = {...a.marks};
      delete newMarks[adminDate];
      return {...a, marks:newMarks};
    }));
    setPopup({title:"🔄 Day reset", body:`Marks cleared for ${adminDate}.`});
    setTimeout(()=>setPopup(null),3500);
  };

  const fmtMarkShort = iso => {
    if(!iso) return "—";
    const d=new Date(iso);
    return `${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}/${String(d.getFullYear()).slice(-2)} ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
  };
  const fmtTimeOnly = iso => {
    if(!iso) return "—";
    const d=new Date(iso);
    return `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
  };

  const calcAnalystDuration = (analystMarks, includeSeconds=true) => {
    if(!analystMarks?.clock_in) return null;
    const start = new Date(analystMarks.clock_in).getTime();
    const end   = analystMarks.clock_out ? new Date(analystMarks.clock_out).getTime() : Date.now();
    const sec   = Math.floor((end-start)/1000);
    const hh = String(Math.floor(sec/3600)).padStart(2,"0");
    const mm = String(Math.floor((sec%3600)/60)).padStart(2,"0");
    const ss = String(sec%60).padStart(2,"0");
    return includeSeconds ? `${hh}:${mm}:${ss}` : `${hh}:${mm}`;
  };

  const exportRosterCSV = () => {
    const header = ["Enterprise ID","Full Name","Date", ...MARK_KEYS.map(k=>k.label), "Worked Time (HH:MM:SS)"];
    const rows = analysts.map(a=>{
      const m = a.marks?.[adminDate] || {};
      return [
        `"${a.enterpriseId}"`,
        `"${a.fullName}"`,
        adminDate,
        ...MARK_KEYS.map(k=>m[k.key]?`"${fmtTimeOnly(m[k.key])}"`:""),
        calcAnalystDuration(m,true)||"",
      ].join(",");
    });
    const csv = header.join(",")+"\n"+rows.join("\n");
    safeDownload(csv, `analyst-tracking-${adminDate}.csv`);
  };

  const exportAllHistoryCSV = () => {
    if(analysts.length===0) return;
    const allDates = new Set();
    analysts.forEach(a=>{ if(a.marks) Object.keys(a.marks).forEach(d=>allDates.add(d)); });
    const sortedDates = [...allDates].sort();
    if(sortedDates.length===0){
      setPopup({title:"⚠ No history",body:"No marks recorded yet for any analyst."});
      setTimeout(()=>setPopup(null),3000);
      return;
    }
    const header = ["Enterprise ID","Full Name","Date", ...MARK_KEYS.map(k=>k.label), "Worked Time (HH:MM:SS)"];
    const rows = [];
    analysts.forEach(a=>{
      sortedDates.forEach(date=>{
        const m = a.marks?.[date] || {};
        const hasAny = MARK_KEYS.some(k=>m[k.key]);
        if(!hasAny) return;
        rows.push([
          `"${a.enterpriseId}"`,
          `"${a.fullName}"`,
          date,
          ...MARK_KEYS.map(k=>m[k.key]?`"${fmtTimeOnly(m[k.key])}"`:""),
          calcAnalystDuration(m,true)||"",
        ].join(","));
      });
    });
    const csv = header.join(",")+"\n"+rows.join("\n");
    safeDownload(csv, `analyst-full-history-${new Date().toISOString().slice(0,10)}.csv`);
    setPopup({title:"⬇ Full history exported",body:`${rows.length} records across ${sortedDates.length} day${sortedDates.length>1?"s":""}.`});
    setTimeout(()=>setPopup(null),4000);
  };

  const simulateAnalystMark = (analystId, markKey) => {
    setAnalysts(prev=>prev.map(a=>{
      if(a.id!==analystId) return a;
      const dateMarks = a.marks?.[adminDate] || {};
      return {...a, marks:{...a.marks, [adminDate]:{...dateMarks, [markKey]:new Date().toISOString()}}};
    }));
  };

  const clearAnalystDayOld = (analystId) => {
    setAnalysts(prev=>prev.map(a=>{
      if(a.id!==analystId) return a;
      const newMarks = {...a.marks};
      delete newMarks[adminDate];
      return {...a, marks:newMarks};
    }));
  };

  const exportTodayLogCSV = () => {
    const today = new Date().toISOString().slice(0,10);
    const todayEntries = (enterprise.log || []).filter(e => e.date === today);
    if(todayEntries.length === 0) {
      setPopup({title:"⚠ No entries", body:"Nothing to export for today."});
      setTimeout(() => setPopup(null), 3000);
      return;
    }
    const currentAnalyst = currentAnalystId ? analysts.find(a => a.id === currentAnalystId) : null;
    const analystName = currentAnalyst?.fullName || "Local";
    const enterpriseId = currentAnalyst?.enterpriseId || "";

    const header = "Analyst,Enterprise ID,Event,Date,Time\n";
    const rows = todayEntries.slice().reverse().map(e =>
      `"${analystName}","${enterpriseId}","${e.label}","${e.date}","${e.time}"`
    );
    const csv = header + rows.join("\n");
    safeDownload(csv, `marks-${today}${currentAnalyst?`-${enterpriseId||currentAnalyst.fullName}`:""}.csv`);
    setPopup({title:"⬇ CSV downloaded", body:`Exported ${todayEntries.length} mark${todayEntries.length>1?"s":""}.`});
    setTimeout(() => setPopup(null), 3000);
  };

  const isAdminView = isAdmin;

  const defaultMarks = () => {
    const base = {
      clock_in:    null, clock_out:   null,
      break_in_1:  null, break_out_1: null,
      break_in_2:  null, break_out_2: null,
      lunch_in:    null, lunch_out:   null,
    };
    customMarkKeys.forEach(cm=>{ base[cm.key]=null; });
    return base;
  };
  const [marks, setMarks]         = useState(()=>{
    try { const s=localStorage.getItem("ph_marks"); return s?JSON.parse(s):defaultMarks(); } catch(e){ return defaultMarks(); }
  });
  const [elapsed, setElapsed]     = useState(0);
  const elapsedRef                = useRef(null);

  // Persist marks
  useEffect(()=>{ try{localStorage.setItem("ph_marks",JSON.stringify(marks));}catch(e){} },[marks]);

  // Elapsed time since clock-in (personal tracker)
  useEffect(()=>{
    clearInterval(elapsedRef.current);
    if(marks.clock_in && !marks.clock_out){
      const update=()=>setElapsed(Math.floor((Date.now()-new Date(marks.clock_in).getTime())/1000));
      update();
      elapsedRef.current = setInterval(update, 1000);
    } else { setElapsed(0); }
    return()=>clearInterval(elapsedRef.current);
  },[marks.clock_in, marks.clock_out]);

  // Mark a time slot
  const stampMark = async (key) => {
    if(marks[key]) return; // already marked
    const now = new Date().toISOString();
    setMarks(prev=>({...prev, [key]:now}));
    const mk = MARK_KEYS.find(m=>m.key===key);
    if (currentAnalystId && supabaseReady && supabase) {
      try {
        await supabase.from("marks").insert({
          analyst_id: currentAnalystId,
          user_id: authUser?.id,
          mark_type: key,
          mark_label: mk?.label || key,
          mark_icon: mk?.icon || "",
          mark_color: mk?.color || "",
          source: "mark_panel",
        });
        loadAnalystsFromDb();
      } catch(e) { console.error("Mark save error:", e); }
    }
    if(mk) manualLog({id:key, label:mk.label, icon:mk.icon, color:mk.color});
  };

  const resetMarksToday = () => {
    setMarks(defaultMarks());
    setElapsed(0);
  };

  const saveTimer  = useRef(null);
  const pushTimer  = useRef(null);
  const wfmStoreKey = "ph_wfm_logs";
  const logToWFM = (ev, source="confirmed") => {
    const now = new Date();
    const entry = {
      id:          `${ev.id}_${now.getTime()}`,
      analystId:   "current.analyst@company.com",
      analystName: "Current Analyst",
      teamId:      "team-alpha",
      event:       ev.id,
      label:       ev.label,
      icon:        ev.icon,
      color:       ev.color,
      timestamp:   now.toISOString(),
      date:        now.toISOString().slice(0,10),
      localTime:   now.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit",second:"2-digit"}),
      source,
    };
    try {
      const existing = JSON.parse(localStorage.getItem(wfmStoreKey)||"[]");
      localStorage.setItem(wfmStoreKey, JSON.stringify([entry,...existing].slice(0,500)));
    } catch(e){}
  };

  const loadWFMLogs = (date) => {
    setWfmLoading(true);
    setTimeout(()=>{
      try {
        const all = JSON.parse(localStorage.getItem(wfmStoreKey)||"[]");
        setWfmLogs(all.filter(l=>l.date===date));
      } catch(e){ setWfmLogs([]); }
      setWfmLoading(false);
    },300);
  };

  const exportWFMCSV = () => {
    const rows = wfmLogs.map(l=>
      `"${l.analystName}","${l.teamId}","${l.label}","${l.date}","${l.localTime}","${l.timestamp}","${l.source}"`
    );
    const csv = "Analyst,Team,Event,Date,Local Time,Timestamp (UTC),Source\n" + rows.join("\n");
    safeDownload(csv, `wfm-log-${wfmDate}.csv`);
  };

  useEffect(()=>{ if(showEnterprise && entTab==="wfm") loadWFMLogs(wfmDate); },[showEnterprise,entTab,wfmDate]);

  const evtColor = id=>({clock_in:"#10b981",clock_out:"#ef4444",break_start:"#f59e0b",
    break_end:"#0ea5e9",lunch_start:"#f43f5e",lunch_end:"#6366f1"}[id]||"#64748b");
  const triggerSave = () => {
    setSaveStatus("saving");
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(()=>setSaveStatus("saved"), 800);
  };

  useEffect(()=>{ if(!loaded) return; try{localStorage.setItem("ph_tasks5",JSON.stringify(tasks));}catch(e){} triggerSave(); },[tasks,loaded]);
  useEffect(()=>{ if(!loaded) return; try{localStorage.setItem("ph_settings5",JSON.stringify(settings));}catch(e){} triggerSave(); },[settings,loaded]);
  useEffect(()=>{ if(!loaded) return; try{localStorage.setItem("ph_ent5",JSON.stringify(enterprise));}catch(e){} triggerSave(); },[enterprise,loaded]);

  useEffect(()=>{
    if(!enterprise.enabled) return;
    const iv=setInterval(()=>{
      const now=new Date(),hhmm=now.toTimeString().slice(0,5),dk=now.toISOString().slice(0,10);
      enterprise.events.forEach(ev=>{
        if(!ev.enabled) return;
        const fk=`${dk}_${ev.id}`;
        if(ev.time===hhmm&&!firedRef.current[fk]){
          firedRef.current[fk]=true;
          playSound(settings.popupSound);
          setEntPopup({id:ev.id,icon:ev.icon,label:ev.label,color:ev.color,time:hhmm});
        }
      });
    },10000);
    return()=>clearInterval(iv);
  },[enterprise,settings.popupSound]);

  useEffect(()=>{
    const iv=setInterval(()=>{
      const now=new Date(),hhmm=now.toTimeString().slice(0,5),ds=now.toISOString().slice(0,10);
      tasks.forEach(t=>{
        if(t.alarmTime&&t.alarmDate===ds&&t.alarmTime===hhmm&&!t.alarmFired){
          setTasks(prev=>prev.map(x=>x.id===t.id?{...x,alarmFired:true}:x));
          setTaskPopup({id:t.id,title:t.title,priority:t.priority,dueDate:t.dueDate||""});
        }
      });
    },15000);
    return()=>clearInterval(iv);
  },[tasks,settings]);

  useEffect(()=>{
    if(!timerRunning){clearInterval(timerRef.current);return;}
    timerRef.current=setInterval(()=>{
      setTimerSecs(s=>{
        if(s<=1){clearInterval(timerRef.current);setTimerRunning(false);playSound(settings.popupSound);triggerPopup("Timer complete!","Session done!");return 0;}
        return s-1;
      });
    },1000);
    return()=>clearInterval(timerRef.current);
  },[timerRunning]);

  const triggerPopup=(title,body)=>{setPopup({title,body});setTimeout(()=>setPopup(null),5000);};
  const dismissEntPopup=(ack)=>{
    clearInterval(entSoundRef.current);
    if(ack&&entPopup){
      const now=new Date();
      setEnterprise(prev=>({...prev,log:[{id:entPopup.id,label:entPopup.label,icon:entPopup.icon,
        time:now.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}),date:now.toISOString().slice(0,10)},...(prev.log||[])].slice(0,100)}));
    }
    setEntPopup(null);
  };
  const manualLog=(ev)=>{
    const now=new Date();
    setEnterprise(prev=>({...prev,log:[{id:ev.id,label:ev.label,icon:ev.icon,
      time:now.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}),date:now.toISOString().slice(0,10)},...(prev.log||[])].slice(0,100)}));
    setPopup({title:`${ev.icon} ${ev.label} logged`,body:`Recorded at ${now.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}`});
    setTimeout(()=>setPopup(null),4000);
  };
  const updateEvt=(id,field,val)=>setEnterprise(prev=>({...prev,events:prev.events.map(e=>e.id===id?{...e,[field]:val}:e)}));
  const deleteEvt=(id)=>setEnterprise(prev=>({...prev,events:prev.events.filter(e=>e.id!==id)}));
  const saveNewAlarm=()=>{
    if(!newAlarm.label.trim()) return;
    setEnterprise(prev=>({...prev,events:[...prev.events,{...newAlarm,id:`custom_${Date.now()}`}]}));
    setAddingAlarm(false); setNewAlarm(newAlarmTemplate());
  };

  const dismissTaskPopup=()=>{ clearInterval(taskSoundRef.current); setTaskPopup(null); };
  const postponeTaskPopup=(mins)=>{
    if(!taskPopup) return;
    clearInterval(taskSoundRef.current);
    const snap={...taskPopup};
    setTaskPopup(null);
    setTimeout(()=>setTaskPopup({...snap,postponed:true}), mins*60*1000);
    setPopup({title:`⏳ Snoozed ${mins} min`,body:`"${snap.title}" reminder postponed.`});
    setTimeout(()=>setPopup(null),4000);
  };

  const exportBackup = () => {
    const data = { tasks, settings, enterprise, exportedAt: new Date().toISOString(), version:"5" };
    safeDownload(JSON.stringify(data, null, 2), `productivity-hub-backup-${new Date().toISOString().slice(0,10)}.json`, "application/json");
  };

  const importBackup = (e) => {
    const file = e.target.files?.[0]; if(!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const data = JSON.parse(ev.target.result);
        if(data.tasks)      setTasks(data.tasks);
        if(data.settings)   setSettings(data.settings);
        if(data.enterprise) setEnterprise(data.enterprise);
        setPopup({title:"✅ Backup restored", body:"All your data has been loaded."});
        setTimeout(()=>setPopup(null),4000);
      } catch(err) {
        setPopup({title:"❌ Import failed", body:"Invalid backup file."});
        setTimeout(()=>setPopup(null),4000);
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const addTask=()=>{
    if(!newTask.title.trim()) return;
    const t={...newTask,id:Date.now().toString(),done:false,created:Date.now(),alarmFired:false,
      alarmDate:newTask.alarmTime?(newTask.dueDate||new Date().toISOString().slice(0,10)):""};
    setTasks(prev=>[t,...prev]);
    setNewTask({title:"",priority:"medium",dueDate:"",alarmTime:""});
  };
  const toggleDone=id=>{
    setTasks(prev=>prev.map(t=>{
      if(t.id!==id) return t;
      const nowDone=!t.done;
      return {...t,done:nowDone,doneAt:nowDone?new Date().toISOString():undefined};
    }));
  };
  const deleteTask=id=>setTasks(prev=>prev.filter(t=>t.id!==id));

  const startEdit=(t)=>setEditingTask({...t});
  const saveEdit=()=>{
    if(!editingTask||!editingTask.title.trim()) return;
    setTasks(prev=>prev.map(t=>t.id===editingTask.id?{...editingTask,alarmFired:false,
      alarmDate:editingTask.alarmTime?(editingTask.dueDate||new Date().toISOString().slice(0,10)):""}:t));
    setEditingTask(null);
  };

  const doneTasks = tasks.filter(t=>t.done).sort((a,b)=>new Date(b.doneAt||0)-new Date(a.doneAt||0));
  const doneCount = doneTasks.length;

  const filtered=tasks
    .filter(t=>!t.done && (filter==="all" ? true : filter==="pending" ? true : false))
    .sort((a,b)=>sortBy==="priority"?PRIORITIES.indexOf(b.priority)-PRIORITIES.indexOf(a.priority):sortBy==="due"?(a.dueDate||"z").localeCompare(b.dueDate||"z"):b.created-a.created);
  const calTasks=tasks.filter(t=>t.dueDate===calDate);
  const fmt=s=>`${String(Math.floor(s/60)).padStart(2,"0")}:${String(s%60).padStart(2,"0")}`;

  const generateSuggestion=async()=>{
    setSugLoading(true);setSuggestion(null);
    const today=new Date().toISOString().slice(0,10);
    const pt=tasks.filter(t=>!t.done).map(t=>({title:t.title,priority:t.priority,dueDate:t.dueDate||"none"}));
    const mt=MOCK_M365.map(m=>({title:m.title,time:m.time,type:m.type,source:m.source}));
    const prompt=`You are a productivity assistant. Suggest ONE most important thing to focus on now. Be concise (2-3 sentences).\nToday: ${today}\nTasks:\n${pt.length?pt.map(t=>`- "${t.title}" (${t.priority}, due:${t.dueDate})`).join("\n"):"None"}\nMeetings:\n${mt.map(m=>`- [${m.type}] "${m.title}" at ${m.time} (${m.source})`).join("\n")}\nJSON only: {"title":"headline","body":"suggestion","priority":"high|medium|low","source":"trigger"}`;
    try{
      const res=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:300,messages:[{role:"user",content:prompt}]})});
      const data=await res.json();
      const raw=data.content?.map(c=>c.text||"").join("").replace(/```json|```/g,"").trim();
      setSuggestion(JSON.parse(raw));
    }catch(e){setSuggestion({title:"Could not load",body:"Check connection.",priority:"low",source:""});}
    setSugLoading(false);
  };

  const s={
    wrap:{minHeight:"100vh",background:bg,color:txt,fontFamily:"sans-serif",paddingBottom:"80px"},
    header:{background:card,borderBottom:`1px solid ${bdr}`,padding:"14px 20px",display:"flex",alignItems:"center",justifyContent:"space-between",gap:"10px"},
    tabs:{display:"flex",gap:"4px",padding:"10px 14px",background:card,borderBottom:`1px solid ${bdr}`,overflowX:"auto"},
    tabBtn:active=>({padding:"7px 14px",borderRadius:lr,border:"none",cursor:"pointer",fontSize:"13px",fontWeight:500,
      background:active?acc:dm?"#3f3f46":"#f3f4f6",color:active?"#fff":txt2,whiteSpace:"nowrap",transition:"all 0.15s"}),
    card:{background:card,border:`1px solid ${bdr}`,borderRadius:lr,padding:"16px",marginBottom:"12px"},
    input:{background:inp,border:`1px solid ${bdr}`,borderRadius:lr,padding:"8px 12px",color:txt,fontSize:"14px",outline:"none",width:"100%",boxSizing:"border-box"},
    btn:(c,outline)=>({background:outline?"transparent":c||acc,color:outline?c||acc:"#fff",
      border:`1.5px solid ${c||acc}`,borderRadius:lr,padding:"8px 16px",cursor:"pointer",fontSize:"13px",fontWeight:500,transition:"all 0.15s"}),
    section:{padding:"16px"},
    lbl:{color:txt2,fontSize:"13px",display:"block",marginBottom:"6px",fontWeight:500},
    iconBtn:(active,c)=>({background:active?(c||acc)+"22":"transparent",border:`1.5px solid ${active?(c||acc):bdr}`,
      borderRadius:"8px",padding:"4px 8px",cursor:"pointer",fontSize:"16px"}),
  };

  const taskSoundRef = useRef(null);
  useEffect(()=>{
    clearInterval(taskSoundRef.current);
    if(taskPopup){
      playSound(entSoundName.current);
      taskSoundRef.current = setInterval(()=>playSound(entSoundName.current), 3000);
    }
    return()=>clearInterval(taskSoundRef.current);
  },[!!taskPopup]);

  const entSoundRef = useRef(null);
  const entSoundName = useRef(settings.popupSound);
  useEffect(()=>{ entSoundName.current = settings.popupSound; },[settings.popupSound]);
  useEffect(()=>{
    clearInterval(entSoundRef.current);
    if(entPopup){
      playSound(entSoundName.current);
      entSoundRef.current = setInterval(()=>playSound(entSoundName.current), 3000);
    }
    return()=>clearInterval(entSoundRef.current);
  },[!!entPopup]);

  const EntPopupOverlay = entPopup?(
    <div style={{position:"fixed",inset:0,zIndex:9999,background:"rgba(0,0,0,0.65)",display:"flex",alignItems:"center",justifyContent:"center",padding:"16px"}}>
      <div style={{background:entPopup.color,borderRadius:"20px",padding:"28px 32px",textAlign:"center",maxWidth:"380px",width:"100%",boxShadow:"0 8px 48px rgba(0,0,0,0.35)"}}>
        <div style={{fontSize:"44px",marginBottom:"10px"}}>{entPopup.icon}</div>
        <div style={{color:"#fff",fontSize:"21px",fontWeight:700,marginBottom:"4px"}}>{entPopup.label}</div>
        <div style={{color:"rgba(255,255,255,0.85)",fontSize:"13px",marginBottom:"20px"}}>
          {entPopup.postponed?"Reminder again — time to ":"Time to "}{entPopup.label.toLowerCase()}! Confirm to log.
        </div>
        <div style={{display:"flex",gap:"8px",justifyContent:"center",marginBottom:"16px"}}>
          <button onClick={()=>dismissEntPopup(true)} style={{background:"#fff",color:entPopup.color,border:"none",borderRadius:"10px",padding:"10px 22px",fontWeight:700,fontSize:"14px",cursor:"pointer"}}>✓ Confirm & Log</button>
          <button onClick={()=>dismissEntPopup(false)} style={{background:"rgba(255,255,255,0.18)",color:"#fff",border:"1px solid rgba(255,255,255,0.4)",borderRadius:"10px",padding:"10px 16px",fontSize:"13px",cursor:"pointer"}}>Dismiss</button>
        </div>
        <div style={{borderTop:"1px solid rgba(255,255,255,0.25)",paddingTop:"14px"}}>
          <div style={{color:"rgba(255,255,255,0.75)",fontSize:"11px",fontWeight:600,letterSpacing:"0.05em",marginBottom:"8px",textTransform:"uppercase"}}>⏸ Snooze / Postpone</div>
          <div style={{display:"flex",gap:"6px",justifyContent:"center",flexWrap:"wrap"}}>
            {[1,2,3,4,5].map(m=>(
              <button key={m} onClick={()=>postponeEntPopup(m)}
                style={{background:"rgba(255,255,255,0.15)",color:"#fff",border:"1px solid rgba(255,255,255,0.35)",
                  borderRadius:"8px",padding:"6px 12px",fontSize:"12px",fontWeight:600,cursor:"pointer",minWidth:"44px"}}>
                {m}m
              </button>
            ))}
          </div>
          <div style={{color:"rgba(255,255,255,0.5)",fontSize:"11px",marginTop:"10px"}}>🔔 Repeating every 3 seconds until dismissed</div>
        </div>
      </div>
    </div>
  ):null;

  const postponeEntPopup=(mins)=>{
    if(!entPopup) return;
    clearInterval(entSoundRef.current);
    const ev = entPopup;
    setEntPopup(null);
    setTimeout(()=>{
      playSound(entSoundName.current);
      setEntPopup({...ev, postponed:true});
    }, mins*60*1000);
    setPopup({title:`⏳ Snoozed ${mins} min`,body:`${ev.label} reminder postponed.`});
    setTimeout(()=>setPopup(null),4000);
  };

  const priColor=p=>p==="high"?"#ef4444":p==="medium"?"#f59e0b":"#10b981";
  const priLabel=p=>p==="high"?"🔴 High":p==="medium"?"🟡 Medium":"🟢 Low";

  const TaskPopupModal = taskPopup?(
    <div style={{position:"fixed",inset:0,zIndex:9999,background:"rgba(0,0,0,0.65)",display:"flex",alignItems:"center",justifyContent:"center",padding:"16px"}}>
      <div style={{background:priColor(taskPopup.priority||"medium"),borderRadius:"20px",padding:"28px 32px",textAlign:"center",maxWidth:"380px",width:"100%",boxShadow:"0 8px 48px rgba(0,0,0,0.35)"}}>
        <div style={{fontSize:"44px",marginBottom:"10px"}}>⏰</div>
        <div style={{color:"#fff",fontSize:"20px",fontWeight:700,marginBottom:"4px",lineHeight:1.3}}>{taskPopup.title}</div>
        <div style={{color:"rgba(255,255,255,0.8)",fontSize:"13px",marginBottom:"6px"}}>
          {taskPopup.postponed?"Reminder again — ":"Task alarm! "}
          {priLabel(taskPopup.priority||"medium")} priority
        </div>
        {taskPopup.dueDate&&<div style={{color:"rgba(255,255,255,0.7)",fontSize:"12px",marginBottom:"16px"}}>Due: {taskPopup.dueDate}</div>}
        <div style={{display:"flex",gap:"8px",justifyContent:"center",marginBottom:"16px"}}>
          <button onClick={dismissTaskPopup}
            style={{background:"#fff",color:priColor(taskPopup.priority||"medium"),border:"none",borderRadius:"10px",padding:"10px 28px",fontWeight:700,fontSize:"14px",cursor:"pointer"}}>
            ✓ Got it
          </button>
        </div>
        <div style={{borderTop:"1px solid rgba(255,255,255,0.25)",paddingTop:"14px"}}>
          <div style={{color:"rgba(255,255,255,0.75)",fontSize:"11px",fontWeight:600,letterSpacing:"0.05em",marginBottom:"8px",textTransform:"uppercase"}}>⏸ Snooze</div>
          <div style={{display:"flex",gap:"6px",justifyContent:"center",flexWrap:"wrap"}}>
            {[1,2,3,4,5].map(m=>(
              <button key={m} onClick={()=>postponeTaskPopup(m)}
                style={{background:"rgba(255,255,255,0.15)",color:"#fff",border:"1px solid rgba(255,255,255,0.35)",
                  borderRadius:"8px",padding:"6px 12px",fontSize:"12px",fontWeight:600,cursor:"pointer",minWidth:"44px"}}>
                {m}m
              </button>
            ))}
          </div>
          <div style={{color:"rgba(255,255,255,0.5)",fontSize:"11px",marginTop:"10px"}}>🔔 Repeating every 3 seconds until dismissed</div>
        </div>
      </div>
    </div>
  ):null;

  const EditModal = editingTask?(
    <div style={{position:"fixed",inset:0,zIndex:9998,background:"rgba(0,0,0,0.5)",display:"flex",alignItems:"center",justifyContent:"center",padding:"16px"}}>
      <div style={{background:card,borderRadius:"18px",padding:"24px",width:"100%",maxWidth:"420px",boxShadow:"0 8px 40px rgba(0,0,0,0.25)"}}>
        <div style={{fontWeight:700,fontSize:"16px",color:txt,marginBottom:"16px"}}>Edit task</div>
        <label style={s.lbl}>Title</label>
        <input value={editingTask.title} onChange={e=>setEditingTask(p=>({...p,title:e.target.value}))}
          style={{...s.input,marginBottom:"12px"}} />
        <label style={s.lbl}>Priority</label>
        <div style={{display:"flex",gap:"6px",marginBottom:"12px"}}>
          {PRIORITIES.map(p=>(
            <button key={p} onClick={()=>setEditingTask(prev=>({...prev,priority:p}))}
              style={{...s.btn(editingTask.priority===p?priColor(p):"#6b7280",editingTask.priority!==p),padding:"6px 14px",fontSize:"12px"}}>
              {p.charAt(0).toUpperCase()+p.slice(1)}
            </button>
          ))}
        </div>
        <label style={s.lbl}>Due date</label>
        <input type="date" value={editingTask.dueDate||""} onChange={e=>setEditingTask(p=>({...p,dueDate:e.target.value}))}
          style={{...s.input,marginBottom:"12px"}} />
        <label style={s.lbl}>Alarm time</label>
        <input type="time" value={editingTask.alarmTime||""} onChange={e=>setEditingTask(p=>({...p,alarmTime:e.target.value}))}
          style={{...s.input,marginBottom:"20px"}} />
        <div style={{display:"flex",gap:"8px",justifyContent:"flex-end"}}>
          <button onClick={()=>setEditingTask(null)} style={s.btn("#6b7280",true)}>Cancel</button>
          <button onClick={saveEdit} style={s.btn(acc)}>Save changes</button>
        </div>
      </div>
    </div>
  ):null;

  // ── Download Modal (fallback for sandboxed iframe) ───────
  const DownloadModal = downloadModal?(
    <div style={{position:"fixed",inset:0,zIndex:10000,background:"rgba(0,0,0,0.6)",display:"flex",alignItems:"center",justifyContent:"center",padding:"16px"}}>
      <div style={{background:card,borderRadius:"18px",padding:"24px",width:"100%",maxWidth:"520px",maxHeight:"80vh",display:"flex",flexDirection:"column",boxShadow:"0 8px 40px rgba(0,0,0,0.3)"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"14px"}}>
          <div>
            <div style={{fontWeight:700,fontSize:"16px",color:txt}}>📄 {downloadModal.filename}</div>
            <div style={{fontSize:"12px",color:txt2,marginTop:"2px"}}>Copy the content below</div>
          </div>
          <button onClick={()=>setDownloadModal(null)} style={{background:"none",border:`1.5px solid ${bdr}`,borderRadius:"50%",width:"32px",height:"32px",cursor:"pointer",fontSize:"16px",color:txt2,display:"flex",alignItems:"center",justifyContent:"center"}}>×</button>
        </div>
        <textarea readOnly value={downloadModal.content}
          style={{...s.input,flex:1,minHeight:"200px",fontFamily:"monospace",fontSize:"11px",resize:"vertical",marginBottom:"12px"}} />
        <div style={{display:"flex",gap:"8px",justifyContent:"flex-end"}}>
          <button onClick={()=>{navigator.clipboard.writeText(downloadModal.content);setPopup({title:"✅ Copied!",body:"Content copied to clipboard."});setTimeout(()=>setPopup(null),3000);}}
            style={s.btn(acc)}>📋 Copy to clipboard</button>
          <button onClick={()=>setDownloadModal(null)} style={s.btn("#6b7280",true)}>Close</button>
        </div>
      </div>
    </div>
  ):null;

  // ── Confirm Dialog (replaces window.confirm) ─────────────
  const ConfirmDialog = confirmAction?(
    <div style={{position:"fixed",inset:0,zIndex:10001,background:"rgba(0,0,0,0.6)",display:"flex",alignItems:"center",justifyContent:"center",padding:"16px"}}>
      <div style={{background:card,borderRadius:"18px",padding:"24px",width:"100%",maxWidth:"380px",boxShadow:"0 8px 40px rgba(0,0,0,0.3)",textAlign:"center"}}>
        <div style={{fontSize:"36px",marginBottom:"10px"}}>⚠️</div>
        <div style={{fontWeight:700,fontSize:"16px",color:txt,marginBottom:"6px"}}>{confirmAction.title}</div>
        <div style={{fontSize:"13px",color:txt2,marginBottom:"20px",lineHeight:1.5}}>{confirmAction.body}</div>
        <div style={{display:"flex",gap:"8px",justifyContent:"center"}}>
          <button onClick={()=>setConfirmAction(null)} style={s.btn("#6b7280",true)}>Cancel</button>
          <button onClick={()=>{confirmAction.onConfirm();setConfirmAction(null);}} style={s.btn("#ef4444")}>Confirm</button>
        </div>
      </div>
    </div>
  ):null;

  const DoneLogModal = showDoneLog?(
    <div style={{position:"fixed",inset:0,zIndex:9997,background:"rgba(0,0,0,0.5)",display:"flex",alignItems:"center",justifyContent:"center",padding:"16px"}}>
      <div style={{background:card,borderRadius:"18px",padding:"24px",width:"100%",maxWidth:"480px",maxHeight:"80vh",display:"flex",flexDirection:"column",boxShadow:"0 8px 40px rgba(0,0,0,0.25)"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"16px"}}>
          <div>
            <div style={{fontWeight:700,fontSize:"16px",color:txt}}>Completed tasks</div>
            <div style={{fontSize:"12px",color:txt2,marginTop:"2px"}}>{doneCount} task{doneCount!==1?"s":""} done</div>
          </div>
          <div style={{display:"flex",gap:"8px",alignItems:"center"}}>
            {doneCount>0&&<button onClick={()=>{safeConfirm("Clear completed?","All completed tasks will be removed.",()=>setTasks(prev=>prev.filter(t=>!t.done)));}} style={{...s.btn("#ef4444",true),padding:"5px 10px",fontSize:"12px"}}>Clear all</button>}
            <button onClick={()=>setShowDoneLog(false)} style={{background:"none",border:`1.5px solid ${bdr}`,borderRadius:"50%",width:"32px",height:"32px",cursor:"pointer",fontSize:"16px",color:txt2,display:"flex",alignItems:"center",justifyContent:"center"}}>×</button>
          </div>
        </div>
        <div style={{overflowY:"auto",flex:1}}>
          {doneCount===0
            ?<div style={{color:txt2,textAlign:"center",padding:"40px 0",fontSize:"14px"}}>No completed tasks yet.</div>
            :doneTasks.map(t=>(
              <div key={t.id} style={{display:"flex",alignItems:"flex-start",gap:"12px",padding:"12px 0",borderBottom:`1px solid ${bdr}`}}>
                <span style={{fontSize:"18px",marginTop:"1px"}}>✅</span>
                <div style={{flex:1}}>
                  <div style={{fontSize:"14px",fontWeight:500,color:txt,textDecoration:"line-through",opacity:0.75}}>{t.title}</div>
                  <div style={{display:"flex",gap:"6px",marginTop:"4px",flexWrap:"wrap"}}>
                    <span style={{background:priColor(t.priority),color:"#fff",borderRadius:"6px",padding:"2px 8px",fontSize:"11px",fontWeight:500}}>{t.priority}</span>
                    {t.dueDate&&<span style={{fontSize:"11px",color:txt2}}>Due {t.dueDate}</span>}
                    {t.doneAt&&<span style={{fontSize:"11px",color:"#10b981"}}>Done {new Date(t.doneAt).toLocaleDateString([],{month:"short",day:"numeric"})} {new Date(t.doneAt).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}</span>}
                  </div>
                </div>
                <div style={{display:"flex",gap:"6px"}}>
                  <button title="Restore" onClick={()=>toggleDone(t.id)} style={{background:"none",border:`1px solid ${bdr}`,borderRadius:"6px",color:acc,cursor:"pointer",fontSize:"13px",padding:"3px 8px"}}>↩</button>
                  <button title="Delete" onClick={()=>deleteTask(t.id)} style={{background:"none",border:"none",color:"#ef4444",cursor:"pointer",fontSize:"17px",padding:"0 2px"}}>×</button>
                </div>
              </div>
            ))}
        </div>
      </div>
    </div>
  ):null;

  const AlarmSchedulePanel = !showEnterprise ? (
    <div style={s.card}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"14px",flexWrap:"wrap",gap:"8px"}}>
        <div style={{fontWeight:600,fontSize:"15px",color:txt}}>Alarm schedule</div>
        <div style={{display:"flex",gap:"8px",alignItems:"center",flexWrap:"wrap"}}>
          <label style={{display:"flex",alignItems:"center",gap:"6px",cursor:"pointer",fontSize:"13px",color:txt2}}>
            <input type="checkbox" checked={enterprise.enabled} onChange={e=>setEnterprise(p=>({...p,enabled:e.target.checked}))} style={{accentColor:acc,width:15,height:15}} />
            Active
          </label>
          <button onClick={()=>{setAddingAlarm(true);setNewAlarm(newAlarmTemplate());}} style={s.btn(acc)}>+ Add alarm</button>
        </div>
      </div>
      {addingAlarm&&(
        <div style={{background:dm?"#3f3f46":acc+"0d",border:`1.5px solid ${acc}44`,borderRadius:lr,padding:"14px",marginBottom:"14px"}}>
          <div style={{fontWeight:600,fontSize:"13px",color:acc,marginBottom:"10px"}}>New alarm</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"8px",marginBottom:"8px"}}>
            <input placeholder="Label (e.g. Stand-up)" value={newAlarm.label} onChange={e=>setNewAlarm(p=>({...p,label:e.target.value}))} style={{...s.input,fontSize:"13px"}} />
            <input type="time" value={newAlarm.time} onChange={e=>setNewAlarm(p=>({...p,time:e.target.value}))} style={{...s.input,fontSize:"13px"}} />
          </div>
          <div style={{marginBottom:"8px"}}>
            <div style={s.lbl}>Icon</div>
            <div style={{display:"flex",gap:"6px",flexWrap:"wrap"}}>
              {ICON_OPTIONS.map(ic=><button key={ic} onClick={()=>setNewAlarm(p=>({...p,icon:ic}))} style={s.iconBtn(newAlarm.icon===ic,acc)}>{ic}</button>)}
            </div>
          </div>
          <div style={{marginBottom:"12px"}}>
            <div style={s.lbl}>Color</div>
            <div style={{display:"flex",gap:"6px",flexWrap:"wrap"}}>
              {COLOR_OPTIONS.map(c=><div key={c} onClick={()=>setNewAlarm(p=>({...p,color:c}))} style={{width:24,height:24,borderRadius:"50%",background:c,cursor:"pointer",border:newAlarm.color===c?`3px solid ${txt}`:"2px solid transparent"}} />)}
            </div>
          </div>
          <div style={{display:"flex",gap:"8px"}}>
            <button onClick={saveNewAlarm} style={s.btn(acc)}>Save alarm</button>
            <button onClick={()=>setAddingAlarm(false)} style={s.btn("#6b7280",true)}>Cancel</button>
          </div>
        </div>
      )}
      {enterprise.events.map(ev=>(
        <div key={ev.id} style={{display:"flex",alignItems:"center",gap:"10px",padding:"10px 0",borderBottom:`1px solid ${bdr}`,flexWrap:"wrap"}}>
          <span style={{fontSize:"20px",minWidth:"26px"}}>{ev.icon}</span>
          <span style={{flex:1,fontSize:"14px",fontWeight:500,color:ev.enabled?txt:txt2,minWidth:"90px"}}>{ev.label}</span>
          <input type="time" value={ev.time} onChange={e=>updateEvt(ev.id,"time",e.target.value)}
            style={{...s.input,width:"108px",padding:"6px 10px",fontSize:"13px",opacity:ev.enabled?1:0.45}} />
          <label style={{display:"flex",alignItems:"center",gap:"5px",cursor:"pointer",fontSize:"12px",color:txt2,whiteSpace:"nowrap"}}>
            <input type="checkbox" checked={ev.enabled} onChange={e=>updateEvt(ev.id,"enabled",e.target.checked)} style={{accentColor:ev.color,width:14,height:14}} />
            On
          </label>
          {!ev.builtin&&<button onClick={()=>deleteEvt(ev.id)} style={{background:"none",border:"none",color:"#ef4444",cursor:"pointer",fontSize:"17px",padding:"0 2px"}}>×</button>}
        </div>
      ))}
    </div>
  ) : null;

  const M365SyncModal = showM365Sync ? (
    <div style={{position:"fixed",inset:0,zIndex:9998,background:"rgba(0,0,0,0.55)",display:"flex",alignItems:"center",justifyContent:"center",padding:"16px"}}>
      <div style={{background:card,borderRadius:"16px",padding:"22px",width:"100%",maxWidth:"640px",maxHeight:"85vh",display:"flex",flexDirection:"column",boxShadow:"0 8px 48px rgba(0,0,0,0.3)"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"14px"}}>
          <div>
            <div style={{display:"flex",alignItems:"center",gap:"8px"}}>
              <div style={{width:24,height:24,background:"#0078d4",borderRadius:"4px",display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontSize:"13px",fontWeight:700}}>M</div>
              <div style={{fontWeight:700,fontSize:"16px",color:txt}}>Sync from Microsoft 365</div>
            </div>
            <div style={{fontSize:"11px",color:txt2,marginTop:"3px"}}>Pull analysts from your Entra ID / Azure AD groups</div>
          </div>
          <button onClick={()=>{setShowM365Sync(false);setSelectedGroup("");setM365Members([]);setSelectedMembers([]);}}
            style={{background:"none",border:`1.5px solid ${bdr}`,borderRadius:"50%",width:"32px",height:"32px",cursor:"pointer",fontSize:"16px",color:txt2}}>×</button>
        </div>
        {!selectedGroup && (
          <>
            <div style={{fontSize:"13px",fontWeight:600,color:txt,marginBottom:"10px"}}>Step 1 — Choose a group</div>
            <input placeholder="Search groups by name…" value={m365Search} onChange={e=>setM365Search(e.target.value)}
              style={{...s.input,marginBottom:"10px"}} />
            <div style={{overflowY:"auto",flex:1,minHeight:"200px",maxHeight:"50vh"}}>
              {m365Loading && <div style={{color:txt2,padding:"20px",textAlign:"center",fontSize:"13px"}}>Loading groups…</div>}
              {!m365Loading && m365Groups.filter(g=>!m365Search || g.displayName.toLowerCase().includes(m365Search.toLowerCase())).map(g=>(
                <div key={g.id} onClick={()=>{ setSelectedGroup(g.id); loadM365Members(g.id); }}
                  style={{padding:"12px 14px",border:`1px solid ${bdr}`,borderRadius:"8px",marginBottom:"6px",cursor:"pointer",background:dm?"#27272a":"#fff",transition:"all 0.15s"}}
                  onMouseEnter={e=>e.currentTarget.style.background=acc+"12"}
                  onMouseLeave={e=>e.currentTarget.style.background=dm?"#27272a":"#fff"}>
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:"8px"}}>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontWeight:600,fontSize:"13px",color:txt}}>{g.displayName}</div>
                      {g.description && <div style={{fontSize:"11px",color:txt2,marginTop:"2px"}}>{g.description}</div>}
                      {g.email && <div style={{fontSize:"10px",color:txt2,marginTop:"2px",fontFamily:"monospace"}}>{g.email}</div>}
                    </div>
                    <span style={{background:g.type==="M365"?"#0078d422":"#10b98122",color:g.type==="M365"?"#0078d4":"#10b981",borderRadius:"6px",padding:"2px 8px",fontSize:"10px",fontWeight:600,whiteSpace:"nowrap"}}>{g.type}</span>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
        {selectedGroup && (
          <>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"10px",flexWrap:"wrap",gap:"6px"}}>
              <div>
                <div style={{fontSize:"13px",fontWeight:600,color:txt}}>Step 2 — Choose members</div>
                <button onClick={()=>{setSelectedGroup("");setM365Members([]);setSelectedMembers([]);}}
                  style={{background:"none",border:"none",color:acc,cursor:"pointer",fontSize:"11px",fontWeight:600,padding:0,textDecoration:"underline"}}>
                  ← Back to groups
                </button>
              </div>
              <div style={{display:"flex",gap:"6px"}}>
                <button onClick={()=>{
                  if(selectedMembers.length===m365Members.length) setSelectedMembers([]);
                  else setSelectedMembers(m365Members.slice());
                }}
                  style={{...s.btn(acc,true),padding:"4px 10px",fontSize:"11px"}}>
                  {selectedMembers.length===m365Members.length?"Deselect all":"Select all"} ({selectedMembers.length}/{m365Members.length})
                </button>
              </div>
            </div>
            <div style={{overflowY:"auto",flex:1,minHeight:"200px",maxHeight:"50vh"}}>
              {m365Loading && <div style={{color:txt2,padding:"20px",textAlign:"center",fontSize:"13px"}}>Loading members…</div>}
              {!m365Loading && m365Members.length===0 && <div style={{color:txt2,padding:"20px",textAlign:"center",fontSize:"13px"}}>No members in this group.</div>}
              {!m365Loading && m365Members.map(m=>{
                const sel = selectedMembers.some(s=>s.id===m.id);
                const already = analysts.some(a=>(a.enterpriseId||"").toLowerCase()===(m.enterpriseId||"").toLowerCase());
                return (
                  <div key={m.id} onClick={()=>{
                    if(already) return;
                    setSelectedMembers(prev => sel ? prev.filter(s=>s.id!==m.id) : [...prev, m]);
                  }}
                    style={{padding:"10px 12px",border:`1.5px solid ${sel?acc:bdr}`,borderRadius:"8px",marginBottom:"6px",
                      cursor:already?"not-allowed":"pointer",background:sel?acc+"12":(dm?"#27272a":"#fff"),
                      opacity:already?0.5:1,transition:"all 0.15s"}}>
                    <div style={{display:"flex",alignItems:"center",gap:"10px"}}>
                      <div style={{width:20,height:20,borderRadius:"5px",border:`2px solid ${sel?acc:bdr}`,
                        background:sel?acc:"transparent",display:"flex",alignItems:"center",justifyContent:"center",
                        color:"#fff",fontSize:"12px",fontWeight:700}}>{sel?"✓":""}</div>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontWeight:600,fontSize:"13px",color:txt}}>{m.fullName} {already && <span style={{fontSize:"10px",color:"#10b981",fontWeight:500}}>· already added</span>}</div>
                        <div style={{fontSize:"11px",color:txt2,fontFamily:"monospace"}}>{m.enterpriseId}</div>
                        {m.jobTitle && <div style={{fontSize:"10px",color:txt2}}>{m.jobTitle}{m.department?` · ${m.department}`:""}</div>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <div style={{marginTop:"12px",display:"flex",gap:"8px",justifyContent:"flex-end"}}>
              <button onClick={()=>{setShowM365Sync(false);setSelectedGroup("");setM365Members([]);setSelectedMembers([]);}}
                style={s.btn("#6b7280",true)}>Cancel</button>
              <button onClick={importSelectedM365} disabled={selectedMembers.length===0}
                style={{...s.btn("#0078d4"),opacity:selectedMembers.length===0?0.5:1}}>
                ✅ Import {selectedMembers.length>0?`${selectedMembers.length} member${selectedMembers.length>1?"s":""}`:""}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  ) : null;

  // Configurable daily reset — fires at the time chosen by the user (or disabled if empty)
  useEffect(()=>{
    if(!resetTime) return;
    const [rh,rm] = resetTime.split(":").map(Number);
    if(isNaN(rh)||isNaN(rm)) return;
    const scheduleReset = () => {
      const now = new Date();
      const next = new Date();
      next.setHours(rh, rm, 0, 0);
      if(now >= next) next.setDate(next.getDate() + 1);
      const ms = next.getTime() - now.getTime();
      return setTimeout(() => {
        setEnterprise(prev => ({...prev, log: []}));
        setAnalysts(prev => prev.map(a => ({...a, marks: {}})));
        setMarks(defaultMarks());
        setElapsed(0);
        firedRef.current = {};
        setPopup({title:`🌙 ${resetTime} — Daily reset`, body:"All marks and logs cleared."});
        setTimeout(()=>setPopup(null), 6000);
        scheduleReset();
      }, ms);
    };
    const tid = scheduleReset();
    return () => clearTimeout(tid);
  },[resetTime]);

  const [adminTick,setAdminTick] = useState(0);
  // Configurable admin panel refresh interval
  useEffect(()=>{
    if(!showAdminPanel || refreshInterval<=0) return;
    const iv = setInterval(()=>setAdminTick(t=>t+1), refreshInterval*1000);
    return()=>clearInterval(iv);
  },[showAdminPanel, refreshInterval]);

  // ── Persistent bottom nav bar ─────────────────────────────
  const BottomNav = (
    <div style={{position:"fixed",bottom:0,left:0,right:0,zIndex:9990,background:card,borderTop:`1px solid ${bdr}`,
      display:"flex",justifyContent:"center",gap:"4px",padding:"8px 12px",boxShadow:"0 -2px 12px rgba(0,0,0,0.08)"}}>
      <button onClick={()=>{setShowEnterprise(false);setShowAdminPanel(false);}}
        style={{flex:1,maxWidth:"140px",background:(!showEnterprise&&!showAdminPanel)?acc+"18":"transparent",border:`1.5px solid ${(!showEnterprise&&!showAdminPanel)?acc:bdr}`,
          borderRadius:"10px",padding:"8px 6px",cursor:"pointer",textAlign:"center",transition:"all 0.15s"}}>
        <div style={{fontSize:"16px"}}>⚡</div>
        <div style={{fontSize:"10px",fontWeight:600,color:(!showEnterprise&&!showAdminPanel)?acc:txt2,marginTop:"2px"}}>Hub</div>
      </button>
      <button onClick={()=>{setShowEnterprise(true);setShowAdminPanel(false);}}
        style={{flex:1,maxWidth:"140px",background:showEnterprise?acc+"18":"transparent",border:`1.5px solid ${showEnterprise?acc:bdr}`,
          borderRadius:"10px",padding:"8px 6px",cursor:"pointer",textAlign:"center",transition:"all 0.15s"}}>
        <div style={{fontSize:"16px"}}>🏢</div>
        <div style={{fontSize:"10px",fontWeight:600,color:showEnterprise?acc:txt2,marginTop:"2px"}}>Enterprise</div>
      </button>
      <button onClick={()=>{setShowAdminPanel(true);setShowEnterprise(false);}}
        style={{flex:1,maxWidth:"140px",background:showAdminPanel?"#ef444418":"transparent",border:`1.5px solid ${showAdminPanel?"#ef4444":bdr}`,
          borderRadius:"10px",padding:"8px 6px",cursor:"pointer",textAlign:"center",transition:"all 0.15s"}}>
        <div style={{fontSize:"16px"}}>{isAdminView?"👑":"📊"}</div>
        <div style={{fontSize:"10px",fontWeight:600,color:showAdminPanel?"#ef4444":txt2,marginTop:"2px"}}>{isAdminView?"Admin":"Team"}</div>
      </button>
    </div>
  );

  if(showAdminPanel) return (
    <div style={s.wrap}>
      {M365SyncModal}{DownloadModal}{ConfirmDialog}
      <div style={s.header}>
        <div style={{display:"flex",alignItems:"center",gap:"10px"}}>
          <div style={{width:30,height:30,borderRadius:"50%",background:"#ef4444",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"14px"}}>👑</div>
          <div>
            <div style={{display:"flex",alignItems:"center",gap:"6px"}}>
              <span style={{fontWeight:700,fontSize:"16px",color:txt}}>Admin Panel</span>
              {refreshInterval>0&&<>
                <span style={{background:"#10b981",borderRadius:"50%",width:7,height:7,animation:"pulse 1.5s infinite"}}/>
                <span style={{fontSize:"10px",color:"#10b981",fontWeight:600}}>LIVE · {refreshInterval<60?`${refreshInterval}s`:`${Math.floor(refreshInterval/60)}min`}</span>
              </>}
              {refreshInterval<=0&&<span style={{fontSize:"10px",color:txt2,fontWeight:500}}>MANUAL</span>}
            </div>
            <div style={{fontSize:"11px",color:txt2}}>
              {refreshInterval>0?`Auto-refreshes every ${refreshInterval<60?`${refreshInterval}s`:`${Math.floor(refreshInterval/60)}min`}`:"Refresh manually or set auto-refresh in Enterprise Control"}
            </div>
          </div>
        </div>
        <div style={{display:"flex",gap:"8px",alignItems:"center"}}>
          <button onClick={()=>setSettings(p=>({...p,darkMode:!p.darkMode}))} style={{background:"none",border:`1.5px solid ${bdr}`,borderRadius:"999px",cursor:"pointer",padding:"6px 10px",fontSize:"18px",color:txt}}>{dm?"☀️":"🌙"}</button>
        </div>
      </div>
      <div style={s.section}>
        {/* Admin-only controls */}
        {isAdminView&&<div style={s.card}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"12px",flexWrap:"wrap",gap:"8px"}}>
            <div style={{fontWeight:600,fontSize:"15px",color:txt}}>➕ Add analyst</div>
            <div style={{display:"flex",gap:"8px",flexWrap:"wrap"}}>
              <button onClick={()=>{ setShowM365Sync(true); loadM365Groups(); }}
                style={{...s.btn("#0078d4"),padding:"4px 10px",fontSize:"11px",display:"inline-flex",alignItems:"center",gap:"4px"}}>
                🔗 Sync from M365
              </button>
              <label style={{...s.btn("#10b981",true),padding:"4px 10px",fontSize:"11px",cursor:"pointer",display:"inline-flex",alignItems:"center",gap:"4px"}}>
                📥 Import CSV
                <input type="file" accept=".csv,text/csv" onChange={importRosterCSV} style={{display:"none"}} />
              </label>
              <button onClick={downloadRosterTemplate}
                style={{...s.btn("#6b7280",true),padding:"4px 10px",fontSize:"11px"}}>
                📄 Template
              </button>
            </div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr auto",gap:"8px",alignItems:"end"}}>
            <div>
              <label style={s.lbl}>Enterprise ID</label>
              <input placeholder="e.g. jane.smith" value={newAnalyst.enterpriseId}
                onChange={e=>setNewAnalyst(p=>({...p,enterpriseId:e.target.value}))}
                onKeyDown={e=>e.key==="Enter"&&addAnalyst()}
                style={s.input} />
            </div>
            <div>
              <label style={s.lbl}>Full name</label>
              <input placeholder="e.g. Jane Smith" value={newAnalyst.fullName}
                onChange={e=>setNewAnalyst(p=>({...p,fullName:e.target.value}))}
                onKeyDown={e=>e.key==="Enter"&&addAnalyst()}
                style={s.input} />
            </div>
            <button onClick={addAnalyst} style={s.btn(acc)}>+ Add</button>
          </div>
          <div style={{fontSize:"11px",color:txt2,marginTop:"8px",lineHeight:1.5}}>
            💡 <strong>Bulk import:</strong> Download the template, fill it with your roster (Enterprise ID + Full Name columns required), then upload it via Import CSV. Existing analysts are auto-skipped.
            <br/>🔗 <strong>Live sync from Microsoft 365 / Workday / AD?</strong> See the Roster Integration Options doc for backend setup.
          </div>
        </div>}
        {/* Non-admin info banner */}
        {!isAdminView&&(
          <div style={{...s.card,background:dm?"#1a1a2e":"#eef2ff",border:`1.5px solid ${acc}33`}}>
            <div style={{fontSize:"13px",color:txt2,lineHeight:1.7}}>
              <strong style={{color:txt}}>📊 Read-only view:</strong> You're viewing team status as an analyst. Admin controls (add, delete, reset) are restricted to admin mode.
            </div>
          </div>
        )}
        <div style={{...s.card,display:"flex",gap:"10px",alignItems:"flex-end",flexWrap:"wrap"}}>
          <div>
            <label style={s.lbl}>Tracking date</label>
            <input type="date" value={adminDate} onChange={e=>setAdminDate(e.target.value)}
              style={{...s.input,width:"160px"}} />
          </div>
          <div style={{display:"flex",gap:"8px",paddingBottom:"1px",flexWrap:"wrap",alignItems:"flex-end"}}>
            {isAdminView&&<button onClick={exportRosterCSV} disabled={analysts.length===0}
              style={s.btn("#10b981")}>⬇ Export day CSV</button>}
            {isAdminView&&<button onClick={exportAllHistoryCSV} disabled={analysts.length===0}
              style={s.btn("#0ea5e9")}>📋 Export full history</button>}
            {isAdminView&&<button
              onClick={()=>{ safeConfirm("Reset all marks?","This clears all analyst marks for the selected date.",()=>setAnalysts(prev=>prev.map(a=>{const nm={...a.marks};delete nm[adminDate];return {...a,marks:nm};}))); }}
              disabled={analysts.length===0}
              style={s.btn("#f59e0b",true)}>🔄 Reset all marks</button>}
          </div>
        </div>
        {isAdminView&&analysts.length>0 && (
          <div style={s.card}>
            <div style={{fontWeight:600,fontSize:"15px",marginBottom:"10px",color:txt}}>🗑 Delete an analyst</div>
            <div style={{display:"flex",gap:"8px",alignItems:"stretch",flexWrap:"wrap"}}>
              <select value={analystToDelete} onChange={e=>setAnalystToDelete(e.target.value)}
                style={{...s.input,flex:1,minWidth:"200px"}}>
                <option value="">— Select an analyst —</option>
                {analysts.map(a=>(
                  <option key={a.id} value={a.id}>
                    {a.fullName}{a.enterpriseId?` (${a.enterpriseId})`:""}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={()=>{
                  if(!analystToDelete){ setPopup({title:"⚠ No selection",body:"Please pick an analyst from the dropdown first."}); setTimeout(()=>setPopup(null),3000); return; }
                  const target = analysts.find(x=>x.id===analystToDelete);
                  const name = target ? target.fullName : "this analyst";
                  const idToRemove = analystToDelete;
                  setAnalysts(prev=>prev.filter(x=>x.id!==idToRemove));
                  if(currentAnalystId===idToRemove) setCurrentAnalystId("");
                  setAnalystToDelete("");
                  setPopup({title:`🗑 ${name} removed`,body:"Analyst deleted from tracking."});
                  setTimeout(()=>setPopup(null),3500);
                }}
                style={s.btn("#ef4444")}>
                🗑 Delete selected
              </button>
            </div>
          </div>
        )}
        {analysts.length>0&&(()=>{
          const today = adminDate;
          const clockedIn  = analysts.filter(a=>a.marks?.[today]?.clock_in && !a.marks?.[today]?.clock_out).length;
          const onBreak    = analysts.filter(a=>{
            const m=a.marks?.[today]; if(!m) return false;
            return (m.break_in_1&&!m.break_out_1) || (m.break_in_2&&!m.break_out_2);
          }).length;
          const onLunch    = analysts.filter(a=>a.marks?.[today]?.lunch_in && !a.marks?.[today]?.lunch_out).length;
          const completed  = analysts.filter(a=>a.marks?.[today]?.clock_out).length;
          return (
            <div style={{...s.card,display:"flex",gap:"12px",flexWrap:"wrap",justifyContent:"space-around"}}>
              {[
                ["👥","Total",analysts.length,acc],
                ["🟢","Active",clockedIn,"#10b981"],
                ["☕","On break",onBreak,"#f59e0b"],
                ["🍽️","On lunch",onLunch,"#f43f5e"],
                ["✅","Completed",completed,"#6366f1"],
              ].map(([icon,label,val,color])=>(
                <div key={label} style={{textAlign:"center",minWidth:"70px"}}>
                  <div style={{fontSize:"18px"}}>{icon}</div>
                  <div style={{fontSize:"22px",fontWeight:700,color}}>{val}</div>
                  <div style={{fontSize:"11px",color:txt2}}>{label}</div>
                </div>
              ))}
            </div>
          );
        })()}
        {analysts.length===0?(
          <div style={{...s.card,textAlign:"center",padding:"40px 20px"}}>
            <div style={{fontSize:"40px",marginBottom:"10px"}}>👥</div>
            <div style={{color:txt2,fontSize:"14px"}}>No analysts added yet.</div>
            <div style={{color:txt2,fontSize:"12px",marginTop:"4px"}}>Add analysts above to start tracking.</div>
          </div>
        ):analysts.map(analyst=>{
          const dayMarks = analyst.marks?.[adminDate] || {};
          const duration = calcAnalystDuration(dayMarks, true);
          const durationShort = calcAnalystDuration(dayMarks, false);
          const isActive = dayMarks.clock_in && !dayMarks.clock_out;
          const status = !dayMarks.clock_in ? "not-started"
            : dayMarks.clock_out ? "done"
            : ((dayMarks.break_in_1&&!dayMarks.break_out_1)||(dayMarks.break_in_2&&!dayMarks.break_out_2)) ? "break"
            : (dayMarks.lunch_in&&!dayMarks.lunch_out) ? "lunch"
            : "active";

          return (
            <div key={analyst.id} style={s.card}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"12px",flexWrap:"wrap",gap:"8px"}}>
                <div style={{display:"flex",alignItems:"center",gap:"10px",flex:1,minWidth:"180px"}}>
                  <div style={{width:36,height:36,borderRadius:"50%",
                    background:status==="active"?"#10b98122":status==="break"?"#f59e0b22":status==="lunch"?"#f43f5e22":status==="done"?"#6366f122":"#f3f4f6",
                    display:"flex",alignItems:"center",justifyContent:"center",fontSize:"16px"}}>
                    {status==="active"?"🟢":status==="break"?"☕":status==="lunch"?"🍽️":status==="done"?"✅":"⚪"}
                  </div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontWeight:600,fontSize:"14px",color:txt}}>{analyst.fullName}</div>
                    {analyst.enterpriseId&&<div style={{fontSize:"11px",color:txt2}}>{analyst.enterpriseId}</div>}
                  </div>
                </div>
                <div style={{display:"flex",gap:"6px",alignItems:"center",flexWrap:"wrap"}}>
                  {/* Live elapsed time bubble */}
                  {duration&&(
                    <span style={{
                      background:isActive?"linear-gradient(135deg,"+acc+","+acc+"cc)":status==="done"?"#d1fae5":"#e0e7ff",
                      color:isActive?"#fff":status==="done"?"#065f46":"#3730a3",
                      borderRadius:"999px",padding:"5px 12px",fontSize:"12px",fontWeight:700,
                      fontVariantNumeric:"tabular-nums",
                      boxShadow:isActive?"0 2px 8px "+acc+"44":"none",
                      display:"inline-flex",alignItems:"center",gap:"5px",
                      animation:isActive?"none":"none",
                    }}>
                      {isActive&&<span style={{display:"inline-block",width:6,height:6,borderRadius:"50%",background:"#fff",opacity:0.8,animation:"pulse 1.5s infinite"}}/>}
                      ⏱ {duration}
                    </span>
                  )}
                  <span style={{
                    background:status==="active"?"#d1fae5":status==="break"?"#fef3c7":status==="lunch"?"#fce7f3":status==="done"?"#e0e7ff":"#f3f4f6",
                    color:status==="active"?"#065f46":status==="break"?"#92400e":status==="lunch"?"#9d174d":status==="done"?"#3730a3":"#6b7280",
                    borderRadius:"999px",padding:"3px 10px",fontSize:"11px",fontWeight:600,textTransform:"capitalize",
                  }}>
                    {status==="not-started"?"Not started":status}
                  </span>
                </div>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(120px,1fr))",gap:"6px"}}>
                {MARK_KEYS.map(({key,label,icon,color})=>{
                  const t = dayMarks[key];
                  return (
                    <div key={key} style={{
                      background: t ? color+"12" : (dm?"#3f3f46":"#f9fafb"),
                      border:`1px solid ${t?color+"44":bdr}`,
                      borderRadius:"8px", padding:"8px 10px", textAlign:"center",
                    }}>
                      <div style={{fontSize:"16px",marginBottom:"2px",opacity:t?1:0.45}}>{icon}</div>
                      <div style={{fontSize:"10px",fontWeight:600,color:t?color:txt2}}>{label}</div>
                      <div style={{fontSize:"10px",color:t?txt:txt2,marginTop:"3px",fontVariantNumeric:"tabular-nums",fontWeight:t?600:400}}>
                        {t ? fmtMarkShort(t) : "—"}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
        <div style={{...s.card,background:dm?"#1a1a2e":"#eef2ff",border:`1.5px solid ${acc}33`}}>
          <div style={{fontSize:"13px",color:txt2,lineHeight:1.7}}>
            <strong style={{color:txt}}>👁 View-only:</strong> Marks displayed here are pulled in real time from each analyst's Enterprise Control. To test, set an analyst as "Acting as" in Enterprise Control and use the Mark buttons or Quick log. In production, this will pull from each analyst's device automatically via the WFM API.
          </div>
        </div>
      </div>
      {BottomNav}
    </div>
  );

  if(showEnterprise) return (
    <div style={s.wrap}>
      {EntPopupOverlay}{DownloadModal}{ConfirmDialog}
      {popup&&<div style={{position:"fixed",top:24,right:24,zIndex:9998}}><div style={shapeStyle(settings.popupShape,settings.popupSize,settings.popupColor)}><div style={{fontWeight:600,marginBottom:4}}>{popup.title}</div><div style={{fontSize:"0.9em",opacity:0.9}}>{popup.body}</div><button onClick={()=>setPopup(null)} style={{marginTop:8,background:"rgba(255,255,255,0.25)",border:"none",borderRadius:"6px",color:"#fff",padding:"4px 12px",cursor:"pointer",fontSize:"12px"}}>Dismiss</button></div></div>}
      <div style={s.header}>
        <div style={{display:"flex",alignItems:"center",gap:"10px"}}>
          <div style={{width:30,height:30,borderRadius:"50%",background:"#6366f1",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"14px"}}>🏢</div>
          <div><div style={{fontWeight:700,fontSize:"16px",color:txt}}>Enterprise Control</div><div style={{fontSize:"11px",color:txt2}}>Analyst time tracking</div></div>
        </div>
        <div style={{display:"flex",gap:"8px",alignItems:"center"}}>
          <button onClick={()=>setSettings(p=>({...p,darkMode:!p.darkMode}))} style={{background:"none",border:`1.5px solid ${bdr}`,borderRadius:"999px",cursor:"pointer",padding:"6px 10px",fontSize:"18px",color:txt}}>{dm?"☀️":"🌙"}</button>
        </div>
      </div>
      <div style={s.section}>
        {/* Mark Attendance — one-tap buttons */}
        <div style={s.card}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"14px",flexWrap:"wrap",gap:"8px"}}>
            <div>
              <div style={{fontWeight:600,fontSize:"15px",color:txt}}>📍 Mark Attendance</div>
              <div style={{fontSize:"11px",color:txt2,marginTop:"2px"}}>Tap to record each event</div>
            </div>
            <div style={{display:"flex",gap:"6px",alignItems:"center",flexWrap:"wrap"}}>
              {marks.clock_in && !marks.clock_out && (
                <span style={{
                  background:"linear-gradient(135deg,"+acc+","+acc+"cc)",
                  color:"#fff",borderRadius:"999px",padding:"5px 14px",fontSize:"13px",fontWeight:700,
                  fontVariantNumeric:"tabular-nums",boxShadow:"0 2px 8px "+acc+"44",
                  display:"inline-flex",alignItems:"center",gap:"6px"
                }}>
                  <span style={{display:"inline-block",width:6,height:6,borderRadius:"50%",background:"#fff",opacity:0.8,animation:"pulse 1.5s infinite"}}/>
                  ⏱ {String(Math.floor(elapsed/3600)).padStart(2,"0")}:{String(Math.floor((elapsed%3600)/60)).padStart(2,"0")}:{String(elapsed%60).padStart(2,"0")}
                </span>
              )}
              {marks.clock_in && marks.clock_out && (
                <span style={{background:"#d1fae5",color:"#065f46",borderRadius:"999px",padding:"5px 12px",fontSize:"12px",fontWeight:700,fontVariantNumeric:"tabular-nums"}}>
                  ✅ Done · {calcAnalystDuration({clock_in:marks.clock_in,clock_out:marks.clock_out},false)}
                </span>
              )}
            </div>
          </div>

          {/* Acting as selector */}
          {analysts.length>0&&(
            <div style={{marginBottom:"14px"}}>
              <label style={s.lbl}>Acting as</label>
              <select value={currentAnalystId} onChange={e=>setCurrentAnalystId(e.target.value)}
                style={{...s.input,fontSize:"13px"}}>
                <option value="">Admin (local only)</option>
                {analysts.map(a=><option key={a.id} value={a.id}>{a.fullName}{a.enterpriseId?` (${a.enterpriseId})`:""}</option>)}
              </select>
              <div style={{fontSize:"11px",color:txt2,marginTop:"4px"}}>
                {currentAnalystId?"Marks will sync to this analyst's roster record.":"Marks saved locally only (not synced to roster)."}
              </div>
            </div>
          )}

          {/* Mark buttons grid */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",gap:"8px"}}>
            {MARK_KEYS.map(({key,label,icon,color})=>{
              const done = !!marks[key];
              return (
                <button key={key} onClick={()=>stampMark(key)} disabled={done}
                  style={{
                    background:done?color+"18":(dm?"#3f3f46":"#fff"),
                    border:`2px solid ${done?color:color+"66"}`,
                    borderRadius:lr,padding:"14px 10px",cursor:done?"default":"pointer",
                    textAlign:"center",opacity:done?0.85:1,transition:"all 0.15s",
                  }}>
                  <div style={{fontSize:"22px",marginBottom:"4px"}}>{icon}</div>
                  <div style={{fontSize:"12px",fontWeight:700,color:done?color:txt}}>{label}</div>
                  {done
                    ? <div style={{fontSize:"11px",color,marginTop:"4px",fontWeight:600,fontVariantNumeric:"tabular-nums"}}>
                        ✓ {fmtTimeOnly(marks[key])}
                      </div>
                    : <div style={{fontSize:"11px",color:txt2,marginTop:"4px"}}>Tap to mark</div>
                  }
                </button>
              );
            })}
          </div>

          {/* Admin: Add custom mark buttons */}
          {isAdminView&&(
            <div style={{marginTop:"14px",borderTop:`1px solid ${bdr}`,paddingTop:"14px"}}>
              {!addingCustomMark?(
                <button onClick={()=>{setAddingCustomMark(true);setNewCustomMark({key:"",label:"",icon:"📌",color:"#6366f1"});}}
                  style={{...s.btn(acc,true),fontSize:"12px",padding:"6px 14px"}}>
                  + Add custom mark button
                </button>
              ):(
                <div style={{background:dm?"#3f3f46":acc+"0d",border:`1.5px solid ${acc}44`,borderRadius:lr,padding:"14px"}}>
                  <div style={{fontWeight:600,fontSize:"13px",color:acc,marginBottom:"10px"}}>New mark button</div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"8px",marginBottom:"8px"}}>
                    <input placeholder="Label (e.g. Huddle)" value={newCustomMark.label}
                      onChange={e=>setNewCustomMark(p=>({...p,label:e.target.value,key:e.target.value.toLowerCase().replace(/\s+/g,"_").replace(/[^a-z0-9_]/g,"")+"_"+Date.now()}))}
                      style={{...s.input,fontSize:"13px"}} />
                    <div/>
                  </div>
                  <div style={{marginBottom:"8px"}}>
                    <div style={s.lbl}>Icon</div>
                    <div style={{display:"flex",gap:"6px",flexWrap:"wrap"}}>
                      {ICON_OPTIONS.map(ic=><button key={ic} onClick={()=>setNewCustomMark(p=>({...p,icon:ic}))}
                        style={s.iconBtn(newCustomMark.icon===ic,acc)}>{ic}</button>)}
                    </div>
                  </div>
                  <div style={{marginBottom:"12px"}}>
                    <div style={s.lbl}>Color</div>
                    <div style={{display:"flex",gap:"6px",flexWrap:"wrap"}}>
                      {COLOR_OPTIONS.map(c=><div key={c} onClick={()=>setNewCustomMark(p=>({...p,color:c}))}
                        style={{width:24,height:24,borderRadius:"50%",background:c,cursor:"pointer",border:newCustomMark.color===c?`3px solid ${txt}`:"2px solid transparent"}} />)}
                    </div>
                  </div>
                  <div style={{display:"flex",gap:"8px"}}>
                    <button onClick={()=>{
                      if(!newCustomMark.label.trim()) return;
                      const mk = {key:newCustomMark.key||("custom_"+Date.now()), label:newCustomMark.label.trim(), icon:newCustomMark.icon, color:newCustomMark.color};
                      setCustomMarkKeys(prev=>[...prev,mk]);
                      setAddingCustomMark(false);
                      setNewCustomMark({key:"",label:"",icon:"📌",color:"#6366f1"});
                      setPopup({title:"✅ Mark button added",body:`"${mk.label}" is now available.`});
                      setTimeout(()=>setPopup(null),3000);
                    }} style={s.btn(acc)}>Save</button>
                    <button onClick={()=>setAddingCustomMark(false)} style={s.btn("#6b7280",true)}>Cancel</button>
                  </div>
                </div>
              )}
              {customMarkKeys.length>0&&(
                <div style={{marginTop:"10px"}}>
                  <div style={{fontSize:"12px",color:txt2,marginBottom:"6px"}}>Custom buttons:</div>
                  <div style={{display:"flex",gap:"6px",flexWrap:"wrap"}}>
                    {customMarkKeys.map(cm=>(
                      <span key={cm.key} style={{display:"inline-flex",alignItems:"center",gap:"6px",background:cm.color+"18",border:`1px solid ${cm.color}44`,borderRadius:"8px",padding:"4px 10px",fontSize:"12px",color:cm.color,fontWeight:600}}>
                        {cm.icon} {cm.label}
                        <button onClick={()=>{
                          safeConfirm(`Remove "${cm.label}"?`,"This custom button will be deleted.",()=>{
                            setCustomMarkKeys(prev=>prev.filter(x=>x.key!==cm.key));
                          });
                        }} style={{background:"none",border:"none",color:"#ef4444",cursor:"pointer",fontSize:"14px",padding:"0 2px"}}>×</button>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Reset + Export */}
          <div style={{display:"flex",gap:"8px",marginTop:"14px",flexWrap:"wrap"}}>
            {isAdminView&&<button onClick={resetMarksToday}
              style={{...s.btn("#f59e0b",true),fontSize:"12px",padding:"6px 14px"}}>🔄 Reset today</button>}
            {isAdminView&&<button onClick={exportTodayLogCSV}
              style={{...s.btn("#10b981",true),fontSize:"12px",padding:"6px 14px"}}>⬇ Export today's marks</button>}
          </div>
        </div>

        {/* Quick log — generic events */}
        <div style={s.card}>
          <div style={{fontWeight:600,fontSize:"15px",marginBottom:"12px",color:txt}}>Quick log</div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(120px,1fr))",gap:"10px"}}>
            {enterprise.events.filter(ev=>ev.enabled).map(ev=>(
              <button key={ev.id} onClick={()=>manualLog(ev)} style={{background:ev.color+"18",border:`1.5px solid ${ev.color}44`,borderRadius:lr,padding:"14px 10px",cursor:"pointer",textAlign:"center"}}>
                <div style={{fontSize:"22px",marginBottom:"4px"}}>{ev.icon}</div>
                <div style={{fontSize:"12px",fontWeight:600,color:ev.color}}>{ev.label}</div>
                <div style={{fontSize:"11px",color:txt2,marginTop:"2px"}}>{ev.time}</div>
              </button>
            ))}
          </div>
        </div>
        {AlarmSchedulePanel}
        <div style={s.card}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"12px"}}>
            <div style={{fontWeight:600,fontSize:"15px",color:txt}}>Today's log</div>
            <button onClick={()=>setEnterprise(p=>({...p,log:[]}))} style={{...s.btn("#ef4444",true),padding:"4px 10px",fontSize:"11px"}}>Clear</button>
          </div>
          {(enterprise.log||[]).filter(e=>e.date===new Date().toISOString().slice(0,10)).length===0
            ?<div style={{color:txt2,textAlign:"center",padding:"20px",fontSize:"13px"}}>No events logged today.</div>
            :(enterprise.log||[]).filter(e=>e.date===new Date().toISOString().slice(0,10)).map((e,i)=>(
              <div key={i} style={{display:"flex",alignItems:"center",gap:"12px",padding:"8px 0",borderBottom:`1px solid ${bdr}`}}>
                <span style={{fontSize:"18px"}}>{e.icon}</span>
                <span style={{flex:1,fontSize:"13px",fontWeight:500,color:txt}}>{e.label}</span>
                <span style={{fontSize:"12px",color:txt2}}>{e.time}</span>
              </div>
            ))}
        </div>
        {(enterprise.log||[]).length>0&&false&&(
          <div style={s.card}>
            <div style={{fontWeight:600,fontSize:"15px",marginBottom:"12px",color:txt}}>Full history</div>
            {(enterprise.log||[]).map((e,i)=>(
              <div key={i} style={{display:"flex",alignItems:"center",gap:"12px",padding:"6px 0",borderBottom:`1px solid ${bdr}`}}>
                <span style={{fontSize:"16px"}}>{e.icon}</span>
                <span style={{flex:1,fontSize:"13px",color:txt}}>{e.label}</span>
                <span style={{fontSize:"11px",color:txt2}}>{e.date} {e.time}</span>
              </div>
            ))}
          </div>
        )}
        {/* Auto-refresh & Daily reset settings */}
        <div style={s.card}>
          <div style={{fontWeight:600,fontSize:"15px",marginBottom:"14px",color:txt}}>⚙ Refresh & Reset</div>
          <div style={{display:"flex",gap:"16px",flexWrap:"wrap",marginBottom:"14px"}}>
            <div style={{flex:1,minWidth:"180px"}}>
              <label style={s.lbl}>Auto-refresh interval</label>
              <select value={refreshInterval} onChange={e=>setRefreshInterval(Number(e.target.value))}
                style={{...s.input,fontSize:"13px"}}>
                <option value={0}>Off (manual only)</option>
                <option value={5}>Every 5 seconds</option>
                <option value={10}>Every 10 seconds</option>
                <option value={30}>Every 30 seconds</option>
                <option value={60}>Every 1 minute</option>
                <option value={300}>Every 5 minutes</option>
                <option value={600}>Every 10 minutes</option>
                <option value={1800}>Every 30 minutes</option>
              </select>
              <div style={{fontSize:"11px",color:txt2,marginTop:"4px"}}>
                {refreshInterval>0?`Admin panel data refreshes every ${refreshInterval<60?`${refreshInterval}s`:`${refreshInterval/60}min`}.`:"Auto-refresh is off. Data updates when you interact."}
              </div>
            </div>
            <div style={{flex:1,minWidth:"180px"}}>
              <label style={s.lbl}>Daily auto-reset time</label>
              <div style={{display:"flex",gap:"8px",alignItems:"center"}}>
                <input type="time" value={resetTime} onChange={e=>setResetTime(e.target.value)}
                  style={{...s.input,flex:1,fontSize:"13px"}} />
                {resetTime&&<button onClick={()=>setResetTime("")}
                  style={{background:"none",border:`1px solid ${bdr}`,borderRadius:"8px",padding:"6px 10px",cursor:"pointer",fontSize:"12px",color:txt2}}>
                  Clear
                </button>}
              </div>
              <div style={{fontSize:"11px",color:txt2,marginTop:"4px"}}>
                {resetTime?`Marks & logs auto-clear daily at ${resetTime}.`:"No auto-reset scheduled. Reset manually as needed."}
              </div>
            </div>
          </div>
          <button onClick={()=>{
            setEnterprise(prev=>({...prev,log:[]}));
            setPopup({title:"🔄 Manual refresh",body:"Enterprise log cleared."});
            setTimeout(()=>setPopup(null),3000);
          }} style={{...s.btn("#6b7280",true),fontSize:"12px",padding:"6px 14px"}}>
            🔄 Reset log now
          </button>
        </div>
      </div>
      {BottomNav}
    </div>
  );

  return (
    <div style={s.wrap}>
      {EntPopupOverlay}{TaskPopupModal}{EditModal}{DownloadModal}{ConfirmDialog}
      {popup&&<div style={{position:"fixed",top:24,right:24,zIndex:9996}}><div style={shapeStyle(settings.popupShape,settings.popupSize,settings.popupColor)}><div style={{fontWeight:600,marginBottom:4}}>{popup.title}</div><div style={{fontSize:"0.9em",opacity:0.9}}>{popup.body}</div><button onClick={()=>setPopup(null)} style={{marginTop:8,background:"rgba(255,255,255,0.25)",border:"none",borderRadius:"6px",color:"#fff",padding:"4px 12px",cursor:"pointer",fontSize:"12px"}}>Dismiss</button></div></div>}
      <div style={s.header}>
        <div style={{display:"flex",alignItems:"center",gap:"10px"}}>
          <div style={{width:30,height:30,borderRadius:"50%",background:acc,display:"flex",alignItems:"center",justifyContent:"center",fontSize:"14px"}}>⚡</div>
          <div>
            <div style={{fontWeight:700,fontSize:"16px",color:txt}}>Productivity Hub</div>
            <div style={{fontSize:"11px",color:txt2}}>{profile?.full_name || authUser?.email} · {isAdmin?"Admin":"Analyst"}</div>
          </div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:"10px"}}>
          <span style={{fontSize:"11px",color:saveStatus==="saving"?acc:"#10b981",fontWeight:500,display:"flex",alignItems:"center",gap:"4px",transition:"color 0.3s"}}>
            {saveStatus==="saving"
              ? <><span style={{display:"inline-block",width:8,height:8,borderRadius:"50%",background:acc,animation:"pulse 0.8s infinite"}}/>Saving…</>
              : <>✓ Saved</>}
          </span>
          <button onClick={()=>setSettings(p=>({...p,darkMode:!p.darkMode}))} style={{background:"none",border:`1.5px solid ${bdr}`,borderRadius:"999px",cursor:"pointer",padding:"6px 10px",fontSize:"18px",color:txt}}>{dm?"☀️":"🌙"}</button>
          <button onClick={handleLogout} style={{background:"none",border:`1.5px solid ${bdr}`,borderRadius:"8px",cursor:"pointer",padding:"6px 10px",fontSize:"11px",color:txt2,fontWeight:500}}>Sign out</button>
        </div>
      </div>
      <div style={s.tabs}>
        {TABS.map(t=><button key={t} style={s.tabBtn(tab===t)} onClick={()=>setTab(t)}>{t}</button>)}
      </div>
      {tab==="Tasks"&&(
        <div style={s.section}>
          <div style={{display:"flex",alignItems:"center",gap:"8px",marginBottom:"12px",background:dm?"#312e81":acc+"12",border:`1.5px solid ${acc}33`,borderRadius:lr,padding:"10px 14px"}}>
            <span style={{fontSize:"15px"}}>✨</span>
            {sugLoading
              ? <span style={{fontSize:"13px",color:txt2,flex:1}}>Reviewing your schedule…</span>
              : suggestion
                ? <div style={{flex:1,minWidth:0}}>
                    <div style={{display:"flex",alignItems:"center",gap:"6px",flexWrap:"wrap"}}>
                      <span style={{background:priColor(suggestion.priority),color:"#fff",borderRadius:"6px",padding:"1px 7px",fontSize:"11px",fontWeight:600}}>{suggestion.priority}</span>
                      <span style={{fontWeight:600,fontSize:"13px",color:txt,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{suggestion.title}</span>
                    </div>
                    <div style={{fontSize:"12px",color:txt2,marginTop:"2px",lineHeight:1.5}}>{suggestion.body}</div>
                  </div>
                : <span style={{fontSize:"12px",color:txt2,flex:1}}>AI suggestion based on your tasks & meetings</span>}
            <button onClick={generateSuggestion} disabled={sugLoading}
              style={{...s.btn(acc),padding:"5px 10px",fontSize:"12px",whiteSpace:"nowrap",flexShrink:0}}>
              {sugLoading?"…":"Suggest"}
            </button>
          </div>
          <div style={s.card}>
            <input placeholder="Task title…" value={newTask.title} onChange={e=>setNewTask(p=>({...p,title:e.target.value}))} style={{...s.input,marginBottom:"8px"}} onKeyDown={e=>e.key==="Enter"&&addTask()} />
            <div style={{display:"flex",gap:"8px",flexWrap:"wrap",marginBottom:"8px"}}>
              <select value={newTask.priority} onChange={e=>setNewTask(p=>({...p,priority:e.target.value}))} style={{...s.input,width:"auto"}}>
                {PRIORITIES.map(p=><option key={p} value={p}>{p.charAt(0).toUpperCase()+p.slice(1)}</option>)}
              </select>
              <input type="date" value={newTask.dueDate} onChange={e=>setNewTask(p=>({...p,dueDate:e.target.value}))} style={{...s.input,width:"auto"}} />
              <input type="time" value={newTask.alarmTime} onChange={e=>setNewTask(p=>({...p,alarmTime:e.target.value}))} style={{...s.input,width:"auto"}} />
            </div>
            <button onClick={addTask} style={s.btn()}>+ Add task</button>
          </div>
          <div style={{display:"flex",gap:"8px",marginBottom:"12px",flexWrap:"wrap",alignItems:"center"}}>
            {["all","pending"].map(f=>(
              <button key={f} onClick={()=>{ setFilter(f); setShowDoneLog(false); }} style={s.tabBtn(filter===f&&!showDoneLog)}>
                {f.charAt(0).toUpperCase()+f.slice(1)}
              </button>
            ))}
            <button onClick={()=>{ setShowDoneLog(true); setFilter("pending"); }}
              style={{...s.tabBtn(showDoneLog), display:"flex", alignItems:"center", gap:"5px"}}>
              Completed
              {doneCount>0&&<span style={{background:showDoneLog?"rgba(255,255,255,0.35)":acc,color:"#fff",borderRadius:"999px",fontSize:"10px",fontWeight:700,padding:"1px 6px",lineHeight:"16px"}}>{doneCount}</span>}
            </button>
            <select value={sortBy} onChange={e=>setSortBy(e.target.value)} style={{...s.input,width:"auto",fontSize:"13px",padding:"7px 12px",marginLeft:"auto"}}>
              <option value="created">Newest</option>
              <option value="priority">Priority</option>
              <option value="due">Due date</option>
            </select>
          </div>
          {showDoneLog&&(
            <div style={s.card}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"12px"}}>
                <div>
                  <div style={{fontWeight:600,fontSize:"15px",color:txt}}>Completed tasks</div>
                  <div style={{fontSize:"12px",color:txt2,marginTop:"2px"}}>{doneCount} task{doneCount!==1?"s":""} done</div>
                </div>
                {doneCount>0&&<button onClick={()=>{safeConfirm("Clear completed?","All completed tasks will be removed.",()=>setTasks(prev=>prev.filter(t=>!t.done)));}} style={{...s.btn("#ef4444",true),padding:"5px 10px",fontSize:"12px"}}>Clear all</button>}
              </div>
              {doneCount===0
                ?<div style={{color:txt2,textAlign:"center",padding:"32px",fontSize:"14px"}}>No completed tasks yet.</div>
                :doneTasks.map(t=>(
                  <div key={t.id} style={{display:"flex",alignItems:"flex-start",gap:"12px",padding:"12px 0",borderBottom:`1px solid ${bdr}`}}>
                    <span style={{fontSize:"18px",marginTop:"1px"}}>✅</span>
                    <div style={{flex:1}}>
                      <div style={{fontSize:"14px",fontWeight:500,color:txt,textDecoration:"line-through",opacity:0.75}}>{t.title}</div>
                      <div style={{display:"flex",gap:"6px",marginTop:"4px",flexWrap:"wrap"}}>
                        <span style={{background:priColor(t.priority),color:"#fff",borderRadius:"6px",padding:"2px 8px",fontSize:"11px",fontWeight:500}}>{t.priority}</span>
                        {t.dueDate&&<span style={{fontSize:"11px",color:txt2}}>Due {t.dueDate}</span>}
                        {t.doneAt&&<span style={{fontSize:"11px",color:"#10b981"}}>Done {new Date(t.doneAt).toLocaleDateString([],{month:"short",day:"numeric"})} {new Date(t.doneAt).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}</span>}
                      </div>
                    </div>
                    <button title="Restore" onClick={()=>toggleDone(t.id)} style={{background:"none",border:`1px solid ${bdr}`,borderRadius:"6px",color:acc,cursor:"pointer",fontSize:"13px",padding:"3px 8px"}}>↩</button>
                    <button title="Delete" onClick={()=>deleteTask(t.id)} style={{background:"none",border:"none",color:"#ef4444",cursor:"pointer",fontSize:"17px",padding:"0 2px"}}>×</button>
                  </div>
                ))}
            </div>
          )}
          {!showDoneLog&&filtered.length===0&&<div style={{color:txt2,textAlign:"center",padding:"32px"}}>No tasks here yet.</div>}
          {!showDoneLog&&filtered.map(t=>(
            <div key={t.id} style={{...s.card,display:"flex",alignItems:"flex-start",gap:"12px",opacity:t.done?0.55:1}}>
              <input type="checkbox" checked={t.done} onChange={()=>toggleDone(t.id)} style={{marginTop:3,width:16,height:16,cursor:"pointer",accentColor:acc}} />
              <div style={{flex:1}}>
                <div style={{fontWeight:500,textDecoration:t.done?"line-through":"none",fontSize:"14px"}}>{t.title}</div>
                <div style={{display:"flex",gap:"6px",marginTop:"4px",flexWrap:"wrap"}}>
                  <span style={{background:priColor(t.priority),color:"#fff",borderRadius:"6px",padding:"2px 8px",fontSize:"11px",fontWeight:500}}>{t.priority}</span>
                  {t.dueDate&&<span style={{fontSize:"11px",color:txt2}}>Due {t.dueDate}</span>}
                  {t.alarmTime&&<span style={{fontSize:"11px",color:acc}}>⏰ {t.alarmTime}</span>}
                  {t.doneAt&&<span style={{fontSize:"11px",color:"#10b981"}}>✓ {new Date(t.doneAt).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}</span>}
                </div>
              </div>
              {!t.done&&(
                <button onClick={()=>startEdit(t)} title="Edit task"
                  style={{background:"none",border:`1px solid ${bdr}`,borderRadius:"7px",color:acc,cursor:"pointer",fontSize:"13px",padding:"3px 9px",fontWeight:500}}>
                  Edit
                </button>
              )}
              <button onClick={()=>deleteTask(t.id)} style={{background:"none",border:"none",color:"#ef4444",cursor:"pointer",fontSize:"18px",padding:0}}>×</button>
            </div>
          ))}
        </div>
      )}
      {tab==="Calendar"&&(
        <div style={s.section}>
          <div style={s.card}>
            <label style={s.lbl}>Select date</label>
            <input type="date" value={calDate} onChange={e=>setCalDate(e.target.value)} style={s.input} />
          </div>
          <div style={{...s.card,background:dm?"#312e81":acc+"12",border:`1.5px solid ${acc}33`}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
              <span style={{fontSize:"13px",fontWeight:600,color:acc}}>✨ Smart suggestion for {calDate}</span>
              <button onClick={generateSuggestion} disabled={sugLoading} style={s.btn(acc)}>{sugLoading?"…":"Analyse"}</button>
            </div>
            {suggestion&&!sugLoading&&<div style={{marginTop:"10px",fontSize:"13px",color:txt2,lineHeight:1.6}}><span style={{fontWeight:600,color:txt}}>{suggestion.title}: </span>{suggestion.body}</div>}
          </div>
          <div style={{fontWeight:500,marginBottom:"8px",fontSize:"14px",color:txt2}}>Tasks on {calDate}</div>
          {calTasks.length===0?<div style={{color:txt2,textAlign:"center",padding:"24px"}}>No tasks for this date.</div>
            :calTasks.map(t=>(
              <div key={t.id} style={{...s.card,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div>
                  <div style={{fontWeight:500,fontSize:"14px"}}>{t.title}</div>
                  {t.alarmTime&&<div style={{fontSize:"12px",color:acc,marginTop:"2px"}}>⏰ {t.alarmTime}</div>}
                </div>
                <div style={{display:"flex",gap:"8px",alignItems:"center"}}>
                  <span style={{background:priColor(t.priority),color:"#fff",borderRadius:"6px",padding:"2px 8px",fontSize:"11px",fontWeight:500}}>{t.priority}</span>
                  <button onClick={()=>startEdit(t)} style={{...s.btn(acc,true),padding:"4px 10px",fontSize:"12px"}}>Edit</button>
                </div>
              </div>
            ))}
          <div style={{...s.card,marginTop:"12px"}}>
            <div style={{fontWeight:500,marginBottom:"8px",fontSize:"14px"}}>Set alarm for a task on {calDate}</div>
            <select style={{...s.input,marginBottom:"8px"}} id="calTask">
              <option value="">Select task…</option>
              {tasks.filter(t=>t.dueDate===calDate||!t.dueDate).map(t=><option key={t.id} value={t.id}>{t.title}</option>)}
            </select>
            <input type="time" id="calAlarm" style={{...s.input,marginBottom:"8px"}} />
            <button onClick={()=>{const tid=document.getElementById("calTask").value,at=document.getElementById("calAlarm").value;if(!tid||!at)return;setTasks(prev=>prev.map(t=>t.id===tid?{...t,alarmTime:at,alarmDate:calDate,alarmFired:false}:t));}} style={s.btn()}>Set alarm</button>
          </div>
        </div>
      )}
      {tab==="Alarms"&&(
        <div style={s.section}>
          {AlarmSchedulePanel}
        </div>
      )}
      {tab==="Timer"&&(
        <div style={s.section}>
          <div style={s.card}>
            <div style={{display:"flex",gap:"8px",marginBottom:"16px"}}>
              {["pomodoro","custom"].map(m=><button key={m} style={s.tabBtn(timerMode===m)} onClick={()=>{setTimerMode(m);setTimerRunning(false);setTimerSecs(m==="pomodoro"?25*60:customMin*60)}}>{m==="pomodoro"?"Pomodoro (25 min)":"Custom"}</button>)}
            </div>
            {timerMode==="custom"&&(
              <div style={{display:"flex",alignItems:"center",gap:"12px",marginBottom:"16px"}}>
                <label style={s.lbl}>Minutes:</label>
                <input type="number" min="1" max="120" value={customMin} onChange={e=>{setCustomMin(Number(e.target.value));setTimerSecs(Number(e.target.value)*60);}} style={{...s.input,width:"80px"}} />
              </div>
            )}
            <div style={{textAlign:"center",fontSize:"56px",fontWeight:300,letterSpacing:"4px",color:timerRunning?acc:txt,margin:"24px 0",fontVariantNumeric:"tabular-nums"}}>{fmt(timerSecs)}</div>
            <div style={{display:"flex",gap:"8px",justifyContent:"center"}}>
              <button onClick={()=>{if(!timerRunning){if(timerMode==="pomodoro")setTimerSecs(25*60);else setTimerSecs(customMin*60);setTimerRunning(true);}}} style={s.btn(timerRunning?"#a1a1aa":undefined)}>Start</button>
              <button onClick={()=>setTimerRunning(false)} style={s.btn("#f59e0b")}>Pause</button>
              <button onClick={()=>{setTimerRunning(false);setTimerSecs(timerMode==="pomodoro"?25*60:customMin*60);}} style={s.btn("#6b7280")}>Reset</button>
            </div>
          </div>
          <div style={s.card}>
            <div style={{fontWeight:500,marginBottom:"10px",fontSize:"14px"}}>Test alarm popup</div>
            <button onClick={()=>{playSound(settings.popupSound);triggerPopup("Test alarm!","Your custom popup is working.");}} style={s.btn()}>Trigger test popup</button>
          </div>
        </div>
      )}
      {tab==="Integrations"&&(
        <div style={s.section}>
          <div style={{...s.card,background:dm?"#312e81":acc+"12",border:`1.5px solid ${acc}44`,marginBottom:"16px"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:suggestion?"10px":"0"}}>
              <span style={{fontWeight:600,fontSize:"14px",color:acc}}>✨ AI Priority Suggestion</span>
              <button onClick={generateSuggestion} disabled={sugLoading} style={s.btn(acc)}>{sugLoading?"Analysing…":"Analyse schedule"}</button>
            </div>
            {suggestion&&!sugLoading&&(
              <div>
                <div style={{display:"flex",gap:"8px",alignItems:"center",marginBottom:"4px"}}>
                  <span style={{background:priColor(suggestion.priority),color:"#fff",borderRadius:"6px",padding:"2px 8px",fontSize:"11px",fontWeight:600}}>{suggestion.priority}</span>
                  <span style={{fontWeight:600,fontSize:"13px",color:txt}}>{suggestion.title}</span>
                </div>
                <div style={{fontSize:"13px",color:txt2,lineHeight:1.6}}>{suggestion.body}</div>
                {suggestion.source&&<div style={{fontSize:"11px",color:acc,marginTop:"4px"}}>📌 {suggestion.source}</div>}
              </div>
            )}
            {!suggestion&&!sugLoading&&<div style={{fontSize:"13px",color:txt2,marginTop:"4px"}}>Analyses your meetings and deadlines.</div>}
          </div>
          <div style={{color:txt2,fontSize:"13px",marginBottom:"12px"}}>Showing simulated Microsoft 365 & Accenture data.</div>
          {MOCK_M365.map(item=>(
            <div key={item.id} style={{...s.card,display:"flex",gap:"12px",alignItems:"flex-start"}}>
              <div style={{background:item.type==="meeting"?acc+"22":"#10b98122",borderRadius:"8px",padding:"8px",minWidth:"36px",textAlign:"center",fontSize:"18px"}}>{item.type==="meeting"?"📅":"🎯"}</div>
              <div style={{flex:1}}><div style={{fontWeight:500,fontSize:"14px"}}>{item.title}</div><div style={{fontSize:"12px",color:txt2,marginTop:"3px"}}>{item.time} · {item.source}</div></div>
              <span style={{fontSize:"11px",background:item.type==="meeting"?acc+"22":"#10b98122",color:item.type==="meeting"?acc:"#059669",borderRadius:"6px",padding:"2px 8px",fontWeight:500,whiteSpace:"nowrap"}}>{item.type}</span>
            </div>
          ))}
          <div style={{...s.card,marginTop:"8px"}}>
            <div style={{fontWeight:500,marginBottom:"8px",fontSize:"14px"}}>Configure connections</div>
            {["Microsoft 365 (Outlook / Teams / Planner)","Accenture Project Tools","Jira / ServiceNow","Custom API endpoint"].map(c=>(
              <div key={c} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 0",borderBottom:`1px solid ${bdr}`}}>
                <span style={{fontSize:"13px"}}>{c}</span>
                <button style={s.btn("#6b7280")}>Configure</button>
              </div>
            ))}
          </div>
        </div>
      )}
      {tab==="Settings"&&(
        <div style={s.section}>
          <div style={{display:"flex",gap:"6px",marginBottom:"16px",flexWrap:"wrap"}}>
            {SETTINGS_SECTIONS.map(sec=><button key={sec} onClick={()=>setSettingsTab(sec)} style={s.tabBtn(settingsTab===sec)}>{sec}</button>)}
          </div>
          {settingsTab==="Appearance"&&(
            <>
              <div style={s.card}>
                <div style={{fontWeight:500,marginBottom:"12px",fontSize:"15px"}}>Layout color palette</div>
                <div style={{display:"flex",gap:"10px",flexWrap:"wrap"}}>
                  {LAYOUT_PALETTES.map((p,i)=>(
                    <div key={p.name} onClick={()=>setSettings(prev=>({...prev,palette:i}))} style={{cursor:"pointer",borderRadius:"10px",overflow:"hidden",border:`2.5px solid ${settings.palette===i?p.accent:"transparent"}`,width:"60px"}}>
                      <div style={{background:p.bg,height:"28px",display:"flex",alignItems:"center",justifyContent:"center"}}><div style={{width:"16px",height:"16px",borderRadius:"50%",background:p.accent}} /></div>
                      <div style={{background:p.card,padding:"3px 0",textAlign:"center",fontSize:"10px",fontWeight:500,color:p.text}}>{p.name}</div>
                    </div>
                  ))}
                </div>
              </div>
              <div style={s.card}>
                <div style={{fontWeight:500,marginBottom:"12px",fontSize:"15px"}}>Layout shape</div>
                <div style={{display:"flex",gap:"8px",flexWrap:"wrap"}}>
                  {LAYOUT_SHAPES.map((sh,i)=>(
                    <button key={sh.name} onClick={()=>setSettings(prev=>({...prev,layoutShape:i}))} style={{...s.btn(settings.layoutShape===i?acc:"#6b7280",settings.layoutShape!==i),borderRadius:sh.radius,padding:"7px 16px"}}>{sh.name}</button>
                  ))}
                </div>
              </div>
            </>
          )}
          {settingsTab==="Popup"&&(
            <>
              <div style={s.card}>
                <div style={{fontWeight:500,marginBottom:"14px",fontSize:"15px"}}>Popup customization</div>
                <label style={s.lbl}>Color</label>
                <div style={{display:"flex",gap:"8px",marginBottom:"14px",flexWrap:"wrap"}}>
                  {POPUP_COLORS.map(c=><div key={c} onClick={()=>setSettings(p=>({...p,popupColor:c}))} style={{width:28,height:28,borderRadius:"50%",background:c,cursor:"pointer",border:settings.popupColor===c?`3px solid ${txt}`:"2px solid transparent"}} />)}
                </div>
                <label style={s.lbl}>Shape</label>
                <div style={{display:"flex",gap:"6px",marginBottom:"14px",flexWrap:"wrap"}}>
                  {SHAPES.map(sh=><button key={sh} onClick={()=>setSettings(p=>({...p,popupShape:sh}))} style={s.tabBtn(settings.popupShape===sh)}>{sh}</button>)}
                </div>
                <label style={s.lbl}>Size</label>
                <div style={{display:"flex",gap:"6px",marginBottom:"14px",flexWrap:"wrap"}}>
                  {SIZES.map(sz=><button key={sz} onClick={()=>setSettings(p=>({...p,popupSize:sz}))} style={s.tabBtn(settings.popupSize===sz)}>{sz}</button>)}
                </div>
                <label style={s.lbl}>Sound</label>
                <div style={{display:"flex",gap:"6px",marginBottom:"14px",flexWrap:"wrap"}}>
                  {SOUNDS.map(snd=><button key={snd} onClick={()=>setSettings(p=>({...p,popupSound:snd}))} style={s.tabBtn(settings.popupSound===snd)}>{snd}</button>)}
                </div>
                <button onClick={()=>{playSound(settings.popupSound);triggerPopup("Preview popup","This is how your alarm will look!");}} style={s.btn()}>Preview popup</button>
              </div>
              <div style={s.card}>
                <div style={{fontWeight:500,marginBottom:"12px",fontSize:"15px"}}>Test persistent popup</div>
                <div style={{fontSize:"12px",color:txt2,marginBottom:"10px"}}>Trigger a persistent enterprise popup to test the configuration (color, shape, sound).</div>
                <div style={{display:"flex",gap:"8px",flexWrap:"wrap"}}>
                  {enterprise.events.map(ev=>(
                    <button key={ev.id} onClick={()=>setEntPopup({id:ev.id,icon:ev.icon,label:ev.label,color:ev.color,time:"now"})}
                      style={{...s.btn(ev.color),padding:"6px 12px",fontSize:"12px"}}>{ev.icon} {ev.label}</button>
                  ))}
                </div>
              </div>
            </>
          )}
          {settingsTab==="Enterprise"&&(
            <>
              <div style={s.card}>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"12px"}}>
                  <div style={{fontWeight:600,fontSize:"15px",color:txt}}>Today's log</div>
                  <button onClick={()=>setEnterprise(p=>({...p,log:[]}))} style={{...s.btn("#ef4444",true),padding:"4px 10px",fontSize:"11px"}}>Clear</button>
                </div>
                {(enterprise.log||[]).filter(e=>e.date===new Date().toISOString().slice(0,10)).length===0
                  ?<div style={{color:txt2,textAlign:"center",padding:"16px",fontSize:"13px"}}>No events logged today.</div>
                  :(enterprise.log||[]).filter(e=>e.date===new Date().toISOString().slice(0,10)).map((e,i)=>(
                    <div key={i} style={{display:"flex",alignItems:"center",gap:"12px",padding:"8px 0",borderBottom:`1px solid ${bdr}`}}>
                      <span style={{fontSize:"18px"}}>{e.icon}</span>
                      <span style={{flex:1,fontSize:"13px",fontWeight:500,color:txt}}>{e.label}</span>
                      <span style={{fontSize:"12px",color:txt2}}>{e.time}</span>
                    </div>
                  ))}
              </div>
              <div style={{...s.card,background:dm?"#1a1a2e":"#eef2ff",border:`1.5px solid ${acc}33`}}>
                <div style={{fontSize:"13px",color:txt2,lineHeight:1.7}}>
                  Manage the alarm schedule in the <button onClick={()=>setTab("Alarms")} style={{background:"none",border:"none",color:acc,cursor:"pointer",fontWeight:600,fontSize:"13px",padding:0,textDecoration:"underline"}}>Alarms tab →</button>
                </div>
              </div>
            </>
          )}
          {settingsTab==="Notifications"&&(
            <div style={s.card}>
              <div style={{fontWeight:500,marginBottom:"10px",fontSize:"15px"}}>System notifications</div>
              <button onClick={()=>{if("Notification" in window&&Notification.permission==="default") Notification.requestPermission();}} style={s.btn("#10b981")}>Enable system notifications</button>
              <div style={{fontSize:"12px",color:txt2,marginTop:"8px"}}>Appears even when this tab is in the background.</div>
            </div>
          )}
          {settingsTab==="Data"&&(
            <div style={s.card}>
              <div style={{fontWeight:500,marginBottom:"14px",fontSize:"15px"}}>Data management</div>
              <div style={{marginBottom:"16px"}}>
                <div style={s.lbl}>Backup & restore</div>
                <div style={{display:"flex",gap:"8px",flexWrap:"wrap"}}>
                  {isAdminView&&<button onClick={exportBackup} style={s.btn("#10b981")}>⬇ Export backup</button>}
                  {isAdminView&&<label style={{...s.btn("#0ea5e9"),cursor:"pointer"}}>
                    ⬆ Import backup
                    <input type="file" accept=".json" onChange={importBackup} style={{display:"none"}} />
                  </label>}
                </div>
                <div style={{fontSize:"12px",color:txt2,marginTop:"8px"}}>Export saves all tasks, settings, and enterprise data as a .json file you can reimport anytime.</div>
              </div>
              <div style={{borderTop:`1px solid ${bdr}`,paddingTop:"14px"}}>
                <div style={s.lbl}>Clear data</div>
                <div style={{display:"flex",gap:"8px",flexWrap:"wrap"}}>
                  <button onClick={()=>{safeConfirm("Clear all tasks?","All tasks will be permanently removed.",()=>setTasks([]));}} style={s.btn("#ef4444",true)}>Clear tasks</button>
                  <button onClick={()=>{safeConfirm("Reset enterprise log?","All logged events will be cleared.",()=>setEnterprise(p=>({...p,log:[]})));}} style={s.btn("#f59e0b",true)}>Clear log</button>
                  <button onClick={()=>{safeConfirm("Reset all settings?","All customizations will be reverted to defaults.",()=>setSettings(defaultSettings));}} style={s.btn("#6b7280",true)}>Reset settings</button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
      {BottomNav}
    </div>
  );
}
