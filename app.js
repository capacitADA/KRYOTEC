// ============================================
// KRYOTEC SERVICIOS SAS - APP Firebase
// Versión: D1 SAS + JMC + RO
// ============================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import {
    getFirestore, collection, addDoc, getDocs, deleteDoc, doc, updateDoc,
    query, orderBy, writeBatch, runTransaction, getDoc
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyCZBwSEeeEPuHcdDzEIrwgoTO51ZD584G0",
    authDomain: "roapp-f036a.firebaseapp.com",
    projectId: "roapp-f036a",
    storageBucket: "roapp-f036a.firebasestorage.app",
    messagingSenderId: "1098765052775",
    appId: "1:1098765052775:web:d51faaaa80c9bc5afc1dc2"
};

const APPS_SCRIPT_URL =
    'https://script.google.com/macros/s/AKfycbw5OJtITMcidLT8KO1T13fnEslWygu9b2rBJmGSMjPP0IpMQtxheC4O3XSHOaduSUg33Q/exec';

const fbApp = initializeApp(firebaseConfig);
const db = getFirestore(fbApp);

// ===== DRIVE =====
let _driveConnected = false;
function driveIsConnected() { return _driveConnected; }

async function conectarDriveAuto() {
    try {
        await fetch(APPS_SCRIPT_URL, { method: 'GET', mode: 'no-cors' });
        _driveConnected = true;
    } catch (e) {
        _driveConnected = false;
    }
}

async function driveUploadPDF(html, filename) {
    if (!filename.endsWith('.pdf')) filename = filename.replace('.html', '') + '.pdf';
    try {
        await fetch(APPS_SCRIPT_URL, {
            method: 'POST', mode: 'no-cors',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ html, filename })
        });
        return true;
    } catch(e) { return false; }
}

// ===== DATOS GLOBALES =====
let clientes = [], equipos = [], servicios = [], tecnicos = [];
let jmcTiendas = [], d1Tiendas = [];

