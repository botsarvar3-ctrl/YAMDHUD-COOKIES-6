const express = require('express');
const multer = require('multer');
const session = require('express-session');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');
const wiegine = require("josh-fca");
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
const http = require('http');
const { Server } = require('socket.io');
const { v4: uuidv4 } = require('uuid');

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// ==================== MULTER CONFIGURATION ====================
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    let uploadPath = 'uploads/';
    if (!fs.existsSync('uploads/')) fs.mkdirSync('uploads/', { recursive: true });
    if (!fs.existsSync('uploads/cookies/')) fs.mkdirSync('uploads/cookies/', { recursive: true });
    if (!fs.existsSync('uploads/files/')) fs.mkdirSync('uploads/files/', { recursive: true });

    if (file.fieldname === 'cookiefile') {
      uploadPath = 'uploads/cookies/';
    } else if (file.fieldname === 'abusingfile') {
      uploadPath = 'uploads/files/';
    }
    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + '-' + Math.round(Math.random() * 1E9));
  }
});

const upload = multer({ storage: storage });
const PORT = 3000;

app.set('view engine', 'ejs');
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static('public'));
app.use('/logs', express.static('logs'));

// Ensure logs directory exists
if (!fs.existsSync('logs')) {
  fs.mkdirSync('logs');
}

const sessions = {};
const userLogs = {};

// Helper: Validate and clean cookies from uploaded file
async function validateAndCleanCookies(cookieFilePath, sessionId) {
  return new Promise((resolve) => {
    try {
      const fileContent = fs.readFileSync(cookieFilePath, 'utf8').trim();
      if (!fileContent) return resolve({ success: false, error: 'Cookie file is empty' });

      let allCookies = [];
      try {
        const jsonData = JSON.parse(fileContent);
        if (Array.isArray(jsonData)) {
          allCookies = [JSON.stringify(jsonData)];
        } else {
          return resolve({ success: false, error: 'Invalid JSON format' });
        }
      } catch (e) {
        allCookies = fileContent.split('\n').map(c => c.trim()).filter(c => c.length > 0);
      }

      const validCookies = [];
      let tested = 0;
      const total = allCookies.length;

      if (total === 0) return resolve({ success: false, error: 'No cookies found' });

      allCookies.forEach((cookie, index) => {
        let loginData;
        try {
          if (cookie.startsWith('[') || cookie.startsWith('{')) {
            loginData = JSON.parse(cookie);
          } else {
            const parsedCookies = {};
            cookie.split(";").forEach((item) => {
              const [key, value] = item.trim().split("=");
              if (key && value) parsedCookies[key] = value;
            });
            const currentDate = new Date().toISOString();
            loginData = Object.entries(parsedCookies).map(([key, value]) => ({
              key, value, domain: "facebook.com", path: "/", hostOnly: false, secure: true, httpOnly: false, creation: currentDate, lastAccessed: currentDate,
            }));
          }
        } catch (e) {
          tested++;
          if (tested === total) finish();
          return;
        }

        const opts = {
          appState: loginData,
          clientID: "sahilansari00112233",
          forceLogin: true,
          listenEvents: false,
          logLevel: "silent",
          userAgent: "Dalvik/2.1.0 (Linux; U; Android 10; SM-A107F Build/QP1A.190711.020)",
        };

        wiegine(opts, (err, api) => {
          if (!err) {
            validCookies.push(cookie);
            if (api && typeof api.logout === 'function') api.logout();
          }
          tested++;
          if (tested === total) finish();
        });
      });

      function finish() {
        if (validCookies.length === 0) return resolve({ success: false, error: 'No valid cookies found' });
        const cleanedPath = cookieFilePath + '_cleaned';
        fs.writeFileSync(cleanedPath, validCookies.join('\n'));
        resolve({ success: true, cleanedFilePath: cleanedPath, validCookies });
      }
    } catch (e) {
      resolve({ success: false, error: 'File error' });
    }
  });
}

