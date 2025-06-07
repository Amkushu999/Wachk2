const { 
    default: makeWASocket, 
    DisconnectReason, 
    useMultiFileAuthState,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore
} = require('@whiskeysockets/baileys');
const readline = require('readline-sync');
const fs = require('fs');
const { 
    botConfig,
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
} = require('./config');

// Create auth directory
if (!fs.existsSync('./auth')) {
    fs.mkdirSync('./auth');
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
    });

    // Connection handling
    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;
        
        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('Connection closed due to:', lastDisconnect?.error, ', reconnecting:', shouldReconnect);
            
            if (shouldReconnect) {
                setTimeout(() => startBot(), 3000);
            }
        } else if (connection === 'open') {
            console.log('✅ Bot connected successfully!');
            console.log(`📱 Bot Number: ${sock.user?.id}`);
            botConfig.ownerNumbers.push(sock.user?.id);
        }
    });

    // Pairing code handling
    if (!sock.authState.creds.registered) {
        const phoneNumber = readline.question('Enter your WhatsApp number (with country code, e.g., +254712345678): ');
        const cleanNumber = phoneNumber.replace(/[^0-9]/g, '');
        
        try {
            const code = await sock.requestPairingCode(cleanNumber);
            console.log(`\n🔑 Your pairing code: ${code}`);
            console.log('Enter this code in WhatsApp > Linked Devices > Link a Device > Link with phone number instead');
        } catch (error) {
            console.error('Error requesting pairing code:', error);
            process.exit(1);
        }
    }

    sock.ev.on('creds.update', saveCreds);

    // Message handling
    sock.ev.on('messages.upsert', async (m) => {
        const message = m.messages[0];
        if (!message.message || message.key.fromMe) return;

        const from = message.key.remoteJid;
        const messageText = message.message.conversation || 
                           message.message.extendedTextMessage?.text || '';
        
        const sender = message.key.participant || from;
        const senderName = message.pushName || 'User';
        const userId = sender.replace('@s.whatsapp.net', '');
        
        console.log(`📩 Message from ${senderName}: ${messageText}`);

        // Handle commands
        if (messageText.startsWith('/')) {
            try {
                await handleCommand(sock, from, messageText, senderName, userId, message.id);
            } catch (error) {
                console.error('Error handling command:', error);
                await sock.sendMessage(from, {
                    text: '❌ An error occurred while processing your command.'
                });
            }
        }
    });

    return sock;
}

async function handleCommand(sock, from, messageText, senderName, userId, messageId) {
    const parts = messageText.split(' ');
    const command = parts[0].toLowerCase();
    
    // Check if user is registered (except for start and register commands)
    if (!['start', 'register'].includes(command.substring(1))) {
        const user = getUser(userId);
        if (!user) {
            await sock.sendMessage(from, {
                text: `*Please register first!*\n\nUse: \`/register\` to get started.`
            });
            return;
        }
    }

    switch (command) {
        case '/start':
            await handleStart(sock, from, senderName, userId);
            break;
            
        case '/register':
            await handleRegister(sock, from, senderName, userId);
            break;
            
        case '/ping':
            await handlePing(sock, from);
            break;
            
        case '/gen':
            await handleGen(sock, from, messageText, senderName, userId);
            break;
            
        case '/bin':
            await handleBin(sock, from, messageText);
            break;
            
        case '/id':
            await handleId(sock, from, userId, senderName);
            break;
            
        case '/ad':
        case '/b4':
            await handleSingleGate(sock, from, messageText, senderName, userId, command);
            break;
            
        case '/mad':
        case '/mb4':
            await handleMassGate(sock, from, messageText, senderName, userId, command);
            break;
            
        case '/vbv':
            await handleVbv(sock, from, messageText, senderName, userId);
            break;
            
        case '/mvbv':
            await handleMassVbv(sock, from, messageText, senderName, userId);
            break;
            
        case '/addvbv':
            await handleAddVbv(sock, from, messageText, userId);
            break;
            
        case '/rmvbv':
            await handleRemoveVbv(sock, from, messageText, userId);
            break;
            
        default:
            await sock.sendMessage(from, {
                text: `❌ Unknown command: \`${command}\`\n\nAvailable commands:\n/start - Get started\n/register - Register account\n/gen - Generate cards\n/bin - BIN lookup\n/ping - Check bot status\n/ad, /b4 - Single card check\n/mad, /mb4 - Mass card check\n/vbv - VBV check\n/mvbv - Mass VBV check`
            });
            break;
    }
}

