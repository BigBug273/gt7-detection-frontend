const API = "https://benthonic-presumptuously-octavio.ngrok-free.dev";

let videoId = null;
let pollInterval = null;
let isProcessing = false;

const fileInput    = document.getElementById("fileInput");
const uploadLabel  = document.getElementById("uploadLabel");
const uploadText   = document.getElementById("uploadBtnText");
const analyzeBtn   = document.getElementById("analyzeBtn");
const stopBtn      = document.getElementById("stopBtn");

const videoFeed    = document.getElementById("videoFeed");

const videoOverlay = document.getElementById("videoOverlay");
const videoMeta    = document.getElementById("videoMeta");

const statusDot    = document.getElementById("statusDot");
const statusLabel  = document.getElementById("statusLabel");

const fpsEl        = document.getElementById("fps");
const confEl       = document.getElementById("avgConf");
const framesEl     = document.getElementById("frames");
const totalEl      = document.getElementById("totalDetections");

const progressFill = document.getElementById("progressFill");
const progressPct  = document.getElementById("progressPct");

const inViewEl     = document.getElementById("currentlyInView");
const historyEl    = document.getElementById("detectionHistory");


/* ───────── FILE UPLOAD ───────── */

fileInput.addEventListener("change", async (e) => {

  const file = e.target.files[0];
  if (!file) return;

  uploadText.textContent = "UPLOADING…";
  uploadLabel.style.opacity = ".6";

  try {

    const fd = new FormData();
    fd.append("video", file);

    const res  = await fetch(`${API}/upload`, { method: "POST", body: fd });
    const data = await res.json();

    if (!data.success) throw new Error(data.detail || "Upload failed");

    videoId = data.videoId;

    videoFeed.src = URL.createObjectURL(file);

    videoOverlay.classList.add("hidden");

    videoMeta.textContent =
      `▸ ${file.name} (${(file.size/1024/1024).toFixed(1)} MB)`;

    analyzeBtn.disabled = false;
    uploadText.textContent = "CHANGE FEED";

    setStatus("standby","VIDEO LOADED");

  }
  catch(err){

    console.error(err);
    uploadText.textContent = "UPLOAD FEED";
    alert("Upload failed: " + err.message);

  }
  finally{

    uploadLabel.style.opacity = "1";
    fileInput.value = "";

  }

});


/* ───────── ANALYZE ───────── */

analyzeBtn.addEventListener("click", async () => {

  if (!videoId) return;

  analyzeBtn.disabled = true;
  stopBtn.disabled = false;

  isProcessing = true;

  setStatus("processing","PROCESSING");

  try {

    await fetch(`${API}/process?videoId=${videoId}`);

    videoFeed.src = "";
    videoFeed.src = `${API}/stream?videoId=${videoId}`;

    startPolling();

  }
  catch(err){

    console.error(err);
    resetState();

    alert("Failed to start analysis: " + err.message);

  }

});


/* ───────── STOP ───────── */

stopBtn.addEventListener("click", async () => {

  if (!videoId) return;

  try{

    await fetch(`${API}/stop`,{
      method:"POST",
      headers:{
        "Content-Type":"application/json"
      },
      body:JSON.stringify({ videoId })
    });

    stopPolling();

    stopBtn.disabled = true;
    analyzeBtn.disabled = false;

    videoFeed.src = "";

    setStatus("standby","ABORTED");

  }
  catch(err){

    console.error(err);

  }

});


/* ───────── POLLING ───────── */

function startPolling(){

  stopPolling();

  pollInterval = setInterval(fetchStats,2000);

  fetchStats();

}

function stopPolling(){

  if(pollInterval){
    clearInterval(pollInterval);
    pollInterval = null;
  }

}


async function fetchStats(){

  if(!videoId) return;

  try{

    const res = await fetch(`${API}/stats?videoId=${videoId}`);

    const text = await res.text();

    let data;

    try{
      data = JSON.parse(text);
    }
    catch(e){
      console.error("Server returned non-JSON:", text);
      return;
    }

    updateDashboard(data);

    if(data.status === "completed" || data.status === "stopped"){

      stopPolling();

      stopBtn.disabled = true;
      analyzeBtn.disabled = false;

      isProcessing = false;

      if(data.status === "completed"){

        setStatus("active","ANALYSIS COMPLETE");

        videoMeta.textContent =
          "✔ Processing finished";

      }
      else{

        setStatus("standby","ABORTED");

      }

    }

  }
  catch(err){

    console.error("Poll error:",err);

  }

}


/* ───────── DASHBOARD UPDATE ───────── */

function updateDashboard(data){

  fpsEl.textContent      = data.fps ?? 0;
  confEl.textContent     = (data.avgConf ?? 0).toFixed(1);
  framesEl.textContent   = (data.frames ?? 0).toLocaleString();
  totalEl.textContent    = (data.totalDetections ?? 0).toLocaleString();

  const pct = data.progress ?? 0;

  progressFill.style.width = pct + "%";
  progressPct.textContent = Math.round(pct) + "%";

  renderInView(data.currentView || {});
  renderHistory(data.history || {});

}


/* ───────── CURRENTLY IN VIEW ───────── */

function renderInView(history){

  const entries = Object.entries(history)
    .sort((a,b)=>b[1]-a[1]);

  if(entries.length === 0){

    inViewEl.innerHTML =
      `<div class="awaiting">
        AWAITING CLASSIFICATION DATA
      </div>`;

    return;

  }

  inViewEl.innerHTML = entries.map(([car,count])=>`

    <div class="car-badge">
      ${car}
      <span class="car-badge-count">${count}</span>
    </div>

  `).join("");

}


/* ───────── HISTORY ───────── */

function renderHistory(history){

  const entries = Object.entries(history)
    .sort((a,b)=>b[1]-a[1]);

  if(entries.length === 0){

    historyEl.innerHTML =
      `<div class="awaiting">
        NO DETECTION DATA YET
      </div>`;

    return;

  }

  const max = entries[0][1];

  historyEl.innerHTML = entries.map(([car,count])=>{

    const pct = max > 0
      ? Math.round((count/max)*100)
      : 0;

    return `

    <div class="det-bar-row">

      <div class="det-bar-label">${car}</div>

      <div class="det-bar-track">
        <div class="det-bar-fill"
        style="width:${pct}%"></div>
      </div>

      <div class="det-bar-count">${count}</div>

    </div>

    `;

  }).join("");

}


/* ───────── STATUS HELPERS ───────── */

function setStatus(type,label){

  statusLabel.textContent = label;

  statusDot.className = "status-dot";

  if(type==="active")
    statusDot.classList.add("active");

  if(type==="processing")
    statusDot.classList.add("processing");

}


function resetState(){

  stopPolling();

  analyzeBtn.disabled = false;
  stopBtn.disabled = true;

  videoFeed.src = "";

  setStatus("","SYSTEM STANDBY");

}
