const { 
    default: makeWASocket, 
    DisconnectReason, 
    useMultiFileAuthState,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore
} = require('@whiskeysockets/baileys');
const readline = require('readline-sync');
const fs = require('fs');
const path = require('path');
const { 
    luhnCardGenerator,
    getBinDetails,
    generateCodeBlocks,
    botConfig,
    checkLuhn,
    ccGenerator
} = require('./config');

// Create required directories
const requiredDirs = ['auth', 'downloads', 'FILES'];
requiredDirs.forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
});

// Create default files if they don't exist
if (!fs.existsSync('FILES/vbvbin.txt')) {
    fs.writeFileSync('FILES/vbvbin.txt', '# VBV BIN Database\n# Format: BIN|STATUS|RESPONSE\n447697|3D TRUE ❌|3D Secure Required\n424242|3D FALSE ✅|3D Secure Not Required\n');
}

if (!fs.existsSync('FILES/config.json')) {
    fs.writeFileSync('FILES/config.json', JSON.stringify({
        "OWNER_ID": ["1234567890"],
        "THREADS": 5,
        "BOT_NAME": "ª𝗠𝗸𝗨𝘀𝗛𝘅𝗖𝗵𝗞"
    }, null, 2));
}

// User database (simple JSON file storage)
const usersDbFile = 'FILES/users.json';
let usersDb = {};
if (fs.existsSync(usersDbFile)) {
    try {
        usersDb = JSON.parse(fs.readFileSync(usersDbFile, 'utf8'));
    } catch (e) {
        usersDb = {};
    }
}

function saveUsersDb() {
    fs.writeFileSync(usersDbFile, JSON.stringify(usersDb, null, 2));
}

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('./auth');
    const { version, isLatest } = await fetchLatestBaileysVersion();
    
    console.log(`Using WA v${version.join('.')}, isLatest: ${isLatest}`);
    
    const sock = makeWASocket({
        version,
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, console)
        },
        printQRInTerminal: false,
        browser: ['WhatsApp Bot', 'Chrome', '1.0.0'],
        generateHighQualityLinkPreview: true,
        connectTimeoutMs: 60000,
        defaultQueryTimeoutMs: 60000,
        keepAliveIntervalMs: 30000,
        markOnlineOnConnect: false,
        syncFullHistory: false,
    });

    // Handle connection updates
    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;
        
        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('Connection closed due to:', lastDisconnect?.error, ', reconnecting:', shouldReconnect);
            
            if (shouldReconnect) {
                console.log('Reconnecting in 5 seconds...');
                setTimeout(() => startBot(), 5000);
            }
        } else if (connection === 'open') {
            console.log('✅ Bot connected successfully!');
            console.log(`📱 Bot Number: ${sock.user?.id}`);
            botConfig.ownerNumber = sock.user?.id;
        } else if (connection === 'connecting') {
            console.log('🔄 Connecting to WhatsApp...');
        }
    });

    // Handle pairing code with retry logic
    if (!sock.authState.creds.registered) {
        const phoneNumber = readline.question('Enter your WhatsApp number (with country code, e.g., +254712345678): ');
        const cleanNumber = phoneNumber.replace(/[^0-9]/g, '');
        
        let retries = 3;
        while (retries > 0) {
            try {
                console.log(`Requesting pairing code... (${4 - retries}/3)`);
                const code = await sock.requestPairingCode(cleanNumber);
                console.log(`\n🔑 Your pairing code: ${code}`);
                console.log('Enter this code in WhatsApp > Linked Devices > Link a Device > Link with phone number instead');
                break;
            } catch (error) {
                console.error(`Attempt ${4 - retries} failed:`, error.message);
                retries--;
                if (retries > 0) {
                    console.log('Retrying in 10 seconds...');
                    await new Promise(resolve => setTimeout(resolve, 10000));
                    return startBot();
                } else {
                    console.error('Failed to get pairing code after 3 attempts');
                    process.exit(1);
                }
            }
        }
    }

    // Save credentials when updated
    sock.ev.on('creds.update', saveCreds);

    // Handle incoming messages
    sock.ev.on('messages.upsert', async (m) => {
        const message = m.messages[0];
        if (!message.message || message.key.fromMe) return;

        const from = message.key.remoteJid;
        const messageText = message.message.conversation || 
                           message.message.extendedTextMessage?.text || '';
        
        const sender = message.key.participant || from;
        const senderName = message.pushName || 'User';
        const userId = from.replace('@s.whatsapp.net', '');
        
        console.log(`📩 Message from ${senderName}: ${messageText}`);

        // Command routing
        try {
            if (messageText.startsWith('/gen') || messageText.startsWith('.gen')) {
                await handleGenCommand(sock, from, messageText, senderName, message.id, userId);
            } else if (messageText.startsWith('/bin') || messageText.startsWith('.bin')) {
                await handleBinCommand(sock, from, messageText, senderName, message.id);
            } else if (messageText.startsWith('/ping') || messageText.startsWith('.ping')) {
                await handlePingCommand(sock, from, senderName);
            } else if (messageText.startsWith('/id') || messageText.startsWith('.id')) {
                await handleIdCommand(sock, from, messageText, senderName, userId);
            } else if (messageText.startsWith('/start') || messageText.startsWith('.start')) {
                await handleStartCommand(sock, from, senderName, userId);
            } else if (messageText.startsWith('/register') || messageText.startsWith('.register')) {
                await handleRegisterCommand(sock, from, senderName, userId);
            } else if (messageText.startsWith('/vbv') || messageText.startsWith('.vbv')) {
                await handleVbvCommand(sock, from, messageText, senderName, userId);
            } else if (messageText.startsWith('/mvbv') || messageText.startsWith('.mvbv')) {
                await handleMassVbvCommand(sock, from, messageText, senderName, userId);
            } else if (messageText.startsWith('/addvbv') || messageText.startsWith('.addvbv')) {
                await handleAddVbvCommand(sock, from, messageText, senderName, userId);
            } else if (messageText.startsWith('/rmvbv') || messageText.startsWith('.rmvbv')) {
                await handleRemoveVbvCommand(sock, from, messageText, senderName, userId);
            } else if (messageText.startsWith('/ad') || messageText.startsWith('.ad')) {
                await handleAdyenCommand(sock, from, messageText, senderName, userId);
            } else if (messageText.startsWith('/b4') || messageText.startsWith('.b4')) {
                await handleBraintreeCommand(sock, from, messageText, senderName, userId);
            } else if (messageText.startsWith('/help') || messageText.startsWith('.help')) {
                await handleHelpCommand(sock, from, senderName);
            }
        } catch (error) {
            console.error('Error handling command:', error);
            await sock.sendMessage(from, {
                text: '❌ An error occurred while processing your command.'
            });
        }
    });

    return sock;
}