// ===== CARGAR DATOS =====
async function cargarDatos() {
    const main = document.getElementById('mainContent');
    main.innerHTML = '<div class="loading-screen"><div class="loading-spinner"></div><p>Cargando...</p></div>';
    try {
        const [cs, es, ss, ts, jmc, d1t] = await Promise.all([
            getDocs(query(collection(db, 'clientes'), orderBy('nombre'))),
            getDocs(collection(db, 'equipos')),
            getDocs(query(collection(db, 'servicios'), orderBy('fecha', 'desc'))),
            getDocs(collection(db, 'tecnicos')),
            getDocs(collection(db, 'jmc_tiendas')),
            getDocs(collection(db, 'd1_tiendas'))
        ]);
        clientes  = cs.docs.map(d => ({ id: d.id, ...d.data() }));
        equipos   = es.docs.map(d => ({ id: d.id, ...d.data() }));
        servicios = ss.docs.map(d => ({ id: d.id, ...d.data() }));
        tecnicos  = ts.docs.map(d => ({ id: d.id, ...d.data() }));
        jmcTiendas = jmc.docs.map(d => ({ id: d.id, ...d.data() }));
        d1Tiendas  = d1t.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch (err) {
        console.error('Error:', err);
        toast('⚠️ Error de conexión');
        main.innerHTML = '<div class="page" style="text-align:center;padding:2rem;"><p>⚠️ Error al cargar datos</p><button class="btn btn-blue" onclick="location.reload()">Reintentar</button></div>';
        return;
    }
    renderView();
}

// ===== HELPERS =====
const getEq  = id => equipos.find(e => e.id === id);
const getCl  = id => clientes.find(c => c.id === id);
const getTec = id => tecnicos.find(t => t.id === id);
const getEquiposCliente  = cid => equipos.filter(e => e.clienteId === cid);
const getServiciosEquipo = eid => servicios.filter(s => s.equipoId === eid);
const getServiciosCliente = cid => servicios.filter(s => getEquiposCliente(cid).some(e => e.id === s.equipoId));

function fmtFecha(f) {
    if (!f) return '';
    return new Date(f + 'T12:00:00').toLocaleDateString('es-ES');
}
function fmtFechaLarga(f) {
    if (!f) return '';
    return new Date(f + 'T12:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
}
function getMesActual() { return new Date().toISOString().slice(0, 7); }
function esAdmin() { return sesionActual?.rol === 'admin'; }
function esPropietario(creadoPor) { return sesionActual?.nombre === creadoPor; }
function puedeEditar(creadoPor) { return esAdmin() || esPropietario(creadoPor); }

// ===== CLIENTES ESPECIALES =====
function esClienteJMC(clienteId) {
    return getCl(clienteId)?.nombre === 'Jeronimo Martins Colombia';
}
function esClienteRO(clienteId) {
    return getCl(clienteId)?.nombre === 'Construciones Arquitectonicas RO';
}
function esClienteD1(clienteId) {
    return getCl(clienteId)?.nombre === 'D1 SAS';
}

// ===== TIENDAS =====
function getTiendaJMC(sap) {
    return jmcTiendas.find(t => t.sap === String(sap));
}
function getTiendaD1(idTienda) {
    return d1Tiendas.find(t => t.idTienda === String(idTienda));
}

// ===== CONSECUTIVO D1 (transacción atómica) =====
async function obtenerConsecutivoD1() {
    const ref = doc(db, 'consecutivos', 'd1');
    let nuevo;
    await runTransaction(db, async (tx) => {
        const snap = await tx.get(ref);
        const actual = snap.exists() ? (snap.data().ultimo || 0) : 0;
        nuevo = actual + 1;
        tx.set(ref, { ultimo: nuevo }, { merge: true });
    });
    return `K-${nuevo}`;
}

// ===== TOAST / MODAL =====
function toast(msg, duration = 3000) {
    const t = document.getElementById('toastEl');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(t._timer);
    t._timer = setTimeout(() => t.classList.remove('show'), duration);
}

function showModal(html) {
    const ov = document.getElementById('overlayEl');
    ov.innerHTML = html;
    ov.classList.remove('hidden');
    ov.onclick = e => { if (e.target === ov) closeModal(); };
}
function closeModal() {
    const ov = document.getElementById('overlayEl');
    ov.classList.add('hidden');
    ov.innerHTML = '';
    fotosNuevas = [null, null, null];
}

function actualizarTopbar() {
    const right = document.getElementById('topbarRight');
    if (!right) return;
    if (!sesionActual) {
        right.innerHTML = `<span class="topbar-user">Sin sesion</span>`;
    } else {
        const initials = sesionActual.nombre.split(' ').map(n => n[0]).join('').slice(0,2).toUpperCase();
        const rolBadge = esAdmin() ? `<span class="topbar-rol-badge">Admin</span>` : '';
        right.innerHTML = `
            <div class="topbar-sesion">
                <div class="topbar-avatar">${initials}</div>
                <div>
                    <div style="font-size:0.68rem;color:white;font-weight:700;">${sesionActual.nombre.split(' ')[0]}</div>
                    ${rolBadge}
                </div>
                <button class="topbar-salir" onclick="cerrarSesion()">Salir</button>
            </div>`;
    }
}

function cerrarSesion() {
    sesionActual = null;
    actualizarTopbar();
    renderView();
    toast('👋 Sesion cerrada');
}

// ===== ESTADO =====
let currentView = 'panel';
let sesionActual = null;
let selectedClienteId = null;
let selectedEquipoId = null;
let fotosNuevas = [null, null, null];
let _servicioEidActual = null;
let _jmcHtmlUltimo = null;
let _jmcTicketUltimo = '';
let _jmcRepuestosUltimo = '';

const CIUDADES = ['Bogota','Medellin','Cali','Bucaramanga','Barranquilla',
    'Cucuta','Manizales','Pereira','Ibague','Villavicencio',
    'Giron','Floridablanca','Piedecuesta','Pamplona','Soacha'];
const TIPOS_DOC = ['CC','CE','PA','NIT','TI'];
const ESPECIALIDADES = [
    { id: 'mecanico',    label: 'Tecnico de refrigeracion' },
    { id: 'baja',        label: 'Electricista baja tension' },
    { id: 'media',       label: 'Electricista media tension' },
    { id: 'electronico', label: 'Electronico' },
    { id: 'ups',         label: 'UPS' },
    { id: 'planta',      label: 'Refrigeracion industrial' }
];

const LOGO_RO_B64 = 'data:image/png;base64,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';

// ===== NAVEGACIÓN =====
function goTo(view, cid = null, eid = null) {
    currentView = view;
    selectedClienteId = cid;
    selectedEquipoId = eid;
    closeModal();
    renderView();
    document.querySelectorAll('.bni').forEach(b => {
        b.classList.toggle('active',
            b.dataset.page === view ||
            (view === 'detalle'   && b.dataset.page === 'clientes') ||
            (view === 'historial' && b.dataset.page === 'clientes'));
    });
}

function renderView() {
    if (!sesionActual && currentView !== 'panel' && currentView !== 'tecnicos') {
        currentView = 'panel';
    }
    const main = document.getElementById('mainContent');
    document.getElementById('botnavEl').style.display = 'flex';
    switch (currentView) {
        case 'panel':          main.innerHTML = renderPanel();          break;
        case 'clientes':       main.innerHTML = renderClientes();       break;
        case 'detalle':        main.innerHTML = renderDetalleCliente(); break;
        case 'historial':      main.innerHTML = renderHistorial();      break;
        case 'equipos':        main.innerHTML = renderEquipos();        break;
        case 'servicios':      main.innerHTML = renderServicios();
                               if (window.aplicarFiltros) aplicarFiltros(); break;
        case 'mantenimientos': main.innerHTML = renderMantenimientos(); break;
        case 'tecnicos':       main.innerHTML = renderTecnicos();       break;
        default:               main.innerHTML = renderPanel();
    }
}

function renderPanel() {
    const mes  = getMesActual();
    const man  = servicios.filter(s => s.tipo === 'Mantenimiento');
    const rep  = servicios.filter(s => s.tipo === 'Reparacion');
    const inst = servicios.filter(s => s.tipo === 'Instalacion');
    const manM  = man.filter(s => s.fecha?.startsWith(mes));
    const repM  = rep.filter(s => s.fecha?.startsWith(mes));
    const instM = inst.filter(s => s.fecha?.startsWith(mes));
    const nuevosDelMes = clientes.filter(c => c.fechaCreacion?.startsWith(mes)).length;
    return `<div class="page">
        <div class="panel-banner">
            <div class="panel-banner-sub">Refrigeracion Industrial</div>
            <div class="panel-banner-title">Panel Principal</div>
        </div>
        <div class="panel-grid">
            <div class="panel-col">
                <div class="panel-col-head">Clientes</div>
                <div class="panel-box gold-box"><div class="panel-box-num">${clientes.length}</div><div class="panel-box-lbl">TOTALES</div></div>
                <div class="panel-box gold-box"><div class="panel-box-num">${nuevosDelMes}</div><div class="panel-box-lbl">NUEVOS MES</div></div>
            </div>
            <div class="panel-col">
                <div class="panel-col-head">Servicio</div>
                <div class="panel-box header-box anual-box"><div class="panel-box-lbl">ANUAL</div></div>
                <div class="panel-box anual-box"><div class="panel-box-num">${man.length}</div><div class="panel-box-lbl">MANTENIMIENTO</div></div>
                <div class="panel-box anual-box"><div class="panel-box-num">${rep.length}</div><div class="panel-box-lbl">REPARACION</div></div>
                <div class="panel-box anual-box"><div class="panel-box-num">${inst.length}</div><div class="panel-box-lbl">INSTALACION</div></div>
            </div>
            <div class="panel-col">
                <div class="panel-col-head">Servicio</div>
                <div class="panel-box header-box mensual-box"><div class="panel-box-lbl">MENSUAL</div></div>
                <div class="panel-box mensual-box"><div class="panel-box-num">${manM.length}</div><div class="panel-box-lbl">MANTENIMIENTO</div></div>
                <div class="panel-box mensual-box"><div class="panel-box-num">${repM.length}</div><div class="panel-box-lbl">REPARACION</div></div>
                <div class="panel-box mensual-box"><div class="panel-box-num">${instM.length}</div><div class="panel-box-lbl">INSTALACION</div></div>
            </div>
        </div>
    </div>`;
}

function renderClientes() {
    return `<div class="page">
        <div class="sec-head"><h2>Clientes (${clientes.length})</h2><button class="btn btn-blue btn-sm" onclick="modalNuevoCliente()">+ Nuevo</button></div>
        <input class="search" placeholder="🔍 Buscar..." oninput="filtrarClientes(this.value)" id="searchClientes">
        <div id="clientesGrid">
            ${clientes.map(c => `
            <div class="cc" data-search="${(c.nombre+c.ciudad+c.telefono+(c.email||'')).toLowerCase()}">
                <div style="display:flex;justify-content:space-between;">
                    <div class="cc-name">${c.nombre}</div>
                    ${esAdmin() ? `<div><button class="ib" onclick="modalEditarCliente('${c.id}')">✏️</button><button class="ib" onclick="modalEliminarCliente('${c.id}')">🗑️</button></div>` : ''}
                </div>
                <div class="cc-row">📞 ${c.telefono}</div>
                ${c.email ? `<div class="cc-row">📧 ${c.email}</div>` : ''}
                <div class="cc-row">📍 ${c.direccion}</div>
                <span class="city-tag">${c.ciudad}</span>
                ${c.latitud ? `<div><a class="map-link" href="https://maps.google.com/?q=${c.latitud},${c.longitud}" target="_blank">🗺️ Ver GPS</a></div>` : ''}
                <div class="cc-meta">${getEquiposCliente(c.id).length} activo(s) · ${getServiciosCliente(c.id).length} servicio(s)</div>
                <button class="link-btn" onclick="goTo('detalle','${c.id}')">Ver activos →</button>
            </div>`).join('')}
        </div>
    </div>`;
}

function filtrarClientes(v) {
    const txt = v.toLowerCase();
    document.querySelectorAll('#clientesGrid .cc').forEach(c => {
        c.style.display = (c.dataset.search||'').includes(txt) ? '' : 'none';
    });
}

function renderDetalleCliente() {
    const c = getCl(selectedClienteId);
    if (!c) { goTo('clientes'); return ''; }
    const eqs = getEquiposCliente(c.id);
    return `<div class="page">
        <div class="det-hdr"><button class="back" onclick="goTo('clientes')">← Volver</button><div><div class="cc-name">${c.nombre}</div><div class="cc-meta">${c.ciudad}</div></div></div>
        <div class="info-box">
            <div class="cc-row">📞 <strong>${c.telefono}</strong></div>
            ${c.email ? `<div class="cc-row">📧 ${c.email}</div>` : ''}
            <div class="cc-row">📍 ${c.direccion}</div>
            ${c.latitud ? `<a class="map-link" href="https://maps.google.com/?q=${c.latitud},${c.longitud}" target="_blank">🗺️ Ver en Google Maps</a>` : '<div class="cc-meta">Sin GPS</div>'}
        </div>
        <div style="display:flex;justify-content:space-between;margin-bottom:0.65rem;"><span style="font-weight:700;">Activos (${eqs.length})</span><button class="btn btn-blue btn-sm" onclick="modalNuevoEquipo('${c.id}')">+ Activo</button></div>
        ${eqs.map(e => `
        <div class="ec">
            <div style="display:flex;justify-content:space-between;">
                <div><div class="ec-name">${e.tipo ? e.tipo+' · ' : ''}${e.marca} ${e.modelo}</div><div class="ec-meta">📍 ${e.ubicacion} · Serie: ${e.serie||'S/N'}</div><div class="ec-meta">${getServiciosEquipo(e.id).length} servicio(s)</div></div>
                ${esAdmin() ? `<div><button class="ib" onclick="modalEditarEquipo('${e.id}')">✏️</button><button class="ib" onclick="modalEliminarEquipo('${e.id}')">🗑️</button></div>` : ''}
            </div>
            <div class="ec-btns">
                <button class="ab" onclick="goTo('historial','${c.id}','${e.id}')">📋 Servicios</button>
                <button class="ab" onclick="modalNuevoServicio('${e.id}')">➕ Nuevo</button>
                <button class="ab" onclick="generarInformePDF('${e.id}')">📄 PDF</button>
                <button class="ab" onclick="modalQR('${e.id}')">📱 QR</button>
            </div>
        </div>`).join('')}
    </div>`;
}

function renderHistorial() {
    const e = getEq(selectedEquipoId);
    if (!e) { goTo('clientes'); return ''; }
    const c = getCl(e.clienteId);
    const ss = getServiciosEquipo(e.id).sort((a,b) => new Date(b.fecha)-new Date(a.fecha));
    return `<div class="page">
        <div class="det-hdr"><button class="back" onclick="goTo('detalle','${e.clienteId}')">← Volver</button><div><div class="ec-name">${e.tipo ? e.tipo+' · ' : ''}${e.marca} ${e.modelo}</div><div class="ec-meta">${e.ubicacion} · ${c?.nombre}</div></div></div>
        <div style="margin-bottom:2rem;"><span style="font-weight:700;">Historial (${ss.length})</span></div>
        ${ss.map(s => `
        <div class="si">
            <div class="si-top"><span class="badge ${s.tipo==='Mantenimiento'?'b-blue':s.tipo==='Reparacion'?'b-red':'b-green'}">${s.tipo}</span><span style="font-size:2rem;color:var(--hint);">${fmtFecha(s.fecha)}</span></div>
            <div class="si-info">🔧 ${s.tecnico}</div>
            <div class="si-info">${s.descripcion}</div>
            ${s.proximoMantenimiento ? `<div class="si-info" style="color:var(--gold);">📅 Proximo: ${fmtFecha(s.proximoMantenimiento)}</div>` : ''}
            <div class="fotos-strip">${(s.fotos||[]).map(f => `<img class="fthumb" src="${f}" loading="lazy">`).join('')}</div>
            <div class="si-top" style="justify-content:flex-end;margin-top:4px;">
                ${puedeEditar(s.tecnico) ? `<button class="ib" onclick="modalEditarServicio('${s.id}')">✏️</button>` : ''}
                ${esAdmin() ? `<button class="ib" onclick="eliminarServicio('${s.id}')">🗑️</button>` : ''}
            </div>
        </div>`).join('')}
    </div>`;
}

function renderEquipos() {
    return `<div class="page">
        <div class="sec-head"><h2>Activos (${equipos.length})</h2></div>
        <input class="search" placeholder="🔍 Buscar..." oninput="filtrarEquipos(this.value)" id="searchEq">
        <div id="equiposGrid">
        ${equipos.map(e => {
            const c = getCl(e.clienteId);
            return `<div class="ec" data-search="${(e.marca+e.modelo+(c?.nombre||'')).toLowerCase()}">
                <div class="ec-name">${e.marca} ${e.modelo}</div>
                <div class="ec-meta">👤 ${c?.nombre||'Sin cliente'} · 📍 ${e.ubicacion}</div>
                <div class="ec-btns">
                    <button class="ab" onclick="goTo('historial','${e.clienteId}','${e.id}')">📋 Servicios</button>
                    <button class="ab" onclick="modalNuevoServicio('${e.id}')">➕ Nuevo</button>
                    <button class="ab" onclick="generarInformePDF('${e.id}')">📄 PDF</button>
                </div>
            </div>`;
        }).join('')}
        </div>
    </div>`;
}

function filtrarEquipos(v) {
    document.querySelectorAll('#equiposGrid .ec').forEach(c => {
        c.style.display = (c.dataset.search||'').includes(v.toLowerCase()) ? '' : 'none';
    });
}

function renderServicios() {
    const años = [...new Set(servicios.map(s=>s.fecha?.slice(0,4)).filter(Boolean))].sort((a,b)=>b-a);
    const meses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
    return `<div class="page">
        <div class="sec-head"><h2>Servicios</h2></div>
        <div class="filtros">
            <select class="fi" id="fAnio"><option value="">Todos los años</option>${años.map(a=>`<option>${a}</option>`).join('')}</select>
            <select class="fi" id="fMes"><option value="">Todos los meses</option>${meses.map((m,i)=>`<option value="${String(i+1).padStart(2,'0')}">${m}</option>`).join('')}</select>
            <select class="fi" id="fTipo"><option value="">Todos los tipos</option><option>Mantenimiento</option><option>Reparacion</option><option>Instalacion</option></select>
            <select class="fi" id="fCliente"><option value="">Todos los clientes</option>${clientes.map(c=>`<option value="${c.id}">${c.nombre}</option>`).join('')}</select>
            <select class="fi" id="fTecnico"><option value="">Todos los tecnicos</option>${tecnicos.map(t=>`<option>${t.nombre}</option>`).join('')}</select>
            <button class="btn btn-blue btn-full" onclick="aplicarFiltros()">Aplicar</button>
            <button class="btn btn-gray btn-full" onclick="limpiarFiltros()">Limpiar</button>
        </div>
        <div id="listaServicios"></div>
    </div>`;
}

function aplicarFiltros() {
    const anio = document.getElementById('fAnio')?.value||'';
    const mes  = document.getElementById('fMes')?.value||'';
    const tipo = document.getElementById('fTipo')?.value||'';
    const cid  = document.getElementById('fCliente')?.value||'';
    const tec  = document.getElementById('fTecnico')?.value||'';
    let filtrados = [...servicios].sort((a,b)=>new Date(b.fecha)-new Date(a.fecha));
    if (anio) filtrados = filtrados.filter(s=>s.fecha?.startsWith(anio));
    if (mes)  filtrados = filtrados.filter(s=>s.fecha?.slice(5,7)===mes);
    if (tipo) filtrados = filtrados.filter(s=>s.tipo===tipo);
    if (cid)  filtrados = filtrados.filter(s=>getEquiposCliente(cid).some(e=>e.id===s.equipoId));
    if (tec)  filtrados = filtrados.filter(s=>s.tecnico===tec);
    const el = document.getElementById('listaServicios');
    if (!el) return;
    if (!filtrados.length) { el.innerHTML='<p class="cc-meta" style="text-align:center;">Sin resultados.</p>'; return; }
    el.innerHTML = filtrados.map(s => {
        const e = getEq(s.equipoId);
        const c = getCl(e?.clienteId);
        return `<div class="si">
            <div class="si-top"><span class="badge ${s.tipo==='Mantenimiento'?'b-blue':s.tipo==='Reparacion'?'b-red':'b-green'}">${s.tipo}</span><span>${fmtFecha(s.fecha)}</span></div>
            <div class="si-info">👤 ${c?.nombre||'N/A'} · ${e?.marca||''} ${e?.modelo||''}</div>
            <div class="si-info">📍 ${e?.ubicacion||''} · 🔧 ${s.tecnico}</div>
            <div class="si-info">${s.descripcion}</div>
            ${s.proximoMantenimiento?`<div class="si-info" style="color:var(--gold);">📅 Proximo: ${fmtFecha(s.proximoMantenimiento)}</div>`:''}
        </div>`;
    }).join('');
}

function limpiarFiltros() {
    ['fAnio','fMes','fTipo','fCliente','fTecnico'].forEach(id=>{ const el=document.getElementById(id); if(el) el.value=''; });
    aplicarFiltros();
}

function renderMantenimientos() {
    const MESES = ['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'];
    const año = new Date().getFullYear();
    const mant = servicios.filter(s=>s.proximoMantenimiento);
    return `<div class="page">
        <div class="sec-head"><h2>Agenda ${año}</h2></div>
        <div class="tbl-wrap">
            <table>
                <thead><tr><th>Mes</th><th>Fecha</th><th>Cliente</th><th>Activo</th><th></th></tr></thead>
                <tbody>
                ${MESES.map((mes,idx) => {
                    const mp = String(idx+1).padStart(2,'0');
                    const lista = mant.filter(m=>m.proximoMantenimiento?.startsWith(`${año}-${mp}`));
                    if (!lista.length) return `<tr><td style="color:var(--hint);">${mes}</td><td colspan="4" style="color:#cbd5e1;">—</td></tr>`;
                    return lista.map((m,i) => {
                        const e = getEq(m.equipoId);
                        const c = getCl(e?.clienteId);
                        return `<tr>
                            ${i===0?`<td rowspan="${lista.length}" style="font-weight:700;background:var(--bg2);">${mes}</td>`:''}
                            <td>${fmtFecha(m.proximoMantenimiento)}</td>
                            <td>${c?.nombre||'N/A'}</td>
                            <td>${e?`${e.marca} ${e.modelo}`:'N/A'}</td>
                            <td><button class="rec-btn" onclick="modalRecordar('${e?.clienteId}','${e?.id}','${m.proximoMantenimiento}')">📱</button></td>
                        </tr>`;
                    }).join('');
                }).join('')}
                </tbody>
            </table>
        </div>
    </div>`;
}

function renderTecnicos() {
    return `<div class="page">
        <div class="sec-head"><h2>Tecnicos (${tecnicos.length})</h2>${esAdmin() ? `<button class="btn btn-blue btn-sm" onclick="modalNuevoTecnico()">+ Nuevo</button>` : ''}</div>
        ${tecnicos.map(t => {
            const esps = (t.especialidades||[]).map(id => ESPECIALIDADES.find(e=>e.id===id)?.label||id);
            return `<div class="ec">
                <div style="display:flex;justify-content:space-between;">
                    <div><div class="ec-name">${t.nombre}</div><div class="ec-meta">${t.tipoDoc}</div><div class="ec-meta">${t.cargo}</div><div class="ec-meta">📞 ${t.telefono}</div></div>
                    <div><span class="tc-rol-badge ${t.rol==='admin'?'rol-admin':'rol-tec'}">${t.rol==='admin'?'Admin':'Tecnico'}</span>${esAdmin() ? `<div><button class="ib" onclick="modalEditarTecnico('${t.id}')">✏️</button><button class="ib" onclick="eliminarTecnico('${t.id}')">🗑️</button></div>` : ''}</div>
                </div>
                <div>${esps.map(e=>`<span class="esp-chip">${e}</span>`).join('')}</div>
                <div class="ec-meta">📍 ${t.region||'Sin region'}</div>
                <button class="btn btn-blue btn-sm btn-full" onclick="abrirLogin('${t.id}')">🔑 Ingresar como ${t.nombre.split(' ')[0]}</button>
            </div>`;
        }).join('')}
    </div>`;
}

// ===== LOGIN =====
function abrirLogin(tid) {
    const t = getTec(tid);
    showModal(`<div class="modal" style="max-width:320px;"><div class="modal-h"><h3>🔑 Ingresar</h3><button class="xbtn" onclick="closeModal()">✕</button></div><div class="modal-b"><div style="font-weight:700;">${t.nombre}</div><div class="ec-meta">${t.tipoDoc}</div><label class="fl">Cedula</label><input class="fi" id="mlCedula" type="number"><label class="fl">Clave (4 digitos)</label><div class="pin-display"><div class="pin-digit" id="mlpd0"></div><div class="pin-digit" id="mlpd1"></div><div class="pin-digit" id="mlpd2"></div><div class="pin-digit" id="mlpd3"></div></div><div class="numpad">${[1,2,3,4,5,6,7,8,9].map(n=>`<div class="num-btn" onclick="mlPin('${tid}',${n})">${n}</div>`).join('')}<div class="num-btn del" onclick="mlDel()">⌫</div><div class="num-btn zero" onclick="mlPin('${tid}',0)">0</div><div class="num-btn ok" onclick="mlLogin('${tid}')">✓</div></div><div id="mlMsg"></div><div class="modal-foot"><button class="btn btn-gray" onclick="closeModal()">Cancelar</button><button class="btn btn-blue" onclick="mlLogin('${tid}')">Ingresar</button></div></div></div>`);
    window._mlPin = '';
}

let mlPinActual = '';
function mlPin(tid, n) { if (mlPinActual.length >= 4) return; mlPinActual += String(n); mlUpdateDisplay(); if (mlPinActual.length === 4) mlLogin(tid); }
function mlDel() { mlPinActual = mlPinActual.slice(0,-1); mlUpdateDisplay(); }
function mlUpdateDisplay() {
    for (let i=0;i<4;i++) {
        const d = document.getElementById('mlpd'+i);
        if(!d) return;
        d.className='pin-digit';
        if(i<mlPinActual.length){ d.textContent='●'; d.classList.add('filled'); }
        else if(i===mlPinActual.length){ d.textContent='_'; d.classList.add('active'); }
        else { d.textContent=''; }
    }
}
function mlLogin(tid) {
    const t = getTec(tid);
    const cedula = document.getElementById('mlCedula')?.value?.trim();
    const msg = document.getElementById('mlMsg');
    if (!cedula) { if(msg) msg.innerHTML='<div class="login-warn">⚠️ Cedula requerida</div>'; return; }
    if (mlPinActual.length<4) { if(msg) msg.innerHTML='<div class="login-warn">⚠️ Clave de 4 digitos</div>'; return; }
    if (t.cedula !== cedula || t.clave !== mlPinActual) { if(msg) msg.innerHTML='<div class="login-error">❌ Credenciales incorrectas</div>'; mlPinActual=''; mlUpdateDisplay(); return; }
    sesionActual = t;
    mlPinActual = '';
    closeModal();
    actualizarTopbar();
    currentView='panel';
    renderView();
    toast(`✅ Bienvenido, ${t.nombre.split(' ')[0]}`);
}

// ===== MODAL RECORDAR =====
function modalRecordar(clienteId, equipoId, fecha) {
    const e = getEq(equipoId);
    const c = getCl(clienteId);
    const fechaF = fmtFechaLarga(fecha);
    const esJMC = esClienteJMC(clienteId);
    let tel, destinatario, msg;
    if (esJMC) {
        const sap = e?.ubicacion;
        const tienda = getTiendaJMC(sap);
        if (tienda) {
            tel = tienda.telefono;
            destinatario = `${tienda.coordinador} · SAP ${sap}`;
            msg = `Hola *${tienda.coordinador}*, recordatorio: activo *${e?.marca} ${e?.modelo}* tienda *${tienda.tienda} (SAP ${sap})* requiere mantenimiento el *${fechaF}*. Confirmar visita. KRYOTEC SERVICIOS SAS 📞 3133292510`;
        } else { tel = c?.telefono; destinatario = c?.nombre; msg = `Hola *${c?.nombre}*, recordatorio: activo *${e?.marca} ${e?.modelo}* requiere mantenimiento el *${fechaF}*. KRYOTEC SERVICIOS SAS 📞 3133292510`; }
    } else { tel = c?.telefono; destinatario = c?.nombre; msg = `Hola *${c?.nombre}*, recordatorio: activo *${e?.marca} ${e?.modelo}* requiere mantenimiento el *${fechaF}*. KRYOTEC SERVICIOS SAS 📞 3133292510`; }
    showModal(`<div class="modal"><div class="modal-h"><h3>📱 Recordatorio WhatsApp</h3><button class="xbtn" onclick="closeModal()">✕</button></div><div class="modal-b"><div class="ec-meta">Para <strong>${destinatario}</strong> · 📞 ${tel}</div><div class="wa-bubble">${msg}</div><textarea class="fi" id="waMsgEdit" rows="4">${msg}</textarea><div class="modal-foot"><button class="btn btn-gray" onclick="closeModal()">Cancelar</button><button class="btn btn-wa" onclick="enviarWhatsApp('${tel}')">📱 Abrir WhatsApp</button></div></div></div>`);
}

function enviarWhatsApp(tel) {
    const msg = document.getElementById('waMsgEdit')?.value||'';
    const telLimpio = '57' + tel.replace(/\D/g,'');
    window.open(`https://wa.me/${telLimpio}?text=${encodeURIComponent(msg)}`, '_blank');
    closeModal();
    toast('📱 WhatsApp abierto');
}

// ===== FOTOS =====
function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const MAX = 800;
                const scale = Math.min(1, MAX / Math.max(img.width, img.height));
                const w = Math.round(img.width * scale);
                const h = Math.round(img.height * scale);
                const canvas = document.createElement('canvas');
                canvas.width = w; canvas.height = h;
                canvas.getContext('2d').drawImage(img, 0, 0, w, h);
                resolve(canvas.toDataURL('image/jpeg', 0.72));
            };
            img.onerror = reject;
            img.src = e.target.result;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

function previewFoto(input, idx) {
    if (!input.files || !input.files[0]) return;
    fotosNuevas[idx] = input.files[0];
    const reader = new FileReader();
    reader.onload = e => {
        const slot = document.getElementById('fslot' + idx);
        if (slot) slot.innerHTML = `<img src="${e.target.result}" style="width:100%;height:100%;object-fit:cover;border-radius:10px;"><button class="fslot-del" onclick="borrarFoto(event,${idx})">✕</button><input type="file" id="finput${idx}" accept="image/*" style="display:none" onchange="previewFoto(this,${idx})">`;
    };
    reader.readAsDataURL(input.files[0]);
}

function borrarFoto(e, idx) {
    e.stopPropagation();
    fotosNuevas[idx] = null;
    const slot = document.getElementById('fslot' + idx);
    if (slot) {
        slot.innerHTML = `<div class="fslot-plus">+</div><div class="fslot-lbl">Foto ${idx+1}</div><input type="file" id="finput${idx}" accept="image/*" style="display:none" onchange="previewFoto(this,${idx})">`;
        slot.onclick = () => document.getElementById('finput' + idx).click();
    }
}

// ===== NUEVO SERVICIO =====
async function guardarServicio(eid) {
    const desc = document.getElementById('sDesc')?.value?.trim();
    if(!desc){ toast('⚠️ Ingresa el diagnostico'); return; }
    const tipo  = document.getElementById('sTipo').value;
    const fecha = document.getElementById('sFecha').value;
    const prox  = tipo === 'Mantenimiento' ? (document.getElementById('proxFecha')?.value || null) : null;
    const fotosBase64 = [];
    for (let i = 0; i < fotosNuevas.length; i++) {
        if (fotosNuevas[i]) fotosBase64.push(await fileToBase64(fotosNuevas[i]));
    }
    try {
        await addDoc(collection(db, 'servicios'), {
            equipoId: eid, tipo, fecha,
            tecnico: sesionActual?.nombre || '',
            descripcion: desc,
            proximoMantenimiento: prox,
            fotos: fotosBase64
        });
        closeModal();
        await cargarDatos();
        const e = getEq(eid);
        if(e) goTo('historial', e.clienteId, eid);
        toast('✅ Servicio guardado con ' + fotosBase64.length + ' foto(s)');
        if (esClienteJMC(getEq(eid)?.clienteId)) {
            const eq = getEq(eid);
            const tienda = getTiendaJMC(eq?.ubicacion);
            if (tienda && _jmcHtmlUltimo) {
                const srvExcel = {
                    ticket: _jmcTicketUltimo||'', sap: eq?.ubicacion||'',
                    tienda: tienda.tienda||'', ciudad: tienda.ciudad||'',
                    fecha, tipo, descripcion: desc,
                    repuestos: _jmcRepuestosUltimo||'',
                    tecnico: sesionActual?.nombre||'',
                    equipo: (eq?.tipo?eq.tipo+' ':'')+( eq?.marca||'')+' '+(eq?.modelo||''),
                };
                setTimeout(() => generarYGuardarExcelSemanal(srvExcel, fotosBase64, _jmcHtmlUltimo), 500);
            }
        }
    } catch(err) { toast('❌ Error: ' + err.message); }
}

function onTipoChange() {
    const tipo = document.getElementById('sTipo')?.value;
    const box  = document.getElementById('mantBox');
    if (box) box.classList.toggle('hidden', tipo !== 'Mantenimiento');
}

function modalNuevoServicio(eid) {
    if (!sesionActual) { toast('🔑 Inicia sesion para continuar'); return; }
    const e = getEq(eid);
    const c = getCl(e?.clienteId);
    const hoy = new Date().toISOString().split('T')[0];
    const esJMC = esClienteJMC(e?.clienteId);
    const esRO  = esClienteRO(e?.clienteId);
    const esD1  = esClienteD1(e?.clienteId);
    fotosNuevas = [null, null, null];
    _servicioEidActual = eid;
    const tiendaJMC = esJMC ? getTiendaJMC(e?.ubicacion) : null;
    const tiendaD1  = esD1 ? getTiendaD1(e?.idTienda) : null;
    const eqLabel   = (e?.tipo ? e.tipo : (e?.marca+' '+e?.modelo));

    showModal(`<div class="modal" onclick="event.stopPropagation()">
        <div class="modal-h"><h3>Nuevo servicio</h3><button class="xbtn" onclick="closeModal()">✕</button></div>
        <div class="modal-b">
            <div style="background:var(--bg2);padding:0.55rem;border-radius:8px;margin-bottom:0.65rem;">
                <strong>${c?.nombre}</strong><br>
                <span style="font-size:0.75rem;">${e?.marca} ${e?.modelo} · 📍 ${e?.ubicacion}</span>
                ${tiendaJMC ? `<br><span style="font-size:0.72rem;color:var(--green);">🏪 ${tiendaJMC.tienda} · ${tiendaJMC.ciudad}</span>` : ''}
                ${tiendaD1 ? `<br><span style="font-size:0.72rem;color:#e4002b;">🔴 ${tiendaD1.tienda} · ${tiendaD1.ciudad}</span>` : ''}
            </div>
            <div class="fr">
                <div><label class="fl">Tipo *</label><select class="fi" id="sTipo" onchange="onTipoChange()"><option>Mantenimiento</option><option>Reparacion</option><option>Instalacion</option></select></div>
                <div><label class="fl">Fecha *</label><input class="fi" type="date" id="sFecha" value="${hoy}"></div>
            </div>
            <label class="fl">Tecnico</label>
            <input class="fi" id="sTecnico" value="${sesionActual?.nombre||''}" readonly>
            ${esJMC ? `<div style="background:#f5f3ff;border-radius:10px;padding:0.65rem;margin-top:0.65rem;display:flex;justify-content:space-between;align-items:center;"><span style="color:#5b21b6;">📋 Informe Jeronimo Martins</span><button class="btn btn-sm" style="background:#7c3aed;color:white;" onclick="modalInformeJMC('${eid}')">Abrir</button></div>` : ''}
            ${esRO  ? `<div style="background:#e8f4fd;border-radius:10px;padding:0.65rem;margin-top:0.65rem;display:flex;justify-content:space-between;align-items:center;"><span style="color:#1565c0;">📋 Informe KRYOTEC SAS</span><button class="btn btn-sm" style="background:#1976d2;color:white;" onclick="modalInformeRO('${eid}')">Abrir</button></div>` : ''}
            ${esD1  ? `<div style="background:#fff1f2;border-radius:10px;padding:0.65rem;margin-top:0.65rem;display:flex;justify-content:space-between;align-items:center;"><span style="color:#e4002b;">📋 Acta D1 SAS</span><button class="btn btn-sm" style="background:#e4002b;color:white;" onclick="modalActaD1('${eid}')">Abrir</button></div>` : ''}
            <label class="fl">Diagnostico / Descripcion *</label>
            <textarea class="fi" id="sDesc" rows="3" placeholder="Trabajo realizado..."></textarea>
            <div class="mant-box hidden" id="mantBox">
                <label class="fl">📅 Proximo mantenimiento</label>
                <input class="fi" type="date" id="proxFecha">
            </div>
            <label class="fl">📷 Fotos (max 3)</label>
            <div class="foto-row">
                ${[0,1,2].map(i => `<div style="flex:1;"><div class="fslot" id="fslot${i}" onclick="document.getElementById('finput${i}').click()"><div class="fslot-plus">+</div><div class="fslot-lbl">Foto ${i+1}</div><input type="file" id="finput${i}" accept="image/*" style="display:none" onchange="previewFoto(this,${i})"></div></div>`).join('')}
            </div>
            <div class="modal-foot">
                <button class="btn btn-gray" onclick="closeModal()">Cancelar</button>
                <button class="btn btn-blue" onclick="guardarServicio('${eid}')">💾 Guardar</button>
            </div>
        </div>
    </div>`);
    onTipoChange();
}

function modalEditarServicio(sid) {
    const s = servicios.find(x => x.id === sid);
    if (!s) return;
    showModal(`<div class="modal"><div class="modal-h"><h3>Editar servicio</h3><button class="xbtn" onclick="closeModal()">✕</button></div><div class="modal-b"><div class="fr"><div><label class="fl">Tipo</label><select class="fi" id="esTipo"><option ${s.tipo==='Mantenimiento'?'selected':''}>Mantenimiento</option><option ${s.tipo==='Reparacion'?'selected':''}>Reparacion</option><option ${s.tipo==='Instalacion'?'selected':''}>Instalacion</option></select></div><div><label class="fl">Fecha</label><input class="fi" type="date" id="esFecha" value="${s.fecha}"></div></div><label class="fl">Diagnostico</label><textarea class="fi" id="esDesc" rows="3">${s.descripcion}</textarea><label class="fl">Proximo mantenimiento</label><input class="fi" type="date" id="esProx" value="${s.proximoMantenimiento||''}"><div class="modal-foot"><button class="btn btn-gray" onclick="closeModal()">Cancelar</button><button class="btn btn-blue" onclick="actualizarServicio('${sid}')">Guardar</button></div></div></div>`);
}

async function actualizarServicio(sid) {
    const tipo  = document.getElementById('esTipo')?.value;
    const fecha = document.getElementById('esFecha')?.value;
    const desc  = document.getElementById('esDesc')?.value?.trim();
    const prox  = document.getElementById('esProx')?.value || null;
    try {
        await updateDoc(doc(db, 'servicios', sid), { tipo, fecha, descripcion: desc, proximoMantenimiento: prox });
        closeModal(); await cargarDatos(); toast('✅ Servicio actualizado');
    } catch(err) { toast('❌ Error: ' + err.message); }
}

async function eliminarServicio(sid) {
    if (!confirm('¿Eliminar este servicio?')) return;
    try { await deleteDoc(doc(db, 'servicios', sid)); await cargarDatos(); toast('🗑️ Eliminado'); }
    catch(err) { toast('❌ Error: ' + err.message); }
}

// ===== MODAL ACTA D1 =====
async function modalActaD1(eid) {
    const e = getEq(eid);
    const tienda = getTiendaD1(e?.idTienda);
    const hoy = new Date().toISOString().split('T')[0];
    const dd = hoy.split('-')[2], mm = hoy.split('-')[1], aa = hoy.split('-')[0].slice(2);

    toast('⏳ Obteniendo consecutivo...');
    let consecutivo;
    try {
        consecutivo = await obtenerConsecutivoD1();
    } catch(err) {
        toast('❌ Error obteniendo consecutivo: ' + err.message);
        return;
    }

    const autoStyle = 'background:#2d3748;color:#a0aec0;border:1.5px solid #4a5568;';
    const manStyle  = 'background:white;border:2.5px solid #0c214a;';

    showModal(`<div class="modal modal-wide" onclick="event.stopPropagation()">
        <div class="modal-h" style="background:#e4002b;">
            <h3 style="color:white;">📋 Acta D1 SAS — ${consecutivo}</h3>
            <button class="xbtn" onclick="closeModal()">✕</button>
        </div>
        <div class="modal-b">

            <!-- PROVEEDOR -->
            <div style="background:#0c214a;color:white;text-align:center;padding:4px;margin-bottom:6px;border-radius:4px;font-size:0.7rem;font-weight:700;">DATOS DEL PROVEEDOR</div>
            <div class="fr">
                <div><label class="fl">Nombre</label><input class="fi" style="${autoStyle}" readonly value="KRYOTEC SERVICIOS SAS"></div>
                <div><label class="fl">NIT</label><input class="fi" style="${autoStyle}" readonly value="900.719.852-0"></div>
            </div>
            <div class="fr">
                <div><label class="fl">Consecutivo</label><input class="fi" style="${autoStyle}color:#fc8181;font-weight:700;font-family:monospace;" readonly value="${consecutivo}"></div>
                <div><label class="fl">ID Servicio D1 ★</label><input class="fi" style="${manStyle}" id="d1IdSrv" placeholder="Código D1 · Ej: 179423"></div>
            </div>

            <!-- TIENDA -->
            <div style="background:#0c214a;color:white;text-align:center;padding:4px;margin:10px 0 6px;border-radius:4px;font-size:0.7rem;font-weight:700;">TIENDA (CEDI)</div>
            <div class="fr">
                <div><label class="fl">Tienda</label><input class="fi" style="${autoStyle}" readonly value="${tienda?.tienda||''}"></div>
                <div style="max-width:100px;"><label class="fl">ID Tienda</label><input class="fi" style="${autoStyle}" readonly value="${e?.idTienda||''}"></div>
            </div>
            <div class="fr">
                <div><label class="fl">Fecha</label><input class="fi" style="${autoStyle}" readonly value="${dd}/${mm}/${aa}"></div>
                <div><label class="fl">Técnico</label><input class="fi" style="${autoStyle}" readonly value="${sesionActual?.nombre||''}"></div>
            </div>

            <!-- TIPO SERVICIO -->
            <div style="background:#0c214a;color:white;text-align:center;padding:4px;margin:10px 0 6px;border-radius:4px;font-size:0.7rem;font-weight:700;">TIPO DE SERVICIO</div>
            <label class="fl">Tipo de mantenimiento ★</label>
            <div style="display:flex;gap:6px;margin-bottom:8px;" id="d1TipoGroup">
                ${['Preventivo','Correctivo','Emergencia'].map((t,i)=>`
                <label style="flex:1;display:flex;align-items:center;gap:4px;padding:7px;border:2px solid ${i===0?'#0c214a':'#ddd'};border-radius:8px;cursor:pointer;background:${i===0?'#0c214a':'white'};color:${i===0?'white':'#666'};font-size:0.72rem;font-weight:600;" id="d1Tipo_${t}" onclick="d1SelectTipo('${t}')">
                    <input type="radio" name="d1Tipo" value="${t}" ${i===0?'checked':''} style="display:none;"> ${t}
                </label>`).join('')}
            </div>

            <label class="fl">Especialidad <span style="font-size:0.6rem;background:#dcfce7;color:#15803d;padding:1px 6px;border-radius:8px;margin-left:4px;">DEL EQUIPO</span></label>
            <input class="fi" style="${autoStyle}" readonly value="${e?.especialidad||'Refrigeración'}">

            <label class="fl" style="margin-top:6px;">Equipo intervenido <span style="font-size:0.6rem;background:#dcfce7;color:#15803d;padding:1px 6px;border-radius:8px;margin-left:4px;">DEL EQUIPO</span></label>
            <input class="fi" style="${autoStyle}" readonly value="${e?.tipo||''}">

            <!-- DESCRIPCIÓN -->
            <div style="background:#0c214a;color:white;text-align:center;padding:4px;margin:10px 0 6px;border-radius:4px;font-size:0.7rem;font-weight:700;">DESCRIPCIÓN DEL SERVICIO</div>

            <div style="background:#f8fafc;border:1.5px solid #e2e8f0;border-radius:8px;padding:8px;margin-bottom:8px;">
                <div style="font-size:0.68rem;font-weight:700;color:#0c214a;margin-bottom:4px;">① ¿Cuál era la falla y cómo la halló?</div>
                <textarea class="fi" style="${manStyle}" id="d1Falla" rows="5" placeholder="Describe la falla encontrada..."></textarea>
            </div>
            <div style="background:#f8fafc;border:1.5px solid #e2e8f0;border-radius:8px;padding:8px;margin-bottom:8px;">
                <div style="font-size:0.68rem;font-weight:700;color:#0c214a;margin-bottom:4px;">② ¿Qué hizo para repararla?</div>
                <textarea class="fi" style="${manStyle}" id="d1Trabajo" rows="5" placeholder="Describe el trabajo realizado..."></textarea>
            </div>
            <div style="background:#f8fafc;border:1.5px solid #e2e8f0;border-radius:8px;padding:8px;margin-bottom:8px;">
                <div style="font-size:0.68rem;font-weight:700;color:#0c214a;margin-bottom:4px;">③ ¿Cómo lo entrega?</div>
                <textarea class="fi" style="${manStyle}" id="d1Entrega" rows="3" placeholder="Condición de entrega..."></textarea>
            </div>
            <div style="background:#f8fafc;border:1.5px solid #e2e8f0;border-radius:8px;padding:8px;margin-bottom:8px;">
                <div style="font-size:0.68rem;font-weight:700;color:#0c214a;margin-bottom:6px;">④ Estado de entrega</div>
                <div id="d1EstadoGroup" style="display:flex;flex-direction:column;gap:5px;">
                    ${[
                        {val:'Funcionando',      icon:'✅', cls:'sel-green'},
                        {val:'Fuera de servicio',icon:'⚠️', cls:'sel-gold'},
                        {val:'No se pudo reparar',icon:'❌',cls:'sel-red'},
                        {val:'Dar de baja',      icon:'🗑️', cls:'sel-dark'}
                    ].map((o,i)=>`
                    <div id="d1Est_${i}" onclick="d1SelectEstado(${i},'${o.val}')"
                        style="display:flex;align-items:center;gap:8px;padding:8px 12px;border:2px solid ${i===0?'#059669':'#e2e8f0'};border-radius:8px;cursor:pointer;background:${i===0?'#f0fdf4':'white'};font-size:0.78rem;font-weight:600;color:${i===0?'#059669':'#666'};">
                        ${o.icon} ${o.val}
                    </div>`).join('')}
                </div>
                <input type="hidden" id="d1EstadoVal" value="Funcionando">
            </div>

            <!-- CONSTANCIA -->
            <div style="background:#0c214a;color:white;text-align:center;padding:4px;margin:10px 0 6px;border-radius:4px;font-size:0.7rem;font-weight:700;">CONSTANCIA / FIRMAS</div>
            <div class="fr">
                <div><label class="fl">Técnico</label><input class="fi" style="${autoStyle}font-style:italic;color:#93c5fd;" readonly value="${sesionActual?.nombre||''}"></div>
                <div><label class="fl">Cédula</label><input class="fi" style="${autoStyle}" readonly value="${sesionActual?.cedula||''}"></div>
            </div>
            <label class="fl">Nombre funcionario D1 ★</label>
            <input class="fi" style="${manStyle}" id="d1FuncNombre" placeholder="Nombre completo...">
            <label class="fl" style="margin-top:6px;">Identificación funcionario ★</label>
            <input class="fi" style="${manStyle}" id="d1FuncId" placeholder="Número de cédula...">
            <label class="fl" style="margin-top:6px;">Firma funcionario D1 (con el dedo)</label>
            <canvas id="d1FirmaCanvas" width="300" height="80"
                style="width:100%;height:80px;border:2px dashed #aaa;border-radius:8px;background:#fafafa;display:block;cursor:crosshair;"></canvas>
            <button class="btn btn-gray btn-sm" onclick="limpiarFirmaD1()" style="margin-top:4px;">🗑️ Limpiar firma</button>

            <div class="modal-foot">
                <button class="btn btn-gray" onclick="closeModal()">Cancelar</button>
                <button class="btn" style="background:#e4002b;color:white;" onclick="exportarActaD1('${eid}','${consecutivo}')">📄 Generar Acta PDF</button>
            </div>
        </div>
    </div>`);

    setTimeout(() => iniciarFirmaCanvas('d1FirmaCanvas'), 100);
}

// Selector tipo mantenimiento D1
window.d1SelectTipo = (val) => {
    ['Preventivo','Correctivo','Emergencia'].forEach(t => {
        const el = document.getElementById('d1Tipo_'+t);
        if (!el) return;
        const sel = t === val;
        el.style.background     = sel ? '#0c214a' : 'white';
        el.style.color          = sel ? 'white'   : '#666';
        el.style.borderColor    = sel ? '#0c214a' : '#ddd';
    });
};

// Selector estado D1
const D1_ESTADOS = [
    { border:'#059669', bg:'#f0fdf4', color:'#059669' },
    { border:'#d97706', bg:'#fffbeb', color:'#92400e' },
    { border:'#e4002b', bg:'#fff1f2', color:'#e4002b' },
    { border:'#555',    bg:'#f5f5f5', color:'#333'    }
];
window.d1SelectEstado = (idx, val) => {
    D1_ESTADOS.forEach((s,i) => {
        const el = document.getElementById('d1Est_'+i);
        if (!el) return;
        const sel = i === idx;
        el.style.borderColor = sel ? s.border : '#e2e8f0';
        el.style.background  = sel ? s.bg     : 'white';
        el.style.color       = sel ? s.color  : '#666';
    });
    const hid = document.getElementById('d1EstadoVal');
    if (hid) hid.value = val;
};

function limpiarFirmaD1() {
    const c = document.getElementById('d1FirmaCanvas');
    if (c) c.getContext('2d').clearRect(0, 0, c.width, c.height);
}

// ===== CANVAS FIRMA (reutilizable) =====
function iniciarFirmaCanvas(canvasId) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    canvas.width = canvas.offsetWidth;
    let drawing = false, lastX = 0, lastY = 0;
    const getPos = ev => {
        const r = canvas.getBoundingClientRect();
        const s = ev.touches ? ev.touches[0] : ev;
        return [s.clientX - r.left, s.clientY - r.top];
    };
    canvas.addEventListener('mousedown',  e => { drawing=true; [lastX,lastY]=getPos(e); });
    canvas.addEventListener('mousemove',  e => { if(!drawing) return; const [x,y]=getPos(e); ctx.beginPath(); ctx.moveTo(lastX,lastY); ctx.lineTo(x,y); ctx.strokeStyle='#1a1a6e'; ctx.lineWidth=2; ctx.lineCap='round'; ctx.stroke(); [lastX,lastY]=[x,y]; });
    canvas.addEventListener('mouseup',    () => drawing=false);
    canvas.addEventListener('mouseleave', () => drawing=false);
    canvas.addEventListener('touchstart', e => { e.preventDefault(); drawing=true; [lastX,lastY]=getPos(e); }, {passive:false});
    canvas.addEventListener('touchmove',  e => { e.preventDefault(); if(!drawing) return; const [x,y]=getPos(e); ctx.beginPath(); ctx.moveTo(lastX,lastY); ctx.lineTo(x,y); ctx.strokeStyle='#1a1a6e'; ctx.lineWidth=2; ctx.lineCap='round'; ctx.stroke(); [lastX,lastY]=[x,y]; }, {passive:false});
    canvas.addEventListener('touchend',   () => drawing=false);
}

