// ==================== CONFIG ====================
// ⚠️ 如地图无法显示，请前往 https://console.amap.com/dev/key/app 申请 Key
//    并获取对应的「安全密钥」(securityJsCode)，两者缺一不可
const AMAP_KEY = 'edcfe3fb51d8317d6b70bdca00d27060';
const AMAP_SECURITY_CODE = '46fa8406849728411d7387d3d1a9a6bb';  // ← 请填写你申请的安全密钥

// 北京科技大学天津学院 中心坐标 (GCJ-02)
// 地址: 天津市宝坻区京津新城珠江北环东路1号
const CAMPUS_CENTER = [117.3956, 39.5456];

// ==================== CONSTANTS ====================
// Realistic patrol robot — ~20km range, 6-8h battery at 1-2 m/s
const CAR_SPEED_MS = 2.5;               
const BATTERY_FULL = 100;                
const BATTERY_DRAIN_PER_METER = 0.002;   
const BATTERY_DRAIN_PER_WAYPOINT = 0.15;  
const SPEED_DISP_MS = 500;               
const BATT_DISP_MS = 2000;              
let lastSpeedDisp = 0;
let lastBattDisp = 0;
let sensorInterval = null;
let connectMode = false;
let sensorTemp = 24.5;
let sensorHumid = 52;
let sensorGas = 0.3;
let sensorNoise = 48;

// ==================== GPS COMMUNICATION STATE ====================
let gpsConnected = false;          
let gpsCarLat = null;            
let gpsCarLng = null;             
let gpsTargetLat = null;         
let gpsTargetLng = null;         
let gpsReceiveCount = 0;          
let gpsSendCount = 0;             
let gpsReceiveInterval = null;    
let gpsTargetMarker = null;       
let gpsCarGpsMarker = null;      
let gpsMockIndex = 0;             

// ==================== STATE ====================
let map = null;
let carMarker = null;
let pathPolyline = null;
let trajectoryPolyline = null;
let pathPoints = [];
let traveledPath = [];
let currentMode = 'free';
let selectedRoute = null;
let isRunning = false;
let animFrameId = null;
let currentPathIndex = 0;
let currentSegmentProgress = 0;
let totalProgress = 0;
let batteryLevel = BATTERY_FULL;
let currentSpeed = 0;
let checkpointCount = 0;
let totalCheckpoints = 0;
let clickMarkers = [];
let etaSeconds = 0;
let etaInterval = null;
let lastTimestamp = 0;
let trajectoryDirty = false;
let trajectoryUpdateCounter = 0;

// ==================== DOM REFS ====================
const $time = document.getElementById('time');
const $date = document.getElementById('date');
const $btnStart = document.getElementById('btnStart');
const $btnStop = document.getElementById('btnStop');
const $btnReset = document.getElementById('btnReset');
const $progressBar = document.getElementById('progressBar');
const $progressPercent = document.getElementById('progressPercent');
const $progressDetail = document.getElementById('progressDetail');
const $progressETA = document.getElementById('progressETA');
const $batteryValue = document.getElementById('batteryValue');
const $speedValue = document.getElementById('speedValue');
const $checkpointValue = document.getElementById('checkpointValue');
const $logBox = document.getElementById('logBox');
const $mapOverlay = document.getElementById('mapOverlay');
const $sensorTemp = document.getElementById('sensorTemp');
const $sensorHumid = document.getElementById('sensorHumid');
const $sensorGas = document.getElementById('sensorGas');
const $sensorNoise = document.getElementById('sensorNoise');
const $cmdInput = document.getElementById('cmdInput');
const $cmdBtn   = document.getElementById('cmdBtn');
const $micBtn   = document.getElementById('micBtn');
const $cmdHint  = document.getElementById('cmdHint');
const $btnConnect = document.getElementById('btnConnect');
const $voiceDialog = document.getElementById('voiceDialog');
const $voiceDialogText = document.getElementById('voiceDialogText');
const $gpsConnDot = document.getElementById('gpsConnDot');
const $gpsConnText = document.getElementById('gpsConnText');
const $gpsConnCount = document.getElementById('gpsConnCount');
const $gpsCarLat = document.getElementById('gpsCarLat');
const $gpsCarLng = document.getElementById('gpsCarLng');
const $gpsTargetLat = document.getElementById('gpsTargetLat');
const $gpsTargetLng = document.getElementById('gpsTargetLng');
const $gpsSendBtn = document.getElementById('gpsSendBtn');
const $gpsSendStatus = document.getElementById('gpsSendStatus');