// Helper functions
function isOwner(userId) {
    const config = JSON.parse(fs.readFileSync('FILES/config.json', 'utf8'));
    return config.OWNER_ID.includes(userId);
}

function getUser(userId) {
    return usersDb[userId] || null;
}

function createUser(userId, username, firstName) {
    const user = {
        id: userId,
        username: username || 'N/A',
        firstName: firstName || 'User',
        credits: 100,
        status: 'FREE',
        registeredAt: new Date().toISOString(),
        lastUsed: new Date().getTime()
    };
    usersDb[userId] = user;
    saveUsersDb();
    return user;
}

function updateUser(userId, updates) {
    if (usersDb[userId]) {
        Object.assign(usersDb[userId], updates);
        saveUsersDb();
    }
}

function deductCredits(userId, amount = 1) {
    if (usersDb[userId]) {
        usersDb[userId].credits = Math.max(0, usersDb[userId].credits - amount);
        saveUsersDb();
    }
}

function extractCCs(text) {
    const ccPattern = /(\d{13,19})\|(\d{1,2})\|(\d{2,4})\|(\d{3,4})/g;
    const matches = [];
    let match;
    while ((match = ccPattern.exec(text)) !== null) {
        matches.push(match[0]);
    }
    return matches;
}

// Command handlers
async function handleGenCommand(sock, from, messageText, senderName, messageId, userId) {
    try {
        const parts = messageText.split(' ');
        if (parts.length < 2) {
            const helpText = `Wrong Format ❌

Usage:
Only Bin
\`/gen 447697\`

With Expiration
\`/gen 447697|12\`
\`/gen 447697|12|23\`

With CVV
\`/gen 447697|12|23|000\`

With Custom Amount
\`/gen 447697 100\``;

            await sock.sendMessage(from, { text: helpText });
            return;
        }

        const ccsdata = parts[1];
        const ccParts = ccsdata.split('|');
        const cc = ccParts[0];
        const mes = ccParts[1] || "None";
        const ano = ccParts[2] || "None";
        const cvv = ccParts[3] || "None";

        let amount = 10; // Default amount
        if (parts.length > 2) {
            const parsedAmount = parseInt(parts[2]);
            if (!isNaN(parsedAmount)) {
                amount = parsedAmount;
            }
        }

        if (amount > 10000) {
            await sock.sendMessage(from, {
                text: `*Limit Reached ⚠️*

Message: Maximum Generated Amount is 10K.`
            });
            return;
        }

        const deleteMsg = await sock.sendMessage(from, {
            text: "*Generating...*"
        });

        const start = Date.now();
        const binDetails = await getBinDetails(cc.substring(0, 6));
        const [brand, type, level, bank, country, flag, currency] = binDetails;
        const allCards = luhnCardGenerator(cc, mes, ano, cvv, amount);
        
        await sock.sendMessage(from, { delete: deleteMsg.key });
        const timeTaken = ((Date.now() - start) / 1000).toFixed(2);

        if (amount === 10) {
            const response = `- 𝐂𝐂 𝐆𝐞𝐧𝐚𝐫𝐚𝐭𝐞𝐝 𝐒𝐮𝐜𝐜𝐞𝐬𝐬𝐟𝐮𝐥𝐥𝐲
- 𝐁𝐢𝐧 - \`${cc}\`
- 𝐀𝐦𝐨𝐮𝐧𝐭 - ${amount}

${generateCodeBlocks(allCards)}
- 𝗜𝗻𝗳𝗼 - ${brand} - ${type} - ${level}
- 𝐁𝐚𝐧𝐤 - ${bank} 🏛
- 𝐂𝐨𝐮𝐧𝐭𝐫𝐲 - ${country} - ${flag}

- 𝐓𝐢𝐦𝐞: - ${timeTaken} 𝐬𝐞𝐜𝐨𝐧𝐝𝐬
- 𝐂𝐡𝐞𝐜𝐤𝐞𝐝 - ${senderName} [ User ]`;

            await sock.sendMessage(from, { text: response });
        } else {
            const filename = `downloads/${amount}x_CC_Generated_By_${userId}.txt`;
            fs.writeFileSync(filename, allCards);

            const caption = `- 𝐁𝐢𝐧: \`${cc}\`
- 𝐀𝐦𝐨𝐮𝐧𝐭: ${amount}

- 𝗜𝗻𝗳𝗼 - ${brand} - ${type} - ${level}
- 𝐁𝐚𝐧𝐤 - ${bank} 🏛
- 𝐂𝐨𝐮𝐧𝐭𝐫𝐲 - ${country} - ${flag} - ${currency}

- 𝐓𝐢𝐦𝐞 - ${timeTaken} 𝐬𝐞𝐜𝐨𝐧𝐝𝐬
- 𝐂𝐡𝐞𝐜𝐤𝐞𝐝 - ${senderName} ⤿ User ⤾`;

            await sock.sendMessage(from, {
                document: fs.readFileSync(filename),
                fileName: `${amount}x_CC_Generated.txt`,
                mimetype: 'text/plain',
                caption: caption
            });

            fs.unlinkSync(filename);
        }

        console.log(`✅ Generated ${amount} cards for ${senderName}`);

    } catch (error) {
        console.error('Generation error:', error);
        await sock.sendMessage(from, {
            text: '❌ Error generating cards. Please try again with valid parameters.'
        });
    }
}