// ===== EXPORTAR ACTA D1 PDF =====
async function exportarActaD1(eid, consecutivo) {
    const e       = getEq(eid);
    const tienda  = getTiendaD1(e?.idTienda);
    const canvas  = document.getElementById('d1FirmaCanvas');
    const firmaDataUrl = canvas ? canvas.toDataURL('image/png') : '';

    const idSrv       = document.getElementById('d1IdSrv')?.value?.trim() || '';
    const tipoMant    = document.querySelector('input[name="d1Tipo"]:checked')?.value || 'Preventivo';
    const falla       = document.getElementById('d1Falla')?.value?.trim()   || '';
    const trabajo     = document.getElementById('d1Trabajo')?.value?.trim() || '';
    const entrega     = document.getElementById('d1Entrega')?.value?.trim() || '';
    const estadoVal   = document.getElementById('d1EstadoVal')?.value       || 'Funcionando';
    const funcNombre  = document.getElementById('d1FuncNombre')?.value?.trim() || '';
    const funcId      = document.getElementById('d1FuncId')?.value?.trim()     || '';

    if (!idSrv)      { toast('⚠️ Ingresa el ID Servicio D1'); return; }
    if (!falla)      { toast('⚠️ Describe la falla encontrada'); return; }
    if (!trabajo)    { toast('⚠️ Describe el trabajo realizado'); return; }
    if (!entrega)    { toast('⚠️ Describe cómo lo entregas'); return; }
    if (!funcNombre) { toast('⚠️ Ingresa el nombre del funcionario D1'); return; }
    if (!funcId)     { toast('⚠️ Ingresa la identificación del funcionario'); return; }

    const hoy   = new Date().toISOString().split('T')[0];
    const dd    = hoy.split('-')[2];
    const mm    = hoy.split('-')[1];
    const aa    = hoy.split('-')[0].slice(2);
    const MESES = ['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'];
    const fechaTxt = `${parseInt(dd)} ${MESES[parseInt(mm)-1]} 20${aa}`;

    async function imgToBase64(url) {
        try {
            const r  = await fetch(url);
            const bl = await r.blob();
            return new Promise(res => { const rd = new FileReader(); rd.onload = () => res(rd.result); rd.readAsDataURL(bl); });
        } catch { return url; }
    }

    const LOGO_D1_URL   = 'https://raw.githubusercontent.com/capacitADA/KRYOTEC/main/Logo_D1.png';
    const LOGO_KRY_URL  = 'https://raw.githubusercontent.com/capacitADA/KRYOTEC/main/KRYOTEC_Logo.png';
    const MEDDON_URL    = 'https://raw.githubusercontent.com/capacitADA/KRYOTEC/main/Meddon-Regular.ttf';

    const [logo_d1_b64, logo_kry_b64, meddon_b64] = await Promise.all([
        imgToBase64(LOGO_D1_URL),
        imgToBase64(LOGO_KRY_URL),
        imgToBase64(MEDDON_URL)
    ]);

    const PC = '-webkit-print-color-adjust:exact;print-color-adjust:exact;';
    const S = {
        tbl:  'width:100%;border-collapse:collapse;margin-top:-1px;',
        hd:   `background:#333;color:white;font-weight:700;text-align:center;font-size:7pt;padding:3px;border:0.5px solid #555;${PC}`,
        lbl:  `background:#e8e8e8;font-weight:700;font-size:6pt;padding:2px 4px;border:0.5px solid #999;vertical-align:middle;${PC}`,
        val:  'font-family:Georgia,serif;font-size:7pt;padding:2px 4px;border:0.5px solid #999;vertical-align:middle;',
        chk:  'font-size:6pt;text-align:center;padding:2px 3px;border:0.5px solid #999;',
        chkOn:'font-size:6pt;text-align:center;padding:2px 3px;border:0.5px solid #999;background:#eff6ff;font-weight:700;',
    };

    const especialidad = e?.especialidad || 'Refrigeración';
    const tipoEquipo   = e?.tipo         || '';
    const ESPS  = ['Civil','Eléctrico','Metalmecánico','Refrigeración','Plomería','Cerrajería','Otro'];
    const TIPOS = ['Isla congeladora','Nevera','Aire acondicionado','Cortina de aire','Otro'];

    const lineRow = (txt='',last=false) =>
        `<tr><td style="height:10px;border-left:0.5px solid #999;border-right:0.5px solid #999;border-top:none;border-bottom:${last?'0.5px solid #999':'0.5px solid #ddd'};padding:1px 4px;font-family:Georgia,serif;font-size:7pt;">${txt}</td></tr>`;

    const estadoColors = {
        'Funcionando':       { bg:'#dcfce7', color:'#15803d', border:'#86efac' },
        'Fuera de servicio': { bg:'#fffbeb', color:'#92400e', border:'#fde68a' },
        'No se pudo reparar':{ bg:'#fff1f2', color:'#b91c1c', border:'#fecaca' },
        'Dar de baja':       { bg:'#f5f5f5', color:'#333',    border:'#aaa'    }
    };
    const ec = estadoColors[estadoVal] || estadoColors['Funcionando'];

    const nombreArch = `D1_${consecutivo}_${e?.idTienda||''}_${dd}-${mm}-${aa}`;

    const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>${nombreArch}</title>
<style>
  @page { size: A4; margin: 8mm; }
  @media print { html,body{margin:0;padding:0;} }
  body { font-family:Arial,sans-serif; margin:0; padding:4px; ${PC} }
  @font-face { font-family:'Meddon'; src:url('${meddon_b64}') format('truetype'); }
  .firma-tec { font-family:'Meddon',cursive; font-size:14px; color:#0c214a; }
</style>
</head><body>

<!-- HEADER -->
<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px;border-bottom:2px solid #e4002b;padding-bottom:5px;">
  <img src="${logo_d1_b64}" style="height:50px;" onerror="this.style.display='none'">
  <div style="text-align:center;flex:1;padding:0 10px;">
    <div style="font-size:10pt;font-weight:900;color:#1a1a1a;">ACTA DE ENTREGA SERVICIOS DE MANTENIMIENTO</div>
    <div style="font-size:8pt;font-weight:700;color:#e4002b;">REGIONAL ${(tienda?.regional||'SANTANDER').toUpperCase()}</div>
  </div>
  <div style="text-align:right;">
    <div style="font-size:5.5pt;color:#888;">FECHA</div>
    <div style="font-weight:700;font-size:8pt;font-family:monospace;">${fechaTxt}</div>
    <img src="${logo_kry_b64}" style="height:30px;margin-top:3px;" onerror="this.style.display='none'">
  </div>
</div>

<!-- PROVEEDOR -->
<table style="${S.tbl}">
  <tr><td colspan="4" style="${S.hd}">DATOS DEL PROVEEDOR</td></tr>
  <tr>
    <td style="${S.lbl};width:14%">NOMBRE</td>
    <td style="${S.val};width:36%">KRYOTEC SERVICIOS SAS</td>
    <td style="${S.lbl};width:10%">NIT</td>
    <td style="${S.val}">900.719.852-0</td>
  </tr>
  <tr>
    <td style="${S.lbl}">CONSECUTIVO</td>
    <td style="${S.val};font-family:monospace;font-weight:700;color:#e4002b;">${consecutivo}</td>
    <td style="${S.lbl}">ID SERVICIO</td>
    <td style="${S.val};font-family:monospace;font-weight:700;">${idSrv}</td>
  </tr>
  <tr>
    <td style="${S.lbl}">TIENDA (CEDI)</td>
    <td style="${S.val}">${tienda?.tienda||''}</td>
    <td style="${S.lbl}">ID TIENDA</td>
    <td style="${S.val};font-family:monospace;">${e?.idTienda||''}</td>
  </tr>
</table>

<!-- TIPO SERVICIO -->
<table style="${S.tbl}">
  <tr><td colspan="8" style="${S.hd}">TIPO DE SERVICIO SOLICITADO</td></tr>
  <tr>
    <td style="${S.lbl};width:20%">TIPO MANTENIMIENTO</td>
    ${['Preventivo','Correctivo','Emergencia'].map(t =>
      `<td style="${tipoMant===t?S.chkOn:S.chk}">${tipoMant===t?'☒':'☐'} ${t}</td>`
    ).join('')}
    <td colspan="5"></td>
  </tr>
  <tr>
    <td style="${S.lbl}">ESPECIALIDAD</td>
    ${ESPS.map(s => `<td style="${especialidad===s?S.chkOn:S.chk}">${especialidad===s?'☒':'☐'} ${s}</td>`).join('')}
  </tr>
  <tr>
    <td style="${S.lbl}">EQUIPO</td>
    ${TIPOS.map(t => `<td style="${tipoEquipo===t?S.chkOn:S.chk}">${tipoEquipo===t?'☒':'☐'} ${t}</td>`).join('')}
    <td colspan="3"></td>
  </tr>
</table>

<!-- DESCRIPCIÓN -->
<table style="${S.tbl}">
  <tr><td style="${S.hd}">DESCRIPCIÓN DEL SERVICIO EJECUTADO</td></tr>
</table>
<table style="${S.tbl}">
  <tr><td style="${S.lbl};border-bottom:none;">① FALLA ENCONTRADA</td></tr>
  ${lineRow(falla)}${lineRow()}${lineRow()}${lineRow()}${lineRow('',true)}
  <tr><td style="${S.lbl};border-top:0.5px solid #999;border-bottom:none;">② TRABAJO REALIZADO</td></tr>
  ${lineRow(trabajo)}${lineRow()}${lineRow()}${lineRow()}${lineRow('',true)}
  <tr><td style="${S.lbl};border-top:0.5px solid #999;border-bottom:none;">③ CONDICIÓN DE ENTREGA</td></tr>
  ${lineRow(entrega)}${lineRow()}${lineRow('',true)}
  <tr>
    <td style="border:0.5px solid #999;padding:4px 6px;display:flex;align-items:center;gap:8px;">
      <span style="${S.lbl};border:none;background:none;padding:0;">④ ESTADO:</span>
      <span style="display:inline-block;background:${ec.bg};color:${ec.color};border:1px solid ${ec.border};font-weight:700;font-size:7pt;padding:2px 10px;border-radius:3px;">${estadoVal}</span>
    </td>
  </tr>
</table>

<!-- FIRMAS -->
<table style="${S.tbl};margin-top:4px;">
  <tr><td colspan="2" style="${S.hd}">ENTREGA A SATISFACCIÓN D1 SAS</td></tr>
  <tr>
    <td style="${S.lbl};text-align:center;width:50%">FIRMA TÉCNICO (PROVEEDOR)</td>
    <td style="${S.lbl};text-align:center;">SELLO Y FIRMA D1 SAS</td>
  </tr>
  <tr>
    <td style="padding:6px;border:0.5px solid #999;text-align:center;vertical-align:top;">
      <div class="firma-tec">${sesionActual?.nombre||''}</div>
      <div style="font-size:5.5pt;color:#888;margin-top:2px;font-family:monospace;">C.C. ${sesionActual?.cedula||''}</div>
      <div style="font-size:5pt;color:#aaa;margin-top:1px;">${sesionActual?.cargo||''}</div>
    </td>
    <td style="padding:6px;border:0.5px solid #999;vertical-align:top;">
      <div style="border:1.5px solid #333;border-radius:4px;padding:5px 8px;text-align:center;font-size:5.5pt;line-height:1.7;display:inline-block;min-width:130px;">
        <div style="font-size:7pt;font-weight:900;letter-spacing:0.04em;">${(tienda?.tienda||'').toUpperCase()}</div>
        <div style="font-weight:700;">D1 S.A.S.</div>
        <div>REGIONAL ${(tienda?.regional||'SANTANDER').toUpperCase()}</div>
        <div style="font-family:monospace;">NIT. 900.276.962-1</div>
        <div style="border-top:0.5px solid #999;margin-top:3px;padding-top:3px;">
          ${firmaDataUrl ? `<img src="${firmaDataUrl}" style="max-height:32px;max-width:100px;">` : '<div style="height:28px;"></div>'}
          <div style="font-family:Georgia,serif;font-style:italic;font-size:6pt;">${funcNombre}</div>
          <div style="font-family:monospace;font-size:5.5pt;color:#888;">C.C. ${funcId}</div>
        </div>
      </div>
    </td>
  </tr>
</table>

<div style="font-size:5pt;color:#bbb;text-align:right;margin-top:4px;">
  Documento generado por capacitADA · KRYOTEC SERVICIOS SAS · ${fechaTxt} · ${consecutivo}
</div>
</body></html>`;

    // Guardar servicio en Firestore
    try {
        await addDoc(collection(db, 'servicios'), {
            equipoId:         eid,
            tipo:             'Reparacion',
            fecha:            hoy,
            tecnico:          sesionActual?.nombre || '',
            descripcion:      `[D1] ${falla}`,
            proximoMantenimiento: null,
            fotos:            [],
            // Campos extra D1
            consecutivoD1:    consecutivo,
            idServicioD1:     idSrv,
            tipoMantenimiento:tipoMant,
            especialidad:     especialidad,
            equipoIntervenido:tipoEquipo,
            falla,
            trabajoRealizado: trabajo,
            condicionEntrega: entrega,
            estadoEntrega:    estadoVal,
            funcionarioNombre:funcNombre,
            funcionarioId:    funcId,
            idTienda:         e?.idTienda || ''
        });
        toast('✅ Servicio D1 guardado');
        await cargarDatos();
    } catch(err) {
        toast('⚠️ Error guardando en Firestore: ' + err.message);
    }

    // Excel semanal D1
    try {
        const payload = {
            tipo: 'D1',
            fecha: hoy, consecutivo, idTienda: e?.idTienda||'',
            tienda: tienda?.tienda||'', ciudad: tienda?.ciudad||'',
            tecnico: sesionActual?.nombre||'',
            tipoMantenimiento: tipoMant,
            especialidad, equipo: tipoEquipo,
            idServicio: idSrv, falla, trabajo, entrega,
            estado: estadoVal,
            funcionario: funcNombre, funcionarioId: funcId
        };
        fetch(APPS_SCRIPT_URL, {
            method: 'POST', mode: 'no-cors',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
    } catch(e) { console.warn('Excel D1:', e); }

    // PDF a Drive
    const guardado = await driveUploadPDF(html, nombreArch + '.pdf');
    if (guardado) { toast('✅ Acta D1 guardada en Drive'); } else { toast('⚠️ No se pudo guardar en Drive'); }

    // Abrir e imprimir
    const blob = new Blob([html], { type: 'text/html' });
    const url  = URL.createObjectURL(blob);
    const v    = window.open(url, '_blank');
    if (v) { v.onload = () => v.print(); }

    closeModal();
    setTimeout(() => {
        if (_servicioEidActual) modalNuevoServicio(_servicioEidActual);
    }, 500);
}

// ===== MODAL INFORME JMC (sin cambios) =====
function modalInformeJMC(eid) {
    const e = getEq(eid);
    const hoy = new Date().toISOString().split('T')[0];
    const sapActual = e?.ubicacion;
    const tienda = getTiendaJMC(sapActual);
    const dd = hoy.split('-')[2], mm = hoy.split('-')[1], aa = hoy.split('-')[0].slice(2);

    showModal(`<div class="modal modal-wide"><div class="modal-h" style="background:#1e3a6e;"><h3>📋 Informe Jeronimo Martins — FF-JMC-DT-06</h3><button class="xbtn" onclick="closeModal()">✕</button></div>
        <div class="modal-b">
            <div style="background:#0c214a;color:white;text-align:center;padding:4px;margin-bottom:6px;border-radius:4px;">CONTRATISTA</div>
            <div class="fr"><div><label class="fl">Razon social</label><input class="fi" value="KRYOTEC SERVICIOS SAS" readonly></div><div><label class="fl">NIT</label><input class="fi" value="900.719.852-0" readonly></div></div>
            <div class="fr"><div><label class="fl">Contacto</label><input class="fi" value="Erwin Duarte" readonly></div><div><label class="fl">Telefono</label><input class="fi" value="313 329 2510" readonly></div></div>
            <div style="background:#0c214a;color:white;text-align:center;padding:4px;margin:10px 0 6px;border-radius:4px;">SOLICITANTE Y TIENDA</div>
            <div class="fr"><div><label class="fl">Nombre solicitante</label><input class="fi" id="jNombreSol" value="${tienda?.coordinador||''}" readonly></div><div><label class="fl">Cargo</label><input class="fi" id="jCargo" value="${tienda?.cargo||''}" readonly></div></div>
            <div class="fr"><div><label class="fl">Nombre tienda</label><input class="fi" id="jTienda" value="${tienda?.tienda||''}" readonly></div><div><label class="fl">N° Tienda (SAP)</label><input class="fi" id="jSAP" value="${sapActual||''}" readonly></div></div>
            <div class="fr"><div><label class="fl">N° Ticket</label><input class="fi" id="jTicket" placeholder="TK-..." style="background-color:#f0d759;"></div>
            <div><label class="fl">Fecha</label><div style="display:flex;gap:4px;"><input class="fi" id="jDD" placeholder="DD" value="${dd}" style="width:33%;"><input class="fi" id="jMM" placeholder="MM" value="${mm}" style="width:33%;"><input class="fi" id="jAA" placeholder="AA" value="${aa}" style="width:33%;"></div></div></div>
            <div class="fr"><div><label class="fl">Municipio</label><input class="fi" id="jMunicipio" value="${tienda?.ciudad||''}" readonly></div><div><label class="fl">Departamento</label><input class="fi" id="jDepartamento" value="${tienda?.departamento||''}" readonly></div></div>
            <div style="background:#0c214a;color:white;text-align:center;padding:4px;margin:10px 0 6px;border-radius:4px;">INFORMACION TECNICA</div>
            <div class="fr"><div><label class="fl">Nombre del equipo</label><input class="fi" id="jEquipo" value="${e?.tipo ? e.tipo + ' ' : ''}${e?.modelo||''}" readonly></div><div><label class="fl">Marca</label><input class="fi" id="jMarca" value="${e?.marca||''}" readonly></div></div>
            <div><label class="fl">Serial</label><input class="fi" id="jSerial" value="${e?.serie||''}" readonly></div>
            <div style="background:#0c214a;color:white;text-align:center;padding:4px;margin:10px 0 6px;border-radius:4px;">TIPO DE ASISTENCIA</div>
            <div style="display:flex;flex-wrap:wrap;gap:6px;">${['Reparacion','Garantia','Ajuste','Modificacion','Servicio','Mejora','Combinacion'].map(t=>`<label><input type="radio" name="jTipoAsi" value="${t}" ${t==='Reparacion'?'checked':''}> ${t}</label>`).join('')}</div>
            <div style="background:#0c214a;color:white;text-align:center;padding:4px;margin:10px 0 6px;border-radius:4px;">TIPO DE FALLA</div>
            <div style="display:flex;flex-wrap:wrap;gap:6px;">${['Mecanicas','Material','Instrumentos','Electricas','Influencia Externa'].map(t=>`<label><input type="radio" name="jTipoFalla" value="${t}"> ${t}</label>`).join('')}</div>
            <div style="background:#0c214a;color:white;text-align:center;padding:4px;margin:10px 0 6px;border-radius:4px;">CAUSA DE FALLAS</div>
            <div style="display:flex;flex-wrap:wrap;gap:6px;">${['Diseno','Fabricacion/Instalacion','Operacion/Mantenimiento','Administracion','Desconocida'].map(t=>`<label><input type="radio" name="jCausa" value="${t}"> ${t}</label>`).join('')}</div>
            <label class="fl">Descripcion de la falla</label><textarea class="fi" id="jDescFalla" rows="2"></textarea>
            <label class="fl">Diagnostico del tecnico</label><textarea class="fi" id="jDiag" rows="3"></textarea>
            <label class="fl">Repuestos cambiados</label><textarea class="fi" id="jRepuestos" rows="2"></textarea>
            <label class="fl">Observaciones</label><textarea class="fi" id="jObs" rows="2"></textarea>
            <div style="background:#0c214a;color:white;text-align:center;padding:4px;margin:10px 0 6px;border-radius:4px;">CONSTANCIA</div>
            <div class="fr"><div><label class="fl">Tecnico encargado</label><input class="fi" value="${sesionActual?.nombre||''}" readonly></div><div><label class="fl">Cedula</label><input class="fi" value="${sesionActual?.cedula||''}" readonly></div></div>
            <div class="fr"><div><label class="fl">Hora entrada</label><input class="fi" type="time" id="jHEntrada"></div><div><label class="fl">Hora salida</label><input class="fi" type="time" id="jHSalida"></div></div>
            <div class="fr"><div><label class="fl">Nombre funcionario</label><input class="fi" id="jFuncNombre"></div><div><label class="fl">Cedula</label><input class="fi" id="jFuncCedula"></div></div>
            <div class="fr"><div><label class="fl">Cargo</label><input class="fi" id="jFuncCargo"></div><div><label class="fl">SAP</label><input class="fi" id="jFuncSAP"></div></div>
            <label class="fl">Firma</label>
            <canvas id="jFirmaCanvas" width="300" height="80" style="width:100%;height:80px;border:1.5px dashed var(--green);border-radius:8px;background:#f0faf5;"></canvas>
            <button class="btn btn-gray btn-sm" onclick="limpiarFirmaJMC()">🗑 Limpiar firma</button>
            <div class="modal-foot"><button class="btn btn-gray" onclick="closeModal()">Cancelar</button><button class="btn btn-blue" onclick="exportarInformeJMC('${eid}')">📄 Exportar PDF</button></div>
        </div>
    </div>`);
    setTimeout(() => iniciarFirmaCanvas('jFirmaCanvas'), 100);
}

function limpiarFirmaJMC() {
    const c = document.getElementById('jFirmaCanvas');
    if (c) c.getContext('2d').clearRect(0, 0, c.width, c.height);
}

async function generarSelloCompuesto(selloBase64, sapVal, ddVal, mmVal, aaVal) {
    return new Promise(resolve => {
        const tmpImg = new Image();
        tmpImg.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = 147; canvas.height = 53;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(tmpImg, 0, 0, 147, 53);
            ctx.font = `15px 'Arial Narrow', Arial, sans-serif`;
            ctx.fillStyle = '#2c3e50'; ctx.textAlign = 'right';
            ctx.fillText(sapVal||'', 141, 19);
            const hoy = new Date();
            const dia  = (ddVal&&ddVal.toString().trim()!=='') ? ddVal : hoy.getDate().toString().padStart(2,'0');
            const mes  = (mmVal&&mmVal.toString().trim()!=='') ? mmVal : (hoy.getMonth()+1).toString().padStart(2,'0');
            const anio = (aaVal&&aaVal.toString().trim()!=='') ? aaVal : hoy.getFullYear().toString().slice(-2);
            ctx.font = `14px Georgia, serif`; ctx.fillStyle='#1e3a5f'; ctx.textAlign='left';
            ctx.fillText(`${dia}-${mes}-${anio}`, 53, 47);
            resolve(canvas.toDataURL('image/png'));
        };
        tmpImg.onerror = () => resolve(selloBase64);
        tmpImg.src = selloBase64;
    });
}

async function exportarInformeJMC(eid) {
    const e = getEq(eid);
    const canvas = document.getElementById('jFirmaCanvas');
    const firmaDataUrl = canvas ? canvas.toDataURL('image/png') : '';
    const getRadio = name => document.querySelector(`input[name="${name}"]:checked`)?.value||'';
    const ticket = document.getElementById('jTicket')?.value||'';
    if (!ticket||ticket.trim()==='') {
        if (!confirm('⚠️ El número de ticket está vacío. ¿Continuar sin ticket?')) {
            document.getElementById('jTicket').focus(); return;
        }
    }
    const sap        = document.getElementById('jSAP')?.value||'';
    const dd         = document.getElementById('jDD')?.value||'';
    const mm         = document.getElementById('jMM')?.value||'';
    const aa         = document.getElementById('jAA')?.value||'';
    const fechaArch  = dd&&mm&&aa ? `${dd}-${mm}-${aa}` : new Date().toISOString().split('T')[0];
    const nombreArch = `TK_${ticket||'sin-ticket'}_SAP_${sap||'sin-sap'}_${fechaArch}`;
    const tiendaActual   = getTiendaJMC(sap);
    const nomSol     = document.getElementById('jNombreSol')?.value||'';
    const cargoSol   = document.getElementById('jCargo')?.value||'';
    const nomTienda  = document.getElementById('jTienda')?.value||'';
    const municipio  = document.getElementById('jMunicipio')?.value||'';
    const depto      = document.getElementById('jDepartamento')?.value||'';
    const nomEquipo  = document.getElementById('jEquipo')?.value||'';
    const marcaEq    = document.getElementById('jMarca')?.value||'';
    const serialEq   = document.getElementById('jSerial')?.value||'';
    const descFalla  = document.getElementById('jDescFalla')?.value||'';
    const diag       = document.getElementById('jDiag')?.value||'';
    const repuestos  = document.getElementById('jRepuestos')?.value||'';
    const obs        = document.getElementById('jObs')?.value||'';
    const hEntrada   = document.getElementById('jHEntrada')?.value||'';
    const hSalida    = document.getElementById('jHSalida')?.value||'';
    const funcNombre = document.getElementById('jFuncNombre')?.value||'';
    const funcCedula = document.getElementById('jFuncCedula')?.value||'';
    const funcCargo  = document.getElementById('jFuncCargo')?.value||'';
    const funcSAP    = document.getElementById('jFuncSAP')?.value||'';
    const tipoAsi    = getRadio('jTipoAsi');
    const tipoFalla  = getRadio('jTipoFalla');
    const causa      = getRadio('jCausa');

    const LOGO_ARA = 'https://raw.githubusercontent.com/capacitADA/KRYOTEC/main/logo_ara.png';
    const LOGO_JM  = 'https://raw.githubusercontent.com/capacitADA/KRYOTEC/main/JEronimo_LOGO.png';
    const SELLO_URL= 'https://raw.githubusercontent.com/capacitADA/KRYOTEC/main/sello_ara.png';
    const MEDDON_URL='https://raw.githubusercontent.com/capacitADA/KRYOTEC/main/Meddon-Regular.ttf';

    async function imgToBase64(url) {
        try { const r=await fetch(url); const bl=await r.blob(); return new Promise(res=>{const rd=new FileReader();rd.onload=()=>res(rd.result);rd.readAsDataURL(bl);}); }
        catch { return url; }
    }
    const [logo_ara_b64,logo_jm_b64,sello_b64_raw,meddon_b64] = await Promise.all([
        imgToBase64(LOGO_ARA),imgToBase64(LOGO_JM),imgToBase64(SELLO_URL),imgToBase64(MEDDON_URL)
    ]);
    const sello_b64 = await generarSelloCompuesto(sello_b64_raw, sap, dd, mm, aa);

    const PC='webkit-print-color-adjust:exact;print-color-adjust:exact;';
    const GE='font-family:Georgia,serif;';
    const S={
        hdrDark:`background:#555555;color:white;font-weight:700;text-align:center;font-size:7.5pt;padding:2px 3px;border:1px solid #333;${PC}`,
        hdrLight:`background:#bbbbbb;color:#111;font-weight:700;text-align:center;font-size:7.5pt;padding:2px 3px;border:1px solid #333;${PC}`,
        glbl:`background:#dddddd;font-size:6.5pt;font-weight:700;padding:1px 3px;border:1px solid #333;vertical-align:middle;${PC}`,
        cell:'font-size:7.5pt;padding:1px 3px;border:1px solid #333;vertical-align:middle;',
        campo:`font-size:7.5pt;padding:1px 3px;border:1px solid #333;vertical-align:middle;${GE}`,
        opt:'font-size:7pt;text-align:center;padding:2px 3px;border:1px solid #333;white-space:nowrap;',
        lineR:`height:11px;border-left:1px solid #333;border-right:1px solid #333;border-top:none;border-bottom:1px solid #aaa;padding:1px 3px;font-size:7pt;${GE}`,
        lineL:`height:11px;border-left:1px solid #333;border-right:1px solid #333;border-top:none;border-bottom:1px solid #333;padding:1px 3px;font-size:7pt;${GE}`,
        evalSec:'font-weight:700;font-style:italic;font-size:7pt;padding:1px 3px;border:1px solid #333;vertical-align:middle;',
        evalTxt:'font-size:6.5pt;padding:1px 3px;border:1px solid #333;',
        evalChk:'text-align:center;font-size:10pt;font-weight:900;padding:1px 3px;border:1px solid #333;',
        evalNo:'padding:1px 3px;border:1px solid #333;',
        tbl:'width:100%;border-collapse:collapse;margin-top:-1px;',
    };
    const chkMark = sel => sel
        ? `<span style="display:inline-block;width:10px;height:10px;background:#222;border:1.5px solid #222;vertical-align:middle;margin-right:3px;"></span>`
        : `<span style="display:inline-block;width:10px;height:10px;background:white;border:1.5px solid #333;vertical-align:middle;margin-right:3px;"></span>`;
    const lineRow = (txt='',last=false) =>
        `<tr><td style="${last?S.lineL:S.lineR}" class="campo">${txt}</td></tr>`;
    const evalGrupos = [
        {sec:'SEGURIDAD',items:['La labor realizada genera una alta riesgo de accidentalidad para los clientes y/o colaboradores','La labor realizada ofrece algun riesgo para la integridad del equipo']},
        {sec:'FUNCIONAMIENTO',items:['La falla reportada fue solucionada con el trabajo realizado','Para operar y/o asear el equipo o area intervenida se siguen los pasos normales de manejo anteriores a la asistencia']},
        {sec:'CALIDAD',items:['La calidad del trabajo esta de acuerdo a la requerida por el personal o el equipo']},
        {sec:'LIMPIEZA Y ORGANIZACION',items:['El equipo o area intervenida se dejo armado y/o organizado como se encontraba en un inicio','Los escombros y suciedad generada por el tecnico fue aseado']},
        {sec:'CAPACITACION',items:['Se indico la causa de la novedad al personal que recibio el trabajo','Se indico como prevenir que el problema se vuelva a presentar','Se indico como actuar en caso de que el problema se vuelva a presentar']}
    ];
    let evalHTML='';
    evalGrupos.forEach(g=>{g.items.forEach((item,idx)=>{evalHTML+=`<tr>${idx===0?`<td rowspan="${g.items.length}" style="${S.evalSec}">${g.sec}</td>`:''}<td style="${S.evalTxt}">${item}</td><td style="${S.evalChk}">&#10007;</td><td style="${S.evalNo}"></td></tr>`;});});
    const optsAsi=['Reparacion','Garantia','Ajuste','Modificacion','Servicio','Mejora','Combinacion'];
    const optsFalla=['Mecanicas','Material','Instrumentos','Electricas','Influencia Externa'];
    const optsCausa=['Diseno','Fabricacion/Instalacion','Operacion/Mantenimiento','Administracion','Desconocida'];
    const MESES_TEXTO=['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'];
    const fechaTexto = dd&&mm&&aa ? `${parseInt(dd)} ${MESES_TEXTO[parseInt(mm)-1]} 20${aa}` : '';

    const html=`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>TK_${ticket}</title>
<style>@page{size:A4;margin:7mm;}@media print{html,body{margin:0;padding:0;}}body{font-family:Arial,sans-serif;margin:0;padding:4px;-webkit-print-color-adjust:exact;print-color-adjust:exact;}@font-face{font-family:'Meddon';src:url('${meddon_b64}') format('truetype');}
.firma-tec{font-family:'Meddon',cursive;font-size:14px;color:#1a1a6e;}.campo{font-family:Georgia,serif;}</style></head><body>
<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
  <img src="${logo_ara_b64}" style="height:76px;" onerror="this.style.display='none'">
  <div style="text-align:center;flex:1;"><div style="font-size:13pt;font-weight:900;">JERONIMO MARTINS COLOMBIA</div><div style="font-size:8pt;">FORMATO UNICO DE SOPORTE</div><div style="font-size:8pt;">FF-JMC-DT-06</div></div>
  <img src="${logo_jm_b64}" style="height:68px;" onerror="this.style.display='none'">
</div>
<table style="${S.tbl}"><tr><td colspan="4" style="${S.hdrDark}">CONTRATISTA</td></tr>
<tr><td style="${S.glbl};width:16%">Razon social</td><td style="${S.cell};width:34%">KRYOTEC SERVICIOS SAS</td><td style="${S.glbl};width:12%">N&deg; NIT</td><td style="${S.cell};">900.719.852-0</td></tr>
<tr><td style="${S.glbl};">Contacto</td><td style="${S.cell};">Erwin Duarte</td><td style="${S.glbl};">Telefono</td><td style="${S.cell};">313 329 2510</td></tr></table>
<table style="${S.tbl}"><tr><td colspan="8" style="${S.hdrDark}">SOLICITANTE Y TIENDA BENEFICIARIA</td></tr>
<tr><td style="${S.glbl};width:13%">Nombre del solicitante</td><td colspan="4" style="${S.cell};">${nomSol}</td><td style="${S.glbl};width:8%">Cargo</td><td colspan="2" style="${S.cell};">${cargoSol}</td></tr>
<tr><td style="${S.glbl};">Nombre de la tienda</td><td style="${S.cell};width:17%;">${nomTienda}</td><td style="${S.glbl};width:9%">N&deg; Tienda</td><td style="${S.cell};width:7%;">${sap}</td>
<td style="background:#c0392b;color:white;font-weight:700;font-size:7pt;text-align:center;padding:2px 4px;border:1px solid #333;width:10%;">N&deg; TICKET:</td>
<td style="${S.cell};width:12%;font-size:11pt;">${ticket}</td><td style="${S.glbl};text-align:center;width:6%;" rowspan="2">Fecha</td><td style="${S.cell};text-align:center;width:14%;" rowspan="2">${fechaTexto}</td></tr>
<tr><td style="${S.glbl};">Municipio</td><td colspan="2" style="${S.cell};">${municipio}</td><td colspan="2" style="${S.glbl};">Departamento</td><td style="${S.cell};">${depto}</td></tr></table>
<table style="${S.tbl}"><tr><td colspan="6" style="${S.hdrDark}">INFORMACION AREA TECNICA</td></tr>
<tr><td style="${S.glbl};width:16%">Nombre del equipo</td><td style="${S.cell};width:28%">${nomEquipo}</td><td style="${S.glbl};width:10%">Marca</td><td style="${S.cell};width:16%">${marcaEq}</td><td style="${S.glbl};width:10%">Serial</td><td style="${S.cell};">${serialEq}</td></tr></table>
<table style="${S.tbl}"><tr><td colspan="7" style="${S.hdrLight}">TIPO DE ASISTENCIA</td></tr><tr>${optsAsi.map(t=>`<td style="${S.opt}">${chkMark(tipoAsi===t)}${t}</td>`).join('')}</tr></table>
<table style="${S.tbl}"><tr><td colspan="5" style="${S.hdrLight}">TIPO DE FALLA</td></tr><tr>${optsFalla.map(t=>`<td style="${S.opt}">${chkMark(tipoFalla===t)}${t}</td>`).join('')}</tr></table>
<table style="${S.tbl}"><tr><td colspan="5" style="${S.hdrLight}">CAUSA DE FALLAS BASICAS</td></tr><tr>${optsCausa.map(t=>`<td style="${S.opt}">${chkMark(causa===t)}${t}</td>`).join('')}</tr></table>
<table style="${S.tbl}">
  <tr><td style="${S.glbl};border-bottom:none;padding:2px 4px;">Descripcion de la falla funcionario tienda:</td></tr>
  ${lineRow(descFalla)}${lineRow()}${lineRow('',true)}
  <tr><td style="${S.glbl};border-top:1px solid #333;border-bottom:none;padding:2px 4px;">Diagnostico del tecnico:</td></tr>
  ${lineRow(diag)}${lineRow()}${lineRow()}${lineRow()}${lineRow('',true)}
  <tr><td style="${S.glbl};border-top:1px solid #333;border-bottom:none;padding:2px 4px;">Repuestos cambiados:</td></tr>
  ${lineRow(repuestos||'NA')}${lineRow()}${lineRow('',true)}
  <tr><td style="${S.glbl};border-top:1px solid #333;border-bottom:none;padding:2px 4px;">Observaciones:</td></tr>
  ${lineRow(obs)}${lineRow()}${lineRow('',true)}
</table>
<table style="${S.tbl}"><tr><td colspan="4" style="${S.hdrDark}">EVALUACION DEL SERVICIO</td></tr>
<tr><th style="${S.glbl};width:16%;text-align:center;">PARAMETROS</th><th style="${S.glbl};"></th><th style="${S.glbl};width:9%;text-align:center;">CUMPLE</th><th style="${S.glbl};width:9%;text-align:center;">NO CUMPLE</th></tr>
${evalHTML}</table>
<table style="${S.tbl}"><tr><td colspan="6" style="${S.hdrDark}">CONSTANCIA REALIZACION ASISTENCIA</td></tr>
<tr><td style="${S.glbl};width:24%;text-align:center;">Contratistas</td><td style="${S.glbl};width:10%;text-align:center;">Cedula</td><td style="${S.glbl};width:11%;text-align:center;">Hora entrada</td><td style="${S.glbl};width:11%;text-align:center;">Hora salida</td><td style="${S.glbl};width:8%;text-align:center;">Datos</td><td style="${S.glbl};text-align:center;">Funcionario de la tienda</td></tr>
<tr><td style="${S.campo};">${sesionActual?.nombre||''}</td><td style="${S.campo};text-align:center;">${sesionActual?.cedula||''}</td><td style="${S.campo};text-align:center;">${hEntrada}</td><td style="${S.campo};text-align:center;">${hSalida}</td><td style="${S.glbl};">Nombre:</td><td style="${S.campo};">${funcNombre}</td></tr>
<tr><td style="${S.cell};"></td><td style="${S.cell};"></td><td style="${S.cell};"></td><td style="${S.cell};"></td><td style="${S.glbl};">Cedula:</td><td style="${S.campo};">${funcCedula}</td></tr>
<tr><td style="${S.cell};"></td><td style="${S.cell};"></td><td style="${S.cell};"></td><td style="${S.cell};"></td><td style="${S.glbl};">Cargo:</td><td style="${S.campo};">${funcCargo}</td></tr>
<tr><td style="${S.cell};"></td><td style="${S.cell};"></td><td style="${S.cell};"></td><td style="${S.cell};"></td><td style="${S.glbl};">SAP:</td><td style="${S.campo};">${funcSAP}</td></tr>
<tr><td style="${S.glbl};">Firma Tecnico:</td><td colspan="3" style="${S.cell};padding:4px 6px;"><span class="firma-tec">${sesionActual?.nombre||''}</span></td>
<td style="${S.glbl};text-align:center;vertical-align:middle;" rowspan="2">Firma:</td>
<td style="${S.cell};padding:4px;vertical-align:middle;" rowspan="2"><div style="display:flex;align-items:flex-end;gap:8px;"><div style="flex:1;min-height:44px;text-align:center;">${firmaDataUrl?`<img src="${firmaDataUrl}" style="max-height:44px;">`:''}</div><div style="flex-shrink:0;"><img src="${sello_b64}" style="width:106px;height:50px;display:block;background:transparent;"></div></div></td></tr>
<tr><td style="${S.glbl};">Cargo:</td><td colspan="3" style="${S.campo};">${sesionActual?.cargo||''}</td></tr>
</table>
<div style="font-size:7pt;color:#888;text-align:right;margin-top:3px;">Documento generado por capacitADA — ${new Date().toLocaleString()}</div>
</body></html>`;

    const guardado = await driveUploadPDF(html, nombreArch+'.pdf');
    if (guardado) { toast('✅ Informe JMC guardado en Drive'); } else { toast('⚠️ No se pudo guardar en Drive'); }
    const blob = new Blob([html],{type:'text/html'});
    const url  = URL.createObjectURL(blob);
    const ventana = window.open(url,'_blank');
    if (ventana) { ventana.onload=()=>ventana.print(); }
    _jmcHtmlUltimo      = html;
    _jmcTicketUltimo    = ticket;
    _jmcRepuestosUltimo = repuestos;
    closeModal();
    setTimeout(()=>{ if(_servicioEidActual) modalNuevoServicio(_servicioEidActual); },500);
}