async function handleStart(sock, from, senderName, userId) {
    // Animated start message
    const frames = [
        "ª",
        "ª𝗠",
        "ª𝗠𝗸", 
        "ª𝗠𝗸𝗨",
        "ª𝗠𝗸𝗨𝘀",
        "ª𝗠𝗸𝗨𝘀𝗛",
        "ª𝗠𝗸𝗨𝘀𝗛𝘅",
        "ª𝗠𝗸𝗨𝘀𝗛𝘅𝗖",
        "ª𝗠𝗸𝗨𝘀𝗛𝘅𝗖𝗵",
        "ª𝗠𝗸𝗨𝘀𝗛𝘅𝗖𝗵𝗞"
    ];
    
    const animationMessage = await sock.sendMessage(from, { text: frames[0] });
    
    for (let i = 1; i < frames.length; i++) {
        await new Promise(resolve => setTimeout(resolve, 200));
        await sock.sendMessage(from, {
            text: frames[i],
            edit: animationMessage.key
        });
    }
    
    await new Promise(resolve => setTimeout(resolve, 500));
    
    const welcomeText = `🌟 *Hello ${senderName}!*

*Welcome aboard the ª𝗠𝗸𝗨𝘀𝗛𝘅𝗖𝗵𝗞! 🚀*

*I am your go-to bot, packed with a variety of gates, tools, and commands to enhance your experience. Excited to see what I can do?*

👇 *Tap the Register button to begin your journey.*
👇 *Discover my full capabilities by using the commands below.*

*Available Commands:*
• /register - Create your account
• /gen - Generate credit cards
• /bin - BIN information lookup
• /ping - Check bot status
• /ad, /b4 - Single card checking
• /mad, /mb4 - Mass card checking 
• /vbv - VBV verification
• /mvbv - Mass VBV checking`;

    await sock.sendMessage(from, {
        text: welcomeText,
        edit: animationMessage.key
    });
}

async function handleRegister(sock, from, senderName, userId) {
    const user = getUser(userId);
    
    if (user) {
        await sock.sendMessage(from, {
            text: `*Already Registered ⚠️*

Message: You are already registered in our bot. No need to register now.

*Explore My Various Commands And Abilities.*`
        });
        return;
    }
    
    registerUser(userId, senderName);
    
    await sock.sendMessage(from, {
        text: `*Registration Successful ♻️*
━━━━━━━━━━━━━━
● Name: ${senderName}
● User ID: ${userId}
● Role: Free  
● Credits: 100

Message: You Got 100 Credits as registration bonus.

*Explore My Various Commands And Abilities.*`
    });
}

async function handlePing(sock, from) {
    const start = Date.now();
    const pingMsg = await sock.sendMessage(from, {
        text: `*🤖 Checking ${botConfig.botName} Ping...*`
    });
    const end = Date.now();
    
    await sock.sendMessage(from, {
        text: `*🤖 Bot Name: ${botConfig.botName}*
✅ *Bot Status: Running*
📶 *Ping: ${end - start} ms*`,
        edit: pingMsg.key
    });
}

async function handleGen(sock, from, messageText, senderName, userId) {
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

    let amount = 10;
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
    const binDetails = getBinInfo(cc.substring(0, 6));
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
}

async function handleBin(sock, from, messageText) {
    const parts = messageText.split(' ');
    if (parts.length < 2) {
        await sock.sendMessage(from, {
            text: `𝐈𝐧𝐯𝐚𝐥𝐢𝐝 𝐁𝐈𝐍 ⚠️

𝐌𝐞𝐬𝐬𝐚𝐠𝐞: 𝐍𝐨 𝐕𝐚𝐥𝐢𝐝 𝐁𝐈𝐍 𝐰𝐚𝐬 𝐟𝐨𝐮𝐧𝐝 𝐢𝐧 𝐲𝐨𝐮𝐫 𝐢𝐧𝐩𝐮𝐭.

Usage: \`/bin 447697\``
        });
        return;
    }

    const bin = parts[1].substring(0, 6);
    const binDetails = getBinInfo(bin);
    const [brand, type, level, bank, country, flag] = binDetails;

    const response = `𝗕𝗜𝗡 𝗟𝗼𝗼𝗸𝘂𝗽 𝗥𝗲𝘀𝘂𝗹𝘁 🔍

𝗕𝗜𝗡: \`${bin}\`
𝗜𝗻𝗳𝗼: \`${brand} - ${type} - ${level}\`
𝐁𝐚𝐧𝐤: \`${bank} 🏛\`
𝐂𝐨𝐮𝐧𝐭𝐫𝐲: \`${country} ${flag}\``;

    await sock.sendMessage(from, { text: response });
}