// ==================== INIT ====================
function init() {
  updateDateTime();
  setInterval(updateDateTime, 1000);
  bindEvents();
  log('正在加载高德地图...');

  // ===== 高德地图安全密钥配置 (必须在加载脚本前设置) =====
  // 2021-12-02 之后申请的 Key 必须配合安全密钥使用
  // 获取方式: AMap 控制台 → 应用管理 → 查看 Key → 安全密钥
  if (AMAP_SECURITY_CODE) {
    window._AMapSecurityConfig = {
      securityJsCode: AMAP_SECURITY_CODE,
    };
  } else {
    console.warn('[AMap] 未配置安全密钥 (AMAP_SECURITY_CODE)，新版 Key 将无法加载地图');
    console.warn('[AMap] 请在 app.js 顶部填写 AMAP_SECURITY_CODE，或前往 console.amap.com 获取');
  }

  // 动态加载 AMap JS API
  const script = document.createElement('script');
  script.src = `https://webapi.amap.com/maps?v=2.0&key=${AMAP_KEY}`;
  script.onload = function() {
    console.log('[AMap] SDK 脚本加载成功');
    initMap();
    log('系统就绪，等待指令...');
  };
  script.onerror = function(e) {
    console.error('[AMap] SDK 脚本加载失败', e);
    log('❌ 地图加载失败，请检查 API Key 和安全密钥', 'error');
    document.getElementById('map').innerHTML = `
      <div style="display:flex;align-items:center;justify-content:center;height:100%;color:#1C1B1F;flex-direction:column;gap:16px;background:#FFFBFE;font-family:'Roboto','Noto Sans SC',sans-serif;">
        <div style="font-size:56px;opacity:0.4;">🗺️</div>
        <div style="font-size:18px;font-weight:500;background:#E8DEF8;padding:6px 20px;border-radius:24px;color:#1D192B;">地图加载失败</div>
        <div style="font-size:14px;text-align:center;line-height:1.8;background:#F3EDF7;border-radius:24px;padding:16px 24px;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
          请确认 <b style="color:#6750A4;">AMAP_KEY</b> 和 <b style="color:#6750A4;">AMAP_SECURITY_CODE</b> 已正确配置<br>
          申请地址: <a href="https://console.amap.com/dev/key/app" target="_blank" style="color:#6750A4;font-weight:500;">console.amap.com/dev/key/app</a><br>
          <span style="font-size:12px;color:#79747E;">控制台 → 应用管理 → 点击 Key → 查看安全密钥</span>
        </div>
      </div>`;
  };
  document.head.appendChild(script);
}

// ==================== DATE / TIME ====================
function updateDateTime() {
  const now = new Date();
  const h = String(now.getHours()).padStart(2,'0');
  const m = String(now.getMinutes()).padStart(2,'0');
  const s = String(now.getSeconds()).padStart(2,'0');
  $time.textContent = `${h}:${m}:${s}`;

  const days = ['日','一','二','三','四','五','六'];
  const y = now.getFullYear();
  const mo = String(now.getMonth()+1).padStart(2,'0');
  const d = String(now.getDate()).padStart(2,'0');
  const wd = days[now.getDay()];
  $date.innerHTML = `${y}年${mo}月${d}日<br>星期${wd}`;
}

// ==================== MAP ====================
function initMap() {
  console.log('[AMap] initMap 开始, AMap 类型:', typeof AMap);
  if (typeof AMap === 'undefined') {
    console.error('[AMap] SDK 未加载, AMap 为 undefined');
    log('❌ 高德地图 SDK 未加载', 'error');
    return;
  }
  const mapDiv = document.getElementById('map');
  console.log('[AMap] map div 尺寸:', mapDiv.offsetWidth, 'x', mapDiv.offsetHeight);
  try {
    map = new AMap.Map('map', {
      center: CAMPUS_CENTER,
      zoom: 18,
      mapStyle: 'amap://styles/light',
      features: ['bg','road','building','point'],
    });
    console.log('[AMap] 地图对象创建成功');
  } catch (e) {
    console.error('[AMap] 地图初始化异常:', e);
    log('❌ 地图初始化失败: ' + e.message, 'error');
    return;
  }

  // Click to add waypoint in free mode
  map.on('click', function(e) {
    if (currentMode !== 'free' || isRunning) return;
    addWaypoint([e.lnglat.getLng(), e.lnglat.getLat()]);
  });
}

// ==================== WAYPOINTS ====================
function addWaypoint(coord) {
  pathPoints.push(coord);
  const idx = pathPoints.length;

  // Add click marker
  const marker = new AMap.Marker({
    position: coord,
    content: `<div style="
      width:24px; height:24px;
      border-radius:50%;
      background:#6750A4;
      border:2px solid #FFFBFE;
      color:#fff; font-size:11px; font-weight:500;
      font-family:'Roboto',sans-serif;
      display:flex; align-items:center; justify-content:center;
      box-shadow:0 2px 6px rgba(0,0,0,0.2);
    ">${idx}</div>`,
    offset: new AMap.Pixel(-11, -11),
  });
  clickMarkers.push(marker);
  map.add(marker);

  updatePathPolyline();
  totalCheckpoints = pathPoints.length;
  $checkpointValue.textContent = `0/${totalCheckpoints}`;
  const coordStr = `[${coord[0].toFixed(5)}, ${coord[1].toFixed(5)}]`;
  log(`添加路径点 #${idx}: ${coordStr}`);
  $cmdHint.textContent = `📍 路径点 #${idx}: ${coordStr}`;
  showMapHint(`📍 #${idx} ${coordStr}`);
}

function updatePathPolyline() {
  if (pathPolyline) { map.remove(pathPolyline); }
  if (pathPoints.length < 2) return;

  pathPolyline = new AMap.Polyline({
    path: pathPoints,
    strokeColor: '#6750A4',
    strokeWeight: 5,
    strokeOpacity: 0.75,
    lineJoin: 'round',
    lineCap: 'round',
    strokeStyle: 'solid',
    showDir: true,
    dirColor: '#6750A4',
  });
  map.add(pathPolyline);
}