async function handleBinCommand(sock, from, messageText, senderName, messageId) {
    try {
        const parts = messageText.split(' ');
        if (parts.length < 2) {
            const helpText = `𝐈𝐧𝐯𝐚𝐥𝐢𝐝 𝐁𝐈𝐍 ⚠️

𝐌𝐞𝐬𝐬𝐚𝐠𝐞: 𝐍𝐨 𝐕𝐚𝐥𝐢𝐝 𝐁𝐈𝐍 𝐰𝐚𝐬 𝐟𝐨𝐮𝐧𝐝 𝐢𝐧 𝐲𝐨𝐮𝐫 𝐢𝐧𝐩𝐮𝐭.

Usage: /bin 447697`;
            await sock.sendMessage(from, { text: helpText });
            return;
        }

        const bin = parts[1].substring(0, 6);
        const binDetails = await getBinDetails(bin);
        const [brand, type, level, bank, country, flag, currency] = binDetails;

        const response = `𝗕𝗜𝗡 𝗟𝗼𝗼𝗸𝘂𝗽 𝗥𝗲𝘀𝘂𝗹𝘁 🔍

𝗕𝗜𝗡: \`${bin}\`
𝗜𝗻𝗳𝗼: \`${brand} - ${type} - ${level}\`
𝐁𝐚𝐧𝐤: \`${bank} 🏛\`
𝐂𝐨𝐮𝐧𝐭𝐫𝐲: \`${country} ${flag}\``;

        await sock.sendMessage(from, { text: response });
    } catch (error) {
        console.error('BIN lookup error:', error);
        await sock.sendMessage(from, {
            text: '❌ Error looking up BIN information.'
        });
    }
}