async function handleId(sock, from, userId, senderName) {
    const response = `*Hey ${senderName}!*
Your User ID: \`${userId}\`
This Chat ID: \`${from}\``;

    await sock.sendMessage(from, { text: response });
}

async function handleSingleGate(sock, from, messageText, senderName, userId, command) {
    const user = getUser(userId);
    if (!checkAntispam(userId)) {
        await sock.sendMessage(from, {
            text: "*Antispam Active ⚠️*\n\nPlease wait 10 seconds between commands."
        });
        return;
    }

    if (user.credit < 1) {
        await sock.sendMessage(from, {
            text: "*Insufficient Credits ⚠️*\n\nYou need at least 1 credit to use this command."
        });
        return;
    }

    const ccData = extractCC(messageText);
    if (!ccData) {
        const gatewayName = command === '/ad' ? 'Adyen Auth' : 'Braintree Auth 3';
        await sock.sendMessage(from, {
            text: `*Gate Name: ${gatewayName} ♻️*
CMD: ${command}

Message: No CC Found in your input ❌

Usage: ${command} cc|mes|ano|cvv`
        });
        return;
    }

    const { cc, mes, ano, cvv } = ccData;
    const fullcc = `${cc}|${mes}|${ano}|${cvv}`;
    const gatewayName = command === '/ad' ? 'Adyen Auth' : 'Braintree Auth 3';

    // Animated checking
    const frames = [
        `↯ Checking.

- 𝗖𝗮𝗿𝗱 - \`${fullcc}\`
- 𝐆𝐚𝐭𝐞𝐰𝐚𝐲 - *${gatewayName}*
- 𝐑𝐞𝐬𝐩𝐨𝐧𝐬𝐞 - ■□□□`,
        `↯ Checking..

- 𝗖𝗮𝗿𝗱 - \`${fullcc}\`
- 𝐆𝐚𝐭𝐞𝐰𝐚𝐲 - *${gatewayName}*
- 𝐑𝐞𝐬𝐩𝐨𝐧𝐬𝐞 - ■■■□`,
        `↯ Checking...

- 𝗖𝗮𝗿𝗱 - \`${fullcc}\`
- 𝐆𝐚𝐭𝐞𝐰𝐚𝐲 - *${gatewayName}*
- 𝐑𝐞𝐬𝐩𝐨𝐧𝐬𝐞 - ■■■■`
    ];

    const checkMsg = await sock.sendMessage(from, { text: frames[0] });

    for (let i = 1; i < frames.length; i++) {
        await new Promise(resolve => setTimeout(resolve, 500));
        await sock.sendMessage(from, {
            text: frames[i],
            edit: checkMsg.key
        });
    }

    const start = Date.now();
    const result = await simulatePaymentGate(fullcc, gatewayName);
    const binDetails = getBinInfo(cc.substring(0, 6));
    const [brand, type, level, bank, country, flag, currency] = binDetails;
    const timeTaken = ((Date.now() - start) / 1000).toFixed(2);

    const finalResponse = `${result.status}

𝗖𝗮𝗿𝗱- \`${fullcc}\`
𝐆𝐚𝐭𝐞𝐰𝐚𝐲- *${gatewayName}*
𝐑𝐞𝐬𝐩𝐨𝐧𝐬𝐞- ⤿ *${result.response}* ⤾

𝗜𝗻𝗳𝗼- ${brand} - ${type} - ${level}
𝐁𝐚𝐧𝐤- ${bank}
𝐂𝐨𝐮𝐧𝐭𝐫𝐲- ${country} - ${flag} - ${currency}

𝗧𝗶𝗺𝗲- ${timeTaken} 𝐬𝐞𝐜𝐨𝐧𝐝𝐬`;

    await sock.sendMessage(from, {
        text: finalResponse,
        edit: checkMsg.key
    });

    deductCredit(userId, 1);
    setAntispamTime(userId);
}