function updateTrajectory() {
  if (trajectoryPolyline) { map.remove(trajectoryPolyline); }
  if (traveledPath.length < 2) return;

  trajectoryPolyline = new AMap.Polyline({
    path: traveledPath,
    strokeColor: '#2E7D32',
    strokeWeight: 6,
    strokeOpacity: 0.85,
    lineJoin: 'round',
    lineCap: 'round',
    strokeStyle: 'solid',
  });
  map.add(trajectoryPolyline);
}

// ==================== CAR MARKER ====================
function createCarMarker(position) {
  if (carMarker) { map.remove(carMarker); }
  carMarker = new AMap.Marker({
    position: position || CAMPUS_CENTER,
    content: `<div id="carIcon" style="
      width:48px; height:48px; position:relative;
      transform:rotate(0deg); transition:transform 0.15s ease;
    ">
      <div style="position:absolute;top:-6px;left:50%;transform:translateX(-50%);
        width:3px;height:8px;background:#FFD54F;border-radius:2px;"></div>
      <div style="position:absolute;top:-9px;left:50%;transform:translateX(-50%);
        width:6px;height:6px;background:#FF5252;border-radius:50%;box-shadow:0 0 4px #FF5252;"></div>
      <div style="width:48px;height:36px;background:linear-gradient(180deg,#37474F,#263238);
        border-radius:10px 10px 6px 6px;border:3px solid #FFFBFE;position:relative;
        box-shadow:0 4px 12px rgba(0,0,0,0.4);">
        <div style="position:absolute;top:6px;left:50%;transform:translateX(-50%);
          width:18px;height:6px;background:#00E5FF;border-radius:3px;
          box-shadow:0 0 6px #00E5FF80;"></div>
        <div style="position:absolute;bottom:3px;left:8px;
          width:6px;height:6px;background:#FF5252;border-radius:50%;"></div>
        <div style="position:absolute;bottom:3px;right:8px;
          width:6px;height:6px;background:#00E676;border-radius:50%;"></div>
      </div>
      <div style="display:flex;justify-content:space-between;padding:0 6px;margin-top:2px;">
        <div style="width:14px;height:7px;background:#546E7A;border-radius:3px;border:2px solid #FFFBFE;"></div>
        <div style="width:14px;height:7px;background:#546E7A;border-radius:3px;border:2px solid #FFFBFE;"></div>
      </div>
    </div>`,
    offset: new AMap.Pixel(-20, -20),
    zIndex: 200,
    autoRotation: false,
  });
  map.add(carMarker);
}

// ==================== PATH INTERPOLATION ====================
function getBearing(p1, p2) {
  const dLng = p2[0] - p1[0];
  const dLat = p2[1] - p1[1];
  const angle = Math.atan2(dLng, dLat) * (180 / Math.PI);
  return angle;
}

function interpolate(p1, p2, t) {
  return [
    p1[0] + (p2[0] - p1[0]) * t,
    p1[1] + (p2[1] - p1[1]) * t,
  ];
}

function distance(p1, p2) {
  const dx = (p2[0] - p1[0]) * 111320 * Math.cos((p1[1] * Math.PI) / 180);
  const dy = (p2[1] - p1[1]) * 110540;
  return Math.sqrt(dx * dx + dy * dy);
}

function totalPathDistance() {
  let d = 0;
  for (let i = 1; i < pathPoints.length; i++) {
    d += distance(pathPoints[i-1], pathPoints[i]);
  }
  return d;
}

// ==================== ANIMATION ====================
function startInspection() {
  if (pathPoints.length < 2) {
    log('⚠️ 请至少设置 2 个路径点', 'warn');
    showMapHint('请先在地图上添加路径点，至少 2 个后再开始');
    return;
  }
  if (batteryLevel <= 5) {
    log('🔋 电量过低，无法启动巡检', 'error');
    return;
  }

  // 检测是否从停止点恢复 (而非首次启动或已完成)
  const isResuming = carMarker
    && (currentPathIndex > 0 || currentSegmentProgress > 0)
    && currentPathIndex < pathPoints.length - 1;

  totalCheckpoints = pathPoints.length;

  if (isResuming) {
    // 从停止点恢复 — 保留当前位置和进度
    log(`📍 从停止点恢复 · 点位 #${currentPathIndex + 1} / ${totalCheckpoints}`);
    $checkpointValue.textContent = `${checkpointCount}/${totalCheckpoints}`;
    // 确保 traveledPath 末尾跟 carMarker 位置同步
    const cp = carMarker.getPosition();
    traveledPath[traveledPath.length - 1] = [cp.getLng(), cp.getLat()];
  } else {
    // 首次启动 / 已完成重新开始
    currentPathIndex = 0;
    currentSegmentProgress = 0;
    totalProgress = 0;
    traveledPath = [pathPoints[0]];
    checkpointCount = 0;
    $checkpointValue.textContent = `0/${totalCheckpoints}`;

    if (!carMarker) {
      createCarMarker(pathPoints[0]);
    } else {
      carMarker.setPosition(pathPoints[0]);
    }
  }

  isRunning = true;
  lastTimestamp = 0;
  trajectoryDirty = false;
  trajectoryUpdateCounter = 0;
  lastSpeedDisp = 0;
  lastBattDisp = 0;

  // Draw trajectory (已有 traveledPath 则恢复显示)
  updateTrajectory();
  updateUIForRunning();
  $progressDetail.textContent = '巡检进行中...';

  // Calculate ETA — 剩余距离
  let remainDist = 0;
  for (let i = currentPathIndex; i < pathPoints.length - 1; i++) {
    remainDist += distance(pathPoints[i], pathPoints[i + 1]);
  }
  // 减去当前段已走过的比例
  remainDist -= currentSegmentProgress * distance(
    pathPoints[currentPathIndex], pathPoints[currentPathIndex + 1]
  );
  etaSeconds = Math.round(remainDist / CAR_SPEED_MS);
  updateETA();
  etaInterval = setInterval(updateETA, 1000);

  log('🚀 巡检任务启动');
  log(`📍 共 ${pathPoints.length} 个点位 · 剩余 ${remainDist.toFixed(0)}m · 预计 ${formatSeconds(etaSeconds)}`);

  // Start sensors
  sensorInterval = setInterval(updateSensors, 1500);
  updateSensors();

  animFrameId = requestAnimationFrame(animate);
}

