import { useState, useEffect } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, BarChart, Bar
} from "recharts";

const STORAGE_KEY_READINGS = "ripensia21_readings";
const STORAGE_KEY_COUNTERS = "ripensia21_counters";
const STORAGE_KEY_META     = "ripensia21_meta";
const STORAGE_KEY_EMAILS   = "ripensia21_emails";

const DEFAULT_COUNTERS = {
  bucatarie: { name: "Bucătărie", serial: "", color: "#3b82f6" },
  baia_mare: { name: "Baie Mare", serial: "", color: "#10b981" },
  baia_mica: { name: "Baie Mică", serial: "", color: "#f59e0b" },
};

const MONTHS = ["Ian","Feb","Mar","Apr","Mai","Iun","Iul","Aug","Sep","Oct","Nov","Dec"];

function formatMonth(dateStr) {
  const [y, m] = dateStr.split("-");
  return `${MONTHS[parseInt(m) - 1]} ${y}`;
}
function getCurrentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2,"0")}`;
}

/* ─── Email HTML builder – replicates the physical form + serial numbers ─── */
function buildEmailHTML({ meta, counters, month, reading, prevReading, consumption }) {
  const prevMonth = (() => {
    const [y, m] = month.split("-").map(Number);
    return m === 1 ? `${y-1}-12` : `${y}-${String(m-1).padStart(2,"0")}`;
  })();

  const td  = "padding:9px 14px;border:2px solid #000;font-size:14px;";
  const tdc = td + "text-align:center;";
  const totalCons = consumption?.total != null ? Number(consumption.total).toFixed(3) + " mc" : "—";

  const counterEntries = Object.entries(counters);

  // Serial numbers row (shown only if at least one serial exists)
  const hasSerials = counterEntries.some(([,c]) => c.serial);
  const serialRow = hasSerials ? `
    <tr style="background:#f9f9f9;">
      <td style="${td}font-style:italic;color:#555;font-size:12px;">Nr. serie contor</td>
      ${counterEntries.map(([,c]) => `<td style="${tdc}font-size:12px;color:#555;">${c.serial || "—"}</td>`).join("")}
      <td style="${tdc}"></td>
    </tr>` : "";

  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<style>
  body{font-family:Arial,sans-serif;background:#fff;color:#000;margin:0;padding:0;}
  .wrap{max-width:660px;margin:32px auto;padding:28px;border:1px solid #ccc;border-radius:4px;}
  .header-title{font-size:18px;font-weight:bold;letter-spacing:1px;margin:0 0 4px;}
  .header-sub{font-size:14px;color:#333;margin:0 0 20px;}
  table{border-collapse:collapse;width:100%;}
  th{background:#111;color:#fff;padding:10px 14px;border:2px solid #000;font-size:13px;text-align:center;}
  th.left{text-align:left;text-decoration:underline;}
  .section-label{background:#ddd;font-weight:bold;font-size:13px;padding:6px 14px;border:2px solid #000;letter-spacing:.5px;}
  .total-row td{background:#222;color:#fff;font-weight:bold;font-size:15px;}
  .footer{margin-top:20px;font-size:11px;color:#999;border-top:1px solid #eee;padding-top:12px;}
</style>
</head>
<body>
<div class="wrap">
  <p class="header-title">RIPENSIA 21 &nbsp;·&nbsp; AP. ${meta.ap || "........"} &nbsp;·&nbsp; Proprietar: <span style="border-bottom:1px solid #999;">${meta.proprietar || "................................"}</span></p>
  <p class="header-sub">CONSUM luna <strong>${formatMonth(month)}</strong> &nbsp;&nbsp;|&nbsp;&nbsp; Nr. persoane: <strong>${meta.nrPers || "—"}</strong></p>

  <table>
    <thead>
      <tr>
        <th class="left" style="min-width:140px;">APĂ RECE</th>
        ${counterEntries.map(([,c]) => `<th>${c.name.toUpperCase()}</th>`).join("")}
        <th>TOTAL CONSUM mc</th>
      </tr>
      ${serialRow}
    </thead>
    <tbody>
      <tr>
        <td style="${td}font-weight:bold;">
          INDEX NOU
          <div style="font-weight:normal;font-size:11px;color:#555;margin-top:2px;">${formatMonth(month)}</div>
        </td>
        ${counterEntries.map(([k]) => `<td style="${tdc}font-size:16px;font-weight:bold;">${reading?.[k] ?? "—"}</td>`).join("")}
        <td style="${tdc}" rowspan="3" valign="middle">
          <div style="font-size:22px;font-weight:bold;">${totalCons}</div>
        </td>
      </tr>
      <tr>
        <td style="${td}font-weight:bold;">
          INDEX VECHI
          <div style="font-weight:normal;font-size:11px;color:#555;margin-top:2px;">${formatMonth(prevMonth)}</div>
        </td>
        ${counterEntries.map(([k]) => `<td style="${tdc}font-size:16px;">${prevReading?.[k] ?? "—"}</td>`).join("")}
      </tr>
      <tr>
        <td style="${td}font-weight:bold;">CONSUM (mc)</td>
        ${counterEntries.map(([k]) => `<td style="${tdc}font-size:15px;color:#1a56db;font-weight:bold;">${consumption?.[k] != null ? Number(consumption[k]).toFixed(3) : "—"}</td>`).join("")}
      </tr>
    </tbody>
  </table>

  <div class="footer">
    Generat automat de aplicația Ripensia 21 &nbsp;·&nbsp; ${new Date().toLocaleString("ro-RO")}
  </div>
</div>
</body></html>`;
}