// ===== MODAL INFORME RO =====
function modalInformeRO(eid) {
    const e = getEq(eid);
    const hoy = new Date().toISOString().split('T')[0];
    const dd=hoy.split('-')[2],mm=hoy.split('-')[1],aa=hoy.split('-')[0].slice(2);
    showModal(`<div class="modal modal-wide"><div class="modal-h" style="background:#1565c0;"><h3>📋 Informe Tecnico — KRYOTEC SERVICIOS SAS</h3><button class="xbtn" onclick="closeModal()">✕</button></div>
        <div class="modal-b">
            <div class="fr"><div><label class="fl">Razon social</label><input class="fi" value="KRYOTEC SERVICIOS SAS" readonly></div><div><label class="fl">NIT</label><input class="fi" value="900.719.852-0" readonly></div></div>
            <div class="fr"><div><label class="fl">Contacto</label><input class="fi" value="Erwin Duarte" readonly></div><div><label class="fl">Telefono</label><input class="fi" value="313 329 2510" readonly></div></div>
            <div class="fr"><div><label class="fl">Equipo</label><input class="fi" id="rEquipo" value="${e?.tipo?e.tipo+' ':''}${e?.marca||''} ${e?.modelo||''}" readonly></div><div><label class="fl">Serial</label><input class="fi" id="rSerial" value="${e?.serie||''}" readonly></div></div>
            <div><label class="fl">Ubicacion</label><input class="fi" id="rUbicacion" value="${e?.ubicacion||''}" readonly></div>
            <div style="display:flex;flex-wrap:wrap;gap:6px;margin:6px 0;">${['Mantenimiento Preventivo','Mantenimiento Correctivo','Instalacion','Garantia','Revision'].map(t=>`<label><input type="radio" name="rTipoSrv" value="${t}" ${t==='Mantenimiento Preventivo'?'checked':''}> ${t}</label>`).join('')}</div>
            <label class="fl">Descripcion del trabajo *</label><textarea class="fi" id="rDesc" rows="3"></textarea>
            <label class="fl">Repuestos</label><textarea class="fi" id="rRepuestos" rows="2" placeholder="NA"></textarea>
            <div class="fr"><div><label class="fl">Hora entrada</label><input class="fi" type="time" id="rHEntrada"></div><div><label class="fl">Hora salida</label><input class="fi" type="time" id="rHSalida"></div></div>
            <div class="fr"><div><label class="fl">Fecha</label><div style="display:flex;gap:4px;"><input class="fi" id="rDD" value="${dd}" style="width:33%;"><input class="fi" id="rMM" value="${mm}" style="width:33%;"><input class="fi" id="rAA" value="${aa}" style="width:33%;"></div></div></div>
            <label class="fl">Nombre quien recibe</label><input class="fi" id="rRecibe">
            <label class="fl">Firma</label>
            <canvas id="rFirmaCanvas" width="300" height="80" style="width:100%;height:80px;border:1.5px dashed #1976d2;border-radius:8px;background:#e8f4fd;"></canvas>
            <button class="btn btn-gray btn-sm" onclick="limpiarFirmaRO()">🗑 Limpiar firma</button>
            <div class="modal-foot"><button class="btn btn-gray" onclick="closeModal()">Cancelar</button><button class="btn btn-sm" style="background:#1976d2;color:white;" onclick="exportarInformeRO('${eid}')">📄 Exportar PDF</button></div>
        </div></div>`);
    setTimeout(()=>iniciarFirmaCanvas('rFirmaCanvas'),100);
}

