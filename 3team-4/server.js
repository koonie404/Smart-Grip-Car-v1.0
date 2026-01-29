/**
 * STM32 Smart Grip Car Web Controller v2.0
 * 
 * 서보모터 그리퍼 + 듀얼 초음파 센서 + 조도 센서 + 차량 제어
 * STM32 USART2: 115200 baud
 * 
 * 차량: w(전진), s(후진), a(좌), d(우), x(정지)
 * 대각: q(좌전), e(우전), z(좌후), c(우후)
 * 그리퍼: y(홈:75,75), u(Hold:55,95), i(Release:95,55), o(예비1), p(예비2)
 */

const express = require('express');
const { SerialPort } = require('serialport');
const fs = require('fs');
const path = require('path');
const os = require('os');

const app = express();
app.use(express.json());

// ===== 설정 =====
const CONFIG_PATH = path.join(__dirname, 'config.json');
let config = {
    serial: { port: 'auto', baudRate: 115200 },
    server: { port: 3000 }
};

function loadConfig() {
    try {
        if (fs.existsSync(CONFIG_PATH)) {
            config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
        }
    } catch (err) {}
}

function saveConfig() {
    try { fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2)); } catch (err) {}
}

loadConfig();

// 명령줄 인자
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
    if ((args[i] === '--port' || args[i] === '-p') && args[i + 1]) config.serial.port = args[i + 1];
    if ((args[i] === '--baud' || args[i] === '-b') && args[i + 1]) config.serial.baudRate = parseInt(args[i + 1]);
}

// ===== 상태 =====
let serialPort = null;
let status = {
    connected: false,
    port: '',
    baudRate: config.serial.baudRate,
    // 듀얼 센서
    distance1: 0,
    distance2: 0,
    distanceHistory1: [],
    distanceHistory2: [],
    // 조도
    lightLevel: 'Medium',
    // 그리퍼
    left: 75,
    right: 75,
    gripperState: 'HOME',
    // 차량
    direction: 'STOP',
    lastInput: '',
    lastAction: '',
    // 상태
    isBlocked: false,
    lastMessage: ''
};

const MAX_HISTORY = 100;

// ===== 시리얼 =====
async function listPorts() {
    try { return await SerialPort.list(); } catch (err) { return []; }
}

async function findPort() {
    const ports = await listPorts();
    if (ports.length === 0) return null;
    const target = ports.find(p => {
        const info = ((p.manufacturer || '') + (p.friendlyName || '')).toLowerCase();
        return ['serial', 'uart', 'ch340', 'cp210', 'ftdi', 'usb', 'st-link'].some(k => info.includes(k));
    });
    return target ? target.path : ports[0].path;
}