async function handlePingCommand(sock, from, senderName) {
    try {
        const start = Date.now();
        const pingMsg = await sock.sendMessage(from, { 
            text: '🤖 Checking ª𝗠𝗸𝗨𝘀𝗛𝘅𝗖𝗵𝗞 Ping...' 
        });
        const end = Date.now();
        
        const response = `🤖 Bot Name: ª𝗠𝗸𝗨𝘀𝗛𝘅𝗖𝗵𝗞 
✅ Bot Status: Running
📶 Ping: ${end - start} ms`;

        await sock.sendMessage(from, {
            text: response,
            edit: pingMsg.key
        });
    } catch (error) {
        console.error('Ping error:', error);
    }
}

async function handleIdCommand(sock, from, messageText, senderName, userId) {
    try {
        const response = `Hey ${senderName}!
Your User ID: \`${userId}\`
This Chat ID: \`${from}\``;

        await sock.sendMessage(from, { text: response });
    } catch (error) {
        console.error('ID command error:', error);
    }
}

async function handleStartCommand(sock, from, senderName, userId) {
    try {
        const frames = [
            'ª', 'ª𝗠', 'ª𝗠𝗸', 'ª𝗠𝗸𝗨', 'ª𝗠𝗸𝗨𝘀', 
            'ª𝗠𝗸𝗨𝘀𝗛', 'ª𝗠𝗸𝗨𝘀𝗛𝘅', 'ª𝗠𝗸𝗨𝘀𝗛𝘅𝗖', 
            'ª𝗠𝗸𝗨𝘀𝗛𝘅𝗖𝗵', 'ª𝗠𝗸𝗨𝘀𝗛𝘅𝗖𝗵𝗞'
        ];

        const startMsg = await sock.sendMessage(from, { text: frames[0] });
        
        for (let i = 1; i < frames.length; i++) {
            await new Promise(resolve => setTimeout(resolve, 200));
            await sock.sendMessage(from, {
                text: frames[i],
                edit: startMsg.key
            });
        }

        await new Promise(resolve => setTimeout(resolve, 500));
        
        const welcomeText = `🌟 𝗛𝗲𝗹𝗹𝗼 ${senderName}!

𝗪𝗲𝗹𝗰𝗼𝗺𝗲 𝗮𝗯𝗼𝗮𝗿𝗱 𝘁𝗵𝗲 ª𝗠𝗸𝗨𝘀𝗛𝘅𝗖𝗵𝗞! 🚀

𝗜 𝗮𝗺 𝘆𝗼𝘂𝗿 𝗴𝗼-𝘁𝗼 𝗯𝗼𝘁, 𝗽𝗮𝗰𝗸𝗲𝗱 𝘄𝗶𝘁𝗵 𝗮 𝘃𝗮𝗿𝗶𝗲𝘁𝘆 𝗼𝗳 𝗴𝗮𝘁𝗲𝘀, 𝘁𝗼𝗼𝗹𝘀, 𝗮𝗻𝗱 𝗰𝗼𝗺𝗺𝗮𝗻𝗱𝘀.

👇 𝗧𝗮𝗽 /register 𝘁𝗼 𝗯𝗲𝗴𝗶𝗻 𝘆𝗼𝘂𝗿 𝗷𝗼𝘂𝗿𝗻𝗲𝘆.
👇 𝗗𝗶𝘀𝗰𝗼𝘃𝗲𝗿 𝗺𝘆 𝗳𝘂𝗹𝗹 𝗰𝗮𝗽𝗮𝗯𝗶𝗹𝗶𝘁𝗶𝗲𝘀 𝘄𝗶𝘁𝗵 /help`;

        await sock.sendMessage(from, {
            text: welcomeText,
            edit: startMsg.key
        });
    } catch (error) {
        console.error('Start command error:', error);
    }
}

