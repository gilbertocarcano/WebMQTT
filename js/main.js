import mqtt from './mqtt.esm.min.js';


// 1. DICHIARAZIONI GLOBALI
let client = null; // Fondamentale dichiararlo qui fuori
let TOPICS = { root: "", cmdPrefix: "", evtPrefix: "" };

var _clientId;

// 2. FUNZIONI DI SUPPORTO (Devono essere definite prima dell'uso)
function setupDynamicTopics(root) {
    let cleanRoot = root.replace(/\\/g, "/");
    if (!cleanRoot.endsWith("/")) cleanRoot += "/";
    TOPICS.root = cleanRoot;
    TOPICS.cmdPrefix = cleanRoot + "cmd/";
    TOPICS.evtPrefix = cleanRoot + "evt/";
    console.log("Sistema Topic Inizializzato:", TOPICS);
}

// 3. CARICAMENTO CONFIGURAZIONE E CONNESSIONE
const savedConfig = loadConfig(); // Carica i dati dal localStorage e popola la UI

if (savedConfig && savedConfig.pass) {
    
    // Inizializza i topic PRIMA di connettersi
    setupDynamicTopics(savedConfig.topic || "home/alarmsystem/");

    const brokerUrl = `wss://${savedConfig.hostname}:${savedConfig.port}/mqtt`;
    const options = {
        username: savedConfig.user,
        password: savedConfig.pass,
        clientId: savedConfig.clientId,
        clean: true
    };
    
    // Assegna alla variabile globale dichiarata sopra
    client = mqtt.connect(brokerUrl, options);    
        
    client.on("connect", () => {
        console.log("Connesso a HiveMQ!");
        client.subscribe(TOPICS.evtPrefix + "#"); 
        
        // Aggiorna UI connessione
        const badge = document.getElementById("internetBadge");
        if(badge) { badge.className = "badge on"; badge.textContent = "CONNESSO"; }        
    });

    client.on("message", (topic, payload) => {
        handleIncomingMessage(topic, payload);
    });

    client.on("error", (err) => {
        console.error("Errore MQTT:", err);
        const badge = document.getElementById("internetBadge");
        if(badge) { badge.className = "badge off"; badge.textContent = "OFFLINE"; }
    });
}

// 4. LOGICA DI GESTIONE MESSAGGI
function handleIncomingMessage(fullTopic, payload) {
    console.log(`Ricevuto evento ${fullTopic} --> ${payload}`);
    const msg = payload.toString();
    if (fullTopic.startsWith(TOPICS.evtPrefix)) {
        const eventName = fullTopic.substring(TOPICS.evtPrefix.length);
        onEvent(eventName, msg);
    }
}

function onEvent(event, payload) {
    // 1. STATO GLOBALE ALLARME
    if (event === "stateChanged") {
        updateAlarmUI(payload === "armed");
    }

    // 2. STATO SINGOLE ZONE (es: Z1/zoneChanged)
    else if (event.endsWith("/zoneChanged")) {
        // Estraiamo il nome della zona (Z1, Z2...) dalla parte sinistra dello slash
        const zoneName = event.split("/")[0]; 
        const isOn = (payload === "on");
        
        // Usiamo l'helper per aggiornare la UI
        updateZoneUI(zoneName, isOn);
        
        console.log(`Update UI Zona: ${zoneName} -> ${payload}`);
    }

    // 3. LOG DI SISTEMA
    else if (event === "log") {
        appendLog(payload);
    }

    // 4. STATUS
    else if (event === "systemStatusChanged") {
        updateStatusUI(payload);        
    }

    // 4. RF DEVICES
    else if (event === "rfDevicesChanged") {
        updateRfDevicesUI(payload);        
    }

    // 4. ESPNOW NODES
    else if (event === "espNowNodesChanged") {
        updateEspNowNodesUI(payload);        
    }

    // 6. RSSI
    else if (event === "rssiChanged") {
        updateRssiUI(payload);        
    }    
}

// 5. FUNZIONI DI USCITA (COMANDI)
function publish(command, payload) {
    // Controllo se il client esiste ed è connesso
    if (!client || !client.connected) {
        console.warn("MQTT non connesso. Impossibile inviare:", command);
        return;
    }
    const fullTopic = TOPICS.cmdPrefix + command;
    console.log(`Publish: ${fullTopic} -> ${payload}`)
    client.publish(fullTopic, payload, { retain: false, qos: 1 });
}