function limpiarFirmaRO() {
    const c=document.getElementById('rFirmaCanvas');
    if(c) c.getContext('2d').clearRect(0,0,c.width,c.height);
}

async function exportarInformeRO(eid) {
    const e=getEq(eid);
    const canvas=document.getElementById('rFirmaCanvas');
    const firmaDataUrl=canvas?canvas.toDataURL('image/png'):'';
    const getRadio=name=>document.querySelector(`input[name="${name}"]:checked`)?.value||'';
    const dd=document.getElementById('rDD')?.value||'';
    const mm=document.getElementById('rMM')?.value||'';
    const aa=document.getElementById('rAA')?.value||'';
    const desc=document.getElementById('rDesc')?.value||'';
    const repuestos=document.getElementById('rRepuestos')?.value||'NA';
    const hEntrada=document.getElementById('rHEntrada')?.value||'';
    const hSalida=document.getElementById('rHSalida')?.value||'';
    const recibe=document.getElementById('rRecibe')?.value||'';
    const tipoSrv=getRadio('rTipoSrv');
    const MESES=['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'];
    const fechaTexto=dd&&mm&&aa?`${parseInt(dd)} ${MESES[parseInt(mm)-1]} 20${aa}`:'';
    const fechaArch=dd&&mm&&aa?`${dd}-${mm}-${aa}`:new Date().toISOString().split('T')[0];
    const nombreArch=`RO_${e?.ubicacion||'equipo'}_${fechaArch}`;
    const LOGO_OLM='https://raw.githubusercontent.com/capacitADA/KRYOTEC/main/KRYOTEC_Logo.png';
    async function imgToBase64(url){try{const r=await fetch(url);const bl=await r.blob();return new Promise(res=>{const rd=new FileReader();rd.onload=()=>res(rd.result);rd.readAsDataURL(bl);});}catch{return url;}}
    const [logo_olm_b64,meddon_b64]=await Promise.all([imgToBase64(LOGO_OLM),imgToBase64('https://raw.githubusercontent.com/capacitADA/KRYOTEC/main/Meddon-Regular.ttf')]);
    const PC='-webkit-print-color-adjust:exact;print-color-adjust:exact;';
    const AZUL='#1565c0';
    const html=`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${nombreArch}</title>
<style>@page{size:A4;margin:7mm;}body{font-family:Arial,sans-serif;margin:0;padding:4px;${PC}}@font-face{font-family:'Meddon';src:url('${meddon_b64}') format('truetype');}
.firma{font-family:'Meddon',cursive;font-size:19px;color:${AZUL};}table{width:100%;border-collapse:collapse;margin-top:-1px;}td,th{border:1px solid #333;padding:1px 3px;vertical-align:middle;font-size:7.5pt;}
.hd{background:${AZUL};color:white;font-weight:700;text-align:center;font-size:7.5pt;${PC}}.hl{background:#e3f2fd;color:#111;font-weight:700;text-align:center;font-size:7.5pt;${PC}}.gl{background:#dde8f8;font-size:6.5pt;font-weight:700;${PC}}</style></head><body>
<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;border-bottom:3px solid ${AZUL};padding-bottom:6px;">
  <img src="${logo_olm_b64}" style="height:60px;" onerror="this.style.display='none'">
  <div style="text-align:center;flex:1;"><div style="font-size:12pt;font-weight:900;color:${AZUL};">KRYOTEC SERVICIOS SAS</div><div style="font-size:8pt;">INFORME TECNICO DE SERVICIO</div><div style="font-size:7pt;color:#555;">NIT: 900.719.852-0</div></div>
  <img src="${LOGO_RO_B64}" style="height:60px;border-radius:6px;" onerror="this.style.display='none'">
</div>
<table><tr><td colspan="4" class="hd">CONTRATISTA</td></tr>
<tr><td class="gl" style="width:18%">Razon social</td><td style="width:32%">KRYOTEC SERVICIOS SAS</td><td class="gl" style="width:12%">NIT</td><td>900.719.852-0</td></tr>
<tr><td class="gl">Contacto</td><td>Erwin Duarte</td><td class="gl">Telefono</td><td>313 329 2510</td></tr></table>
<table><tr><td colspan="6" class="hd">INFORMACION TECNICA</td></tr>
<tr><td class="gl" style="width:16%">Equipo</td><td style="width:28%">${e?.tipo||''} ${e?.marca||''} ${e?.modelo||''}</td><td class="gl" style="width:10%">Serial</td><td style="width:16%">${e?.serie||'N/A'}</td><td class="gl" style="width:10%">Ubicacion</td><td>${e?.ubicacion||''}</td></tr>
<tr><td class="gl">Tipo servicio</td><td colspan="3">${tipoSrv}</td><td class="gl">Fecha</td><td style="text-align:center;">${fechaTexto}</td></tr>
<tr><td class="gl">Hora entrada</td><td style="text-align:center;">${hEntrada}</td><td class="gl">Hora salida</td><td style="text-align:center;">${hSalida}</td><td class="gl">Tecnico</td><td>${sesionActual?.nombre||''}</td></tr></table>
<table><tr><td class="gl" style="border-bottom:none;">Descripcion del trabajo realizado:</td></tr><tr><td style="min-height:55px;height:55px;font-family:Georgia,serif;font-size:7pt;vertical-align:top;padding:3px;">${desc}</td></tr>
<tr><td class="gl" style="border-top:1px solid #333;border-bottom:none;">Repuestos cambiados:</td></tr><tr><td style="height:22px;font-family:Georgia,serif;font-size:7pt;vertical-align:top;padding:3px;">${repuestos}</td></tr></table>
<table><tr><td colspan="4" class="hd">CONSTANCIA DE RECIBO</td></tr>
<tr><td class="gl" style="width:24%;text-align:center;">Firma Tecnico</td><td class="gl" style="width:10%;text-align:center;">Cedula</td><td class="gl" style="width:11%;text-align:center;">Cargo</td><td class="gl" style="text-align:center;">Quien recibe</td></tr>
<tr><td style="padding:4px 6px;"><span class="firma">${sesionActual?.nombre||''}</span></td><td style="text-align:center;">${sesionActual?.cedula||''}</td><td>${sesionActual?.cargo||''}</td><td style="padding:4px;">${recibe}</td></tr>
<tr><td colspan="2" style="padding:4px;">${firmaDataUrl?`<img src="${firmaDataUrl}" style="max-height:44px;">`:'<div style="height:44px;"></div>'}</td><td colspan="2" style="padding:4px;color:#888;font-size:7pt;">_______________________________________<br>Firma y sello quien recibe</td></tr></table>
<div style="font-size:6pt;color:#aaa;text-align:right;margin-top:4px;">Documento generado por capacitADA — ${new Date().toLocaleString()}</div>
</body></html>`;
    const guardado=await driveUploadPDF(html,nombreArch+'.pdf');
    if(guardado){toast('✅ Informe RO guardado en Drive');}else{toast('⚠️ No se pudo guardar en Drive');}
    const blob=new Blob([html],{type:'text/html'});
    const url=URL.createObjectURL(blob);
    const ventana=window.open(url,'_blank');
    if(ventana){ventana.onload=()=>ventana.print();}
    closeModal();
    setTimeout(()=>{if(_servicioEidActual)modalNuevoServicio(_servicioEidActual);},500);
}