async function handleRegisterCommand(sock, from, senderName, userId) {
    try {
        const user = getUser(userId);
        
        if (user) {
            const response = `𝗔𝗹𝗿𝗲𝗮𝗱𝘆 𝗥𝗲𝗴𝗶𝘀𝘁𝗲𝗿𝗲𝗱 ⚠️

𝗠𝗲𝘀𝘀𝗮𝗴𝗲: 𝗬𝗼𝘂 𝗮𝗿𝗲 𝗮𝗹𝗿𝗲𝗮𝗱𝘆 𝗿𝗲𝗴𝗶𝘀𝘁𝗲𝗿𝗲𝗱 𝗶𝗻 𝗼𝘂𝗿 𝗯𝗼𝘁.

𝗘𝘅𝗽𝗹𝗼𝗿𝗲 𝗺𝘆 𝗰𝗼𝗺𝗺𝗮𝗻𝗱𝘀 𝘄𝗶𝘁𝗵 /help`;
        } else {
            createUser(userId, 'N/A', senderName);
            const response = `𝗥𝗲𝗴𝗶𝘀𝘁𝗿𝗮𝘁𝗶𝗼𝗻 𝗦𝘂𝗰𝗰𝗲𝘀𝘀𝗳𝘂𝗹 ♻️ 
━━━━━━━━━━━━━━
● 𝗡𝗮𝗺𝗲: ${senderName}
● 𝗨𝘀𝗲𝗿 𝗜𝗗: ${userId}
● 𝗥𝗼𝗹𝗲: Free
● 𝗖𝗿𝗲𝗱𝗶𝘁𝘀: 100

𝗠𝗲𝘀𝘀𝗮𝗴𝗲: 𝗬𝗼𝘂 𝗴𝗼𝘁 100 𝗰𝗿𝗲𝗱𝗶𝘁𝘀 𝗮𝘀 𝗿𝗲𝗴𝗶𝘀𝘁𝗿𝗮𝘁𝗶𝗼𝗻 𝗯𝗼𝗻𝘂𝘀.

𝗘𝘅𝗽𝗹𝗼𝗿𝗲 𝗺𝘆 𝘃𝗮𝗿𝗶𝗼𝘂𝘀 𝗰𝗼𝗺𝗺𝗮𝗻𝗱𝘀 𝘄𝗶𝘁𝗵 /help`;
        }

        await sock.sendMessage(from, { text: response });
    } catch (error) {
        console.error('Register error:', error);
    }
}

async function handleVbvCommand(sock, from, messageText, senderName, userId) {
    try {
        const user = getUser(userId);
        if (!user) {
            await sock.sendMessage(from, { text: 'Please register first with /register' });
            return;
        }

        const parts = messageText.split(' ');
        if (parts.length < 2) {
            const helpText = `Gate Name: 3DS Lookup ♻️
CMD: /vbv

Message: No CC Found in your input ❌

Usage: /vbv cc|mes|ano|cvv`;
            await sock.sendMessage(from, { text: helpText });
            return;
        }

        const ccData = parts[1];
        const ccParts = ccData.split('|');
        const cc = ccParts[0];
        const bin = cc.substring(0, 6);

        if (bin.startsWith('3')) {
            await sock.sendMessage(from, { text: 'Unsupported card type.' });
            return;
        }

        const processingMsg = await sock.sendMessage(from, { text: 'Processing your request...' });

        const vbvData = fs.readFileSync('FILES/vbvbin.txt', 'utf8').split('\n');
        let binFound = false;
        let binResponse = 'Not Found';
        let responseMessage = 'Lookup Card Error';
        let approve = '𝗥𝗲𝗷𝗲𝗰𝘁𝗲𝗱 ❌';

        for (const line of vbvData) {
            if (line.startsWith(bin)) {
                binFound = true;
                const parts = line.trim().split('|');
                binResponse = parts[1] || 'Unknown';
                responseMessage = parts[2] || 'Unknown Response';
                if (!binResponse.includes('3D TRUE ❌')) {
                    approve = '𝗣𝗮𝘀𝘀𝗲𝗱 ✅';
                }
                break;
            }
        }

        const start = Date.now();
        const binDetails = await getBinDetails(bin);
        const [brand, type, level, bank, country, flag] = binDetails;
        const timeTaken = ((Date.now() - start) / 1000).toFixed(2);

        const response = `${approve}
        
𝗖𝗮𝗿𝗱 ⇾ \`${ccData}\`
𝐆𝐚𝐭𝐞𝐰𝐚𝐲 ⇾ 3DS Lookup
𝐑𝐞𝐬𝐩𝐨𝐧𝐬𝐞 ⇾ ${responseMessage}

𝗜𝗻𝗳𝗼 ⇾ ${brand} - ${type} - ${level}
𝐈𝐬𝐬𝐮𝐞𝐫 ⇾ ${bank}
𝐂𝐨𝐮𝐧𝐭𝐫𝐲 ⇾ ${country} ${flag}

𝗧𝗶𝗺𝗲 ⇾ ${timeTaken} 𝘀𝗲𝗰𝗼𝗻𝗱𝘀`;

        await sock.sendMessage(from, {
            text: response,
            edit: processingMsg.key
        });

        deductCredits(userId, 1);
    } catch (error) {
        console.error('VBV error:', error);
    }
}