// 6. GESTIONE EVENTI UI -------------------------------
document.getElementById("switch-1").onchange = (e) => {
    setZoneEnabled(!e.target.checked);
    publish("setState", e.target.checked ? "armed" : "disarmed");    
};

["1","2","3","4","5"].forEach(num => {
    const el = document.getElementById(`z${num}`);
    if (el) {
        el.onchange = (e) => {
            // Inviamo il comando su Zn/setZone (come intenzione)
            // L'ESP32 risponderà su Zn/zoneChanged (come evento)
            publish(`Z${num}/setZone`, e.target.checked ? "on" : "off");
        };
    }
});

function setZoneEnabled(state) {
    ["1","2","3","4","5"].forEach(num => {
        const el = document.getElementById(`z${num}`);
        el.disabled = !state;
    });
}

//------------------------------------------------------



// Helper per i Log 
function appendLog(msg) {
    const container = document.getElementById("logContainer");
    if (!container) return;
    container.textContent += msg + "\n";
    if (document.getElementById("autoScrollSwitch").checked) {
        container.scrollTop = container.scrollHeight;
    }
}

// Helper per UI Allarme
function updateAlarmUI(isArmed) {
    const badge = document.getElementById("alarmBadge");
    const sw = document.getElementById("switch-1");
    if (badge) {
        badge.textContent = isArmed ? "ATTIVO" : "DISATTIVO";
        badge.className = isArmed ? "badge on" : "badge off";
    }
    if (sw) {
        sw.checked = isArmed;
        setZoneEnabled(!sw.checked);
    } 
}

// Helper per UI Zone
function updateZoneUI(zoneName, isOn) {
    // zoneName sarà "Z1", "Z2", ecc.
    const checkbox = document.getElementById(zoneName.toLowerCase());
    if (checkbox) {
        checkbox.checked = isOn;                
    }
}

// Helper per UI RSSI
function updateRssiUI(value) {
    document.getElementById("wifiRSSI").textContent = value;
}

// Helper per UI Status
function updateStatusUI(jsonString) {
    try {
        const data = JSON.parse(jsonString);       

        // --- WIFI ---
        if (data.wifiSSID) document.getElementById("wifiSSID").textContent = data.wifiSSID;
        if (data.wifiIP)   document.getElementById("wifiIP").textContent   = data.wifiIP;
        
        if (data.wifiState !== undefined) {
            const wifiBadge = document.getElementById("wifiBadge");            
            wifiBadge.textContent = data.wifiState ? "CONNESSO" : "DISCONNESSO";
            wifiBadge.className = data.wifiState ? "badge on" : "badge off";
        }

        // --- ACCESS POINT ---
        if (data.apIP) document.getElementById("apIP").textContent = data.apIP;
        if (data.apState !== undefined) {
            const apBadge = document.getElementById("apBadge");            
            apBadge.textContent = data.apState ? "ATTIVO" : "DISATTIVO";
            apBadge.className = data.apState ? "badge on" : "badge off";
        }

        // --- MESH ---
        if (data.meshRole) document.getElementById("meshRole").textContent = data.meshRole;
        if (data.meshInfo) document.getElementById("meshInfo").textContent = data.meshInfo;
        if (data.meshState !== undefined) {
            const meshBadge = document.getElementById("meshBadge");            
            meshBadge.textContent = data.meshState ? "INIZIALIZZATO" : "NON INIZIALIZZATO";
            meshBadge.className = data.meshState ? "badge on" : "badge off";
        }

        // --- SISTEMA ---
        if (data.srCounter !== undefined) {
            document.getElementById("srCounter").textContent = data.srCounter;
        }

    } catch (e) {
        console.error("Errore nel parsing del JSON di stato:", e);
    }
}