function stopInspection() {
  isRunning = false;
  if (animFrameId) { cancelAnimationFrame(animFrameId); animFrameId = null; }
  if (etaInterval) { clearInterval(etaInterval); etaInterval = null; }
  if (sensorInterval) { clearInterval(sensorInterval); sensorInterval = null; }
  $progressDetail.textContent = '巡检已暂停';
  $progressETA.textContent = '';
  currentSpeed = 0;
  $speedValue.textContent = '0.0 m/s';
  updateUIForStopped();
  log('⏸️ 巡检已停止', 'warn');
}

function resetAll() {
  stopInspection();
  connectMode = false;
  $btnConnect.classList.remove('active');
  $btnConnect.textContent = '🔌 连接小车';
  pathPoints = [];
  traveledPath = [];
  currentPathIndex = 0;
  currentSegmentProgress = 0;
  totalProgress = 0;
  checkpointCount = 0;
  totalCheckpoints = 0;
  selectedRoute = null;
  etaSeconds = 0;

  // Clear map elements
  if (pathPolyline) { map.remove(pathPolyline); pathPolyline = null; }
  if (trajectoryPolyline) { map.remove(trajectoryPolyline); trajectoryPolyline = null; }
  if (carMarker) { map.remove(carMarker); carMarker = null; }
  if (gpsTargetMarker) { map.remove(gpsTargetMarker); gpsTargetMarker = null; }
  if (gpsCarGpsMarker) { map.remove(gpsCarGpsMarker); gpsCarGpsMarker = null; }
  clickMarkers.forEach(m => map.remove(m));
  clickMarkers = [];

  // Reset GPS state (保持连接，仅清空数据)
  gpsTargetLat = null;
  gpsTargetLng = null;
  gpsCarLat = null;
  gpsCarLng = null;
  $gpsCarLat.textContent = '--';
  $gpsCarLng.textContent = '--';
  $gpsTargetLat.value = '';
  $gpsTargetLng.value = '';
  $gpsSendStatus.textContent = '';

  // Reset UI
  $progressBar.style.width = '0%';
  $progressPercent.textContent = '0%';
  $progressDetail.textContent = '等待开始...';
  $progressETA.textContent = '';
  $checkpointValue.textContent = '0/0';
  $speedValue.textContent = '0.0 m/s';
  currentSpeed = 0;
  batteryLevel = BATTERY_FULL;
  updateBatteryDisplay();
 // $route1Btn.classList.remove('selected');
  $route2Btn.classList.remove('selected');
  updateUIForStopped();
  log('🔄 已重置所有状态');
}