async function handleMassVbvCommand(sock, from, messageText, senderName, userId) {
    try {
        const user = getUser(userId);
        if (!user) {
            await sock.sendMessage(from, { text: 'Please register first with /register' });
            return;
        }

        const ccs = extractCCs(messageText);
        if (ccs.length === 0) {
            await sock.sendMessage(from, { text: 'No valid credit cards found in your message.' });
            return;
        }

        if (ccs.length > 25) {
            await sock.sendMessage(from, { text: `Error: Maximum 25 CCs allowed. You provided ${ccs.length}.` });
            return;
        }

        const processingMsg = await sock.sendMessage(from, { text: 'Processing your request...' });
        const vbvData = fs.readFileSync('FILES/vbvbin.txt', 'utf8').split('\n');

        let response = `MASS VBV CHECK [/mvbv]

Number Of CC Check : [${ccs.length} / 25]

`;

        const start = Date.now();

        for (const cc of ccs) {
            const bin = cc.split('|')[0].substring(0, 6);
            let status = 'Error';
            let responseText = 'Lookup Card Error';

            if (bin.startsWith('3')) {
                status = 'Card Error';
                responseText = 'Unsupported card type.';
            } else {
                for (const line of vbvData) {
                    if (line.startsWith(bin)) {
                        const parts = line.trim().split('|');
                        status = parts[1] || 'Unknown';
                        responseText = parts[2] || 'Unknown Response';
                        break;
                    }
                }
            }

            response += `Card↯ \`${cc}\`
**Status - ${status}**
**Result -⤿ ${responseText} ⤾**

`;
        }

        const timeTaken = ((Date.now() - start) / 1000).toFixed(2);
        response += `𝗧𝗶𝗺𝗲 ⇾ ${timeTaken} 𝘀𝗲𝗰𝗼𝗻𝗱𝘀`;

        await sock.sendMessage(from, {
            text: response,
            edit: processingMsg.key
        });

        deductCredits(userId, ccs.length);
    } catch (error) {
        console.error('Mass VBV error:', error);
    }
}

async function handleAddVbvCommand(sock, from, messageText, senderName, userId) {
    try {
        if (!isOwner(userId)) {
            await sock.sendMessage(from, { 
                text: `You Don't Have Permission To Use This Command.
Contact Bot Owner!` 
            });
            return;
        }

        const parts = messageText.split(' ');
        if (parts.length < 2) {
            await sock.sendMessage(from, { text: 'Usage: /addvbv BIN|STATUS|RESPONSE' });
            return;
        }

        const newToken = parts.slice(1).join(' ').trim();
        const newBin = newToken.split('|')[0].trim();

        const vbvData = fs.readFileSync('FILES/vbvbin.txt', 'utf8').split('\n');
        const updatedTokens = vbvData.filter(line => !line.startsWith(newBin));
        
        updatedTokens.push(newToken);
        fs.writeFileSync('FILES/vbvbin.txt', updatedTokens.join('\n'));

        const response = `VBV_TOKEN Successfully Added ✅
━━━━━━━━━━━━━━
${newToken}

Status: Successful`;

        await sock.sendMessage(from, { text: response });
    } catch (error) {
        console.error('Add VBV error:', error);
    }
}

async function handleRemoveVbvCommand(sock, from, messageText, senderName, userId) {
    try {
        if (!isOwner(userId)) {
            await sock.sendMessage(from, { 
                text: `You Don't Have Permission To Use This Command.
Contact Bot Owner!` 
            });
            return;
        }

        const parts = messageText.split(' ');
        if (parts.length < 2) {
            await sock.sendMessage(from, { text: 'Usage: /rmvbv BIN' });
            return;
        }

        const binToRemove = parts[1].trim();
        const vbvData = fs.readFileSync('FILES/vbvbin.txt', 'utf8').split('\n');
        const updatedTokens = vbvData.filter(line => !line.startsWith(binToRemove));

        if (updatedTokens.length === vbvData.length) {
            await sock.sendMessage(from, { text: `No matching token found for BIN: ${binToRemove}` });
            return;
        }

        fs.writeFileSync('FILES/vbvbin.txt', updatedTokens.join('\n'));

        const response = `VBV_TOKEN Successfully Removed ✅
━━━━━━━━━━━━━━
BIN: ${binToRemove}

Status: Successful`;

        await sock.sendMessage(from, { text: response });
    } catch (error) {
        console.error('Remove VBV error:', error);
    }
}