app.use(session({
  secret: 'admin-secret',
  resave: false,
  saveUninitialized: true
}));

app.get('/', (req, res) => {
  if (!req.session.authenticated) return res.redirect('/login');
  res.redirect('/dashboard');
});

app.get('/login', (req, res) => {
  res.render('login', { message: null });
});

// LOGIN PASSWORD
app.post('/login', (req, res) => {
  const password = req.body.password;
  if (password && password.trim() === 'XMARTY-AYUSH-KING') {
    req.session.authenticated = true;
    res.redirect('/dashboard');
  } else {
    res.render('login', { message: 'Invalid password !' });
  }
});

app.get('/dashboard', (req, res) => {
  if (!req.session.authenticated) return res.redirect('/login');

  const enhancedSessions = {};
  for (const [id, sessionData] of Object.entries(sessions)) {
    if (sessionData.owner !== req.sessionID) continue;

    const logFile = path.join(__dirname, 'logs', `${id}.txt`);
    let messageCount = 0;
    let lastMessage = "No messages sent yet";

    if (fs.existsSync(logFile)) {
      const logContent = fs.readFileSync(logFile, 'utf8');
      const entries = logContent.split('\n\n').filter(e => e.trim());
      messageCount = entries.length;
      if (messageCount > 0) {
        const lastEntry = entries[entries.length - 1];
        const lines = lastEntry.split('\n');
        lastMessage = lines.length >= 2 ? lines[1] : "Parsed error";
      }
    }

    enhancedSessions[id] = {
      ...sessionData,
      status: sessionData.timer ? 'RUNNING' : 'STOPPED',
      messageCount,
      lastMessage
    };
  }

  res.render('dashboard', { sessions: enhancedSessions, userLogs });
});