function animate(timestamp) {
  if (!isRunning) { console.log('[animate] stopped, isRunning=false'); return; }
  if (currentPathIndex >= pathPoints.length - 1) {
    console.log('[animate] path complete');
    finishInspection();
    return;
  }

  // ---- delta-time (cap at 100ms to avoid jumps on tab-switch) ----
  if (!lastTimestamp) lastTimestamp = timestamp;
  const dt = Math.min((timestamp - lastTimestamp) / 1000, 0.1);
  lastTimestamp = timestamp;

  const p1 = pathPoints[currentPathIndex];
  const p2 = pathPoints[currentPathIndex + 1];
  const segDist = distance(p1, p2);   // meters

  if (segDist < 0.01) {
    currentSegmentProgress = 0;
    currentPathIndex++;
    checkpointCount++;
    checkpointReached(p2);
    animFrameId = requestAnimationFrame(animate);
    return;
  }

  // ---- smooth speed ----
  const targetSpeed = CAR_SPEED_MS;
  currentSpeed += (targetSpeed - currentSpeed) * Math.min(dt * 4, 1);

  // ---- advance along segment ----
  const moveDist = currentSpeed * dt;
  const step = moveDist / segDist;
  currentSegmentProgress += step;

  if (currentPathIndex === 0 && currentSegmentProgress < 0.02) {
    console.log('[animate] moving, step=' + step.toFixed(6) + ' dt=' + dt.toFixed(3) + ' dist=' + segDist.toFixed(1));
  }

  // ---- update car position ----
  const clampedT = Math.min(currentSegmentProgress, 1);
  const currentPos = interpolate(p1, p2, clampedT);
  const bearing = getBearing(p1, p2);

  carMarker.setPosition(currentPos);
  const carIcon = document.getElementById('carIcon');
  if (carIcon) {
    carIcon.style.transform = `rotate(${bearing}deg)`;
  }
  // ---- update traveled path (last point follows car) ----
  traveledPath[traveledPath.length - 1] = [currentPos[0], currentPos[1]];
  trajectoryDirty = true;
  trajectoryUpdateCounter++;

  // Redraw trajectory every 3 frames to avoid thrashing the polyline
  if (trajectoryDirty && traveledPath.length >= 2 && trajectoryUpdateCounter >= 3) {
    trajectoryUpdateCounter = 0;
    trajectoryDirty = false;
    updateTrajectory();
  }

  // ---- battery drain (throttled display) ----
  batteryLevel = Math.max(0, batteryLevel - (moveDist * BATTERY_DRAIN_PER_METER));
  if (timestamp - lastBattDisp > BATT_DISP_MS) {
    lastBattDisp = timestamp;
    updateBatteryDisplay();
  }

  if (batteryLevel <= 5) {
    log('🔋 电量不足，自动停止', 'error');
    stopInspection();
    return;
  }

  // ---- waypoint reached? ----
  if (currentSegmentProgress >= 1) {
    currentSegmentProgress = 0;
    currentPathIndex++;
    checkpointCount++;
    checkpointReached(p2);

    if (currentPathIndex >= pathPoints.length - 1) {
      finishInspection();
      return;
    }
  }

  // ---- UI updates (throttle speed display) ----
  const completedSegments = currentPathIndex;
  const totalSegments = pathPoints.length - 1;
  totalProgress = ((completedSegments + Math.min(currentSegmentProgress, 1)) / totalSegments) * 100;
  $progressBar.style.width = totalProgress + '%';
  $progressPercent.textContent = Math.round(totalProgress) + '%';
  if (timestamp - lastSpeedDisp > SPEED_DISP_MS) {
    lastSpeedDisp = timestamp;
    $speedValue.textContent = currentSpeed.toFixed(1) + ' m/s';
  }

  animFrameId = requestAnimationFrame(animate);
}

function checkpointReached(pos) {
  $checkpointValue.textContent = `${checkpointCount}/${totalCheckpoints}`;
  log(`✅ 到达点位 #${checkpointCount}`);
  batteryLevel = Math.max(0, batteryLevel - BATTERY_DRAIN_PER_WAYPOINT);
  updateBatteryDisplay();
  traveledPath.push([pos[0], pos[1]]);
  trajectoryDirty = true;
  updateTrajectory();
}

function finishInspection() {
  isRunning = false;
  if (animFrameId) { cancelAnimationFrame(animFrameId); animFrameId = null; }
  if (etaInterval) { clearInterval(etaInterval); etaInterval = null; }
  if (sensorInterval) { clearInterval(sensorInterval); sensorInterval = null; }
  currentSpeed = 0;
  $speedValue.textContent = '0.0 m/s';
  $progressBar.style.width = '100%';
  $progressPercent.textContent = '100%';
  $progressDetail.textContent = '✅ 巡检完成';
  $progressETA.textContent = '';
  updateUIForStopped();
  log('🎉 巡检任务完成！所有点位已覆盖');
  log(`📊 本次巡检数据: 距离 ${totalPathDistance().toFixed(0)}m | 电量消耗 ${(BATTERY_FULL - batteryLevel).toFixed(1)}%`);
}

function updateETA() {
  if (!isRunning || etaSeconds <= 0) return;
  etaSeconds = Math.max(0, etaSeconds - 1);
  $progressETA.textContent = '⏱ 预计剩余: ' + formatSeconds(etaSeconds);
}

function formatSeconds(s) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return m > 0 ? `${m}分${sec}秒` : `${sec}秒`;
}

// ==================== GPS COMMUNICATION ====================
function gpsConnect() {
  if (gpsConnected) return;

  setTimeout(() => {
    gpsConnected = true;
    gpsReceiveCount = 0;
    gpsSendCount = 0;
    updateGpsConnectionUI();
    log('📡 GPS 通信已连接');

    gpsReceiveInterval = setInterval(gpsSimulateReceive, 2000);
    gpsSimulateReceive(); 
  }, 300);

  $gpsConnText.textContent = '连接中...';
  $gpsConnDot.className = 'gps-conn-dot';
}

/**
 * 断开小车 GPS 通信
 */
function gpsDisconnect() {
  if (!gpsConnected) return;
  gpsConnected = false;
  if (gpsReceiveInterval) { clearInterval(gpsReceiveInterval); gpsReceiveInterval = null; }
  updateGpsConnectionUI();
  log('📡 GPS 通信已断开', 'warn');
}