async function handleAdyenCommand(sock, from, messageText, senderName, userId) {
    try {
        const user = getUser(userId);
        if (!user) {
            await sock.sendMessage(from, { text: 'Please register first with /register' });
            return;
        }

        const parts = messageText.split(' ');
        if (parts.length < 2) {
            const helpText = `Gate Name: Adyen Auth ♻️
CMD: /ad

Message: No CC Found in your input ❌

Usage: /ad cc|mes|ano|cvv`;
            await sock.sendMessage(from, { text: helpText });
            return;
        }

        const ccData = parts[1];
        const ccParts = ccData.split('|');
        const [cc, mes, ano, cvv] = ccParts;

        const progressMsg = await sock.sendMessage(from, { 
            text: `↯ Checking.

- 𝐂𝐚𝐫𝐝 - \`${ccData}\` 
- 𝐆𝐚𝐭𝐞𝐰𝐚𝐲 -  Adyen Auth
- 𝐑𝐞𝐬𝐩𝐨𝐧𝐬𝐞 - ■□□□` 
        });

        await new Promise(resolve => setTimeout(resolve, 500));
        await sock.sendMessage(from, {
            text: `↯ Checking..

- 𝐂𝐚𝐫𝐝 - \`${ccData}\` 
- 𝐆𝐚𝐭𝐞𝐰𝐚𝐲 -  Adyen Auth
- 𝐑𝐞𝐬𝐩𝐨𝐧𝐬𝐞 - ■■■□`,
            edit: progressMsg.key
        });

        await new Promise(resolve => setTimeout(resolve, 500));
        await sock.sendMessage(from, {
            text: `↯ Checking...

- 𝐂𝐚𝐫𝐝 - \`${ccData}\` 
- 𝐆𝐚𝐭𝐞𝐰𝐚𝐲 -  Adyen Auth
- 𝐑𝐞𝐬𝐩𝐨𝐧𝐬𝐞 - ■■■■`,
            edit: progressMsg.key
        });

        const start = Date.now();
        const binDetails = await getBinDetails(cc.substring(0, 6));
        const [brand, type, level, bank, country, flag, currency] = binDetails;
        
        // Simulate payment processing
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Mock response (replace with actual payment processing)
        const isApproved = Math.random() > 0.7; // 30% approval rate
        const status = isApproved ? '𝐀𝐩𝐩𝐫𝐨𝐯𝐞𝐝 ✅' : '𝐃𝐞𝐜𝐥𝐢𝐧𝐞𝐝 ❌';
        const response = isApproved ? 'Auth Success' : 'Card was declined';
        
        const timeTaken = ((Date.now() - start) / 1000).toFixed(2);

        const finalResponse = `${status}

𝗖𝗮𝗿𝗱- \`${ccData}\` 
𝐆𝐚𝐭𝐞𝐰𝐚𝐲- Adyen Auth
𝐑𝐞𝐬𝐩𝐨𝐧𝐬𝐞- ⤿ ${response} ⤾

𝗜𝗻𝗳𝗼- ${brand} - ${type} - ${level}
𝐁𝐚𝐧𝐤- ${bank} 
𝐂𝐨𝐮𝐧𝐭𝐫𝐲- ${country} - ${flag} - ${currency}

𝗧𝗶𝗺𝗲- ${timeTaken} 𝐬𝐞𝐜𝐨𝐧𝐝𝐬`;

        await sock.sendMessage(from, {
            text: finalResponse,
            edit: progressMsg.key
        });

        deductCredits(userId, 1);
    } catch (error) {
        console.error('Adyen error:', error);
    }
}