/* ─── CSV builder – full history ─── */
function buildCSV({ meta, counters, readings, getPrevMonth, getConsumption }) {
  const counterKeys = Object.keys(counters);
  const counterNames = counterKeys.map(k => counters[k].name);
  const counterSerials = counterKeys.map(k => counters[k].serial || "");

  // Header rows
  const lines = [];
  lines.push(`"RIPENSIA 21 - AP. ${meta.ap || ""}","Proprietar: ${meta.proprietar || ""}","Nr. pers.: ${meta.nrPers || ""}"`);
  lines.push("");

  // Column headers – one column per counter for index_nou, index_vechi, consum + total
  const colHeaders = [
    "Luna",
    ...counterKeys.map(k => `Index Nou - ${counters[k].name}`),
    ...counterKeys.map(k => `Index Vechi - ${counters[k].name}`),
    ...counterKeys.map(k => `Consum (mc) - ${counters[k].name}`),
    "Total Consum (mc)",
    ...counterKeys.map(k => `Nr. Serie - ${counters[k].name}`),
  ];
  lines.push(colHeaders.map(h => `"${h}"`).join(","));

  // Data rows sorted ascending
  const months = Object.keys(readings).sort();
  for (const m of months) {
    const r    = readings[m];
    const prev = readings[getPrevMonth(m)];
    const cons = getConsumption(m);

    const idxNou   = counterKeys.map(k => r?.[k]    ?? "");
    const idxVechi = counterKeys.map(k => prev?.[k] ?? "");
    const consum   = counterKeys.map(k => cons?.[k] != null ? Number(cons[k]).toFixed(3) : "");
    const total    = cons?.total != null ? Number(cons.total).toFixed(3) : "";
    const serials  = counterKeys.map(k => counters[k].serial || "");

    lines.push([
      `"${formatMonth(m)}"`,
      ...idxNou.map(v => `"${v}"`),
      ...idxVechi.map(v => `"${v}"`),
      ...consum.map(v => `"${v}"`),
      `"${total}"`,
      ...serials.map(v => `"${v}"`),
    ].join(","));
  }

  return lines.join("\r\n");
}

/* ─── Send via Claude API + Gmail MCP ─── */
async function sendViaClaudeGmail({ emailList, subject, htmlBody }) {
  const toList = emailList.join(", ");
  const prompt = `Please send an email using Gmail with these exact details:
To: ${toList}
Subject: ${subject}
Send it as an HTML email. Use exactly the following HTML as the email body — do not modify it:

${htmlBody}`;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      mcp_servers: [{ type: "url", url: "https://gmail.mcp.claude.com/mcp", name: "gmail-mcp" }],
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.error?.message || `HTTP ${response.status}`);
  }
  const data = await response.json();
  return data.content?.filter(b => b.type === "text").map(b => b.text).join("\n") || "Trimis.";
}