// ===== EXCEL SEMANAL JMC =====
const EXCEL_SCRIPT_URL='https://script.google.com/macros/s/AKfycbzw4N4af4jXZsqKLq0c7Sijf4Z1Za5ttSUIwd4OiFDCiZNPCDfY7znMziyyyx0x2iXk/exec';

async function escalarImagenB64(b64,maxW,maxH){return new Promise(resolve=>{const img=new Image();img.onload=()=>{const scale=Math.min(maxW/img.width,maxH/img.height);const w=Math.round(img.width*scale);const h=Math.round(img.height*scale);const c=document.createElement('canvas');c.width=w;c.height=h;c.getContext('2d').drawImage(img,0,0,w,h);resolve(c.toDataURL('image/jpeg',0.82));};img.onerror=()=>resolve(b64);img.src=b64;});}

async function capturarHTMLcomoImagen(htmlString,maxW,maxH){return new Promise(resolve=>{if(!window.html2canvas){resolve(null);return;}const iframe=document.createElement('iframe');iframe.style.cssText='position:fixed;top:-9999px;left:-9999px;width:800px;height:1100px;border:none;';document.body.appendChild(iframe);iframe.contentDocument.open();iframe.contentDocument.write(htmlString);iframe.contentDocument.close();setTimeout(()=>{html2canvas(iframe.contentDocument.body,{scale:0.6,useCORS:true,logging:false,width:800,height:1100,backgroundColor:'#ffffff'}).then(canvas=>{document.body.removeChild(iframe);escalarImagenB64(canvas.toDataURL('image/jpeg',0.85),maxW,maxH).then(resolve);}).catch(()=>{try{document.body.removeChild(iframe);}catch(e){}resolve(null);});},1000);});}