app.post('/start', upload.fields([{ name: 'cookiefile' }, { name: 'abusingfile' }]), async (req, res) => {
  if (!req.session.authenticated) return res.redirect('/login');

  const { password, targetID, timer, hatersname, cookieMethod, singleCookie, multiCookies } = req.body;

  // ← Authentication key check हटा दिया गया है

  if (!req.files.abusingfile || !req.files.abusingfile[0]) return res.status(400).send('Messages file required');

  let allCookies = [];
  if (cookieMethod === 'single') {
    if (!singleCookie) return res.status(400).send('Cookie required');
    allCookies = [singleCookie.trim()];
  } else if (cookieMethod === 'multi') {
    if (!multiCookies) return res.status(400).send('Cookies required');
    allCookies = multiCookies.split('\n').map(c => c.trim()).filter(Boolean);
  } else if (cookieMethod === 'file') {
    if (!req.files.cookiefile) return res.status(400).send('Cookie file required');
    const validation = await validateAndCleanCookies(req.files.cookiefile[0].path, uuidv4());
    if (!validation.success) return res.status(400).send(validation.error);
    allCookies = validation.validCookies;
  }

  const messages = fs.readFileSync(req.files.abusingfile[0].path, 'utf8').split('\n').filter(Boolean);
  const sessionId = uuidv4();
  const logFile = path.join('logs', `${sessionId}.txt`);
  let currentIndex = 0;

  function startBot(api) {
    let cookieIndex = 0;
    let activeApis = [api];
    let currentApiIndex = 0;

    const sendMessageWithSequentialAccount = (message) => {
      if (activeApis.length === 0) {
        const now = new Date().toLocaleString('en-PK', { timeZone: 'Asia/Karachi' });
        const stopMessage = `🛑 AUTO-STOP | Session ${sessionId} | All cookies invalid\n\n`;
        io.emit('log', stopMessage);
        if (sessions[sessionId]) {
          clearInterval(sessions[sessionId].timer);
          delete sessions[sessionId];
        }
        return;
      }

      const currentApi = activeApis[currentApiIndex];
      const accountInfo = activeApis.length > 1 ? ` [Account ${currentApiIndex + 1}/${activeApis.length}]` : '';
      let safeTargetID = String(targetID).trim();

      const attemptSend = (id, isRetry = false) => {
        const target = isRetry ? Number(id) : String(id);
        
        currentApi.sendMessage(message, target, (err) => {
          if (err) {
            if (!isRetry && (err.error === 1545012 || (err.message && (err.message.includes('1545012') || err.message.includes('1357004'))))) {
              if (/^\d+$/.test(String(id))) {
                const retryLog = `⚠️ ID FORMAT RETRY | Session ${sessionId} | Retrying with numeric type for ID: ${id}\n\n`;
                io.emit('log', retryLog);
                return attemptSend(id, true);
              }
            }

            if (err.error === 1545012 || (err.message && err.message.includes('1545012'))) {
              logSuccessfulMessage(message, accountInfo + " (Sent)");
              if (activeApis.length > 1) {
                currentApiIndex = (currentApiIndex + 1) % activeApis.length;
              }
              return;
            }

            if (err.message && (err.message.includes('login') || err.message.includes('Session expired') || err.message.includes('User not logged in'))) {
              activeApis.splice(currentApiIndex, 1);
              if (activeApis.length > 0) {
                currentApiIndex %= activeApis.length;
                sendMessageWithSequentialAccount(message);
              }
              return;
            }

            const errorLog = `⚠️ SEND ERROR | Session ${sessionId} | ${err.message || err}\n\n`;
            io.emit('log', errorLog);
            return;
          }

          logSuccessfulMessage(message, accountInfo);
          if (activeApis.length > 1) {
            currentApiIndex = (currentApiIndex + 1) % activeApis.length;
          }
        });
      };

      attemptSend(safeTargetID);
    };

    function logSuccessfulMessage(message, accountInfo) {
      const now = new Date().toLocaleString('en-PK', { timeZone: 'Asia/Karachi' });
      const log = `Session ${sessionId} | To: ${targetID}${accountInfo} | ${now}\n${message}\n\n`;
      fs.appendFileSync(logFile, log);
      io.emit('log', log);
      currentIndex = (currentIndex + 1) % messages.length;
    }

    const interval = setInterval(() => {
      const message = `${hatersname} ${messages[currentIndex].trim()}`;
      sendMessageWithSequentialAccount(message);
    }, parseInt(timer) * 1000);

    sessions[sessionId] = {
      timer: interval,
      startTime: new Date().toLocaleString('en-PK', { timeZone: 'Asia/Karachi' }),
      targetID,
      owner: req.sessionID
    };
  }

  // Initial login
  let loginData;
  const initialCookie = allCookies[0];
  try {
    if (initialCookie.startsWith('[') || initialCookie.startsWith('{')) {
      loginData = JSON.parse(initialCookie);
    } else {
      const parsed = {};
      initialCookie.split(";").forEach(i => {
        const [k, v] = i.trim().split("=");
        if (k && v) parsed[k] = v;
      });
      loginData = Object.entries(parsed).map(([key, value]) => ({
        key, value, domain: "facebook.com", path: "/", secure: true
      }));
    }
  } catch (e) {
    return res.status(400).send('Invalid cookie format');
  }

  wiegine({
    appState: loginData,
    clientID: "sahilansari00112233",
    forceLogin: true,
    userAgent: "Dalvik/2.1.0 (Linux; U; Android 10; SM-A107F Build/QP1A.190711.020)"
  }, (err, api) => {
    if (err) return res.status(400).send(`Login failed: ${err.message}`);
    startBot(api);
    res.redirect('/dashboard');
  });
});

app.post('/stop', (req, res) => {
  const id = req.body.sessionId;
  if (sessions[id] && sessions[id].owner === req.sessionID) {
    clearInterval(sessions[id].timer);
    delete sessions[id];
  }
  res.redirect('/dashboard');
});

server.listen(PORT, () => console.log(`Server running on port ${PORT}`));