/* ══════════════════════ MAIN APP ══════════════════════ */
export default function App() {
  const [view, setView]               = useState("input");
  const [readings, setReadings]       = useState({});
  const [counters, setCounters]       = useState(DEFAULT_COUNTERS);
  const [meta, setMeta]               = useState({ ap: "", proprietar: "", nrPers: "" });
  const [emailList, setEmailList]     = useState([]);
  const [newEmail, setNewEmail]       = useState("");
  const [emailError, setEmailError]   = useState("");
  const [currentMonth, setCurrentMonth] = useState(getCurrentMonth());
  const [form, setForm]               = useState({ bucatarie: "", baia_mare: "", baia_mica: "" });
  const [toast, setToast]             = useState(null);
  const [sending, setSending]         = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  /* ── Load ── */
  useEffect(() => {
    try {
      const r = localStorage.getItem(STORAGE_KEY_READINGS);
      const c = localStorage.getItem(STORAGE_KEY_COUNTERS);
      const m = localStorage.getItem(STORAGE_KEY_META);
      const e = localStorage.getItem(STORAGE_KEY_EMAILS);
      if (r) setReadings(JSON.parse(r));
      if (c) setCounters(JSON.parse(c));
      if (m) setMeta(JSON.parse(m));
      if (e) setEmailList(JSON.parse(e));
    } catch {}
  }, []);

  /* ── Persist ── */
  useEffect(() => { try { localStorage.setItem(STORAGE_KEY_READINGS, JSON.stringify(readings)); } catch {} }, [readings]);
  useEffect(() => { try { localStorage.setItem(STORAGE_KEY_COUNTERS, JSON.stringify(counters)); } catch {} }, [counters]);
  useEffect(() => { try { localStorage.setItem(STORAGE_KEY_META,     JSON.stringify(meta));     } catch {} }, [meta]);
  useEffect(() => { try { localStorage.setItem(STORAGE_KEY_EMAILS,   JSON.stringify(emailList)); } catch {} }, [emailList]);

  useEffect(() => {
    const r = readings[currentMonth];
    if (r) setForm({ bucatarie: r.bucatarie ?? "", baia_mare: r.baia_mare ?? "", baia_mica: r.baia_mica ?? "" });
    else   setForm({ bucatarie: "", baia_mare: "", baia_mica: "" });
  }, [currentMonth, readings]);

  function getPrevMonth(month) {
    const [y, m] = month.split("-").map(Number);
    return m === 1 ? `${y-1}-12` : `${y}-${String(m-1).padStart(2,"0")}`;
  }

  function getConsumption(month) {
    const cur  = readings[month];  if (!cur)  return null;
    const prev = readings[getPrevMonth(month)]; if (!prev) return null;
    const buc  = Math.max(0, (Number(cur.bucatarie)||0) - (Number(prev.bucatarie)||0));
    const bm   = Math.max(0, (Number(cur.baia_mare)||0) - (Number(prev.baia_mare)||0));
    const bmic = Math.max(0, (Number(cur.baia_mica)||0)  - (Number(prev.baia_mica)||0));
    return { bucatarie: buc, baia_mare: bm, baia_mica: bmic, total: buc+bm+bmic };
  }

  function showToast(msg, type = "ok") {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3800);
  }

  function saveReading() {
    const vals = {
      bucatarie: form.bucatarie === "" ? null : Number(form.bucatarie),
      baia_mare: form.baia_mare === "" ? null : Number(form.baia_mare),
      baia_mica: form.baia_mica === "" ? null : Number(form.baia_mica),
      savedAt: new Date().toISOString(),
    };
    setReadings(prev => ({ ...prev, [currentMonth]: vals }));
    showToast("Date salvate cu succes!");
  }

  function addEmail() {
    const t = newEmail.trim().toLowerCase();
    if (!t) return;
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRe.test(t)) { setEmailError("Adresă invalidă."); return; }
    if (emailList.includes(t)) { setEmailError("Deja adăugat."); return; }
    setEmailList(prev => [...prev, t]);
    setNewEmail("");
    setEmailError("");
  }

  function downloadCSV() {
    if (Object.keys(readings).length === 0) { showToast("Nu există date de exportat!", "warn"); return; }
    const csv  = buildCSV({ meta, counters, readings, getPrevMonth, getConsumption });
    const bom  = "\uFEFF";
    const blob = new Blob([bom + csv], { type: "text/csv;charset=utf-8;" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    const stamp = new Date().toISOString().slice(0,10);
    a.download  = `ripensia21_ap${meta.ap || "X"}_${stamp}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast("📥 CSV descărcat cu succes!");
  }

  async function handleSendEmail() {
    if (emailList.length === 0) { showToast("Adaugă cel puțin un email în Setări!", "warn"); return; }
    if (!readings[currentMonth]) { showToast("Salvează mai întâi indexul lunii!", "warn"); return; }
    setSending(true);
    try {
      const prevM = getPrevMonth(currentMonth);
      const cons  = getConsumption(currentMonth);
      const html  = buildEmailHTML({
        meta, counters, month: currentMonth,
        reading: readings[currentMonth],
        prevReading: readings[prevM],
        consumption: cons,
      });
      const subject = `Consum apă RIPENSIA 21 AP.${meta.ap || "?"} — ${formatMonth(currentMonth)}`;
      await sendViaClaudeGmail({ emailList, subject, htmlBody: html });
      showToast(`✅ Email trimis la ${emailList.length} destinatar${emailList.length > 1 ? "i" : ""}!`);
    } catch (e) {
      showToast(`❌ Eroare: ${e.message}`, "err");
    } finally {
      setSending(false);
    }
  }

  /* Chart */
  const chartData = (() => {
    const months = Object.keys(readings).sort();
    return months.slice(-13).slice(1).map(m => {
      const c = getConsumption(m);
      return { month: formatMonth(m), Bucătărie: c?.bucatarie??0, "Baie Mare": c?.baia_mare??0, "Baie Mică": c?.baia_mica??0, Total: c?.total??0 };
    }).filter(d => d.Total > 0);
  })();

  const curConsumption  = getConsumption(currentMonth);
  const prevMonth       = getPrevMonth(currentMonth);
  const prevReading     = readings[prevMonth];
  const allMonths       = Object.keys(readings).sort().reverse();
  const emailPreviewHTML = readings[currentMonth] ? buildEmailHTML({
    meta, counters, month: currentMonth,
    reading: readings[currentMonth],
    prevReading, consumption: curConsumption,
  }) : null;

  const inp = { display:"block", marginTop:6, width:"100%", background:"#0f1117", border:"1.5px solid #2a2d3e", borderRadius:8, color:"#e8eaf0", padding:"10px 14px", fontSize:15, fontFamily:"inherit", outline:"none", boxSizing:"border-box" };

  return (
    <div style={{ minHeight:"100vh", background:"#0f1117", color:"#e8eaf0", fontFamily:"'JetBrains Mono','Courier New',monospace", paddingBottom:80 }}>

      {/* Header */}
      <div style={{ background:"linear-gradient(135deg,#1a1d2e 0%,#0f1117 100%)", borderBottom:"2px solid #2563eb", padding:"16px 20px 12px", position:"sticky", top:0, zIndex:10, boxShadow:"0 4px 24px rgba(37,99,235,.18)" }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <div>
            <div style={{ fontSize:11, color:"#6b7db3", letterSpacing:3, textTransform:"uppercase" }}>Bloc</div>
            <div style={{ fontSize:22, fontWeight:700, color:"#fff", letterSpacing:1 }}>
              RIPENSIA 21{meta.ap && <span style={{ color:"#2563eb", marginLeft:8 }}>AP. {meta.ap}</span>}
            </div>
            {meta.proprietar && <div style={{ fontSize:12, color:"#94a3b8" }}>{meta.proprietar}</div>}
          </div>
          <div style={{ width:48, height:48, borderRadius:12, background:"linear-gradient(135deg,#2563eb,#1d4ed8)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:24, boxShadow:"0 2px 12px rgba(37,99,235,.4)" }}>💧</div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display:"flex", background:"#1a1d2e", borderBottom:"1px solid #2a2d3e", overflowX:"auto" }}>
        {[{id:"input",label:"📝 Index"},{id:"chart",label:"📊 Grafic"},{id:"history",label:"📋 Istoric"},{id:"settings",label:"⚙️ Setări"}].map(tab => (
          <button key={tab.id} onClick={() => setView(tab.id)} style={{ flex:1, padding:"12px 4px", border:"none", cursor:"pointer", background:view===tab.id?"#0f1117":"transparent", color:view===tab.id?"#2563eb":"#6b7db3", borderBottom:view===tab.id?"2px solid #2563eb":"2px solid transparent", fontSize:12, fontWeight:600, fontFamily:"inherit", transition:"all .2s", whiteSpace:"nowrap" }}>{tab.label}</button>
        ))}
      </div>

      <div style={{ padding:"20px 16px", maxWidth:520, margin:"0 auto" }}>

        {/* ══ INPUT ══ */}
        {view==="input" && (
          <div>
            <div style={{ marginBottom:20 }}>
              <label style={{ fontSize:11, color:"#6b7db3", letterSpacing:2, textTransform:"uppercase" }}>Luna</label>
              <input type="month" value={currentMonth} onChange={e => setCurrentMonth(e.target.value)} style={{ ...inp, fontSize:16 }} />
            </div>

            {prevReading && (
              <div style={{ background:"#1a1d2e", border:"1px solid #2a2d3e", borderRadius:10, padding:"10px 14px", marginBottom:16, fontSize:12 }}>
                <span style={{ color:"#6b7db3" }}>Index anterior ({formatMonth(prevMonth)}): </span>
                {Object.keys(counters).map(k => (
                  <span key={k} style={{ marginRight:12, color:counters[k].color }}>{counters[k].name}: <b>{prevReading[k]??'—'}</b></span>
                ))}
              </div>
            )}

            {Object.entries(counters).map(([key, counter]) => {
              const prev = prevReading?.[key];
              const cur  = form[key];
              const cons = (prev!=null && cur!=="") ? Math.max(0, Number(cur)-Number(prev)) : null;
              return (
                <div key={key} style={{ background:"#1a1d2e", border:`1.5px solid ${form[key]!==""?counter.color+"55":"#2a2d3e"}`, borderRadius:14, padding:16, marginBottom:14 }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
                    <div>
                      <div style={{ fontWeight:700, fontSize:15, color:counter.color }}>{counter.name}</div>
                      {counter.serial && <div style={{ fontSize:11, color:"#6b7db3" }}>Nr. serie: {counter.serial}</div>}
                    </div>
                    {cons!==null && <div style={{ background:counter.color+"22", color:counter.color, borderRadius:8, padding:"4px 10px", fontSize:13, fontWeight:700 }}>▲ {cons.toFixed(2)} m³</div>}
                  </div>
                  <input type="number" step="0.001" min="0" placeholder={prev!=null?`Anterior: ${prev}`:"Index actual..."} value={form[key]} onChange={e => setForm(f=>({...f,[key]:e.target.value}))} style={{ width:"100%", background:"#0f1117", border:"1.5px solid #2a2d3e", borderRadius:8, color:"#fff", padding:"12px 14px", fontSize:18, fontFamily:"inherit", outline:"none", boxSizing:"border-box" }} />
                </div>
              );
            })}

            {curConsumption && (
              <div style={{ background:"linear-gradient(135deg,#1e3a8a22,#1a1d2e)", border:"2px solid #2563eb44", borderRadius:14, padding:16, marginBottom:20, textAlign:"center" }}>
                <div style={{ fontSize:11, color:"#6b7db3", letterSpacing:2, textTransform:"uppercase", marginBottom:6 }}>Total Consum Luna</div>
                <div style={{ fontSize:36, fontWeight:700, color:"#2563eb" }}>{curConsumption.total.toFixed(3)} <span style={{ fontSize:18, color:"#94a3b8" }}>m³</span></div>
                <div style={{ display:"flex", justifyContent:"center", gap:16, marginTop:8 }}>
                  {Object.entries(counters).map(([k,c]) => <span key={k} style={{ fontSize:12, color:c.color }}>{c.name}: {curConsumption[k].toFixed(2)}</span>)}
                </div>
              </div>
            )}

            <div style={{ marginBottom:16 }}>
              <label style={{ fontSize:11, color:"#6b7db3", letterSpacing:2, textTransform:"uppercase" }}>Nr. Persoane</label>
              <input type="number" min="1" value={meta.nrPers} onChange={e => setMeta(m=>({...m,nrPers:e.target.value}))} placeholder="1" style={inp} />
            </div>

            <button onClick={saveReading} style={{ width:"100%", padding:16, borderRadius:14, border:"none", background:"linear-gradient(135deg,#2563eb,#1d4ed8)", color:"#fff", fontSize:16, fontWeight:700, fontFamily:"inherit", cursor:"pointer", letterSpacing:1, boxShadow:"0 4px 20px rgba(37,99,235,.4)", marginBottom:14 }}>
              💾 SALVEAZĂ INDEXUL
            </button>

            {/* ── Email send panel ── */}
            <div style={{ background:"#1a1d2e", borderRadius:14, border:"1px solid #0ea5e933", padding:16 }}>
              <div style={{ fontSize:12, color:"#0ea5e9", letterSpacing:2, textTransform:"uppercase", marginBottom:12, fontWeight:700 }}>✉️ Trimite Raport Email</div>

              {emailList.length === 0 ? (
                <div style={{ fontSize:13, color:"#6b7db3", textAlign:"center", padding:"6px 0 10px" }}>
                  Nicio adresă configurată.{" "}
                  <span style={{ color:"#0ea5e9", cursor:"pointer", textDecoration:"underline" }} onClick={() => setView("settings")}>Adaugă în Setări →</span>
                </div>
              ) : (
                <div style={{ marginBottom:12, display:"flex", flexWrap:"wrap", gap:6 }}>
                  {emailList.map((e,i) => (
                    <div key={i} style={{ background:"#0f1117", border:"1px solid #0ea5e944", borderRadius:20, padding:"3px 10px", fontSize:12, color:"#94a3b8" }}>
                      {e}
                    </div>
                  ))}
                </div>
              )}

              <div style={{ display:"flex", gap:8 }}>
                {readings[currentMonth] && (
                  <button onClick={() => setPreviewOpen(true)} style={{ flex:1, padding:"10px", borderRadius:10, border:"1px solid #2a2d3e", background:"transparent", color:"#94a3b8", fontSize:13, fontFamily:"inherit", cursor:"pointer" }}>
                    👁 Preview
                  </button>
                )}
                <button onClick={handleSendEmail} disabled={sending||emailList.length===0} style={{ flex:2, padding:"12px", borderRadius:10, border:"none", background:emailList.length===0||sending?"#1a1d2e":"linear-gradient(135deg,#0ea5e9,#0369a1)", color:emailList.length===0||sending?"#4b5563":"#fff", fontSize:14, fontWeight:700, fontFamily:"inherit", cursor:emailList.length===0||sending?"not-allowed":"pointer", boxShadow:emailList.length===0||sending?"none":"0 4px 16px rgba(14,165,233,.35)", transition:"all .2s" }}>
                  {sending ? "⏳ Se trimite..." : "📨 TRIMITE EMAIL"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ══ CHART ══ */}
        {view==="chart" && (
          <div>
            <div style={{ fontSize:13, color:"#6b7db3", marginBottom:16, letterSpacing:1 }}>CONSUM LUNAR (m³)</div>
            {chartData.length < 2 ? (
              <div style={{ background:"#1a1d2e", borderRadius:14, padding:40, textAlign:"center", color:"#6b7db3" }}>
                <div style={{ fontSize:32, marginBottom:12 }}>📊</div>Adaugă cel puțin 2 luni de date.
              </div>
            ) : (
              <>
                <div style={{ background:"#1a1d2e", borderRadius:14, padding:"16px 8px", marginBottom:20 }}>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={chartData} margin={{ top:5, right:10, left:-20, bottom:0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#2a2d3e" />
                      <XAxis dataKey="month" tick={{ fill:"#6b7db3", fontSize:10 }} />
                      <YAxis tick={{ fill:"#6b7db3", fontSize:10 }} />
                      <Tooltip contentStyle={{ background:"#0f1117", border:"1px solid #2a2d3e", borderRadius:8, fontFamily:"monospace" }} labelStyle={{ color:"#e8eaf0", fontWeight:700 }} />
                      <Legend wrapperStyle={{ fontSize:11, color:"#94a3b8" }} />
                      <Bar dataKey="Bucătărie" fill="#3b82f6" radius={[4,4,0,0]} />
                      <Bar dataKey="Baie Mare" fill="#10b981" radius={[4,4,0,0]} />
                      <Bar dataKey="Baie Mică" fill="#f59e0b" radius={[4,4,0,0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div style={{ fontSize:13, color:"#6b7db3", marginBottom:12, letterSpacing:1 }}>TREND TOTAL</div>
                <div style={{ background:"#1a1d2e", borderRadius:14, padding:"16px 8px", marginBottom:20 }}>
                  <ResponsiveContainer width="100%" height={180}>
                    <LineChart data={chartData} margin={{ top:5, right:10, left:-20, bottom:0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#2a2d3e" />
                      <XAxis dataKey="month" tick={{ fill:"#6b7db3", fontSize:10 }} />
                      <YAxis tick={{ fill:"#6b7db3", fontSize:10 }} />
                      <Tooltip contentStyle={{ background:"#0f1117", border:"1px solid #2563eb44", borderRadius:8, fontFamily:"monospace" }} labelStyle={{ color:"#e8eaf0", fontWeight:700 }} />
                      <Line type="monotone" dataKey="Total" stroke="#2563eb" strokeWidth={2.5} dot={{ fill:"#2563eb", r:4 }} activeDot={{ r:6 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                {(() => {
                  const totals = chartData.map(d => d.Total);
                  const avg = totals.reduce((a,b)=>a+b,0)/totals.length;
                  return (
                    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10 }}>
                      {[{label:"Medie",val:avg.toFixed(2),color:"#2563eb"},{label:"Max",val:Math.max(...totals).toFixed(2),color:"#ef4444"},{label:"Min",val:Math.min(...totals).toFixed(2),color:"#10b981"}].map(s=>(
                        <div key={s.label} style={{ background:"#1a1d2e", borderRadius:10, padding:12, textAlign:"center", border:`1px solid ${s.color}33` }}>
                          <div style={{ fontSize:11, color:"#6b7db3", marginBottom:4 }}>{s.label}</div>
                          <div style={{ fontSize:20, fontWeight:700, color:s.color }}>{s.val}</div>
                          <div style={{ fontSize:10, color:"#6b7db3" }}>m³</div>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </>
            )}
          </div>
        )}

        {/* ══ HISTORY ══ */}
        {view==="history" && (
          <div>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
              <div style={{ fontSize:13, color:"#6b7db3", letterSpacing:1 }}>ISTORIC CITIRI</div>
              <button onClick={downloadCSV} disabled={allMonths.length===0} style={{
                display:"flex", alignItems:"center", gap:6,
                background: allMonths.length===0 ? "#1a1d2e" : "linear-gradient(135deg,#059669,#047857)",
                border:"none", color: allMonths.length===0 ? "#4b5563" : "#fff",
                borderRadius:8, padding:"7px 14px", fontSize:12, fontWeight:700,
                fontFamily:"inherit", cursor: allMonths.length===0 ? "not-allowed":"pointer",
                boxShadow: allMonths.length===0 ? "none":"0 2px 10px rgba(5,150,105,.35)",
                transition:"all .2s",
              }}>
                ⬇ Export CSV
              </button>
            </div>
            {allMonths.length===0
              ? <div style={{ background:"#1a1d2e", borderRadius:14, padding:32, textAlign:"center", color:"#6b7db3" }}>Nu există citiri salvate.</div>
              : allMonths.map(m => {
                  const r = readings[m]; const c = getConsumption(m);
                  return (
                    <div key={m} style={{ background:"#1a1d2e", borderRadius:14, padding:16, marginBottom:12, border:"1px solid #2a2d3e" }}>
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
                        <div style={{ fontWeight:700, fontSize:16 }}>{formatMonth(m)}</div>
                        {c && <div style={{ background:"#2563eb22", color:"#2563eb", borderRadius:8, padding:"3px 10px", fontSize:13, fontWeight:700 }}>▲ {c.total.toFixed(3)} m³</div>}
                      </div>
                      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8 }}>
                        {Object.entries(counters).map(([key,counter]) => (
                          <div key={key} style={{ background:"#0f1117", borderRadius:8, padding:8, borderLeft:`3px solid ${counter.color}` }}>
                            <div style={{ fontSize:10, color:"#6b7db3", marginBottom:2 }}>{counter.name}</div>
                            <div style={{ fontSize:15, fontWeight:700, color:counter.color }}>{r[key]??'—'}</div>
                            {counter.serial && <div style={{ fontSize:10, color:"#4b5563", marginTop:1 }}>{counter.serial}</div>}
                            {c && <div style={{ fontSize:10, color:"#6b7db3", marginTop:2 }}>+{c[key].toFixed(2)} m³</div>}
                          </div>
                        ))}
                      </div>
                      <button onClick={() => { if (window.confirm(`Ștergi citirea pentru ${formatMonth(m)}?`)) setReadings(prev => { const n={...prev}; delete n[m]; return n; }); }} style={{ marginTop:10, background:"transparent", border:"1px solid #ef444433", color:"#ef4444", borderRadius:6, padding:"4px 10px", fontSize:11, cursor:"pointer", fontFamily:"inherit" }}>🗑 Șterge</button>
                    </div>
                  );
                })}
          </div>
        )}

        {/* ══ SETTINGS ══ */}
        {view==="settings" && (
          <div>
            <div style={{ fontSize:13, color:"#6b7db3", marginBottom:12, letterSpacing:1 }}>INFORMAȚII APARTAMENT</div>
            <div style={{ background:"#1a1d2e", borderRadius:14, padding:16, marginBottom:20 }}>
              {[{field:"ap",label:"Nr. Apartament"},{field:"proprietar",label:"Proprietar"},{field:"nrPers",label:"Nr. Persoane"}].map(({field,label}) => (
                <div key={field} style={{ marginBottom:14 }}>
                  <label style={{ fontSize:11, color:"#6b7db3", letterSpacing:2, textTransform:"uppercase" }}>{label}</label>
                  <input value={meta[field]} onChange={e => setMeta(m=>({...m,[field]:e.target.value}))} style={inp} />
                </div>
              ))}
            </div>

            <div style={{ fontSize:13, color:"#6b7db3", marginBottom:12, letterSpacing:1 }}>CONTOARE APĂ RECE</div>
            {Object.entries(counters).map(([key,counter]) => (
              <div key={key} style={{ background:"#1a1d2e", borderRadius:14, padding:16, marginBottom:12, borderLeft:`4px solid ${counter.color}` }}>
                <div style={{ fontWeight:700, color:counter.color, marginBottom:10 }}>{counter.name}</div>
                <label style={{ fontSize:11, color:"#6b7db3", letterSpacing:2, textTransform:"uppercase" }}>Număr Serie Contor</label>
                <input value={counter.serial} onChange={e => setCounters(prev=>({...prev,[key]:{...prev[key],serial:e.target.value}}))} placeholder="ex: ABC123456" style={{ ...inp, marginTop:6 }} />
              </div>
            ))}

            {/* ── Email recipients ── */}
            <div style={{ fontSize:13, color:"#0ea5e9", marginBottom:12, marginTop:8, letterSpacing:1, fontWeight:700 }}>✉️ DESTINATARI EMAIL</div>
            <div style={{ background:"#1a1d2e", borderRadius:14, padding:16, marginBottom:20, border:"1px solid #0ea5e933" }}>
              <p style={{ fontSize:12, color:"#6b7db3", margin:"0 0 14px", lineHeight:1.6 }}>
                Adresele de mai jos vor primi lunar raportul de consum formatat identic cu formularul fizic.
              </p>

              {/* Add row */}
              <div style={{ display:"flex", gap:8, marginBottom:6 }}>
                <input
                  type="email" value={newEmail} placeholder="adresa@email.com"
                  onChange={e => { setNewEmail(e.target.value); setEmailError(""); }}
                  onKeyDown={e => { if (e.key==="Enter") addEmail(); }}
                  style={{ ...inp, marginTop:0, flex:1, fontSize:14 }}
                />
                <button onClick={addEmail} style={{ background:"linear-gradient(135deg,#0ea5e9,#0369a1)", border:"none", color:"#fff", borderRadius:8, padding:"0 18px", fontSize:22, cursor:"pointer", flexShrink:0 }}>+</button>
              </div>
              {emailError && <div style={{ color:"#ef4444", fontSize:12, marginBottom:10 }}>{emailError}</div>}

              {/* List */}
              {emailList.length===0 ? (
                <div style={{ textAlign:"center", color:"#4b5563", fontSize:13, padding:"14px 0" }}>Nicio adresă adăugată</div>
              ) : (
                <div style={{ marginTop:10 }}>
                  {emailList.map((email,i) => (
                    <div key={i} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", background:"#0f1117", borderRadius:10, padding:"10px 14px", marginBottom:8, border:"1px solid #2a2d3e" }}>
                      <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                        <div style={{ width:30, height:30, borderRadius:"50%", background:"linear-gradient(135deg,#0ea5e9,#0369a1)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:13, color:"#fff", fontWeight:700, flexShrink:0 }}>
                          {email[0].toUpperCase()}
                        </div>
                        <span style={{ fontSize:13, color:"#e8eaf0", wordBreak:"break-all" }}>{email}</span>
                      </div>
                      <button onClick={() => setEmailList(prev=>prev.filter((_,j)=>j!==i))} style={{ background:"transparent", border:"none", color:"#ef4444", cursor:"pointer", fontSize:20, padding:"0 4px", lineHeight:1, flexShrink:0 }}>×</button>
                    </div>
                  ))}
                  <div style={{ fontSize:11, color:"#6b7db3", textAlign:"center", marginTop:6 }}>
                    {emailList.length} destinatar{emailList.length!==1?"i":""}
                  </div>
                </div>
              )}
            </div>

            {/* Danger */}
            <div style={{ padding:16, background:"#1a1d2e", borderRadius:14, border:"1px solid #ef444433" }}>
              <div style={{ fontSize:13, color:"#ef4444", marginBottom:10, fontWeight:700 }}>⚠️ Resetare Date</div>
              <button onClick={() => { if (window.confirm("Ești sigur? Toate citirile vor fi șterse!")) { setReadings({}); showToast("Date șterse.", "warn"); } }} style={{ background:"transparent", border:"1px solid #ef4444", color:"#ef4444", borderRadius:8, padding:"8px 16px", cursor:"pointer", fontFamily:"inherit", fontSize:13 }}>Șterge toate citirile</button>
            </div>
          </div>
        )}
      </div>

      {/* ── Email Preview Modal ── */}
      {previewOpen && emailPreviewHTML && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.88)", zIndex:200, display:"flex", alignItems:"center", justifyContent:"center", padding:12 }} onClick={() => setPreviewOpen(false)}>
          <div style={{ background:"#fff", borderRadius:16, maxWidth:580, width:"100%", maxHeight:"88vh", overflow:"auto", boxShadow:"0 20px 60px rgba(0,0,0,.6)" }} onClick={e => e.stopPropagation()}>
            <div style={{ background:"#1a1d2e", padding:"12px 16px", display:"flex", justifyContent:"space-between", alignItems:"center", borderRadius:"16px 16px 0 0", position:"sticky", top:0, zIndex:1 }}>
              <span style={{ color:"#e8eaf0", fontFamily:"monospace", fontSize:13, fontWeight:700 }}>👁 Previzualizare Email</span>
              <button onClick={() => setPreviewOpen(false)} style={{ background:"transparent", border:"none", color:"#94a3b8", cursor:"pointer", fontSize:24, lineHeight:1 }}>×</button>
            </div>
            <div dangerouslySetInnerHTML={{ __html: emailPreviewHTML }} />
          </div>
        </div>
      )}

      {/* ── Toast ── */}
      {toast && (
        <div style={{ position:"fixed", bottom:90, left:"50%", transform:"translateX(-50%)", background:toast.type==="ok"?"#10b981":toast.type==="err"?"#ef4444":"#f59e0b", color:"#fff", borderRadius:30, padding:"10px 24px", fontWeight:700, fontSize:13, fontFamily:"inherit", boxShadow:"0 4px 20px rgba(0,0,0,.4)", zIndex:300, animation:"fadeIn .2s ease", maxWidth:"90vw", textAlign:"center" }}>
          {toast.msg}
        </div>
      )}

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600;700&display=swap');
        * { box-sizing:border-box; }
        input[type=number]::-webkit-inner-spin-button { opacity:.5; }
        input[type=month]::-webkit-calendar-picker-indicator { filter:invert(1); opacity:.5; }
        @keyframes fadeIn { from{opacity:0;transform:translateX(-50%) translateY(10px)} to{opacity:1;transform:translateX(-50%) translateY(0)} }
        ::-webkit-scrollbar{width:4px;height:4px}
        ::-webkit-scrollbar-track{background:#0f1117}
        ::-webkit-scrollbar-thumb{background:#2563eb44;border-radius:2px}
      `}</style>
    </div>
  );
}