function gpsSimulateReceive() {
  let lat, lng;

  if (isRunning && carMarker) {
    // 小车运行中: 取动画位置 + GPS 噪声 (~1-3米 ≈ 0.00001-0.00003°)
    const pos = carMarker.getPosition();
    lng = pos.getLng() + (Math.random() - 0.5) * 0.00003;
    lat = pos.getLat() + (Math.random() - 0.5) * 0.00003;
  } else if (pathPoints.length > 0) {
    // 有待命路径: 在起点附近漂移
    const p = pathPoints[0];
    lng = p[0] + (Math.random() - 0.5) * 0.00002;
    lat = p[1] + (Math.random() - 0.5) * 0.00002;
  } else if (carMarker) {
    // 有 carMarker 但无路径
    const pos = carMarker.getPosition();
    lng = pos.getLng() + (Math.random() - 0.5) * 0.00001;
    lat = pos.getLat() + (Math.random() - 0.5) * 0.00001;
  } else {
    // 默认: 校园中心附近
    lng = CAMPUS_CENTER[0] + (Math.random() - 0.5) * 0.0002;
    lat = CAMPUS_CENTER[1] + (Math.random() - 0.5) * 0.0002;
  }

  gpsHandleReceive(lat, lng);
}

/**
 * 处理接收到的小车 GPS 数据
 * @param {number} lat - 纬度
 * @param {number} lng - 经度
 * @param {object} extra - 额外数据 (speed, heading, battery 等，可选)
 */
function gpsHandleReceive(lat, lng, extra) {
  gpsCarLat = lat;
  gpsCarLng = lng;
  gpsReceiveCount++;

  // 更新 GPS 面板显示
  $gpsCarLat.textContent = lat.toFixed(6);
  $gpsCarLng.textContent = lng.toFixed(6);
  updateGpsConnectionUI();

  // 更新地图上的 GPS 标记点 (绿色小圆点，区别于小车动画标记)
  if (!gpsCarGpsMarker && map) {
    gpsCarGpsMarker = new AMap.Marker({
      position: [lng, lat],
      content: `<div style="width:12px;height:12px;border-radius:50%;background:#00E676;border:2px solid #FFF;box-shadow:0 0 8px rgba(0,230,118,0.6);"></div>`,
      offset: new AMap.Pixel(-6, -6),
      zIndex: 150,
    });
    map.add(gpsCarGpsMarker);
  } else if (gpsCarGpsMarker) {
    gpsCarGpsMarker.setPosition([lng, lat]);
  }

  // 如果有额外数据 (实际小车可能上报速度、朝向、电量等)，在此处理
  if (extra) {
    if (extra.speed !== undefined) {
      // 可用于校准速度显示
    }
    if (extra.battery !== undefined) {
      // 可用于更新真实电量
    }
  }
}

function gpsSendTarget() {
  const latStr = $gpsTargetLat.value.trim();
  const lngStr = $gpsTargetLng.value.trim();

  if (!latStr || !lngStr) {
    $gpsSendStatus.textContent = '⚠️ 请输入完整的目标经纬度';
    $gpsSendStatus.style.color = '#B3261E';
    return;
  }

  const lat = parseFloat(latStr);
  const lng = parseFloat(lngStr);

  if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    $gpsSendStatus.textContent = '⚠️ 经纬度格式无效';
    $gpsSendStatus.style.color = '#B3261E';
    return;
  }

  gpsTargetLat = lat;
  gpsTargetLng = lng;
  gpsSendCount++;

  // ============================================================
  $gpsSendStatus.textContent = '📤 正在发送目标坐标...';
  $gpsSendStatus.style.color = 'var(--md-primary)';
  $gpsSendBtn.disabled = true;

  setTimeout(() => {
    $gpsSendStatus.textContent = `✅ 目标已发送 (${lat.toFixed(6)}, ${lng.toFixed(6)})`;
    $gpsSendStatus.style.color = '#2E7D32';
    $gpsSendBtn.disabled = false;

    // 在地图上放置目标标记
    placeTargetMarker(lat, lng);

    // 记录日志
    log(`🎯 目标已发送 → 小车: [${lng.toFixed(5)}, ${lat.toFixed(5)}]`);

    setTimeout(() => {
      log('✅ 小车已收到目标坐标');
    }, 800);
  }, 600);
}

/**
 * 在地图上放置目标地点标记
 */
function placeTargetMarker(lat, lng) {
  if (gpsTargetMarker) { map.remove(gpsTargetMarker); }
  gpsTargetMarker = new AMap.Marker({
    position: [lng, lat],
    content: `<div style="
      width: 28px; height: 28px;
      background: #FF5252;
      border: 3px solid #FFF;
      border-radius: 50% 50% 50% 0;
      transform: rotate(-45deg);
      box-shadow: 0 3px 12px rgba(255,82,82,0.5);
      display: flex; align-items: center; justify-content: center;
    "><div style="width:8px;height:8px;background:#FFF;border-radius:50%;"></div></div>`,
    offset: new AMap.Pixel(-10, -28),
    zIndex: 250,
  });
  map.add(gpsTargetMarker);
  // 地图视野包含目标
  map.setFitView([gpsTargetMarker.getPosition()], false, [100, 80, 100, 80]);
  showMapHint('🎯 目标地点已标记');
}

/**
 * 更新 GPS 通信面板 UI
 */