async function handleMassGate(sock, from, messageText, senderName, userId, command) {
    const user = getUser(userId);
    
    // Extract cards from message
    const lines = messageText.split('\n');
    const cards = [];
    
    for (const line of lines) {
        const ccData = extractCC(line);
        if (ccData) {
            const { cc, mes, ano, cvv } = ccData;
            cards.push(`${cc}|${mes}|${ano}|${cvv}`);
        }
    }

    if (cards.length === 0) {
        await sock.sendMessage(from, {
            text: "*No valid cards found in your message!*\n\nPlease send cards in format: cc|mm|yy|cvv"
        });
        return;
    }

    if (cards.length > 10) {
        await sock.sendMessage(from, {
            text: "*Limit Reached ⚠️*\n\nMessage: You can't check more than 10 CCs at a time."
        });
        return;
    }

    if (user.credit < cards.length) {
        await sock.sendMessage(from, {
            text: `*Insufficient Credits ⚠️*\n\nYou need ${cards.length} credits but only have ${user.credit}.`
        });
        return;
    }

    const gatewayName = command === '/mad' ? 'Adyen Auth' : 'Braintree Auth 3';
    
    const processingMsg = await sock.sendMessage(from, {
        text: `- 𝐆𝐚𝐭𝐞𝐰𝐚𝐲 - ${gatewayName}

- 𝐂𝐂 𝐀𝐦𝐨𝐮𝐧𝐭 - ${cards.length}
- 𝐂𝐡𝐞𝐜𝐤𝐞𝐝 - Checking CC For ${senderName}

- 𝐒𝐭𝐚𝐭𝐮𝐬 - Processing...⌛️`
    });

    let resultText = `*↯ ${gatewayName}*\n\n`;
    const start = Date.now();

    for (let i = 0; i < cards.length; i++) {
        const card = cards[i];
        const result = await simulatePaymentGate(card, gatewayName);
        
        resultText += `Card↯ \`${card}\`\n*Status - ${result.status}*\n*Result -⤿ ${result.response} ⤾*\n\n`;
        
        // Update every 3 cards
        if ((i + 1) % 3 === 0 || i === cards.length - 1) {
            await sock.sendMessage(from, {
                text: resultText,
                edit: processingMsg.key
            });
        }
        
        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    const timeTaken = ((Date.now() - start) / 1000).toFixed(2);
    resultText += `- 𝗧𝗶𝗺𝗲 - ${timeTaken} 𝐬𝐞𝐜𝐨𝐧𝐝𝐬`;

    await sock.sendMessage(from, {
        text: resultText,
        edit: processingMsg.key
    });

    deductCredit(userId, cards.length);
    setAntispamTime(userId);
}

async function handleVbv(sock, from, messageText, senderName, userId) {
    const user = getUser(userId);
    
    if (!checkAntispam(userId)) {
        await sock.sendMessage(from, {
            text: "*Antispam Active ⚠️*\n\nPlease wait 10 seconds between commands."
        });
        return;
    }

    if (user.credit < 1) {
        await sock.sendMessage(from, {
            text: "*Insufficient Credits ⚠️*\n\nYou need at least 1 credit to use this command."
        });
        return;
    }

    const ccData = extractCC(messageText);
    if (!ccData) {
        await sock.sendMessage(from, {
            text: `*Gate Name: 3DS Lookup ♻️*
CMD: /vbv

Message: No CC Found in your input ❌

Usage: /vbv cc|mes|ano|cvv`
        });
        return;
    }

    const { cc, mes, ano, cvv } = ccData;
    const fullcc = `${cc}|${mes}|${ano}|${cvv}`;
    const bin = cc.substring(0, 6);

    if (cc.startsWith('3')) {
        await sock.sendMessage(from, {
            text: "*Unsupported card type.*"
        });
        return;
    }

    const processingMsg = await sock.sendMessage(from, {
        text: "Processing your request..."
    });

    const start = Date.now();
    const vbvInfo = getVbvInfo(bin);
    const binDetails = getBinInfo(bin);
    const [brand, type, level, bank, country, flag] = binDetails;

    let status = "𝗣𝗮𝘀𝘀𝗲𝗱 ✅";
    let responseMessage = "3D FALSE ✅";

    if (vbvInfo) {
        if (vbvInfo.status.includes("3D TRUE")) {
            status = "𝗥𝗲𝗷𝗲𝗰𝘁𝗲𝗱 ❌";
        }
        responseMessage = vbvInfo.response;
    } else {
        status = "𝗥𝗲𝗷𝗲𝗰𝘁𝗲𝗱 ❌";
        responseMessage = "Lookup Card Error";
    }

    const timeTaken = ((Date.now() - start) / 1000).toFixed(2);

    const response = `${status}

𝗖𝗮𝗿𝗱 ⇾ \`${fullcc}\`
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

    deductCredit(userId, 1);
    setAntispamTime(userId);
}

async function handleMassVbv(sock, from, messageText, senderName, userId) {
    const user = getUser(userId);
    
    // Extract cards from message
    const lines = messageText.split('\n');
    const cards = [];
    
    for (const line of lines) {
        const ccData = extractCC(line);
        if (ccData) {
            const { cc, mes, ano, cvv } = ccData;
            cards.push(`${cc}|${mes}|${ano}|${cvv}`);
        }
    }

    if (cards.length === 0) {
        await sock.sendMessage(from, {
            text: "*No valid cards found in your message!*\n\nPlease send cards in format: cc|mm|yy|cvv"
        });
        return;
    }

    if (cards.length > 25) {
        await sock.sendMessage(from, {
            text: `*Error: The maximum number of CC entries allowed is 25. You provided ${cards.length}.*`
        });
        return;
    }

    if (user.credit < cards.length) {
        await sock.sendMessage(from, {
            text: `*Insufficient Credits ⚠️*\n\nYou need ${cards.length} credits but only have ${user.credit}.`
        });
        return;
    }

    const processingMsg = await sock.sendMessage(from, {
        text: "Processing your request..."
    });

    let resultText = `*MASS VBV CHECK [/mvbv]*

Number Of CC Check : [${cards.length} / 25]

`;
    const start = Date.now();

    for (let i = 0; i < cards.length; i++) {
        const card = cards[i];
        const bin = card.split('|')[0].substring(0, 6);
        
        let status = "Error";
        let response = "Lookup Card Error";

        if (card.startsWith('3')) {
            status = "Card Error";
            response = "Unsupported card type.";
        } else {
            const vbvInfo = getVbvInfo(bin);
            if (vbvInfo) {
                status = vbvInfo.status;
                response = vbvInfo.response;
            }
        }
        
        resultText += `Card↯ \`${card}\`\n*Status - ${status}*\n*Result -⤿ ${response} ⤾*\n\n`;
        
        // Update every 5 cards
        if ((i + 1) % 5 === 0 || i === cards.length - 1) {
            await sock.sendMessage(from, {
                text: resultText,
                edit: processingMsg.key
            });
        }
        
        await new Promise(resolve => setTimeout(resolve, 500));
    }

    const timeTaken = ((Date.now() - start) / 1000).toFixed(2);
    resultText += `𝗧𝗶𝗺𝗲 ⇾ ${timeTaken} 𝘀𝗲𝗰𝗼𝗻𝗱𝘀`;

    await sock.sendMessage(from, {
        text: resultText,
        edit: processingMsg.key
    });

    deductCredit(userId, cards.length);
    setAntispamTime(userId);
}