const _cpx=w=>Math.round(w*7);
const ZONA_ABC_W=_cpx(10.25)+_cpx(10.75)+_cpx(15.25);
const ZONA_DEFG_W=_cpx(8.38)+_cpx(14)+_cpx(10)+_cpx(12.13);
const ZONA_H=Math.round(11*15.75*4/3);

async function generarYGuardarExcelSemanal(srv,fotoB64s,jmcHtmlString){
    try{
        toast('📊 Preparando soporte semanal...');
        const[f1,f2,f3]=await Promise.all([fotoB64s[0]?escalarImagenB64(fotoB64s[0],ZONA_ABC_W,ZONA_H):Promise.resolve(''),fotoB64s[1]?escalarImagenB64(fotoB64s[1],ZONA_DEFG_W,ZONA_H):Promise.resolve(''),fotoB64s[2]?escalarImagenB64(fotoB64s[2],ZONA_ABC_W,ZONA_H):Promise.resolve('')]);
        const fJMC=jmcHtmlString?await capturarHTMLcomoImagen(jmcHtmlString,ZONA_DEFG_W,ZONA_H):null;
        const payload={ticket:srv.ticket,sap:srv.sap,tienda:srv.tienda,ciudad:srv.ciudad,fecha:srv.fecha,tipo:srv.tipo,descripcion:srv.descripcion,repuestos:srv.repuestos||'',foto1:f1||'',foto2:f2||'',foto3:f3||'',fotoJMC:fJMC||''};
        toast('☁️ Subiendo soporte a Drive...');
        await fetch(EXCEL_SCRIPT_URL,{method:'POST',mode:'no-cors',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
        toast('✅ Soporte semanal guardado en Drive');
    }catch(err){console.error('Error Excel semanal:',err);toast('❌ Error soporte: '+err.message);}
}

// ===== CRUD CLIENTES =====
function modalNuevoCliente(){showModal(`<div class="modal"><div class="modal-h"><h3>Nuevo cliente</h3><button class="xbtn" onclick="closeModal()">✕</button></div><div class="modal-b"><label class="fl">Nombre *</label><input class="fi" id="cNombre"><label class="fl">Telefono *</label><input class="fi" id="cTel" type="tel"><label class="fl">Email</label><input class="fi" id="cEmail"><label class="fl">Ciudad *</label><select class="fi" id="cCiudad">${CIUDADES.map(ci=>`<option>${ci}</option>`).join('')}</select><label class="fl">Direccion *</label><input class="fi" id="cDir"><button class="btn btn-blue btn-full" onclick="obtenerGPS()">📍 Compartir ubicacion</button><input type="hidden" id="cLat"><input type="hidden" id="cLng"><div class="modal-foot"><button class="btn btn-gray" onclick="closeModal()">Cancelar</button><button class="btn btn-blue" onclick="guardarCliente()">Guardar</button></div></div></div>`);}

function obtenerGPS(){if(!navigator.geolocation){toast('⚠️ GPS no disponible');return;}navigator.geolocation.getCurrentPosition(pos=>{document.getElementById('cLat').value=pos.coords.latitude.toFixed(6);document.getElementById('cLng').value=pos.coords.longitude.toFixed(6);toast('✅ Ubicacion capturada');},()=>toast('⚠️ No se pudo obtener GPS'));}

async function guardarCliente(){const n=document.getElementById('cNombre')?.value?.trim();const t=document.getElementById('cTel')?.value?.trim();const ci=document.getElementById('cCiudad')?.value;const d=document.getElementById('cDir')?.value?.trim();if(!n||!t||!ci||!d){toast('⚠️ Complete campos obligatorios');return;}try{await addDoc(collection(db,'clientes'),{nombre:n,telefono:t,ciudad:ci,direccion:d,email:document.getElementById('cEmail')?.value||'',latitud:document.getElementById('cLat')?.value||null,longitud:document.getElementById('cLng')?.value||null,fechaCreacion:new Date().toISOString().split('T')[0]});closeModal();await cargarDatos();toast('✅ Cliente guardado');}catch(err){toast('❌ Error: '+err.message);}}

function modalEditarCliente(cid){const c=getCl(cid);showModal(`<div class="modal"><div class="modal-h"><h3>Editar cliente</h3><button class="xbtn" onclick="closeModal()">✕</button></div><div class="modal-b"><label class="fl">Nombre</label><input class="fi" id="eNombre" value="${c.nombre}"><label class="fl">Telefono</label><input class="fi" id="eTel" value="${c.telefono}"><label class="fl">Email</label><input class="fi" id="eEmail" value="${c.email||''}"><label class="fl">Ciudad</label><select class="fi" id="eCiudad">${CIUDADES.map(ci=>`<option ${ci===c.ciudad?'selected':''}>${ci}</option>`).join('')}</select><label class="fl">Direccion</label><input class="fi" id="eDir" value="${c.direccion}"><div class="modal-foot"><button class="btn btn-gray" onclick="closeModal()">Cancelar</button><button class="btn btn-blue" onclick="actualizarCliente('${cid}')">Guardar</button></div></div></div>`);}

async function actualizarCliente(cid){try{await updateDoc(doc(db,'clientes',cid),{nombre:document.getElementById('eNombre').value,telefono:document.getElementById('eTel').value,email:document.getElementById('eEmail').value,ciudad:document.getElementById('eCiudad').value,direccion:document.getElementById('eDir').value});closeModal();await cargarDatos();toast('✅ Cliente actualizado');}catch(err){toast('❌ Error: '+err.message);}}

function modalEliminarCliente(cid){if(!confirm('¿Eliminar este cliente y todos sus activos/servicios?'))return;eliminarCliente(cid);}

async function eliminarCliente(cid){const eids=getEquiposCliente(cid).map(e=>e.id);try{for(const eid of eids){const ss=getServiciosEquipo(eid);for(const s of ss)await deleteDoc(doc(db,'servicios',s.id));await deleteDoc(doc(db,'equipos',eid));}await deleteDoc(doc(db,'clientes',cid));await cargarDatos();goTo('clientes');toast('🗑️ Cliente eliminado');}catch(err){toast('❌ Error: '+err.message);}}

// ===== CRUD EQUIPOS =====
function modalNuevoEquipo(cid){showModal(`<div class="modal"><div class="modal-h"><h3>Nuevo activo</h3><button class="xbtn" onclick="closeModal()">✕</button></div><div class="modal-b"><div class="fr"><div><label class="fl">Marca *</label><input class="fi" id="qMarca"></div><div><label class="fl">Modelo *</label><input class="fi" id="qModelo"></div></div><label class="fl">Serie</label><input class="fi" id="qSerie"><label class="fl">Ubicacion *</label><input class="fi" id="qUbic"><label class="fl">Tipo</label><input class="fi" id="qTipo"><div class="modal-foot"><button class="btn btn-gray" onclick="closeModal()">Cancelar</button><button class="btn btn-blue" onclick="guardarEquipo('${cid}')">Guardar</button></div></div></div>`);}

async function guardarEquipo(cid){const m=document.getElementById('qMarca')?.value?.trim();const mo=document.getElementById('qModelo')?.value?.trim();const u=document.getElementById('qUbic')?.value?.trim();if(!m||!mo||!u){toast('⚠️ Complete marca, modelo y ubicacion');return;}try{await addDoc(collection(db,'equipos'),{clienteId:cid,marca:m,modelo:mo,serie:document.getElementById('qSerie')?.value||'',ubicacion:u,tipo:document.getElementById('qTipo')?.value||''});closeModal();await cargarDatos();toast('✅ Activo guardado');}catch(err){toast('❌ Error: '+err.message);}}

function modalEditarEquipo(eid){const eq=getEq(eid);if(!eq)return;showModal(`<div class="modal"><div class="modal-h"><h3>Editar activo</h3><button class="xbtn" onclick="closeModal()">✕</button></div><div class="modal-b"><div class="fr"><div><label class="fl">Marca</label><input class="fi" id="eMarca" value="${eq.marca}"></div><div><label class="fl">Modelo</label><input class="fi" id="eModelo" value="${eq.modelo}"></div></div><label class="fl">Serie</label><input class="fi" id="eSerie" value="${eq.serie||''}"><label class="fl">Ubicacion</label><input class="fi" id="eUbic" value="${eq.ubicacion}"><label class="fl">Tipo</label><input class="fi" id="eTipoEq" value="${eq.tipo||''}"><div class="modal-foot"><button class="btn btn-gray" onclick="closeModal()">Cancelar</button><button class="btn btn-blue" onclick="actualizarEquipo('${eid}')">Guardar</button></div></div></div>`);}

async function actualizarEquipo(eid){try{await updateDoc(doc(db,'equipos',eid),{marca:document.getElementById('eMarca').value,modelo:document.getElementById('eModelo').value,serie:document.getElementById('eSerie').value,ubicacion:document.getElementById('eUbic').value,tipo:document.getElementById('eTipoEq').value});closeModal();await cargarDatos();toast('✅ Activo actualizado');}catch(err){toast('❌ Error: '+err.message);}}

function modalEliminarEquipo(eid){if(!confirm('¿Eliminar este activo y sus servicios?'))return;eliminarEquipo(eid);}

async function eliminarEquipo(eid){const ss=getServiciosEquipo(eid);try{for(const s of ss)await deleteDoc(doc(db,'servicios',s.id));await deleteDoc(doc(db,'equipos',eid));await cargarDatos();toast('🗑️ Activo eliminado');}catch(err){toast('❌ Error: '+err.message);}}

// ===== CRUD TECNICOS =====
function modalNuevoTecnico(){showModal(`<div class="modal"><div class="modal-h"><h3>Nuevo tecnico</h3><button class="xbtn" onclick="closeModal()">✕</button></div><div class="modal-b"><label class="fl">Nombre *</label><input class="fi" id="tNombre"><div class="fr"><div><label class="fl">Tipo Doc</label><select class="fi" id="tTipoDoc">${TIPOS_DOC.map(d=>`<option>${d}</option>`).join('')}</select></div><div><label class="fl">Cedula *</label><input class="fi" id="tCedula" type="number"></div></div><label class="fl">Telefono</label><input class="fi" id="tTel"><label class="fl">Cargo</label><input class="fi" id="tCargo"><label class="fl">Rol</label><select class="fi" id="tRol"><option value="tecnico">Tecnico</option><option value="admin">Admin</option></select><label class="fl">Clave (4 digitos) *</label><input class="fi" id="tClave" type="password" maxlength="4"><div class="modal-foot"><button class="btn btn-gray" onclick="closeModal()">Cancelar</button><button class="btn btn-blue" onclick="guardarTecnico()">Guardar</button></div></div></div>`);}

async function guardarTecnico(){const n=document.getElementById('tNombre')?.value?.trim();const cc=document.getElementById('tCedula')?.value?.trim();const cl=document.getElementById('tClave')?.value?.trim();if(!n||!cc||!cl){toast('⚠️ Nombre, cedula y clave requeridos');return;}if(cl.length!==4){toast('⚠️ Clave de 4 digitos');return;}try{await addDoc(collection(db,'tecnicos'),{nombre:n,cedula:cc,tipoDoc:document.getElementById('tTipoDoc')?.value||'CC',telefono:document.getElementById('tTel')?.value||'',cargo:document.getElementById('tCargo')?.value||'',rol:document.getElementById('tRol')?.value||'tecnico',especialidades:[],region:'',clave:cl});closeModal();await cargarDatos();toast('✅ Tecnico guardado');}catch(err){toast('❌ Error: '+err.message);}}

function modalEditarTecnico(tid){const t=getTec(tid);showModal(`<div class="modal"><div class="modal-h"><h3>Editar tecnico</h3><button class="xbtn" onclick="closeModal()">✕</button></div><div class="modal-b"><label class="fl">Nombre</label><input class="fi" id="etNombre" value="${t.nombre}"><label class="fl">Cedula</label><input class="fi" id="etCedula" value="${t.cedula}"><label class="fl">Telefono</label><input class="fi" id="etTel" value="${t.telefono}"><label class="fl">Cargo</label><input class="fi" id="etCargo" value="${t.cargo||''}"><label class="fl">Rol</label><select class="fi" id="etRol"><option value="tecnico" ${t.rol==='tecnico'?'selected':''}>Tecnico</option><option value="admin" ${t.rol==='admin'?'selected':''}>Admin</option></select><label class="fl">Nueva clave (opcional)</label><input class="fi" id="etClave" type="password" maxlength="4"><div class="modal-foot"><button class="btn btn-gray" onclick="closeModal()">Cancelar</button><button class="btn btn-blue" onclick="actualizarTecnico('${tid}')">Guardar</button></div></div></div>`);}

async function actualizarTecnico(tid){const data={nombre:document.getElementById('etNombre').value,cedula:document.getElementById('etCedula').value,telefono:document.getElementById('etTel').value,cargo:document.getElementById('etCargo').value,rol:document.getElementById('etRol').value};const newClave=document.getElementById('etClave')?.value?.trim();if(newClave&&newClave.length===4)data.clave=newClave;try{await updateDoc(doc(db,'tecnicos',tid),data);closeModal();await cargarDatos();toast('✅ Tecnico actualizado');}catch(err){toast('❌ Error: '+err.message);}}

async function eliminarTecnico(tid){if(!confirm('¿Eliminar este tecnico?'))return;try{await deleteDoc(doc(db,'tecnicos',tid));await cargarDatos();toast('🗑️ Tecnico eliminado');}catch(err){toast('❌ Error: '+err.message);}}

// ===== INFORME PDF GENERAL =====
function generarInformePDF(eid){
    const e=getEq(eid);const c=getCl(e?.clienteId);
    const ss=getServiciosEquipo(eid).sort((a,b)=>new Date(b.fecha)-new Date(a.fecha));
    const LOGO='https://raw.githubusercontent.com/capacitADA/KRYOTEC/main/KRYOTEC_Logo.png';
    const serviciosHTML=ss.map(s=>{
        const fotosHTML=(s.fotos||[]).length>0?`<div style="display:flex;flex-wrap:wrap;gap:6px;margin:6px 0;">${(s.fotos||[]).map(f=>`<img src="${f}" style="height:80px;width:80px;object-fit:cover;border-radius:6px;border:1px solid #ddd;">`).join('')}</div>`:'';
        const proxHTML=(s.tipo==='Mantenimiento'&&s.proximoMantenimiento)?`<div style="color:#b45309;font-size:16px;margin-top:4px;">📅 Proximo: ${fmtFecha(s.proximoMantenimiento)}</div>`:'';
        return `<div style="border:1px solid #d1d5db;border-radius:8px;padding:12px;margin-bottom:10px;page-break-inside:avoid;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
                <span style="background:${s.tipo==='Mantenimiento'?'#1d4ed8':s.tipo==='Reparacion'?'#dc2626':'#15803d'};color:white;padding:2px 10px;border-radius:12px;font-size:11px;font-weight:700;">${s.tipo}</span>
                <span style="font-size:16px;color:#555;">${fmtFecha(s.fecha)}</span>
            </div>
            <div style="font-size:16px;color:#374151;margin:3px 0;">🔧 ${s.tecnico}</div>
            <div style="font-size:16px;color:#111;margin:3px 0;">${s.descripcion}</div>
            ${fotosHTML}${proxHTML}
        </div>`;
    }).join('');
    const html=`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Informe_${e?.marca}_${e?.modelo}</title>
<style>@page{size:letter;margin:15mm;}@media print{html,body{margin:0;padding:0;}}body{font-family:Arial,sans-serif;font-size:11px;color:#111;margin:0;padding:0;}</style></head><body>
<div style="display:flex;align-items:center;border-bottom:3px solid #0c214a;padding-bottom:10px;margin-bottom:12px;">
  <img src="${LOGO}" style="height:64px;margin-right:18px;" onerror="this.style.display='none'">
  <div><div style="font-size:14px;color:#555;">KRYOTEC SERVICIOS SAS | 📞 313 329 2510</div><div style="font-size:18px;font-weight:700;margin-top:4px;">INFORME TECNICO</div></div>
</div>
<table style="width:100%;border-collapse:collapse;margin-bottom:12px;">
  <tr><td style="padding:6px 10px;background:#f1f5f9;border:1px solid #ddd;width:50%;font-size:14px;-webkit-print-color-adjust:exact;"><strong>Cliente:</strong> ${c?.nombre||'N/A'}</td>
  <td style="padding:6px 10px;background:#f1f5f9;border:1px solid #ddd;font-size:14px;-webkit-print-color-adjust:exact;"><strong>Generado:</strong> ${new Date().toLocaleString()}</td></tr>
  <tr><td style="padding:6px 10px;border:1px solid #ddd;font-size:14px;" colspan="2"><strong>Activo:</strong> ${e?.tipo||''} ${e?.marca||''} ${e?.modelo||''} <strong>Serial:</strong> ${e?.serie||'N/A'} <strong>Ubicacion:</strong> ${e?.ubicacion||''}</td></tr>
</table>
<div style="background:#0c214a;color:white;font-weight:700;font-size:15px;padding:7px 12px;border-radius:4px;margin-bottom:10px;-webkit-print-color-adjust:exact;">HISTORIAL DE SERVICIOS <span style="font-weight:400;font-size:13px;">${ss.length} registro(s)</span></div>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">${serviciosHTML}</div>
</body></html>`;
    const v=window.open('','_blank');
    if(v){v.document.open();v.document.write(html);v.document.close();setTimeout(()=>v.print(),500);}
}

// ===== QR =====
function modalQR(eid){
    const e=getEq(eid);const c=getCl(e?.clienteId);
    const url=`${window.location.origin}${window.location.pathname}#/equipo/${eid}`;
    const qrDiv=document.createElement('div');
    qrDiv.style.cssText='position:fixed;top:-9999px;left:-9999px;width:280px;height:280px;';
    document.body.appendChild(qrDiv);
    const QRLib=window.QRCode;
    if(!QRLib){toast('⚠️ QRCode.js no cargado');return;}
    new QRLib(qrDiv,{text:url,width:280,height:280,colorDark:'#0c214a',colorLight:'#ffffff'});
    setTimeout(()=>{
        const qrCanvas=qrDiv.querySelector('canvas');
        const qrDataUrl=qrCanvas.toDataURL('image/png');
        document.body.removeChild(qrDiv);
        const W=400,PAD=16;
        const compCanvas=document.createElement('canvas');
        const ctx=compCanvas.getContext('2d');
        const logoImg=new Image();const qrImg=new Image();
        logoImg.crossOrigin='anonymous';
        logoImg.src='https://raw.githubusercontent.com/capacitADA/KRYOTEC/main/KRYOTEC_Logo.png';
        logoImg.onload=()=>{
            qrImg.onload=()=>{
                const logoH=50,infoH=70,qrH=280,footH=24;
                const totalH=PAD+logoH+8+infoH+8+qrH+8+footH+PAD;
                compCanvas.width=W;compCanvas.height=totalH;
                ctx.fillStyle='#ffffff';ctx.fillRect(0,0,W,totalH);
                ctx.strokeStyle='#0c214a';ctx.lineWidth=3;ctx.strokeRect(2,2,W-4,totalH-4);
                ctx.fillStyle='#0c214a';ctx.fillRect(2,2,W-4,logoH+PAD+4);
                const logoW=logoImg.width*(logoH/logoImg.height);
                ctx.drawImage(logoImg,(W-logoW)/2,PAD,logoW,logoH);
                let y=PAD+logoH+8+4;
                ctx.fillStyle='#111';ctx.font='bold 14px Arial';ctx.textAlign='center';
                const eqLabel=(e?.tipo?e.tipo+' · ':'')+( e?.marca||'')+' '+(e?.modelo||'');
                ctx.fillText(eqLabel,W/2,y+16);
                ctx.font='12px Arial';ctx.fillStyle='#444';
                ctx.fillText('📍 '+(e?.ubicacion||''),W/2,y+34);
                ctx.fillText('👤 '+(c?.nombre||''),W/2,y+50);
                if(e?.serie){ctx.font='10px Arial';ctx.fillStyle='#888';ctx.fillText('Serie: '+e.serie,W/2,y+64);}
                y=PAD+logoH+8+4+infoH+8;
                ctx.drawImage(qrImg,(W-280)/2,y,280,280);
                y+=280+8;ctx.font='10px Arial';ctx.fillStyle='#888';
                ctx.fillText('Escanea para ver historial y contactar soporte',W/2,y+14);
                const compositeUrl=compCanvas.toDataURL('image/png');
                showModal(`<div class="modal" style="max-width:360px;"><div class="modal-h"><h3>📱 Codigo QR</h3><button class="xbtn" onclick="closeModal()">✕</button></div><div class="modal-b" style="text-align:center;"><img src="${compositeUrl}" style="width:100%;border-radius:8px;border:2px solid #0c214a;"><a href="${compositeUrl}" download="QR_${e?.marca}_${e?.modelo}.png" class="btn btn-blue btn-full" style="margin-top:8px;">⬇️ Descargar QR</a></div></div>`);
            };
            qrImg.src=qrDataUrl;
        };
        logoImg.onerror=()=>{showModal(`<div class="modal" style="max-width:340px;"><div class="modal-h"><h3>📱 Codigo QR</h3><button class="xbtn" onclick="closeModal()">✕</button></div><div class="modal-b" style="text-align:center;"><img src="${qrDataUrl}" style="width:100%;"><a href="${qrDataUrl}" download="QR_${e?.marca}_${e?.modelo}.png" class="btn btn-blue btn-full" style="margin-top:8px;">⬇️ Descargar QR</a></div></div>`);};
    },200);
}

// ===== MANEJAR RUTA QR =====
function manejarRutaQR(){
    const hash=window.location.hash;
    if(!hash.startsWith('#/equipo/'))return false;
    const eid=hash.replace('#/equipo/','');
    const e=getEq(eid);
    if(!e)return false;
    const c=getCl(e.clienteId);
    const ss=getServiciosEquipo(eid).sort((a,b)=>new Date(b.fecha)-new Date(a.fecha));
    const main=document.getElementById('mainContent');
    const topbar=document.querySelector('.topbar');
    const botnav=document.querySelector('.botnav');
    if(topbar)topbar.style.display='none';
    if(botnav)botnav.style.display='none';
    main.style.background='white';

    const esD1=esClienteD1(e.clienteId);
    const tiendaD1=esD1?getTiendaD1(e?.idTienda):null;
    const eqLabel=e?.tipo||(e?.marca+' '+e?.modelo);

    const waMsg=encodeURIComponent('Hola KRYOTEC, necesito ayuda con el '+(e?.tipo||'')+ ' '+(e?.marca||'')+' '+(e?.modelo||'')+' ubicado en '+(e?.ubicacion||'')+', pueden contactarme por favor');
    const waUrl='https://wa.me/573133292510?text='+waMsg;

    // Bloque ubicación D1
    const d1UbicHTML = esD1 && tiendaD1 ? `
        <div style="background:white;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;margin-bottom:10px;">
            <div style="background:#333;color:white;font-size:0.62rem;font-weight:700;letter-spacing:0.1em;padding:5px 12px;">📍 UBICACIÓN</div>
            <div style="padding:10px 12px;">
                <div style="display:flex;justify-content:space-between;margin-bottom:4px;"><span style="font-size:0.62rem;color:#888;">Tienda</span><span style="font-size:0.75rem;font-weight:700;">${tiendaD1.tienda}</span></div>
                <div style="display:flex;justify-content:space-between;margin-bottom:4px;"><span style="font-size:0.62rem;color:#888;">Ciudad</span><span style="font-size:0.75rem;font-weight:600;">${tiendaD1.ciudad}</span></div>
                <div style="display:flex;justify-content:space-between;margin-bottom:4px;"><span style="font-size:0.62rem;color:#888;">Departamento</span><span style="font-size:0.75rem;font-weight:600;">${tiendaD1.departamento}</span></div>
                <div style="display:flex;justify-content:space-between;margin-bottom:4px;"><span style="font-size:0.62rem;color:#888;">Dirección</span><span style="font-size:0.72rem;text-align:right;max-width:60%;">${tiendaD1.direccion}</span></div>
                ${tiendaD1.latitud ? `<a href="https://maps.google.com/?q=${tiendaD1.latitud},${tiendaD1.longitud}" target="_blank" style="display:block;text-align:center;margin-top:6px;background:#0c214a;color:white;padding:7px;border-radius:8px;font-size:0.75rem;font-weight:700;text-decoration:none;">🗺️ Abrir en Google Maps</a>` : ''}
            </div>
        </div>` : '';

    // Bloque datos técnicos
    const tecHTML = (e.refrigerante||e.capacidad||e.voltaje||e.añoInstalacion) ? `
        <div style="background:white;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;margin-bottom:10px;">
            <div style="background:#333;color:white;font-size:0.62rem;font-weight:700;letter-spacing:0.1em;padding:5px 12px;">🔧 DATOS TÉCNICOS</div>
            <div style="padding:10px 12px;">
                <div style="display:flex;justify-content:space-between;margin-bottom:4px;"><span style="font-size:0.62rem;color:#888;">Marca / Modelo</span><span style="font-size:0.75rem;font-weight:600;">${e.marca} ${e.modelo}</span></div>
                <div style="display:flex;justify-content:space-between;margin-bottom:4px;"><span style="font-size:0.62rem;color:#888;">Serie</span><span style="font-size:0.72rem;font-family:monospace;">${e.serie||'N/A'}</span></div>
                ${e.refrigerante?`<div style="display:flex;justify-content:space-between;margin-bottom:4px;"><span style="font-size:0.62rem;color:#888;">Refrigerante</span><span style="font-size:0.72rem;font-family:monospace;">${e.refrigerante}</span></div>`:''}
                ${e.capacidad?`<div style="display:flex;justify-content:space-between;margin-bottom:4px;"><span style="font-size:0.62rem;color:#888;">Capacidad</span><span style="font-size:0.72rem;">${e.capacidad}</span></div>`:''}
                ${e.voltaje?`<div style="display:flex;justify-content:space-between;margin-bottom:4px;"><span style="font-size:0.62rem;color:#888;">Voltaje</span><span style="font-size:0.72rem;font-family:monospace;">${e.voltaje}</span></div>`:''}
                ${e.añoInstalacion?`<div style="display:flex;justify-content:space-between;"><span style="font-size:0.62rem;color:#888;">Año instalación</span><span style="font-size:0.72rem;">${e.añoInstalacion}</span></div>`:''}
            </div>
        </div>` : '';

    // Botón técnico D1
    const tecBtnHTML = sesionActual && esD1 ? `
        <div style="margin:0 14px 4px;background:rgba(12,33,74,0.06);border:1px solid rgba(12,33,74,0.15);border-radius:10px;padding:7px 12px;display:flex;align-items:center;justify-content:space-between;">
            <div style="font-size:0.62rem;color:#0c214a;font-weight:700;">🔐 ${sesionActual.nombre}</div>
            <span style="background:#dcfce7;color:#15803d;font-size:0.58rem;font-weight:700;padding:2px 7px;border-radius:10px;">✓ Sesión activa</span>
        </div>
        <button onclick="modalActaD1('${eid}')" style="display:block;margin:0 14px 14px;width:calc(100% - 28px);background:linear-gradient(135deg,#0c214a,#1e3d7a);color:white;border:none;border-radius:12px;padding:14px;font-size:0.9rem;font-weight:800;cursor:pointer;font-family:sans-serif;box-shadow:0 6px 20px rgba(12,33,74,0.3);">
            ➕ Nuevo servicio — ${eqLabel}
        </button>` : '';

    main.innerHTML=`<div style="max-width:600px;margin:0 auto;padding:1.5rem 14px 40px;">
        <div style="background:#0c214a;border-radius:14px;padding:16px 16px 12px;color:white;margin-bottom:12px;">
            <div style="font-size:0.6rem;opacity:0.5;font-weight:700;letter-spacing:0.1em;margin-bottom:6px;">KRYOTEC SERVICIOS SAS</div>
            <div style="font-size:1.05rem;font-weight:700;">${e?.tipo?e.tipo+' · ':''}${e.marca} ${e.modelo}</div>
            <div style="font-size:0.68rem;opacity:0.6;margin-top:3px;font-family:monospace;">Serie: ${e.serie||'N/A'} ${esD1&&e.idTienda?'· ID Tienda: '+e.idTienda:''}</div>
        </div>

        ${d1UbicHTML}
        ${tecHTML}

        <div style="background:#e4002b;border-radius:12px;padding:12px 14px;display:flex;align-items:center;gap:12px;color:white;margin-bottom:10px;">
            <div><div style="font-size:0.6rem;opacity:0.8;">SOPORTE KRYOTEC</div><div style="font-family:monospace;font-size:1.1rem;font-weight:500;">313 329 2510</div></div>
            <div style="margin-left:auto;font-size:1.4rem;">📞</div>
        </div>
        <a href="${waUrl}" target="_blank" style="display:block;background:#25D366;color:white;border-radius:12px;padding:12px;text-align:center;font-weight:700;font-size:0.88rem;text-decoration:none;margin-bottom:10px;">📱 Contactar por WhatsApp</a>

        ${tecBtnHTML}

        <h3 style="font-size:0.85rem;font-weight:700;color:#333;margin-bottom:8px;">Historial (${ss.length})</h3>
        ${ss.map(s=>`
        <div style="border:1px solid #e5e7eb;border-radius:10px;padding:10px 12px;margin-bottom:8px;background:white;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
                <span style="background:${s.tipo==='Mantenimiento'?'#eff6ff':s.tipo==='Reparacion'?'#fef2f2':'#f0fdf4'};color:${s.tipo==='Mantenimiento'?'#1d4ed8':s.tipo==='Reparacion'?'#dc2626':'#15803d'};font-size:0.65rem;font-weight:700;padding:2px 8px;border-radius:10px;">${s.tipo}</span>
                <span style="font-size:0.65rem;color:#888;font-family:monospace;">${fmtFecha(s.fecha)}</span>
            </div>
            <div style="font-size:0.75rem;color:#444;margin-top:3px;">${s.descripcion}</div>
            <div style="font-size:0.65rem;color:#888;margin-top:3px;">🔧 ${s.tecnico}${s.consecutivoD1?' · '+s.consecutivoD1:''}</div>
        </div>`).join('')}
    </div>`;
    return true;
}

// ===== GLOBALS =====
window.goTo=goTo; window.closeModal=closeModal;
window.filtrarClientes=filtrarClientes; window.filtrarEquipos=filtrarEquipos;
window.aplicarFiltros=aplicarFiltros; window.limpiarFiltros=limpiarFiltros;
window.modalNuevoCliente=modalNuevoCliente; window.modalEditarCliente=modalEditarCliente;
window.modalEliminarCliente=modalEliminarCliente; window.guardarCliente=guardarCliente;
window.actualizarCliente=actualizarCliente;
window.modalNuevoEquipo=modalNuevoEquipo; window.modalEditarEquipo=modalEditarEquipo;
window.modalEliminarEquipo=modalEliminarEquipo; window.guardarEquipo=guardarEquipo;
window.actualizarEquipo=actualizarEquipo;
window.modalNuevoServicio=modalNuevoServicio; window.modalEditarServicio=modalEditarServicio;
window.guardarServicio=guardarServicio; window.actualizarServicio=actualizarServicio;
window.eliminarServicio=eliminarServicio;
window.modalNuevoTecnico=modalNuevoTecnico; window.modalEditarTecnico=modalEditarTecnico;
window.guardarTecnico=guardarTecnico; window.actualizarTecnico=actualizarTecnico;
window.eliminarTecnico=eliminarTecnico;
window.modalRecordar=modalRecordar; window.enviarWhatsApp=enviarWhatsApp;
window.modalInformeJMC=modalInformeJMC; window.limpiarFirmaJMC=limpiarFirmaJMC;
window.exportarInformeJMC=exportarInformeJMC;
window.modalInformeRO=modalInformeRO; window.limpiarFirmaRO=limpiarFirmaRO;
window.exportarInformeRO=exportarInformeRO;
window.modalActaD1=modalActaD1; window.limpiarFirmaD1=limpiarFirmaD1;
window.exportarActaD1=exportarActaD1;
window.generarYGuardarExcelSemanal=generarYGuardarExcelSemanal;
window.generarInformePDF=generarInformePDF; window.modalQR=modalQR;
window.obtenerGPS=obtenerGPS; window.previewFoto=previewFoto;
window.borrarFoto=borrarFoto; window.onTipoChange=onTipoChange;
window.abrirLogin=abrirLogin; window.mlPin=mlPin; window.mlDel=mlDel;
window.mlLogin=mlLogin; window.cerrarSesion=cerrarSesion;

document.querySelectorAll('.bni').forEach(btn=>{
    btn.addEventListener('click',()=>{
        const page=btn.dataset.page;
        if(!sesionActual&&page!=='panel'&&page!=='tecnicos'){toast('🔒 Inicia sesion desde Tecnicos');return;}
        selectedClienteId=null; selectedEquipoId=null; goTo(page);
    });
});

// ===== INICIAR =====
(async()=>{
    await conectarDriveAuto();
    await cargarDatos();
    if(!manejarRutaQR())renderView();
})();