function updateGpsConnectionUI() {
  if (gpsConnected) {
    $gpsConnDot.className = 'gps-conn-dot connected';
    $gpsConnText.textContent = '已连接';
    $gpsConnCount.textContent = `收:${gpsReceiveCount} 发:${gpsSendCount}`;
  } else {
    $gpsConnDot.className = 'gps-conn-dot disconnected';
    $gpsConnText.textContent = '未连接';
    $gpsConnCount.textContent = '';
  }
}

// ==================== UI HELPERS ====================
// ==================== SENSOR SIMULATION ====================
function updateSensors() {
  // Slowly drift sensor values with small random walks
  sensorTemp  += (Math.random() - 0.5) * 0.06;
  sensorTemp  = Math.round(Math.max(20, Math.min(32, sensorTemp)) * 10) / 10;
  sensorHumid += (Math.random() - 0.5) * 0.3;
  sensorHumid = Math.round(Math.max(35, Math.min(75, sensorHumid)));
  sensorGas   += (Math.random() - 0.7) * 0.08;  // bias toward low values
  sensorGas   = Math.round(Math.max(0.05, Math.min(3.0, sensorGas)) * 10) / 10;
  sensorNoise += (Math.random() - 0.5) * 0.8;
  sensorNoise = Math.round(Math.max(38, Math.min(72, sensorNoise)));

  $sensorTemp.textContent  = sensorTemp.toFixed(1) + '°C';
  $sensorHumid.textContent = sensorHumid + '%';
  $sensorGas.textContent   = sensorGas.toFixed(1) + ' ppm';
  $sensorNoise.textContent = sensorNoise + ' dB';

  // Alert if gas > 1.5
  const gasItem = $sensorGas.closest('.sensor-item');
  if (sensorGas > 1.5) {
    gasItem.classList.add('alert');
    if (Math.random() < 0.1) log('⚠️ 可燃气浓度偏高: ' + sensorGas.toFixed(1) + ' ppm', 'warn');
  } else {
    gasItem.classList.remove('alert');
  }
}

function updateBatteryDisplay() {
  const lvl = Math.round(batteryLevel);
  let cls = 'battery-high';
  let icon = '';
  if (lvl <= 15) { cls = 'battery-low'; icon = '🪫 '; }
  else if (lvl <= 40) { cls = 'battery-mid'; icon = '🔋 '; }
  else { icon = '🔋 '; }
  $batteryValue.className = 'status-value ' + cls;
  $batteryValue.textContent = `${icon}${lvl}%`;
}

function updateUIForRunning() {
  $btnStart.style.opacity = '0.5';
  $btnStart.style.pointerEvents = 'none';
}

function updateUIForStopped() {
  $btnStart.style.opacity = '1';
  $btnStart.style.pointerEvents = 'auto';
}

// ==================== LOG ====================
function log(msg, level) {
  const now = new Date();
  const ts = `[${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')}]`;
  const cls = level === 'warn' ? 'warn' : level === 'error' ? 'error' : '';
  const div = document.createElement('div');
  div.className = 'log-line ' + cls;
  div.innerHTML = `<span class="time-stamp">${ts}</span>${msg}`;
  $logBox.appendChild(div);
  $logBox.scrollTop = $logBox.scrollHeight;
}

// ==================== MAP HINT ====================
function showMapHint(text) {
  const old = document.querySelector('.mode-hint');
  if (old) old.remove();
  const hint = document.createElement('div');
  hint.style.cssText = `
    position:absolute; top:50%; left:50%; transform:translate(-50%,-50%);
    background:#1C1B1F; color:#FFFBFE; border-radius:16px;
    padding:18px 32px; font-family:Roboto,sans-serif;
    font-size:17px; font-weight:500; z-index:9999;
    pointer-events:none; white-space:nowrap;
    box-shadow:0 8px 40px rgba(0,0,0,0.4);
    animation: toast-in 3s forwards;
  `;
  hint.textContent = text;
  const container = document.querySelector('.map-container');
  if (container) {
    container.appendChild(hint);
    setTimeout(() => { if (hint.parentNode) hint.remove(); }, 3200);
  }
}

// ==================== EVENTS ====================
function bindEvents() {
  // Controls
  $btnStart.addEventListener('click', startInspection);
  $btnStop.addEventListener('click', stopInspection);
  $btnReset.addEventListener('click', resetAll);

  // Connect car — toggle GPS communication
  $btnConnect.addEventListener('click', function() {
    if (gpsConnected) {
      gpsDisconnect();
      $btnConnect.classList.remove('active');
      $btnConnect.textContent = '🔌 连接小车';
      $cmdHint.textContent = '📡 GPS 通信已断开';
    } else {
      // Place car marker at default position if not already placed
      if (!carMarker) {
        const pos = CAMPUS_CENTER;
        createCarMarker(pos);
        map.setCenter(pos);
      }
      gpsConnect();
      $btnConnect.classList.add('active');
      $btnConnect.textContent = '🔌 已连接 · 点击断开';
      $cmdHint.textContent = '📡 GPS 通信已连接';
    }
  });

  // GPS Target send button
  $gpsSendBtn.addEventListener('click', gpsSendTarget);

  // GPS Target input — Enter key to send
  $gpsTargetLat.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') gpsSendTarget();
  });
  $gpsTargetLng.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') gpsSendTarget();
  });

  // Voice control
  setupVoice();

  // Keyboard shortcuts
  document.addEventListener('keydown', function(e) {
    switch(e.key.toLowerCase()) {
      case ' ':
        e.preventDefault();
        if (isRunning) stopInspection(); else startInspection();
        break;
      case 'r':
        if (!e.ctrlKey && !e.metaKey) { resetAll(); }
        break;
  });
}