async function handleBraintreeCommand(sock, from, messageText, senderName, userId) {
    try {
        const user = getUser(userId);
        if (!user) {
            await sock.sendMessage(from, { text: 'Please register first with /register' });
            return;
        }

        const parts = messageText.split(' ');
        if (parts.length < 2) {
            const helpText = `Gate Name: Braintree Auth 3 ♻️
CMD: /b4

Message: No CC Found in your input ❌

Usage: /b4 cc|mes|ano|cvv`;
            await sock.sendMessage(from, { text: helpText });
            return;
        }

        const ccData = parts[1];
        const ccParts = ccData.split('|');
        const [cc, mes, ano, cvv] = ccParts;

        const progressMsg = await sock.sendMessage(from, { 
            text: `↯ Checking.

- 𝗖𝗮𝗿𝗱 - \`${ccData}\` 
- 𝐆𝐚𝐭𝐞𝐰𝐚𝐲 -  Braintree Auth 3
- 𝐑𝐞𝐬𝐩𝐨𝐧𝐬𝐞 - ■□□□` 
        });

        await new Promise(resolve => setTimeout(resolve, 500));
        await sock.sendMessage(from, {
            text: `↯ Checking..

- 𝗖𝗮𝗿𝗱 - \`${ccData}\` 
- 𝐆𝐚𝐭𝐞𝐰𝐚𝐲 -  Braintree Auth 3
- 𝐑𝐞𝐬𝐩𝐨𝐧𝐬𝐞 - ■■■□`,
            edit: progressMsg.key
        });

        await new Promise(resolve => setTimeout(resolve, 500));
        await sock.sendMessage(from, {
            text: `↯ Checking...

- 𝗖𝗮𝗿𝗱 - \`${ccData}\` 
- 𝐆𝐚𝐭𝐞𝐰𝐚𝐲 -  Braintree Auth 3
- 𝐑𝐞𝐬𝐩𝐨𝐧𝐬𝐞 - ■■■■`,
            edit: progressMsg.key
        });

        const start = Date.now();
        const binDetails = await getBinDetails(cc.substring(0, 6));
        const [brand, type, level, bank, country, flag, currency] = binDetails;
        
        // Simulate payment processing
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Mock response
        const isApproved = Math.random() > 0.75; // 25% approval rate
        const status = isApproved ? '𝐀𝐩𝐩𝐫𝐨𝐯𝐞𝐝 ✅' : '𝐃𝐞𝐜𝐥𝐢𝐧𝐞𝐝 ❌';
        const response = isApproved ? '1000: Approved' : 'Gateway Rejected: cvv';
        
        const timeTaken = ((Date.now() - start) / 1000).toFixed(2);

        const finalResponse = `${status}

𝗖𝗮𝗿𝗱- \`${ccData}\` 
𝐆𝐚𝐭𝐞𝐰𝐚𝐲- Braintree Auth 3
𝐑𝐞𝐬𝐩𝐨𝐧𝐬𝐞- ⤿ ${response} ⤾

𝗜𝗻𝗳𝗼- ${brand} - ${type} - ${level}
𝐁𝐚𝐧𝐤- ${bank} 
𝐂𝐨𝐮𝐧𝐭𝐫𝐲- ${country} - ${flag} - ${currency}

𝗧𝗶𝗺𝗲- ${timeTaken} 𝐬𝐞𝐜𝐨𝐧𝐝𝐬`;

        await sock.sendMessage(from, {
            text: finalResponse,
            edit: progressMsg.key
        });

        deductCredits(userId, 1);
    } catch (error) {
        console.error('Braintree error:', error);
    }
}

async function handleHelpCommand(sock, from, senderName) {
    try {
        const helpText = `𝗛𝗲𝗹𝗹𝗼 ${senderName}!

ª𝗠𝗸𝗨𝘀𝗛𝘅𝗖𝗵𝗞 𝗛𝗮𝘀 𝗽𝗹𝗲𝗻𝘁𝘆 𝗼𝗳 𝗖𝗼𝗺𝗺𝗮𝗻𝗱𝘀

**📱 BASIC COMMANDS:**
• /start - Welcome message
• /register - Register for the bot
• /ping - Check bot status
• /id - Get your user ID
• /help - Show this help

**💳 CC TOOLS:**
• /gen - Generate credit cards
• /bin - BIN lookup

**🔒 VBV SYSTEM:**
• /vbv - Single VBV check
• /mvbv - Mass VBV check
• /addvbv - Add VBV token (Owner only)
• /rmvbv - Remove VBV token (Owner only)

**🚪 PAYMENT GATES:**
• /ad - Adyen Auth gate
• /b4 - Braintree Auth gate

**Examples:**
\`/gen 447697 10\`
\`/bin 447697\`
\`/vbv 4532123456789012|12|25|123\`
\`/ad 4532123456789012|12|25|123\`

𝗘𝗻𝗷𝗼𝘆 𝘂𝘀𝗶𝗻𝗴 𝘁𝗵𝗲 𝗯𝗼𝘁! 🚀`;

        await sock.sendMessage(from, { text: helpText });
    } catch (error) {
        console.error('Help error:', error);
    }
}

// Handle process termination
process.on('SIGINT', () => {
    console.log('\n👋 Bot shutting down...');
    process.exit(0);
});

process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    console.log('Restarting bot in 5 seconds...');
    setTimeout(() => startBot(), 5000);
});

process.on('unhandledRejection', (error) => {
    console.error('Unhandled Rejection:', error);
});

// Start the bot
console.log('🚀 Starting WhatsApp Bot...');
startBot().catch(error => {
    console.error('Failed to start bot:', error);
    console.log('Retrying in 10 seconds...');
    setTimeout(() => startBot(), 10000);
});
