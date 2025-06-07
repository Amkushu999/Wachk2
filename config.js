const axios = require('axios');
const fs = require('fs');
const csv = require('csv-parser');

// Bot Configuration
const botConfig = {
    botName: "ª𝗠𝗸𝗨𝘀𝗛𝘅𝗖𝗵𝗞",
    prefix: "/",
    ownerNumbers: [], // Add owner numbers here
    adminNumbers: [],
    sessionName: "whatsapp_session",
    threads: 3,
    maxCardsPerRequest: 10000
};

// User Database (In-memory for simplicity)
const users = new Map();
const vbvDatabase = new Map(); // For VBV tokens
let binDatabase = new Map(); // For BIN data

// Credit Card Generator Functions
function checkLuhn(cardNo) {
    const nDigits = cardNo.length;
    let nSum = 0;
    let isSecond = false;
    
    for (let i = nDigits - 1; i >= 0; i--) {
        let d = parseInt(cardNo[i]);
        if (isSecond) {
            d = d * 2;
        }
        nSum += Math.floor(d / 10);
        nSum += d % 10;
        isSecond = !isSecond;
    }
    
    return nSum % 10 === 0;
}

function ccGenerator(cc, mes, ano, cvv) {
    cc = String(cc);
    mes = String(mes);
    ano = String(ano);
    cvv = String(cvv);
    
    if (mes !== "None" && mes.length === 1) {
        mes = "0" + mes;
    }
    
    if (ano !== "None" && ano.length === 2) {
        ano = "20" + ano;
    }
    
    const numbers = "0123456789".split("");
    for (let i = numbers.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [numbers[i], numbers[j]] = [numbers[j], numbers[i]];
    }
    const result = cc + numbers.join("");
    
    if (cc.startsWith("37") || cc.startsWith("34")) {
        cc = result.substring(0, 15);
    } else {
        cc = result.substring(0, 16);
    }
    
    cc = cc.replace(/x/gi, () => Math.floor(Math.random() * 10));
    
    if (mes === "None" || /[xX]|rnd/.test(mes)) {
        mes = Math.floor(Math.random() * 12) + 1;
        mes = mes < 10 ? "0" + mes : String(mes);
    }
    
    if (ano === "None" || /[xX]|rnd/.test(ano)) {
        ano = Math.floor(Math.random() * (2035 - 2024 + 1)) + 2024;
    }
    
    if (cvv === "None" || /[xX]|rnd/.test(cvv)) {
        if (cc.startsWith("37") || cc.startsWith("34")) {
            cvv = Math.floor(Math.random() * 9000) + 1000;
        } else {
            cvv = Math.floor(Math.random() * 900) + 100;
        }
    }
    
    return `${cc}|${mes}|${ano}|${cvv}`;
}

function luhnCardGenerator(cc, mes, ano, cvv, amount) {
    let allCards = "";
    
    for (let i = 0; i < amount; i++) {
        while (true) {
            const result = ccGenerator(cc, mes, ano, cvv);
            const [ccx, mesx, anox, cvvx] = result.split("|");
            
            if (checkLuhn(ccx)) {
                allCards += `${ccx}|${mesx}|${anox}|${cvvx}\n`;
                break;
            }
        }
    }
    
    return allCards.trim();
}

// BIN Database Functions
async function loadBinDatabase() {
    try {
        const results = [];
        return new Promise((resolve, reject) => {
            fs.createReadStream('bins_all.csv')
                .pipe(csv())
                .on('data', (data) => {
                    binDatabase.set(data.number, {
                        country: data.country,
                        flag: data.flag,
                        vendor: data.vendor,
                        type: data.type,
                        level: data.level,
                        bank_name: data.bank_name
                    });
                })
                .on('end', () => {
                    console.log(`✅ Loaded ${binDatabase.size} BIN entries`);
                    resolve();
                })
                .on('error', reject);
        });
    } catch (error) {
        console.log('❌ BIN database not found, using fallback');
    }
}

function getBinInfo(bin) {
    const binInfo = binDatabase.get(bin);
    if (binInfo) {
        return [
            binInfo.vendor || "Unknown",
            binInfo.type || "Unknown", 
            binInfo.level || "Unknown",
            binInfo.bank_name || "Unknown",
            binInfo.country || "Unknown",
            binInfo.flag || "🏳️",
            "Unknown" // currency placeholder
        ];
    }
    
    // Fallback to API
    return ["Unknown", "Unknown", "Unknown", "Unknown", "Unknown", "🏳️", "Unknown"];
}

// User Management Functions
function registerUser(userId, username) {
    const currentTime = Date.now();
    users.set(userId, {
        id: userId,
        username: username || "Unknown",
        status: "FREE",
        credit: 100,
        antispam_time: currentTime,
        reg_at: new Date().toLocaleDateString(),
        role: "FREE"
    });
}