// ==================== COMMAND INPUT ====================
function setupVoice() {
  // ---- Text input ----
  function sendCmd(cmd) {
    if (cmd) { handleVoiceCommand(cmd); $cmdInput.value = ''; $cmdInput.blur(); }
  }
  $cmdInput.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') sendCmd($cmdInput.value.trim());
  });
  $cmdBtn.addEventListener('click', function() {
    sendCmd($cmdInput.value.trim());
  });

  // ---- Voice input ----
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { $micBtn.style.display = 'none'; return; }

  const rec = new SR();
  rec.lang = 'zh-CN';
  rec.continuous = false;
  rec.interimResults = true;

  rec.onstart = function() {
    $micBtn.classList.add('listening');
    $cmdHint.textContent = '🎤 正在聆听...';
  };
  rec.onresult = function(event) {
    let final = '', interim = '';
    for (let i = 0; i < event.results.length; i++) {
      if (event.results[i].isFinal) final += event.results[i][0].transcript;
      else interim += event.results[i][0].transcript;
    }
    $cmdInput.value = final || interim;
    if (final) { sendCmd(final); }
  };
  rec.onerror = function(event) {
    $micBtn.classList.remove('listening');
    if (event.error === 'network' || event.error === 'service-not-allowed') {
      $cmdHint.textContent = '⚠️ 语音服务不可用，请用文字输入指令';
      $micBtn.style.opacity = '0.4';
      setTimeout(() => { $micBtn.style.opacity = '1'; }, 5000);
    } else {
      $cmdHint.textContent = '⚠️ ' + event.error;
    }
  };
  rec.onend = function() {
    $micBtn.classList.remove('listening');
  };

  $micBtn.addEventListener('click', function() {
    if ($micBtn.classList.contains('listening')) {
      rec.stop();
    } else {
      rec.start();
    }
  });
}

let dialogTimer = null;
function showDialog(msg) {
  clearTimeout(dialogTimer);
  $voiceDialogText.textContent = msg;
  $voiceDialog.classList.add('show');
  dialogTimer = setTimeout(() => $voiceDialog.classList.remove('show'), 3000);
}

function handleVoiceCommand(text) {
  const cmd = text.trim().replace(/[，。！？,!?]/g, '');
  log('📝 指令: "' + cmd + '"');

  if (/开始巡检|启动|出发|开巡/.test(cmd)) {
    startInspection();
  } else if (/停止|停下|暂停/.test(cmd)) {
    stopInspection();
  } else if (/重置|清除|清空/.test(cmd)) {
    resetAll();
  } else if (/添加点|加点|设点|标记位置|这里/.test(cmd) && map) {
    // if (currentMode !== 'free') switchMode('free');  // 仅自由模式，无需切换
    const center = map.getCenter();
    addWaypoint([center.getLng(), center.getLat()]);
    $cmdHint.textContent = '✅ 已在地图中心添加路径点';
  } else if (/放大|拉近/.test(cmd) && map) {
    map.zoomIn();
    $cmdHint.textContent = '✅ 放大地图';
  } else if (/缩小|拉远/.test(cmd) && map) {
    map.zoomOut();
    $cmdHint.textContent = '✅ 缩小地图';
  } else if (/发送目标|设目标|定目标/.test(cmd)) {
    // 尝试从语音中提取坐标
    const coordMatch = cmd.match(/(\d+\.?\d*)[^\d]+(\d+\.?\d*)/);
    if (coordMatch) {
      $gpsTargetLat.value = coordMatch[1];
      $gpsTargetLng.value = coordMatch[2];
      gpsSendTarget();
    } else {
      $cmdHint.textContent = '🎯 请在输入框中填写目标经纬度后点击发送';
      showDialog('请填写目标经纬度后点击发送');
    }
  } else if (/接收目标|查看目标|目标在哪/.test(cmd)) {
    if (gpsTargetLat !== null && gpsTargetLng !== null) {
      map.setCenter([gpsTargetLng, gpsTargetLat]);
      $cmdHint.textContent = `🎯 目标: ${gpsTargetLat.toFixed(5)}, ${gpsTargetLng.toFixed(5)}`;
    } else {
      $cmdHint.textContent = '⚠️ 尚未设置目标地点';
    }
  } else if (/连接通信|连接gps|gps连接|连gps/.test(cmd)) {
    if (!gpsConnected) {
      $btnConnect.click();
      showDialog('正在连接小车 GPS 通信...');
    }
  } else if (/断开通信|断开gps|断gps/.test(cmd)) {
    if (gpsConnected) {
      $btnConnect.click();
      showDialog('GPS 通信已断开');
    }
  } else {
    $cmdHint.textContent = '可用: 开始/停止/重置/添加点/放大/缩小/发送目标';
  }
}

// ==================== BOOT ====================
window.addEventListener('DOMContentLoaded', init);