async function connect(portPath, baudRate) {
    if (serialPort) {
        try {
            if (serialPort.isOpen) {
                await new Promise(resolve => serialPort.close(() => resolve()));
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        } catch (e) {}
        serialPort = null;
    }
    
    if (!portPath || portPath === 'auto') {
        portPath = await findPort();
        if (!portPath) { status.connected = false; return false; }
    }
    
    baudRate = baudRate || config.serial.baudRate;
    
    return new Promise(resolve => {
        try {
            serialPort = new SerialPort({ path: portPath, baudRate: baudRate, autoOpen: false });
            
            serialPort.on('error', err => { status.connected = false; });
            serialPort.on('close', () => { status.connected = false; });
            
            let buffer = '';
            serialPort.on('data', data => {
                buffer += data.toString();
                const lines = buffer.split('\r\n');
                buffer = lines.pop();
                lines.forEach(line => {
                    if (line.trim()) {
                        console.log('📥', line);
                        parseSTM32(line);
                    }
                });
            });
            
            serialPort.open(err => {
                if (err) {
                    status.connected = false;
                    serialPort = null;
                    resolve(false);
                } else {
                    console.log(`✅ 연결: ${portPath} @ ${baudRate}`);
                    status.connected = true;
                    status.port = portPath;
                    status.baudRate = baudRate;
                    config.serial.port = portPath;
                    config.serial.baudRate = baudRate;
                    saveConfig();
                    resolve(true);
                }
            });
        } catch (err) {
            status.connected = false;
            resolve(false);
        }
    });
}

// STM32 응답 파싱
// 지원 포맷:
// 1) Dist:  57 cm (거리 센서 1)
// 2) Very Bright / Bright / Medium / Dark / Very Dark (조도)
// 3) 기존 포맷도 지원
function parseSTM32(line) {
    status.lastMessage = line;
    
    // 거리1 파싱 - "Dist: 57 cm" 또는 "Dist1: 123 mm" 형식 모두 지원
    const distCmMatch = line.match(/Dist:\s*(\d+)\s*cm/i);
    const dist1MmMatch = line.match(/Dist1?:\s*(\d+)\s*mm/i);
    if (distCmMatch) {
        // cm를 mm로 변환하여 저장
        status.distance1 = parseInt(distCmMatch[1]) * 10;
        status.distanceHistory1.push({ time: Date.now(), dist: status.distance1 });
        if (status.distanceHistory1.length > MAX_HISTORY) status.distanceHistory1.shift();
    } else if (dist1MmMatch) {
        status.distance1 = parseInt(dist1MmMatch[1]);
        status.distanceHistory1.push({ time: Date.now(), dist: status.distance1 });
        if (status.distanceHistory1.length > MAX_HISTORY) status.distanceHistory1.shift();
    }
    
    // 거리2 파싱 (아직 미구현 - 추후 사용)
    const dist2Match = line.match(/Dist2:\s*(\d+)\s*(mm|cm)/i);
    if (dist2Match) {
        const val = parseInt(dist2Match[1]);
        status.distance2 = dist2Match[2].toLowerCase() === 'cm' ? val * 10 : val;
        status.distanceHistory2.push({ time: Date.now(), dist: status.distance2 });
        if (status.distanceHistory2.length > MAX_HISTORY) status.distanceHistory2.shift();
    }
    
    // 조도 파싱 - 단독 라인 "Very Bright" 등 또는 "Light Level: Bright" 형식
    const trimmedLine = line.trim();
    const lightLevels = ['Very Dark', 'Dark', 'Medium', 'Bright', 'Very Bright'];
    if (lightLevels.includes(trimmedLine)) {
        status.lightLevel = trimmedLine;
    } else {
        const lightMatch = line.match(/Light Level:\s*(Very Bright|Bright|Medium|Dark|Very Dark)/i);
        if (lightMatch) {
            status.lightLevel = lightMatch[1];
        }
    }
    
    // Input 파싱
    const inputMatch = line.match(/Input:\s*(\S+)/);
    if (inputMatch) {
        status.lastInput = inputMatch[1];
    }
    
    // Action 파싱
    const actionMatch = line.match(/\|\s*(Forward|Backward|Left|Right|Stop|Diag-\w+|Grip\s+\w+|BLOCKED!|Unknown)/i);
    if (actionMatch) {
        status.lastAction = actionMatch[1];
        
        const action = actionMatch[1].toLowerCase();
        if (action === 'forward') status.direction = 'FORWARD';
        else if (action === 'backward') status.direction = 'BACKWARD';
        else if (action === 'left') status.direction = 'LEFT';
        else if (action === 'right') status.direction = 'RIGHT';
        else if (action === 'stop') status.direction = 'STOP';
        else if (action.includes('diag')) status.direction = action.toUpperCase();
        else if (action === 'blocked!') {
            status.direction = 'BLOCKED';
            status.isBlocked = true;
        }
        
        if (action !== 'blocked!') status.isBlocked = false;
    }
    
    // Left, Right 그리퍼 파싱
    const leftMatch = line.match(/Left:\s*(\d+)/);
    const rightMatch = line.match(/Right:\s*(\d+)/);
    if (leftMatch) status.left = parseInt(leftMatch[1]);
    if (rightMatch) status.right = parseInt(rightMatch[1]);
    
    // 그리퍼 상태 파싱
    const gripMatch = line.match(/Grip:\s*(HOME|HOLD|RELEASE|CMD1|CMD2)/i);
    if (gripMatch) {
        status.gripperState = gripMatch[1].toUpperCase();
    }
}

async function disconnect() {
    if (serialPort) {
        try { if (serialPort.isOpen) await new Promise(r => serialPort.close(() => r())); } catch (e) {}
        serialPort = null;
        status.connected = false;
    }
}

function send(cmd) {
    if (!serialPort || !serialPort.isOpen) return false;
    serialPort.write(cmd);
    return true;
}

// ===== HTML =====
const HTML = `
<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>Smart Grip Car</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;600;700;900&family=Rajdhani:wght@400;500;600;700&display=swap" rel="stylesheet">
    <style>
        * { margin:0; padding:0; box-sizing:border-box; user-select:none; }
        :root {
            --bg:#050810;
            --card:linear-gradient(145deg, #0d1520 0%, #0a0f18 100%);
            --border:#1a2a40;
            --glow-border:#0ff3;
            --text:#e0f0ff;
            --dim:#4a6080;
            --cyan:#00f0ff;
            --cyan-dim:#0088aa;
            --green:#00ff88;
            --red:#ff3355;
            --orange:#ff8822;
            --yellow:#ffcc00;
            --purple:#aa44ff;
            --blue:#3388ff;
        }
        html,body { height:100%; overflow-x:hidden; }
        body {
            font-family:'Rajdhani','Segoe UI',sans-serif;
            background:var(--bg);
            color:var(--text);
            padding:10px;
            background-image:
                radial-gradient(ellipse at 20% 20%, #0a1525 0%, transparent 50%),
                radial-gradient(ellipse at 80% 80%, #0a1020 0%, transparent 50%),
                linear-gradient(180deg, #050810 0%, #080c15 100%);
        }
        
        .container { max-width:1000px; margin:0 auto; display:flex; flex-direction:column; gap:10px; }
        
        /* 헤더 */
        .header {
            display:flex;
            justify-content:space-between;
            align-items:center;
            padding:12px 16px;
            background:var(--card);
            border-radius:12px;
            border:1px solid var(--border);
            box-shadow:0 0 20px #0ff1, inset 0 1px 0 #fff1;
        }
        h1 {
            font-family:'Orbitron',monospace;
            font-size:1.3rem;
            font-weight:700;
            background:linear-gradient(90deg,#00f0ff,#00ff88);
            -webkit-background-clip:text;
            -webkit-text-fill-color:transparent;
            text-shadow:0 0 30px #0ff5;
            letter-spacing:2px;
        }
        .conn-status { display:flex; align-items:center; gap:10px; }
        .header-btn {
            background:linear-gradient(145deg,#1a2535,#0d1520);
            border:1px solid var(--border);
            color:var(--cyan);
            padding:8px 14px;
            border-radius:8px;
            cursor:pointer;
            font-family:'Rajdhani',sans-serif;
            font-weight:600;
            transition:all 0.2s;
        }
        .header-btn:hover { border-color:var(--cyan); box-shadow:0 0 15px #0ff3; }
        .conn-dot { font-size:1.4rem; filter:drop-shadow(0 0 8px currentColor); }
        
        /* 조도 오버레이 */
        .headlight-overlay {
            position:fixed;
            top:0; left:0; right:0; bottom:0;
            pointer-events:none;
            z-index:1000;
            opacity:0;
            transition:opacity 0.5s ease;
        }
        .headlight-overlay.active {
            opacity:1;
        }
        .headlight-beam {
            position:absolute;
            top:-100px;
            width:300px;
            height:500px;
            background:linear-gradient(180deg, 
                rgba(255,250,200,0.15) 0%, 
                rgba(255,250,200,0.08) 30%,
                rgba(255,250,200,0.02) 60%,
                transparent 100%);
            filter:blur(20px);
            animation:headlight-sway 3s ease-in-out infinite;
        }
        .headlight-beam.left { left:10%; transform:rotate(-5deg); animation-delay:0s; }
        .headlight-beam.right { right:10%; transform:rotate(5deg); animation-delay:0.5s; }
        @keyframes headlight-sway {
            0%,100% { opacity:0.8; }
            50% { opacity:1; }
        }
        .headlight-indicator {
            position:fixed;
            top:15px;
            left:50%;
            transform:translateX(-50%);
            background:rgba(255,220,100,0.9);
            color:#222;
            padding:6px 16px;
            border-radius:20px;
            font-family:'Orbitron',monospace;
            font-size:0.75rem;
            font-weight:700;
            letter-spacing:1px;
            box-shadow:0 0 30px rgba(255,220,100,0.5);
            opacity:0;
            transition:opacity 0.3s;
            z-index:1001;
        }
        .headlight-indicator.active { opacity:1; }
        
        /* 블록 경고 */
        .block-alert {
            display:none;
            padding:12px;
            background:linear-gradient(90deg,rgba(255,51,85,0.2),rgba(255,51,85,0.1));
            border:2px solid var(--red);
            border-radius:10px;
            text-align:center;
            color:var(--red);
            font-family:'Orbitron',monospace;
            font-weight:700;
            letter-spacing:2px;
            box-shadow:0 0 30px rgba(255,51,85,0.3);
        }
        .block-alert.show { display:block; animation:alert-pulse 1s infinite; }
        @keyframes alert-pulse { 0%,100%{opacity:1;box-shadow:0 0 30px rgba(255,51,85,0.3)} 50%{opacity:0.7;box-shadow:0 0 50px rgba(255,51,85,0.5)} }
        
        /* 메인 그리드 */
        .main-grid { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
        
        /* 패널 공통 */
        .panel {
            background:var(--card);
            border-radius:12px;
            padding:14px;
            border:1px solid var(--border);
            box-shadow:0 4px 20px #0003, inset 0 1px 0 #fff1;
        }
        .panel-title {
            font-family:'Orbitron',monospace;
            font-size:0.7rem;
            color:var(--dim);
            text-transform:uppercase;
            letter-spacing:2px;
            margin-bottom:10px;
            display:flex;
            align-items:center;
            gap:8px;
        }
        .panel-title::before {
            content:'';
            width:8px;
            height:8px;
            background:var(--cyan);
            border-radius:2px;
            box-shadow:0 0 10px var(--cyan);
        }
        
        /* 거리 그래프 패널 */
        .graph-panel { grid-column:span 1; }
        .graph-header {
            display:flex;
            justify-content:space-between;
            align-items:center;
            margin-bottom:8px;
        }
        .graph-value {
            font-family:'Orbitron',monospace;
            font-size:1.6rem;
            font-weight:700;
            color:var(--cyan);
            text-shadow:0 0 20px var(--cyan);
        }
        .graph-value.danger { color:var(--red); text-shadow:0 0 20px var(--red); }
        .graph-value.warning { color:var(--orange); text-shadow:0 0 20px var(--orange); }
        .graph-canvas { width:100%; height:130px; border-radius:8px; background:#080c12; }
        
        /* 그리퍼 패널 */
        .gripper-panel { grid-column:span 2; }
        .gripper-content { display:flex; align-items:center; justify-content:space-between; gap:20px; }
        .gripper-visual {
            flex:1;
            display:flex;
            align-items:center;
            justify-content:center;
            gap:30px;
            padding:10px;
            background:#080c12;
            border-radius:10px;
            border:1px solid #1a2a40;
        }
        .gripper-bar {
            display:flex;
            flex-direction:column;
            align-items:center;
            gap:6px;
        }
        .gripper-bar-label {
            font-family:'Orbitron',monospace;
            font-size:0.65rem;
            color:var(--dim);
            letter-spacing:1px;
        }
        .gripper-bar-track {
            width:60px;
            height:12px;
            background:#0a1020;
            border-radius:6px;
            border:1px solid #1a2a40;
            overflow:hidden;
            position:relative;
        }
        .gripper-bar-fill {
            height:100%;
            background:linear-gradient(90deg,var(--purple),var(--cyan));
            border-radius:6px;
            transition:width 0.2s;
            box-shadow:0 0 10px var(--purple);
        }
        .gripper-bar-value {
            font-family:'Orbitron',monospace;
            font-size:0.9rem;
            font-weight:700;
            color:var(--cyan);
        }
        .gripper-state {
            font-family:'Orbitron',monospace;
            font-size:0.9rem;
            font-weight:700;
            color:var(--green);
            text-shadow:0 0 15px var(--green);
            padding:8px 16px;
            background:#0a1520;
            border-radius:8px;
            border:1px solid var(--green);
        }
        
        /* 그리퍼 컨트롤 */
        .gripper-controls {
            display:flex;
            gap:6px;
            flex-wrap:wrap;
            justify-content:center;
        }
        .grip-btn {
            width:52px;
            height:44px;
            border:none;
            border-radius:8px;
            font-family:'Orbitron',monospace;
            font-size:0.65rem;
            font-weight:700;
            cursor:pointer;
            color:white;
            transition:all 0.15s;
            display:flex;
            flex-direction:column;
            align-items:center;
            justify-content:center;
            gap:2px;
            text-transform:uppercase;
            letter-spacing:0.5px;
        }
        .grip-btn:active { transform:scale(0.95); }
        .grip-btn .key {
            font-size:0.8rem;
            opacity:0.7;
        }
        .grip-btn.home { background:linear-gradient(145deg,#ff8822,#cc6600); box-shadow:0 4px 15px rgba(255,136,34,0.3); }
        .grip-btn.hold { background:linear-gradient(145deg,#22cc88,#118855); box-shadow:0 4px 15px rgba(34,204,136,0.3); }
        .grip-btn.release { background:linear-gradient(145deg,#ff4466,#cc2244); box-shadow:0 4px 15px rgba(255,68,102,0.3); }
        .grip-btn.cmd1 { background:linear-gradient(145deg,#6644ff,#4422cc); box-shadow:0 4px 15px rgba(102,68,255,0.3); }
        .grip-btn.cmd2 { background:linear-gradient(145deg,#3388ff,#2266cc); box-shadow:0 4px 15px rgba(51,136,255,0.3); }
        
        /* 상태 + 조도 패널 */
        .status-light-row { display:grid; grid-template-columns:2fr 1fr; gap:10px; }
        .status-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:8px; }
        .status-item {
            background:#080c12;
            padding:10px 8px;
            border-radius:8px;
            text-align:center;
            border:1px solid #1a2a40;
        }
        .status-label {
            font-family:'Orbitron',monospace;
            font-size:0.5rem;
            color:var(--dim);
            text-transform:uppercase;
            letter-spacing:1px;
        }
        .status-value {
            font-family:'Orbitron',monospace;
            font-size:0.85rem;
            font-weight:700;
            color:var(--cyan);
            margin-top:4px;
        }
        .status-value.danger { color:var(--red); }
        .status-value.warning { color:var(--yellow); }
        .status-value.ok { color:var(--green); }
        
        /* 조도 패널 */
        .light-panel {
            display:flex;
            flex-direction:column;
            align-items:center;
            justify-content:center;
            gap:8px;
        }
        .light-icon {
            font-size:2rem;
            transition:all 0.3s;
        }
        .light-icon.very-bright { color:#ffee00; text-shadow:0 0 30px #ffee00, 0 0 60px #ffee00; }
        .light-icon.bright { color:#ffcc00; text-shadow:0 0 20px #ffcc00; }
        .light-icon.medium { color:#aa8844; text-shadow:0 0 10px #aa8844; }
        .light-icon.dark { color:#665533; text-shadow:none; }
        .light-icon.very-dark { color:#333322; text-shadow:none; }
        .light-label {
            font-family:'Orbitron',monospace;
            font-size:0.7rem;
            font-weight:600;
            color:var(--dim);
        }
        .light-value {
            font-family:'Orbitron',monospace;
            font-size:0.8rem;
            font-weight:700;
        }
        
        /* 차량 컨트롤 */
        .car-panel { grid-column:span 2; }
        .car-controls {
            display:flex;
            justify-content:center;
            gap:8px;
        }
        .car-grid {
            display:grid;
            grid-template-columns:repeat(5,1fr);
            gap:6px;
        }
        .car-btn {
            width:54px;
            height:50px;
            border:none;
            border-radius:10px;
            font-family:'Orbitron',monospace;
            font-size:0.7rem;
            font-weight:700;
            cursor:pointer;
            color:white;
            transition:all 0.15s;
            display:flex;
            flex-direction:column;
            align-items:center;
            justify-content:center;
            gap:2px;
        }
        .car-btn:active { transform:scale(0.93); }
        .car-btn .arrow { font-size:1.1rem; }
        .car-btn .key { font-size:0.6rem; opacity:0.7; }
        .car-btn.fwd { background:linear-gradient(145deg,#3388ff,#2266cc); box-shadow:0 4px 15px rgba(51,136,255,0.3); }
        .car-btn.bwd { background:linear-gradient(145deg,#8855ff,#6633cc); box-shadow:0 4px 15px rgba(136,85,255,0.3); }
        .car-btn.left { background:linear-gradient(145deg,#00ccaa,#009988); box-shadow:0 4px 15px rgba(0,204,170,0.3); }
        .car-btn.right { background:linear-gradient(145deg,#00ccaa,#009988); box-shadow:0 4px 15px rgba(0,204,170,0.3); }
        .car-btn.stop { background:linear-gradient(145deg,#ff4455,#cc2233); box-shadow:0 4px 15px rgba(255,68,85,0.3); }
        .car-btn.diag { background:linear-gradient(145deg,#22bb77,#119955); box-shadow:0 4px 15px rgba(34,187,119,0.3); }
        .car-spacer { width:54px; height:50px; }
        
        /* 로그 */
        .log-panel { grid-column:span 2; padding:10px; }
        .log-content {
            font-family:'Courier New',monospace;
            font-size:0.7rem;
            color:var(--cyan);
            background:#080c12;
            padding:8px 12px;
            border-radius:6px;
            max-height:36px;
            overflow-y:auto;
            word-break:break-all;
            border:1px solid #1a2a40;
        }
        
        /* 모달 */
        .modal { display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.85); justify-content:center; align-items:center; z-index:2000; }
        .modal.show { display:flex; }
        .modal-content {
            background:linear-gradient(145deg,#0d1520,#080c12);
            border-radius:16px;
            padding:24px;
            width:90%;
            max-width:380px;
            border:1px solid var(--border);
            box-shadow:0 0 50px #0ff2;
        }
        .modal-header { display:flex; justify-content:space-between; align-items:center; margin-bottom:20px; }
        .modal-title { font-family:'Orbitron',monospace; font-size:1.1rem; font-weight:700; color:var(--cyan); }
        .close-btn { background:none; border:none; color:var(--dim); font-size:1.5rem; cursor:pointer; }
        .form-group { margin-bottom:16px; }
        .form-label { display:block; font-family:'Orbitron',monospace; color:var(--dim); font-size:0.7rem; margin-bottom:6px; letter-spacing:1px; }
        .form-select {
            width:100%;
            padding:10px;
            border-radius:8px;
            border:1px solid var(--border);
            background:#080c12;
            color:var(--text);
            font-family:'Rajdhani',sans-serif;
            font-size:1rem;
        }
        .port-list { max-height:120px; overflow-y:auto; margin-bottom:10px; }
        .port-item {
            padding:10px 12px;
            background:#080c12;
            border-radius:8px;
            margin-bottom:4px;
            cursor:pointer;
            border:1px solid var(--border);
            font-family:'Rajdhani',sans-serif;
            transition:all 0.2s;
        }
        .port-item:hover { border-color:var(--cyan); }
        .port-item.selected { border-color:var(--green); background:rgba(0,255,136,0.1); }
        .btn-row { display:flex; gap:10px; margin-top:16px; }
        .btn-primary {
            flex:1;
            padding:12px;
            border:none;
            border-radius:10px;
            background:linear-gradient(145deg,#00ccaa,#009988);
            color:white;
            font-family:'Orbitron',monospace;
            font-weight:700;
            cursor:pointer;
            letter-spacing:1px;
        }
        .btn-danger {
            flex:1;
            padding:12px;
            border:none;
            border-radius:10px;
            background:linear-gradient(145deg,#ff4455,#cc2233);
            color:white;
            font-family:'Orbitron',monospace;
            font-weight:700;
            cursor:pointer;
            letter-spacing:1px;
        }
        .refresh-btn {
            background:var(--border);
            border:none;
            color:var(--text);
            padding:4px 10px;
            border-radius:6px;
            cursor:pointer;
            font-size:0.75rem;
        }
        
        /* 반응형 */
        @media (max-width:700px) {
            .main-grid { grid-template-columns:1fr; }
            .graph-panel { grid-column:span 1; }
            .gripper-panel, .car-panel, .log-panel { grid-column:span 1; }
            .status-light-row { grid-template-columns:1fr; }
            .status-grid { grid-template-columns:repeat(2,1fr); }
            .gripper-content { flex-direction:column; }
            .car-grid { grid-template-columns:repeat(5,1fr); gap:4px; }
            .car-btn { width:48px; height:44px; }
        }
    </style>
</head>
<body>
    <div class="headlight-overlay" id="headlightOverlay">
        <div class="headlight-beam left"></div>
        <div class="headlight-beam right"></div>
    </div>
    <div class="headlight-indicator" id="headlightIndicator">💡 HEADLIGHTS ON</div>
    
    <div class="container">
        <div class="header">
            <h1>🦾 SMART GRIP CAR</h1>
            <div class="conn-status">
                <button class="header-btn" onclick="openSettings()">⚙️ SETTINGS</button>
                <span class="conn-dot" id="connStatus">○</span>
            </div>
        </div>
        
        <div class="block-alert" id="blockAlert">⚠️ BLOCKED — OBSTACLE DETECTED</div>
        
        <div class="main-grid">
            <!-- 거리 센서 1 -->
            <div class="panel graph-panel">
                <div class="panel-title">Distance Sensor 1</div>
                <div class="graph-header">
                    <span class="graph-value" id="distValue1">0 mm</span>
                </div>
                <canvas class="graph-canvas" id="distanceGraph1"></canvas>
            </div>
            
            <!-- 거리 센서 2 -->
            <div class="panel graph-panel">
                <div class="panel-title">Distance Sensor 2</div>
                <div class="graph-header">
                    <span class="graph-value" id="distValue2">0 mm</span>
                </div>
                <canvas class="graph-canvas" id="distanceGraph2"></canvas>
            </div>
            
            <!-- 그리퍼 컨트롤 -->
            <div class="panel gripper-panel">
                <div class="panel-title">Gripper Control</div>
                <div class="gripper-content">
                    <div class="gripper-visual">
                        <div class="gripper-bar">
                            <span class="gripper-bar-label">LEFT</span>
                            <div class="gripper-bar-track">
                                <div class="gripper-bar-fill" id="leftBar" style="width:50%"></div>
                            </div>
                            <span class="gripper-bar-value" id="leftValue">75</span>
                        </div>
                        <div class="gripper-state" id="gripperState">HOME</div>
                        <div class="gripper-bar">
                            <span class="gripper-bar-label">RIGHT</span>
                            <div class="gripper-bar-track">
                                <div class="gripper-bar-fill" id="rightBar" style="width:50%"></div>
                            </div>
                            <span class="gripper-bar-value" id="rightValue">75</span>
                        </div>
                    </div>
                    <div class="gripper-controls">
                        <button class="grip-btn home" onclick="sendCmd('y')"><span class="key">Y</span>HOME</button>
                        <button class="grip-btn hold" onclick="sendCmd('u')"><span class="key">U</span>HOLD</button>
                        <button class="grip-btn release" onclick="sendCmd('i')"><span class="key">I</span>RELEASE</button>
                        <button class="grip-btn cmd1" onclick="sendCmd('o')"><span class="key">O</span>CMD 1</button>
                        <button class="grip-btn cmd2" onclick="sendCmd('p')"><span class="key">P</span>CMD 2</button>
                    </div>
                </div>
            </div>
            
            <!-- 상태 + 조도 -->
            <div class="panel" style="grid-column:span 2;">
                <div class="status-light-row">
                    <div class="status-grid">
                        <div class="status-item">
                            <div class="status-label">Direction</div>
                            <div class="status-value" id="dirStatus">STOP</div>
                        </div>
                        <div class="status-item">
                            <div class="status-label">Last Input</div>
                            <div class="status-value" id="inputStatus">-</div>
                        </div>
                        <div class="status-item">
                            <div class="status-label">Action</div>
                            <div class="status-value" id="actionStatus">-</div>
                        </div>
                        <div class="status-item">
                            <div class="status-label">Safety</div>
                            <div class="status-value ok" id="safetyStatus">OK</div>
                        </div>
                    </div>
                    <div class="panel light-panel">
                        <div class="light-icon medium" id="lightIcon">☀️</div>
                        <div class="light-label">LIGHT LEVEL</div>
                        <div class="light-value" id="lightValue">Medium</div>
                    </div>
                </div>
            </div>
            
            <!-- 차량 컨트롤 (통합) -->
            <div class="panel car-panel">
                <div class="panel-title">Vehicle Control</div>
                <div class="car-controls">
                    <div class="car-grid">
                        <!-- Row 1 -->
                        <button class="car-btn diag" onclick="sendCmd('q')"><span class="arrow">↖</span><span class="key">Q</span></button>
                        <div class="car-spacer"></div>
                        <button class="car-btn fwd" onclick="sendCmd('w')"><span class="arrow">▲</span><span class="key">W</span></button>
                        <div class="car-spacer"></div>
                        <button class="car-btn diag" onclick="sendCmd('e')"><span class="arrow">↗</span><span class="key">E</span></button>
                        <!-- Row 2 -->
                        <div class="car-spacer"></div>
                        <button class="car-btn left" onclick="sendCmd('a')"><span class="arrow">◀</span><span class="key">A</span></button>
                        <button class="car-btn stop" onclick="sendCmd('x')"><span class="arrow">■</span><span class="key">X</span></button>
                        <button class="car-btn right" onclick="sendCmd('d')"><span class="arrow">▶</span><span class="key">D</span></button>
                        <div class="car-spacer"></div>
                        <!-- Row 3 -->
                        <button class="car-btn diag" onclick="sendCmd('z')"><span class="arrow">↙</span><span class="key">Z</span></button>
                        <div class="car-spacer"></div>
                        <button class="car-btn bwd" onclick="sendCmd('s')"><span class="arrow">▼</span><span class="key">S</span></button>
                        <div class="car-spacer"></div>
                        <button class="car-btn diag" onclick="sendCmd('c')"><span class="arrow">↘</span><span class="key">C</span></button>
                    </div>
                </div>
            </div>
            
            <!-- 로그 -->
            <div class="panel log-panel">
                <div class="log-content" id="logContent">Waiting for data...</div>
            </div>
        </div>
    </div>
    
    <!-- 설정 모달 -->
    <div class="modal" id="settingsModal">
        <div class="modal-content">
            <div class="modal-header">
                <span class="modal-title">⚙️ SETTINGS</span>
                <button class="close-btn" onclick="closeSettings()">×</button>
            </div>
            <div class="form-group">
                <div style="display:flex;justify-content:space-between;margin-bottom:6px;">
                    <label class="form-label">AVAILABLE PORTS</label>
                    <button class="refresh-btn" onclick="refreshPorts()">🔄 Refresh</button>
                </div>
                <div class="port-list" id="portList"></div>
            </div>
            <div class="form-group">
                <label class="form-label">BAUD RATE</label>
                <select class="form-select" id="baudRate">
                    <option value="9600">9600</option>
                    <option value="115200" selected>115200</option>
                </select>
            </div>
            <div class="btn-row">
                <button class="btn-primary" onclick="connectPort()">CONNECT</button>
                <button class="btn-danger" onclick="disconnectPort()">DISCONNECT</button>
            </div>
        </div>
    </div>

    <script>
        const graph1Canvas = document.getElementById('distanceGraph1');
        const graph1Ctx = graph1Canvas.getContext('2d');
        const graph2Canvas = document.getElementById('distanceGraph2');
        const graph2Ctx = graph2Canvas.getContext('2d');
        let selectedPort = null;
        
        function resizeCanvases() {
            [graph1Canvas, graph2Canvas].forEach(c => {
                c.width = c.parentElement.clientWidth - 28;
                c.height = 130;
            });
        }
        resizeCanvases();
        window.addEventListener('resize', resizeCanvases);
        
        // 거리 그래프 그리기
        function drawGraph(ctx, canvas, history, color) {
            const W = canvas.width, H = canvas.height;
            const maxDist = 500;
            const padding = { top:8, right:8, bottom:18, left:36 };
            const graphW = W - padding.left - padding.right;
            const graphH = H - padding.top - padding.bottom;
            
            ctx.fillStyle = '#080c12';
            ctx.fillRect(0, 0, W, H);
            
            // 그리드
            ctx.strokeStyle = '#152030';
            ctx.lineWidth = 1;
            for (let i = 0; i <= 5; i++) {
                const y = padding.top + (graphH / 5) * i;
                ctx.beginPath();
                ctx.moveTo(padding.left, y);
                ctx.lineTo(W - padding.right, y);
                ctx.stroke();
                
                ctx.fillStyle = '#4a6080';
                ctx.font = '9px Orbitron, monospace';
                ctx.textAlign = 'right';
                ctx.fillText((maxDist - maxDist/5*i) + '', padding.left - 4, y + 3);
            }
            
            // 위험/경고 존
            ctx.fillStyle = 'rgba(255,51,85,0.08)';
            const dangerY = padding.top + graphH * (1 - 120/maxDist);
            ctx.fillRect(padding.left, dangerY, graphW, H - padding.bottom - dangerY);
            
            ctx.fillStyle = 'rgba(255,136,34,0.06)';
            const warnY = padding.top + graphH * (1 - 200/maxDist);
            ctx.fillRect(padding.left, warnY, graphW, dangerY - warnY);
            
            if (history.length < 2) return;
            
            // 데이터 라인
            ctx.beginPath();
            ctx.strokeStyle = color;
            ctx.lineWidth = 2;
            ctx.shadowColor = color;
            ctx.shadowBlur = 8;
            
            const step = graphW / (history.length - 1);
            history.forEach((d, i) => {
                const x = padding.left + i * step;
                const y = padding.top + graphH * (1 - Math.min(d.dist, maxDist) / maxDist);
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            });
            ctx.stroke();
            ctx.shadowBlur = 0;
            
            // 마지막 포인트
            if (history.length > 0) {
                const last = history[history.length - 1];
                const x = padding.left + (history.length - 1) * step;
                const y = padding.top + graphH * (1 - Math.min(last.dist, maxDist) / maxDist);
                
                ctx.beginPath();
                ctx.arc(x, y, 5, 0, Math.PI * 2);
                ctx.fillStyle = last.dist < 120 ? '#ff3355' : last.dist < 200 ? '#ff8822' : '#00ff88';
                ctx.fill();
                ctx.strokeStyle = '#fff';
                ctx.lineWidth = 2;
                ctx.stroke();
            }
        }
        
        // 조도에 따른 헤드라이트 효과
        function updateHeadlight(level) {
            const overlay = document.getElementById('headlightOverlay');
            const indicator = document.getElementById('headlightIndicator');
            const icon = document.getElementById('lightIcon');
            const value = document.getElementById('lightValue');
            
            const isDark = ['Medium', 'Dark', 'Very Dark'].includes(level);
            overlay.classList.toggle('active', isDark);
            indicator.classList.toggle('active', isDark);
            
            value.textContent = level;
            icon.className = 'light-icon ' + level.toLowerCase().replace(' ', '-');
            
            // 아이콘 및 색상
            const colors = {
                'Very Bright': { icon:'☀️', color:'#ffee00' },
                'Bright': { icon:'🌤️', color:'#ffcc00' },
                'Medium': { icon:'⛅', color:'#aa8844' },
                'Dark': { icon:'🌙', color:'#665533' },
                'Very Dark': { icon:'🌑', color:'#333322' }
            };
            const c = colors[level] || colors['Medium'];
            icon.textContent = c.icon;
            value.style.color = c.color;
        }
        
        function updateUI(data) {
            // 연결 상태
            const conn = document.getElementById('connStatus');
            conn.textContent = data.connected ? '●' : '○';
            conn.style.color = data.connected ? '#00ff88' : '#ff3355';
            
            // 거리 센서 1
            const dist1El = document.getElementById('distValue1');
            dist1El.textContent = data.distance1 + ' mm';
            dist1El.className = 'graph-value' + (data.distance1 > 0 && data.distance1 < 120 ? ' danger' : data.distance1 < 200 ? ' warning' : '');
            
            // 거리 센서 2
            const dist2El = document.getElementById('distValue2');
            dist2El.textContent = data.distance2 + ' mm';
            dist2El.className = 'graph-value' + (data.distance2 > 0 && data.distance2 < 120 ? ' danger' : data.distance2 < 200 ? ' warning' : '');
            
            // 블록 알림
            document.getElementById('blockAlert').className = 'block-alert' + (data.isBlocked ? ' show' : '');
            
            // 상태
            document.getElementById('dirStatus').textContent = data.direction;
            document.getElementById('inputStatus').textContent = data.lastInput || '-';
            document.getElementById('actionStatus').textContent = data.lastAction || '-';
            
            const safetyEl = document.getElementById('safetyStatus');
            if (data.isBlocked) {
                safetyEl.textContent = 'BLOCKED';
                safetyEl.className = 'status-value danger';
            } else if ((data.distance1 > 0 && data.distance1 < 200) || (data.distance2 > 0 && data.distance2 < 200)) {
                safetyEl.textContent = 'WARNING';
                safetyEl.className = 'status-value warning';
            } else {
                safetyEl.textContent = 'OK';
                safetyEl.className = 'status-value ok';
            }
            
            // 그리퍼
            document.getElementById('leftValue').textContent = data.left;
            document.getElementById('rightValue').textContent = data.right;
            document.getElementById('leftBar').style.width = ((data.left - 25) / 100 * 100) + '%';
            document.getElementById('rightBar').style.width = ((data.right - 25) / 100 * 100) + '%';
            document.getElementById('gripperState').textContent = data.gripperState || 'HOME';
            
            // 조도
            updateHeadlight(data.lightLevel);
            
            // 로그
            document.getElementById('logContent').textContent = data.lastMessage || 'Waiting...';
            
            // 그래프
            drawGraph(graph1Ctx, graph1Canvas, data.distanceHistory1 || [], '#00f0ff');
            drawGraph(graph2Ctx, graph2Canvas, data.distanceHistory2 || [], '#aa44ff');
        }
        
        function sendCmd(cmd) {
            // 그립 명령 시 화면에 즉시 서보 값 업데이트
            const gripValues = {
                'u': { left: 55, right: 95, state: 'HOLD' },
                'i': { left: 95, right: 55, state: 'RELEASE' },
                'y': { left: 75, right: 75, state: 'HOME' }
            };
            const grip = gripValues[cmd.toLowerCase()];
            if (grip) {
                document.getElementById('leftValue').textContent = grip.left;
                document.getElementById('rightValue').textContent = grip.right;
                document.getElementById('leftBar').style.width = ((grip.left - 25) / 100 * 100) + '%';
                document.getElementById('rightBar').style.width = ((grip.right - 25) / 100 * 100) + '%';
                document.getElementById('gripperState').textContent = grip.state;
            }
            fetch('/api/cmd?c='+cmd).then(r=>r.json()).then(updateUI);
        }
        
        // 키보드
        document.addEventListener('keydown', e => {
            const key = e.key.toLowerCase();
            const validKeys = ['w','a','s','d','x','q','e','z','c','y','u','i','o','p'];
            if (validKeys.includes(key)) {
                e.preventDefault();
                sendCmd(key);
            }
        });
        
        // 설정 모달
        function openSettings() { document.getElementById('settingsModal').classList.add('show'); refreshPorts(); }
        function closeSettings() { document.getElementById('settingsModal').classList.remove('show'); }
        function refreshPorts() {
            fetch('/api/ports').then(r=>r.json()).then(ports => {
                document.getElementById('portList').innerHTML = ports.length ? 
                    ports.map(p => '<div class="port-item" onclick="selPort(this,\\''+p.path+'\\')"><b>'+p.path+'</b></div>').join('') : 
                    '<div style="color:#4a6080;text-align:center;padding:12px;">No ports found</div>';
            });
        }
        function selPort(el, port) {
            document.querySelectorAll('.port-item').forEach(i=>i.classList.remove('selected'));
            el.classList.add('selected');
            selectedPort = port;
        }
        function connectPort() {
            if(!selectedPort) return alert('Select a port first');
            fetch('/api/connect', {
                method:'POST',
                headers:{'Content-Type':'application/json'},
                body:JSON.stringify({port:selectedPort, baudRate:parseInt(document.getElementById('baudRate').value)})
            }).then(r=>r.json()).then(d => { if(d.success) closeSettings(); });
        }
        function disconnectPort() { fetch('/api/disconnect',{method:'POST'}); }
        document.getElementById('settingsModal').addEventListener('click', e => { if(e.target.id==='settingsModal') closeSettings(); });
        
        // 폴링
        setInterval(() => fetch('/api/status').then(r=>r.json()).then(updateUI).catch(()=>{}), 100);
        
        // 초기화
        drawGraph(graph1Ctx, graph1Canvas, [], '#00f0ff');
        drawGraph(graph2Ctx, graph2Canvas, [], '#aa44ff');
        updateHeadlight('Medium');
    </script>
</body>
</html>
`;

// ===== 라우트 =====
app.get('/', (req, res) => res.send(HTML));
app.get('/api/cmd', (req, res) => {
    if (req.query.c) {
        const cmd = req.query.c.toLowerCase();
        send(req.query.c);
        
        // 그립 명령 시 서버 상태도 즉시 업데이트
        const gripValues = {
            'u': { left: 55, right: 95, state: 'HOLD' },
            'i': { left: 95, right: 55, state: 'RELEASE' },
            'y': { left: 75, right: 75, state: 'HOME' }
        };
        if (gripValues[cmd]) {
            status.left = gripValues[cmd].left;
            status.right = gripValues[cmd].right;
            status.gripperState = gripValues[cmd].state;
        }
    }
    res.json(status);
});
app.get('/api/status', (req, res) => res.json(status));
app.get('/api/ports', async (req, res) => res.json(await listPorts()));
app.post('/api/connect', async (req, res) => {
    const ok = await connect(req.body.port, req.body.baudRate);
    res.json({ success: ok });
});
app.post('/api/disconnect', async (req, res) => { await disconnect(); res.json({success:true}); });

// ===== 시작 =====
async function start() {
    console.log('='.repeat(50));
    console.log('   STM32 Smart Grip Car Controller v2.0');
    console.log('='.repeat(50));
    
    await connect(config.serial.port, config.serial.baudRate);
    
    app.listen(config.server.port, '0.0.0.0', () => {
        const nets = os.networkInterfaces();
        let ip = 'localhost';
        for (const n of Object.keys(nets)) {
            for (const net of nets[n]) {
                if (net.family === 'IPv4' && !net.internal) { ip = net.address; break; }
            }
        }
        console.log('🌐 http://localhost:' + config.server.port);
        console.log('📱 http://' + ip + ':' + config.server.port);
        console.log('='.repeat(50));
        console.log('');
        console.log('📋 Commands:');
        console.log('   Vehicle: w(fwd) s(bwd) a(left) d(right) x(stop)');
        console.log('   Diagonal: q(↖) e(↗) z(↙) c(↘)');
        console.log('   Gripper: y(home:75,75) u(hold:55,95) i(release:95,55) o(cmd1) p(cmd2)');
        console.log('');
        console.log('📡 Expected UART format:');
        console.log('   Dist1: 123 mm | Dist2: 456 mm | Light Level: Bright | ...');
        console.log('='.repeat(50));
    });
}

start();