async function handleAddVbv(sock, from, messageText, userId) {
    if (!botConfig.ownerNumbers.includes(userId)) {
        await sock.sendMessage(from, {
            text: "*You Don't Have Permission To Use This Command.*\nContact Bot Owner!"
        });
        return;
    }

    const parts = messageText.split(' ');
    if (parts.length < 2) {
        await sock.sendMessage(from, {
            text: "*Usage: /addvbv BIN|STATUS|RESPONSE*\n\nExample: /addvbv 123456|3D TRUE ❌|3D Secure Required"
        });
        return;
    }

    const token = parts.slice(1).join(' ');
    
    if (addVbvToken(token)) {
        await sock.sendMessage(from, {
            text: `*VBV_TOKEN Successfully Added ✅*
━━━━━━━━━━━━━━
${token}

Status: Successful`
        });
    } else {
        await sock.sendMessage(from, {
            text: "*Error: Invalid token format*\n\nUse: BIN|STATUS|RESPONSE"
        });
    }
}

async function handleRemoveVbv(sock, from, messageText, userId) {
    if (!botConfig.ownerNumbers.includes(userId)) {
        await sock.sendMessage(from, {
            text: "*You Don't Have Permission To Use This Command.*\nContact Bot Owner!"
        });
        return;
    }

    const parts = messageText.split(' ');
    if (parts.length < 2) {
        await sock.sendMessage(from, {
            text: "*Usage: /rmvbv BIN*\n\nExample: /rmvbv 123456"
        });
        return;
    }

    const bin = parts[1];
    
    if (removeVbvToken(bin)) {
        await sock.sendMessage(from, {
            text: `*VBV_TOKEN Successfully Removed ✅*
━━━━━━━━━━━━━━
BIN: ${bin}

Status: Successful`
        });
    } else {
        await sock.sendMessage(from, {
            text: `*No matching token found for BIN: ${bin}*`
        });
    }
}

// Handle process termination
process.on('SIGINT', () => {
    console.log('\n👋 Bot shutting down...');
    process.exit(0);
});

process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (error) => {
    console.error('Unhandled Rejection:', error);
});

// Start the bot
console.log('🚀 Starting WhatsApp Bot...');
startBot().catch(console.error);