async function updateRfDevicesUI(jsonString) {
    try {
        const data = JSON.parse(jsonString);
        const container = document.getElementById("rfCardsContainer");
        const emptyMsg = document.getElementById("rfEmptyMessage");

        // Pulizia del contenitore prima del ridisegno
        container.innerHTML = "";

        // Controllo se ci sono dispositivi
        if (!data.devices || data.devices.length === 0) {
            if (emptyMsg) emptyMsg.style.display = "block";
            return;
        }

        if (emptyMsg) emptyMsg.style.display = "none";

        data.devices.forEach(dev => {
            // Mapping del tipo: A = Allarme (Sensore), T = Telecomando
            const isSensor = (dev.type === "A");
            const typeLabel = isSensor ? "Sensore di intrusione" : "Telecomando att./disatt.";

            // Costruiamo i campi aggiuntivi solo se il dispositivo è un sensore
            let extraFields = "";
            if (isSensor) {
                extraFields = `
                    <div class="rf-field">
                        <span class="rf-label">Zona Associata</span>
                        <span class="rf-value">${dev.zone || '-'}</span>
                    </div>
                    <div class="rf-field">
                        <span class="rf-delay-badge ${dev.delayed ? "rf-delay-on" : "rf-delay-off"}">
                            ${dev.delayed ? "ATTIVAZIONE RITARDATA" : "ATTIVAZIONE ISTANTANEA"}
                        </span>
                    </div>
                `;
            }

            const card = document.createElement("div");
            card.className = "rf-card";

            card.innerHTML = `
                <div class="rf-field">
                    <span class="rf-label">Codice Unico (ID)</span>
                    <span class="rf-value">${dev.id}</span>
                </div>

                <div class="rf-field">
                    <span class="rf-label">Tipo Dispositivo</span>
                    <span class="rf-value">${typeLabel}</span>
                </div>

                <div class="rf-field">
                    <span class="rf-label">Nome / Descrizione</span>
                    <span class="rf-value">${dev.description || 'Nessun dettaglio'}</span>
                </div>

                ${extraFields}
            `;

            container.appendChild(card);
        });

    } catch (err) {
        console.error("Errore nel rendering dei dispositivi RF:", err);
    }
}

async function updateEspNowNodesUI(jsonString) {
    try {        
        const data = JSON.parse(jsonString);

        const container = document.getElementById("espnowCardsContainer");
        const emptyMsg = document.getElementById("espnowEmptyMessage");

        container.innerHTML = "";

        if (!data.nodes || data.nodes.length === 0) {
            emptyMsg.style.display = "block";
            return;
        }

        emptyMsg.style.display = "none";

        data.nodes.forEach(node => {

            const typeLabel = node.canSleep
                ? "Sleepy node"
                : "Always-on node";

            const statusLabel = node.canSleep && node.isSleeping
                ? "Sleeping"
                : "Attivo";

            const card = document.createElement("div");
            card.className = "espnow-node-card";

            card.innerHTML = `
                <span class="espnow-status-badge badge ${statusLabel === "Attivo" ? "on" : "off"}">
                    ${statusLabel}
                </span>

                <div class="espnow-field">
                    <span class="espnow-label">MAC</span>
                    <span class="espnow-value">${node.mac}</span>
                </div>

                <div class="espnow-field">
                    <span class="espnow-label">Nome</span>
                    <span class="espnow-value">${node.name}</span>
                </div>

                <div class="espnow-field">
                    <span class="espnow-label">Tipo</span>
                    <span class="espnow-value">${typeLabel}</span>
                </div>
            `;

            container.appendChild(card);
        });

    } catch (err) {
        console.error("Errore caricamento nodi ESP-NOW:", err);
    }
}


// Listener per il menu hamburger
document.getElementById("menuToggle").onclick = () => {
    document.getElementById("menu").classList.toggle("open");
};

document.getElementById("logoutBtn").addEventListener("click", logout);

document.getElementById("saveConfigBtn").addEventListener("click", () => { saveConfig(false); });

function saveConfig(logout) {
    const config = {        
        hostname: document.getElementById("mqttHostname").value,
        port: document.getElementById("mqttPort").value,
        user: document.getElementById("mqttUsername").value,
        pass: document.getElementById("mqttPassword").value,
        topic: document.getElementById("mqttTopicRoot").value,   
        clientId: _clientId     
    };

    localStorage.setItem("mqtt_config", JSON.stringify(config));  

    if (!logout)
        alert("Configurazione salvata nel browser!");
    else
        alert("Password rimossa dal local-storage");
    
    // Opzionale: ricarica la pagina per applicare i nuovi parametri
    location.reload(); 
}

function loadConfig() {
    const saved = localStorage.getItem("mqtt_config");
    if (saved) {
        const config = JSON.parse(saved);
                
        document.getElementById("mqttHostname").value = config.hostname || "";
        document.getElementById("mqttPort").value = config.port || "8884";
        document.getElementById("mqttUsername").value = config.user || "";
        document.getElementById("mqttPassword").value = config.pass || "";
        document.getElementById("mqttTopicRoot").value = config.topic || "home/alarmsystem/";   
        _clientId = config.clientId || "web_client_" + Math.random().toString(16).substr(2, 8);
        
        return config; // Restituisce i dati per la connessione MQTT
    }
    return null;
}

async function logout() {    
    document.getElementById("mqttPassword").value ="";
    saveConfig(true);   
}