function getUser(userId) {
    return users.get(userId);
}

function deductCredit(userId, amount = 1) {
    const user = users.get(userId);
    if (user && user.credit >= amount) {
        user.credit -= amount;
        users.set(userId, user);
        return true;
    }
    return false;
}

function setAntispamTime(userId) {
    const user = users.get(userId);
    if (user) {
        user.antispam_time = Date.now();
        users.set(userId, user);
    }
}

function checkAntispam(userId) {
    const user = users.get(userId);
    if (!user) return false;
    
    const timeDiff = Date.now() - user.antispam_time;
    return timeDiff > 10000; // 10 seconds cooldown
}

// VBV Management Functions
function loadVbvDatabase() {
    try {
        if (fs.existsSync('vbvbin.txt')) {
            const data = fs.readFileSync('vbvbin.txt', 'utf8');
            const lines = data.split('\n');
            
            lines.forEach(line => {
                const parts = line.trim().split('|');
                if (parts.length >= 3) {
                    vbvDatabase.set(parts[0], {
                        status: parts[1],
                        response: parts[2]
                    });
                }
            });
            console.log(`✅ Loaded ${vbvDatabase.size} VBV entries`);
        }
    } catch (error) {
        console.log('❌ VBV database not found, creating empty one');
        fs.writeFileSync('vbvbin.txt', '');
    }
}

function getVbvInfo(bin) {
    return vbvDatabase.get(bin);
}

function addVbvToken(token) {
    const parts = token.split('|');
    if (parts.length >= 3) {
        vbvDatabase.set(parts[0], {
            status: parts[1],
            response: parts[2]
        });
        
        // Save to file
        const entries = Array.from(vbvDatabase.entries());
        const fileContent = entries.map(([bin, data]) => `${bin}|${data.status}|${data.response}`).join('\n');
        fs.writeFileSync('vbvbin.txt', fileContent);
        return true;
    }
    return false;
}

function removeVbvToken(bin) {
    if (vbvDatabase.has(bin)) {
        vbvDatabase.delete(bin);
        
        // Save to file
        const entries = Array.from(vbvDatabase.entries());
        const fileContent = entries.map(([bin, data]) => `${bin}|${data.status}|${data.response}`).join('\n');
        fs.writeFileSync('vbvbin.txt', fileContent);
        return true;
    }
    return false;
}

// Payment Gate Simulation Functions
async function simulatePaymentGate(fullcc, gateway) {
    // Simulate different responses for demo
    const responses = [
        { status: "𝐀𝐩𝐩𝐫𝐨𝐯𝐞𝐝 ✅", response: "1000: Approved", hits: "YES" },
        { status: "𝐃𝐞𝐜𝐥𝐢𝐧𝐞𝐝 ❌", response: "Insufficient Funds", hits: "NO" },
        { status: "𝐃𝐞𝐜𝐥𝐢𝐧𝐞𝐝 ❌", response: "Card Declined", hits: "NO" },
        { status: "𝐃𝐞𝐜𝐥𝐢𝐧𝐞𝐝 ❌", response: "Invalid Card", hits: "NO" },
    ];
    
    // Random delay to simulate processing
    await new Promise(resolve => setTimeout(resolve, Math.random() * 2000 + 1000));
    
    // Return random response (mostly declined for demo)
    const randomIndex = Math.random() < 0.1 ? 0 : Math.floor(Math.random() * 3) + 1;
    return responses[randomIndex];
}

// Generate code blocks for cards
function generateCodeBlocks(allCards) {
    const cards = allCards.split('\n');
    let codeBlocks = "";
    for (const card of cards) {
        if (card.trim()) {
            codeBlocks += `\`${card}\`\n`;
        }
    }
    return codeBlocks;
}

// Extract CC from message
function extractCC(text) {
    const ccPattern = /(\d{4,6})\|?(\d{1,2})?\|?(\d{2,4})?\|?(\d{3,4})?/;
    const match = text.match(ccPattern);
    
    if (match) {
        return {
            cc: match[1],
            mes: match[2] || "None",
            ano: match[3] || "None", 
            cvv: match[4] || "None"
        };
    }
    
    return null;
}

// Initialize databases
loadBinDatabase();
loadVbvDatabase();

// Ensure directories exist
if (!fs.existsSync('./downloads')) {
    fs.mkdirSync('./downloads');
}

module.exports = {
    botConfig,
    checkLuhn,
    ccGenerator,
    luhnCardGenerator,
    getBinInfo,
    generateCodeBlocks,
    registerUser,
    getUser,
    deductCredit,
    setAntispamTime,
    checkAntispam,
    getVbvInfo,
    addVbvToken,
    removeVbvToken,
    simulatePaymentGate,
    extractCC
};
