import './env-loader.js';
import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { Server } from 'socket.io';
import { WhatsAppEngine } from './services/whatsappEngine.js';
import { storage } from './services/storage.js';
import { CampaignService } from './services/campaignService.js';
import { SessionService } from './services/sessionService.js';
// import { Action } from './models/Action.js'; removed bad import
import { AutoReplyService } from './services/autoReplyService.js';
import { SchedulerService } from './services/schedulerService.js';
import { getAIResponse } from './services/aiService.js';
import { IUser } from './models/User.js';
import { ISession } from './models/Session.js';
import { ISetting } from './models/Setting.js';
import { ChatLog } from './models/index.js';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';

dotenv.config({ path: '.env.local' });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Behind Render/Vercel proxies — trust X-Forwarded-* so req.ip is the real client IP
app.set('trust proxy', true);

// CORS must be the FIRST middleware so every route — including the preflight
// OPTIONS request the browser sends before login — gets the CORS headers.
// origin: true reflects the caller's origin (works for the Vercel frontend).
app.use(cors({
    origin: true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
}));

// --- Global Middleware ---
app.use(express.json({ limit: '50mb' })); // Combined Body Parser (JSON)
app.use(express.urlencoded({ extended: true, limit: '50mb' })); // Body Parser (URL Encoded)

app.get('/', (req, res) => res.send('WhatsApp Gateway API is Running 🚀 (V: 1.0.3)')); // Single Root Route

const httpServer = createServer(app);
const io = new Server(httpServer, {
    maxHttpBufferSize: 1e7,
    cors: { origin: "*", methods: ["GET", "POST"] }
});

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-it';

// --- Stats Endpoint ---

// Middleware: Authenticate Token & Optional Admin Check
const authenticateToken = (req: any, res: any, next: any) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (token == null) return res.sendStatus(401);

    jwt.verify(token, JWT_SECRET, (err: any, user: any) => {
        if (err) return res.sendStatus(403);
        req.user = user;
        next();
    });
};

const requireAdmin = (req: any, res: any, next: any) => {
    if (req.user && req.user.role === 'admin') {
        next();
    } else {
        res.status(403).json({ error: 'Admin access required' });
    }
};

// Accepts EITHER a dashboard JWT or an account-level API key (x-api-key / Bearer ak_... / ?api_key).
// Used on the public REST endpoints documented for external integrations.
const authenticateTokenOrApiKey = async (req: any, res: any, next: any) => {
    const authHeader = req.headers['authorization'] || '';
    const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    const apiKey = String(req.headers['x-api-key'] || req.query.api_key || (bearer.startsWith('ak_') ? bearer : '')).trim();

    if (apiKey.startsWith('ak_')) {
        try {
            const user = await storage.getItem('users', { apiKey });
            if (!user) return res.status(403).json({ success: false, error_code: 'INVALID_API_KEY', message: 'مفتاح API غير صحيح' });
            if (user.isActive === false) return res.status(403).json({ success: false, error_code: 'ACCOUNT_SUSPENDED', message: 'الحساب موقوف' });
            req.user = { userId: user._id, role: user.role };
            return next();
        } catch (e: any) {
            return res.status(500).json({ success: false, error_code: 'AUTH_ERROR', message: e.message });
        }
    }

    if (!bearer) return res.status(401).json({ success: false, error_code: 'UNAUTHORIZED', message: 'مطلوب مفتاح API أو تسجيل دخول' });
    jwt.verify(bearer, JWT_SECRET, (err: any, user: any) => {
        if (err) return res.status(403).json({ success: false, error_code: 'FORBIDDEN', message: 'بيانات اعتماد غير صالحة' });
        req.user = user;
        next();
    });
};

// Seed Admin User
const seedAdmin = async () => {
    try {
        // Fix: Drop legacy 'email_1' index if it exists (causes user creation errors)
        try {
            const UserModel: any = storage.getModel('users');
            if (UserModel) {
                await UserModel.collection.dropIndex('email_1');
                console.log('--> Dropped legacy index: email_1');
            }
        } catch (idxErr: any) {
            // Ignore error if index doesn't exist
            if (idxErr.code !== 27) { // 27 = Index not found
                console.log('--> Note: email_1 index logic:', idxErr.message);
            }
        }

        const adminUser = await storage.getItem('users', { role: 'admin' });
        if (!adminUser) {
            console.log('Seeding default admin...');
            const hashedPassword = await bcrypt.hash('admin123', 10);
            await storage.saveItem('users', {
                name: 'System Admin',
                username: 'admin@admin.com',
                password: hashedPassword,
                role: 'admin',
                isActive: true
            });
            console.log('Default admin created: admin@admin.com / admin123');
        } else {
            if (adminUser.username !== 'admin@admin.com') {
                adminUser.username = 'admin@admin.com';
                adminUser.isActive = true;
                await storage.saveItem('users', adminUser);
                console.log('Admin updated');
            }
        }
    } catch (error) {
        console.error('Failed to seed admin:', error);
    }
};

// Migrate the AI Agent collection to the per-session model.
// Drops the legacy unique index on userId and builds the {userId, sessionId} index.
const syncAgentIndexes = async () => {
    try {
        const AgentModel: any = storage.getModel('aiagent');
        await AgentModel.syncIndexes();
        console.log('--> aiagent indexes synced (per-session).');
    } catch (e: any) {
        console.log('--> aiagent index sync note:', e.message);
    }
};

// Seed default subscription plans on first run
const seedPlans = async () => {
    try {
        const existing = await storage.getItems('plans');
        if (existing.length > 0) return;
        const defaults = [
            { name: 'مجانية', priceMonthly: 0, priceYearly: 0, currency: 'ج.م', priceMonthlySA: 0, priceYearlySA: 0, currencySA: 'ر.س', maxSessions: 1, maxConversations: 100, maxCampaignMessages: 200, maxScheduled: 1, features: ['جهاز واحد', 'رد آلي بالذكاء الاصطناعي', 'قواعد معرفة أساسية'], popular: false, order: 1, isActive: true },
            { name: 'احترافية', priceMonthly: 299, priceYearly: 2990, currency: 'ج.م', priceMonthlySA: 49, priceYearlySA: 490, currencySA: 'ر.س', maxSessions: 3, maxConversations: 2000, maxCampaignMessages: 10000, maxScheduled: 10, features: ['3 أجهزة', 'كل مميزات الذكاء الاصطناعي', 'تكامل فيسبوك', 'تحليلات متقدمة', 'دعم أولوية'], popular: true, order: 2, isActive: true },
            { name: 'أعمال', priceMonthly: 799, priceYearly: 7990, currency: 'ج.م', priceMonthlySA: 129, priceYearlySA: 1290, currencySA: 'ر.س', maxSessions: 10, maxConversations: 0, maxCampaignMessages: 0, maxScheduled: 0, features: ['10 أجهزة', 'محادثات وحملات بلا حدود', 'API للموقع الإلكتروني', 'مستخدمون متعددون', 'دعم مخصص'], popular: false, order: 3, isActive: true }
        ];
        for (const p of defaults) await storage.saveItem('plans', p);
        console.log('--> Seeded default subscription plans.');
    } catch (e: any) { console.log('--> seedPlans note:', e.message); }
};

const PORT = Number(process.env.PORT || 3050);

// Initialize & Start Server
const startServer = async () => {
    // 1. Start listening FIRST so health-check & CORS preflight always respond,
    //    even while MongoDB is still connecting. This prevents a crash-loop / 503s
    //    on Render when the DB is briefly unreachable.
    httpServer.listen(PORT, '0.0.0.0', () => {
        console.log(`Backend Server running on port ${PORT}`);
    });

    // 2. Connect to MongoDB (retries internally), then load everything that needs the DB.
    try {
        await storage.init();
        await syncAgentIndexes();
        await SessionService.loadSessions();
        SchedulerService.init();
        await seedAdmin();
        await seedPlans();
        console.log('✅ Startup complete (DB connected, sessions loaded).');
    } catch (err) {
        console.error('⚠️  Background startup error (server still listening):', err);
    }
};

startServer();

// Health/Version Check
app.get('/api/version', (req: any, res: any) => {
    res.json({
        version: '1.0.2-debug-error-logging',
        timestamp: new Date().toISOString(),
        env: process.env.NODE_ENV
    });
});

// --- Settings Routes ---

// Get System Settings (Public to allow Login page to show name)
app.get('/api/settings', async (req: any, res: any) => {
    try {
        const settings = await storage.getItems('settings');
        // Convert array to object { key: value }
        const settingsObj = settings.reduce((acc: any, curr: any) => {
            // Since settings are sorted by createdAt desc (Newest first),
            // we only take the first occurrence of each key to ignore old duplicates.
            if (acc[curr.key] === undefined) {
                acc[curr.key] = curr.value;
            }
            return acc;
        }, {});

        // Default if not set
        if (!settingsObj.systemName) settingsObj.systemName = 'SaaSBot';

        res.json(settingsObj);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch settings' });
    }
});

// Update Settings (Admin Only)
app.put('/api/settings', authenticateToken, requireAdmin, async (req: any, res: any) => {
    try {
        const { systemName } = req.body;
        console.log('Updating settings:', req.body);

        if (systemName) {
            await storage.saveItem('settings', { key: 'systemName', value: systemName });
        }

        res.json({ success: true, message: 'Settings updated' });
    } catch (error) {
        console.error('Settings update error:', error);
        res.status(500).json({ error: 'Failed to update settings' });
    }
});

// --- Auth Routes ---

// Register (Now Protected - Admin Only)
app.post('/api/auth/register', authenticateToken, requireAdmin, async (req: any, res: any) => {
    console.log('--> REGISTER REQUEST RECEIVED');
    console.log('Body:', JSON.stringify(req.body, null, 2));
    try {
        const { name, username, password, permissions, role, maxSessions } = req.body;
        if (!name || !username || !password) return res.status(400).json({ error: 'Missing fields' });

        const existingUser = await storage.getItem('users', { username });
        if (existingUser) return res.status(400).json({ error: 'Username already exists' });

        const isAdminRole = role === 'admin';
        const hashedPassword = await bcrypt.hash(password, 10);
        const user = await storage.saveItem('users', {
            name,
            username,
            password: hashedPassword,
            role: isAdminRole ? 'admin' : 'user',
            permissions: isAdminRole ? [] : (permissions || []),
            maxSessions: isAdminRole ? 0 : Math.max(0, Number(maxSessions) || 0),
            isActive: true
        });

        console.log('--> USER CREATED SUCCESSFULLY:', user._id);
        res.json({ message: 'User created successfully', user: { id: user._id, name: user.name, username: user.username } });
    } catch (error: any) {
        console.error('xx REGISTER ERROR THROWN xx');
        console.error(error);

        // Debugging: Write error to file (Sync)
        try {
            const fs = await import('fs');
            fs.appendFileSync('server_error.log', `[${new Date().toISOString()}] Register Error: ${error.message}\nStack: ${error.stack}\n\n`);
            console.log('--> Error written to server_error.log');
        } catch (fsErr) {
            console.error('Failed to write error log:', fsErr);
        }

        res.status(500).json({ error: `Internal Server Error: ${error.message}`, details: error.message });
    }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

        const user: IUser = await storage.getItem('users', { username });
        if (!user) return res.status(400).json({ error: 'User not found' });

        if (user.isActive === false) return res.status(403).json({ error: 'Account is suspended' });

        const validPassword = await bcrypt.compare(password, user.password || '');
        if (!validPassword) return res.status(400).json({ error: 'Invalid password' });

        const token = jwt.sign({ userId: user._id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
        res.json({ token, user: { id: user._id, name: user.name, username: user.username, role: user.role, permissions: user.permissions || [] } });
    } catch (error) {
        console.error('Login error', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.get('/api/me', authenticateToken, async (req: any, res) => {
    const user = await storage.getItem('users', { _id: req.user.userId });
    if (user) delete user.password;
    res.json(user);
});

// --- Account-level API key (external REST API) ---
const genAccountKey = () => 'ak_' + randomUUID().replace(/-/g, '') + randomUUID().replace(/-/g, '');

app.get('/api/account/api-key', authenticateToken, async (req: any, res) => {
    try {
        const user = await storage.getItem('users', { _id: req.user.userId });
        res.json({ apiKey: user?.apiKey || '' });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.post('/api/account/api-key/regenerate', authenticateToken, async (req: any, res) => {
    try {
        const user = await storage.getItem('users', { _id: req.user.userId });
        if (!user) return res.status(404).json({ error: 'User not found' });
        const apiKey = genAccountKey();
        await storage.saveItem('users', { _id: user._id, apiKey });
        res.json({ apiKey });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// List Users (Admin Only)
app.get('/api/users', authenticateToken, requireAdmin, async (req: any, res) => {
    console.log('--> GET /api/users REQUEST');
    try {
        const users = await storage.getItems('users');
        const safeUsers = users.map((u: any) => {
            const { password, ...rest } = u;
            return rest;
        });

        // Per-user conversation + message counts (from ChatLog)
        const agg = await ChatLog.aggregate([
            { $group: { _id: '$userId', messages: { $sum: 1 }, chats: { $addToSet: '$remoteJid' } } }
        ]);
        const counts: Record<string, { messages: number; conversations: number }> = {};
        agg.forEach((a: any) => { if (a._id) counts[a._id] = { messages: a.messages, conversations: (a.chats || []).length }; });

        const enriched = safeUsers.map((u: any) => ({
            ...u,
            messageCount: counts[u._id]?.messages || 0,
            conversationCount: counts[u._id]?.conversations || 0
        }));

        // Sort by date (newest first)
        res.json(enriched.sort((a: any, b: any) => {
            const dateA = new Date(a.createdAt || 0).getTime();
            const dateB = new Date(b.createdAt || 0).getTime();
            return dateB - dateA;
        }));
    } catch (error: any) {
        console.error('--> GET /api/users ERROR:', error);
        res.status(500).json({ error: 'Failed to fetch users', details: error.message });
    }
});

// Update User (Admin Only)
app.put('/api/users/:id', authenticateToken, requireAdmin, async (req: any, res) => {
    try {
        const { id } = req.params;
        const { name, username, password, isActive, permissions, role, maxSessions, planId } = req.body;

        // Prevent suspending Admin
        const targetUser = await storage.getItem('users', { _id: id });
        if (!targetUser) return res.status(404).json({ error: 'User not found' });

        if (targetUser.role === 'admin' && isActive === false) {
            return res.status(403).json({ error: 'Cannot suspend an admin account' });
        }

        const updateData: any = { _id: id, name, username, isActive };

        const effectiveRole = (role === 'admin' || role === 'user') ? role : targetUser.role;
        updateData.role = effectiveRole;
        if (effectiveRole === 'admin') {
            updateData.permissions = [];
            updateData.maxSessions = 0;
        } else {
            if (permissions) updateData.permissions = permissions;
            if (maxSessions !== undefined) updateData.maxSessions = Math.max(0, Number(maxSessions) || 0);
        }
        if (planId !== undefined) updateData.planId = planId;

        if (password && password.trim() !== '') {
            updateData.password = await bcrypt.hash(password, 10);
        }

        const updatedUser = await storage.saveItem('users', updateData);
        delete updatedUser.password;
        res.json(updatedUser);
    } catch (error) {
        res.status(500).json({ error: 'Failed to update user' });
    }
});

// Delete User (Admin Only)
app.delete('/api/users/:id', authenticateToken, requireAdmin, async (req: any, res) => {
    try {
        const { id } = req.params;

        // Check if target is admin
        const targetUser = await storage.getItem('users', { _id: id });
        if (!targetUser) return res.status(404).json({ error: 'User not found' });

        if (targetUser.role === 'admin') {
            return res.status(403).json({ error: 'Cannot delete an admin account' });
        }

        await storage.deleteItem('users', { _id: id });
        // Also delete their sessions
        await storage.deleteItem('sessions', { userId: id });
        res.json({ message: 'User deleted' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete user' });
    }
});

// Change Password (Self)
app.post('/api/auth/change-password', authenticateToken, async (req: any, res) => {
    try {
        const { oldPassword, newPassword } = req.body;
        const user = await storage.getItem('users', { _id: req.user.userId });
        if (!user) return res.status(404).json({ error: 'User not found' });

        const isMatch = await bcrypt.compare(oldPassword, user.password || '');
        if (!isMatch) return res.status(400).json({ error: 'Incorrect old password' });

        user.password = await bcrypt.hash(newPassword, 10);
        await storage.saveItem('users', user);

        res.json({ message: 'Password updated successfully' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update password' });
    }
});

// --- Secured API Endpoints ---

// Get User's Sessions
app.get('/api/sessions', authenticateTokenOrApiKey, async (req: any, res) => {
    const isAdmin = req.user.role === 'admin';
    const list = isAdmin ? SessionService.getAllSessions() : SessionService.getUserSessions(req.user.userId);

    let ownerMap: Record<string, string> = {};
    if (isAdmin) {
        const users = await storage.getItems('users');
        ownerMap = users.reduce((acc: any, u: any) => { acc[u._id] = u.name; return acc; }, {});
    }

    res.json(list.map(s => ({
        id: s.id,
        name: s.name,
        status: s.engine.currentStatus,
        userId: s.userId,
        ownerName: isAdmin ? (ownerMap[s.userId] || '—') : undefined,
        webhookUrl: s.webhookUrl,
        webhookUrls: s.webhookUrls || [],
        webhooks: s.webhooks || []
    })));
});


// Send Message (Secured)
app.post('/api/sessions/:sessionId/send', authenticateToken, async (req: any, res) => {
    const { sessionId } = req.params;
    const { number, type, content, caption } = req.body;

    const session = SessionService.getSession(sessionId);

    // Isolation Check
    if (!session || session.userId !== req.user.userId && req.user.role !== 'admin') {
        return res.status(404).json({ error: 'Session not found or access denied', code: 'SESSION_NOT_FOUND' });
    }

    if (session.engine.currentStatus !== 'CONNECTED') {
        return res.status(400).json({ error: 'Session is not connected', code: 'SESSION_NOT_CONNECTED' });
    }

    if (!number || !content || !type) {
        return res.status(400).json({ error: 'Missing required fields: number, type, content', code: 'MISSING_FIELDS' });
    }

    const cleanNumber = number.replace(/\D/g, '');
    const finalNumber = (cleanNumber.startsWith('01') && cleanNumber.length === 11)
        ? '20' + cleanNumber.substring(1)
        : cleanNumber;

    if (finalNumber.length < 10) {
        return res.status(400).json({ error: 'Invalid phone number', code: 'INVALID_NUMBER' });
    }

    try {
        const shouldValidate = req.query.skip_validate !== 'true';

        if (shouldValidate) {
            const isValid = await session.engine.validateNumber(finalNumber);
            if (!isValid) {
                return res.status(400).json({ error: 'Number not registered on WhatsApp', code: 'NUMBER_NOT_REGISTERED' });
            }
        }

        const validTypes = ['text', 'image', 'audio', 'video', 'document'];
        if (!validTypes.includes(type)) {
            return res.status(400).json({ error: `Invalid type. Supported: ${validTypes.join(', ')}` });
        }

        await session.engine.send(finalNumber, type as any, content, caption);

        return res.json({ success: true, message: 'Message sent successfully', timestamp: Date.now() });

    } catch (error) {
        console.error(`API Send Error [${sessionId}]:`, error);
        return res.status(500).json({ error: (error as any).message || 'Internal Server Error' });
    }
});

// Get Contacts (Secured)
app.get('/api/sessions/:sessionId/contacts', authenticateToken, async (req: any, res) => {
    const { sessionId } = req.params;

    const session = SessionService.getSession(sessionId);
    // Isolation Check
    if (!session || session.userId !== req.user.userId && req.user.role !== 'admin') {
        return res.status(404).json({ error: 'Session not found or access denied' });
    }

    try {
        const contacts = await storage.getContacts(sessionId);
        res.json(contacts);
    } catch (error) {
        console.error('Failed to fetch contacts:', error);
        res.status(500).json({ error: 'Failed to fetch contacts' });
    }
});

// Get Messages (Secured)
app.get('/api/sessions/:sessionId/messages', authenticateToken, async (req: any, res) => {
    const { sessionId } = req.params;
    const { jid, limit = 50 } = req.query;

    const session = SessionService.getSession(sessionId);
    // Isolation Check
    if (!session || session.userId !== req.user.userId && req.user.role !== 'admin') {
        return res.status(404).json({ error: 'Session not found or access denied' });
    }

    try {
        const messages = await storage.getMessages(sessionId, Number(limit), jid as string);
        res.json(messages);
    } catch (error) {
        console.error('Failed to fetch messages:', error);
        res.status(500).json({ error: 'Failed to fetch messages' });
    }
});

// --- n8n-Optimized API (Unified Endpoint) ---

// Simple in-memory Idempotency Store (Cleaned up every hour)
const idempotencyStore = new Map<string, { response: any, timestamp: number }>();
setInterval(() => {
    const now = Date.now();
    for (const [key, value] of idempotencyStore.entries()) {
        if (now - value.timestamp > 24 * 60 * 60 * 1000) { // 24 hours TTL
            idempotencyStore.delete(key);
        }
    }
}, 60 * 60 * 1000);

app.post('/api/sessions/:sessionId/messages', authenticateTokenOrApiKey, async (req: any, res) => {
    const { sessionId } = req.params;
    const { to, text, media_url, media_id, media_type, filename, caption } = req.body;
    const idempotencyKey = req.headers['idempotency-key'];

    // 1. Idempotency Check
    if (idempotencyKey) {
        const cached = idempotencyStore.get(`${sessionId}:${idempotencyKey}`);
        if (cached) {
            console.log(`[API] Idempotency hit: ${idempotencyKey}`);
            // Return cached response (Success guarantees)
            return res.json(cached.response);
        }
    }

    const session = SessionService.getSession(sessionId);

    // 2. Isolation & Status Check
    if (!session || session.userId !== req.user.userId && req.user.role !== 'admin') {
        return res.status(404).json({ success: false, error_code: 'SESSION_NOT_FOUND', message: 'Session not found or access denied' });
    }

    if (session.engine.currentStatus !== 'CONNECTED') {
        return res.status(400).json({ success: false, error_code: 'SESSION_NOT_CONNECTED', message: 'Session is not connected' });
    }

    // 3. Validation
    if (!to) {
        return res.status(400).json({ success: false, error_code: 'MISSING_RECIPIENT', message: 'The "to" field is required.' });
    }

    if (!text && !media_url && !media_id) {
        return res.status(400).json({ success: false, error_code: 'EMPTY_MESSAGE', message: 'Message must contain text, media_url, or media_id.' });
    }

    // Normalize Number
    const cleanNumber = to.replace(/\D/g, '');
    const finalNumber = (cleanNumber.startsWith('01') && cleanNumber.length === 11)
        ? '20' + cleanNumber.substring(1)
        : cleanNumber;

    if (finalNumber.length < 10) {
        return res.status(400).json({ success: false, error_code: 'INVALID_NUMBER', message: 'Invalid phone number format.' });
    }

    try {
        // 4. Logic Extraction (Implicit Intelligence)
        let finalType: 'text' | 'image' | 'video' | 'audio' | 'document' = 'text';
        let finalContent = text || '';
        let finalCaption = caption || text || ''; // For media, 'text' works as caption if explicit caption is missing

        if (media_url) {
            finalContent = media_url;

            if (media_type) {
                // Trust user input if valid
                if (['image', 'video', 'audio', 'document'].includes(media_type)) {
                    finalType = media_type;
                } else {
                    finalType = 'document'; // Fallback
                }
            } else {
                // Simple extension inference
                const ext = media_url.split('.').pop()?.toLowerCase();
                if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) finalType = 'image';
                else if (['mp4', 'mov', 'avi', 'mkv'].includes(ext)) finalType = 'video';
                else if (['mp3', 'ogg', 'wav', 'm4a'].includes(ext)) finalType = 'audio';
                else finalType = 'document';
            }

            // If it's media, the 'text' param is definitely the caption
            // BUT if caption is explicitly provided, it takes precedence
            if (!caption && text) {
                finalCaption = text;
            }

        } else if (text) {
            finalType = 'text';
            finalContent = text;
        }

        // 5. Send using the updated Engine logic (supports URLs)
        await session.engine.send(finalNumber, finalType, finalContent, finalCaption);

        const responsePayload = {
            success: true,
            // Generate a predictable message ID or use timestamp
            message_id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
            status: 'queued'
        };

        // Cache Idempotency
        if (idempotencyKey) {
            idempotencyStore.set(`${sessionId}:${idempotencyKey}`, {
                response: responsePayload,
                timestamp: Date.now()
            });
        }

        return res.json(responsePayload);

    } catch (error: any) {
        console.error(`n8n API Error [${sessionId}]:`, error);
        return res.status(500).json({ success: false, error_code: 'INTERNAL_ERROR', message: error.message || 'Internal Server Error' });
    }
});


// Configure Webhook URL
app.put('/api/sessions/:sessionId/webhook', authenticateToken, async (req: any, res) => {
    const { sessionId } = req.params;
    const { webhookUrl, webhookUrls, webhooks } = req.body;

    console.log(`[Webhook Update] Session: ${sessionId}`);
    console.log(`[Webhook Update] Payload:`, JSON.stringify(req.body, null, 2));

    // Isolation Check
    const session = await storage.getItem('sessions', { id: sessionId });
    if (!session || session.userId !== req.user.userId && req.user.role !== 'admin') {
        return res.status(404).json({ error: 'Session not found or access denied' });
    }

    try {
        // Validate Webhooks Structure
        let textWebhooks: any[] = [];
        if (webhooks && Array.isArray(webhooks)) {
            textWebhooks = webhooks.filter((w: any) => w.url && w.url.trim() !== '');
            // Ensure name is present
            textWebhooks = textWebhooks.map(w => ({
                name: w.name || 'Webhook',
                url: w.url
            }));
        }

        console.log(`[Webhook Update] Processed Webhooks:`, textWebhooks);

        // Merge with existing session data to avoid validation errors or data loss
        const updatedSession = {
            ...session,
            webhookUrl: webhookUrl || '',
            webhookUrls: Array.isArray(webhookUrls) ? webhookUrls : (session.webhookUrls || []),
            webhooks: textWebhooks
        };

        // Clean up fields that shouldn't be updated manually or cause Mongoose errors
        if (updatedSession._id) delete updatedSession._id;
        delete updatedSession.createdAt;
        delete updatedSession.updatedAt;

        console.log(`[Webhook Update] Saving to Storage...`);
        await storage.saveItem('sessions', updatedSession);
        console.log(`[Webhook Update] Save Complete.`);

        // Sync in-memory cache
        SessionService.updateSessionWebhooks(sessionId, updatedSession.webhooks);

        res.json({ success: true, message: 'Webhook URL updated', webhookUrl, webhookUrls: updatedSession.webhookUrls, webhooks: updatedSession.webhooks });
    } catch (error: any) {
        console.error('Webhook save error:', error);
        // Expose the actual error message to the client for debugging
        res.status(500).json({ error: 'Failed to update webhook URL', details: error.message || error });
    }
});

// Toggle Session Auto-Reply
app.put('/api/sessions/:sessionId/toggle-autoreply', authenticateToken, async (req: any, res) => {
    const { sessionId } = req.params;
    const { enabled } = req.body;

    // Isolation Check
    const session = await storage.getItem('sessions', { id: sessionId });
    if (!session || session.userId !== req.user.userId && req.user.role !== 'admin') {
        return res.status(404).json({ error: 'Session not found or access denied' });
    }

    try {
        const updatedSession = { ...session, autoReplyEnabled: !!enabled };
        if (updatedSession._id) delete updatedSession._id;
        delete updatedSession.createdAt;
        delete updatedSession.updatedAt;

        await storage.saveItem('sessions', updatedSession);

        // Sync in-memory cache if needed (though engine will read fresh from DB)
        res.json({ success: true, autoReplyEnabled: updatedSession.autoReplyEnabled });
    } catch (error: any) {
        console.error('Toggle Auto-Reply error:', error);
        res.status(500).json({ error: 'Failed to toggle Auto-Reply', details: error.message || error });
    }
});


// Session settings (auto-reply master switch + save-conversations privacy toggle)
app.get('/api/sessions/:sessionId/settings', authenticateToken, async (req: any, res) => {
    const { sessionId } = req.params;
    const session = await storage.getItem('sessions', { id: sessionId });
    if (!session || (session.userId !== req.user.userId && req.user.role !== 'admin')) {
        return res.status(404).json({ error: 'Session not found or access denied' });
    }
    res.json({
        autoReplyEnabled: session.autoReplyEnabled !== false,
        saveConversations: session.saveConversations !== false,
        supervisorPhone: session.supervisorPhone || ''
    });
});

app.put('/api/sessions/:sessionId/settings', authenticateToken, async (req: any, res) => {
    const { sessionId } = req.params;
    const session = await storage.getItem('sessions', { id: sessionId });
    if (!session || (session.userId !== req.user.userId && req.user.role !== 'admin')) {
        return res.status(404).json({ error: 'Session not found or access denied' });
    }
    try {
        const { autoReplyEnabled, saveConversations, supervisorPhone } = req.body;
        const updated: any = { ...session };
        if (autoReplyEnabled !== undefined) updated.autoReplyEnabled = !!autoReplyEnabled;
        if (saveConversations !== undefined) updated.saveConversations = !!saveConversations;
        if (supervisorPhone !== undefined) updated.supervisorPhone = String(supervisorPhone).replace(/[^\d]/g, '');
        if (updated._id) delete updated._id;
        delete updated.createdAt;
        delete updated.updatedAt;
        await storage.saveItem('sessions', updated);
        res.json({
            success: true,
            autoReplyEnabled: updated.autoReplyEnabled !== false,
            saveConversations: updated.saveConversations !== false,
            supervisorPhone: updated.supervisorPhone || ''
        });
    } catch (e: any) {
        console.error('[Session Settings] error:', e);
        res.status(500).json({ error: e.message });
    }
});

// --- Auto Reply Routes ---

app.get('/api/autoreply', authenticateToken, async (req: any, res) => {
    console.log(`[GET] /api/autoreply - User: ${req.user.userId}`);
    try {
        const rules = await AutoReplyService.getRules(req.user.userId);
        res.json(rules);
    } catch (e) {
        res.status(500).json({ error: 'Failed to fetch rules' });
    }
});

// Create Rule
app.post('/api/autoreply', authenticateToken, async (req: any, res) => {
    try {
        console.log(`[POST] /api/autoreply - User: ${req.user.userId}`, req.body);
        const { keyword, response, matchType, sessionId, replyType, mediaUrl, fileName } = req.body;

        if (!keyword || !response) return res.status(400).json({ error: 'Missing keyword or response' });

        const rule = await AutoReplyService.createRule({
            userId: req.user.userId,
            sessionId: sessionId || undefined, // undefined means "All Devices"
            keyword,
            response,
            matchType: matchType || 'exact',
            replyType: replyType || 'text',
            mediaUrl: mediaUrl || undefined,
            fileName: fileName || undefined,
            isActive: true
        });
        res.json(rule);
    } catch (e: any) {
        console.error(e);
        res.status(500).json({ error: e.message });
    }
});

// Update Rule
app.put('/api/autoreply/:id', authenticateToken, async (req: any, res) => {
    try {
        console.log(`[PUT] /api/autoreply/${req.params.id} - User: ${req.user.userId}`, req.body);
        const rule = await AutoReplyService.updateRule(req.params.id, req.user.userId, req.body);
        if (!rule) return res.status(404).json({ error: 'Rule not found' });
        res.json(rule);
    } catch (e: any) {
        console.error(e);
        res.status(500).json({ error: e.message });
    }
});

// Delete Rule
app.delete('/api/autoreply/:id', authenticateToken, async (req: any, res) => {
    try {
        await AutoReplyService.deleteRule(req.params.id, req.user.userId);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: 'Failed to delete rule' });
    }
});

// Toggle Rule Status
app.put('/api/autoreply/:id/toggle', authenticateToken, async (req: any, res) => {
    try {
        const { isActive } = req.body;
        console.log(`[PUT] /api/autoreply/${req.params.id}/toggle - User: ${req.user.userId}, Active: ${isActive}`);
        const success = await AutoReplyService.toggleRule(req.params.id, req.user.userId, !!isActive);
        if (!success) return res.status(404).json({ error: 'Rule not found or unauthorized' });
        res.json({ success: true, isActive: !!isActive });
    } catch (e: any) {
        console.error(e);
        res.status(500).json({ error: e.message });
    }
});

// --- AI Agent Routes ---

// A per-session AI agent belongs to the SESSION's owner. Returns the owner userId
// the requester may manage (own session, or any session for admins), or null if denied.
const resolveAgentOwner = (req: any, sessionId: string | null): string | null => {
    if (!sessionId) return req.user.userId; // legacy global agent
    const s = SessionService.getSession(sessionId);
    if (!s) return req.user.userId; // not loaded yet; fall back to requester
    if (s.userId === req.user.userId || req.user.role === 'admin') return s.userId;
    return null;
};

// Replace raw Groq keys with a masked view before sending an agent to the client.
const maskAgent = (agent: any) => {
    if (agent && Array.isArray(agent.groqKeys)) {
        agent.groqKeys = agent.groqKeys.map((k: any) => ({
            id: k.id,
            label: k.label || '',
            status: k.status || 'untested',
            lastError: k.lastError || '',
            hint: k.key ? '••••' + String(k.key).slice(-4) : '',
            isActive: !!agent.activeGroqKeyId && k.id === agent.activeGroqKeyId
        }));
    }
    // Don't ship large base64 voice notes / attachments to the client — flag them instead
    if (agent && Array.isArray(agent.knowledgeBase)) {
        agent.knowledgeBase = agent.knowledgeBase.map((e: any) => {
            const { audio, media, ...rest } = e;
            const isDataUrl = typeof media === 'string' && media.startsWith('data:');
            return {
                ...rest,
                hasAudio: !!audio,
                hasMedia: !!media,
                media: isDataUrl ? undefined : media // keep plain URLs, strip base64
            };
        });
    }
    return agent;
};

// Extract plain text from an uploaded knowledge file (txt/md/json/csv/pdf/docx)
const extractDocumentText = async (name: string, mimeType: string, buffer: Buffer): Promise<string> => {
    const ext = (name.split('.').pop() || '').toLowerCase();
    const mt = (mimeType || '').toLowerCase();

    if (ext === 'pdf' || mt.includes('pdf')) {
        const { PDFParse } = await import('pdf-parse');
        const parser = new PDFParse({ data: new Uint8Array(buffer) });
        const result = await parser.getText();
        return result.text || '';
    }
    if (ext === 'docx' || mt.includes('officedocument.wordprocessingml')) {
        const mammothMod: any = await import('mammoth');
        const mammoth = mammothMod.default || mammothMod;
        const result = await mammoth.extractRawText({ buffer });
        return result.value || '';
    }
    if (ext === 'json' || mt.includes('json')) {
        try { return JSON.stringify(JSON.parse(buffer.toString('utf8')), null, 2); }
        catch { return buffer.toString('utf8'); }
    }
    // txt, md, csv, and any other text-like file
    return buffer.toString('utf8');
};

app.get('/api/aiagent', authenticateToken, async (req: any, res) => {
    try {
        const sessionId = req.query.sessionId || null;
        const ownerId = resolveAgentOwner(req, sessionId);
        if (ownerId === null) return res.status(403).json({ error: 'Access denied' });
        const agent = await storage.getItem('aiagent', { userId: ownerId, sessionId });
        if (!agent) {
            return res.json(null);
        }
        res.json(maskAgent(agent));
    } catch (e) {
        console.error('[AI Agent] Fetch error:', e);
        res.status(500).json({ error: 'Failed to fetch AI agent config' });
    }
});

app.post('/api/aiagent', authenticateToken, async (req: any, res) => {
    try {
        const { sessionId, name, role, about, welcomeMessage, systemPrompt, temperature, aiModel, isActive, fallbackToAI, knowledgeBase } = req.body;
        const sid = sessionId || null;
        const ownerId = resolveAgentOwner(req, sid);
        if (ownerId === null) return res.status(403).json({ error: 'Access denied' });

        const existing = await storage.getItem('aiagent', { userId: ownerId, sessionId: sid });

        const agentData: any = {
            userId: ownerId,
            sessionId: sid,
            name: name || 'AI Assistant',
            role: role || 'مساعد ذكي',
            about: about || '',
            welcomeMessage: welcomeMessage || 'مرحباً! كيف يمكنني مساعدتك؟',
            systemPrompt: systemPrompt || 'أنت مساعد ذكي ومفيد.',
            temperature: temperature ?? 0.7,
            aiModel: aiModel || 'llama-3.3-70b-versatile',
            isActive: isActive ?? (existing?.isActive ?? false),
            fallbackToAI: fallbackToAI ?? (existing?.fallbackToAI ?? false),
            knowledgeBase: knowledgeBase || existing?.knowledgeBase || []
        };

        if (existing?._id) {
            agentData._id = existing._id;
        }

        const saved = await storage.saveItem('aiagent', agentData);
        res.json(maskAgent(saved));
    } catch (e: any) {
        console.error('[AI Agent] Save error:', e);
        res.status(500).json({ error: e.message || 'Failed to save AI agent config' });
    }
});

app.put('/api/aiagent/toggle', authenticateToken, async (req: any, res) => {
    try {
        const { sessionId, isActive, fallbackToAI } = req.body;
        const sid = sessionId || null;
        const ownerId = resolveAgentOwner(req, sid);
        if (ownerId === null) return res.status(403).json({ error: 'Access denied' });
        // Auto-create the agent (with schema defaults) if the user toggles before saving settings.
        const existing = await storage.getItem('aiagent', { userId: ownerId, sessionId: sid })
            || { userId: ownerId, sessionId: sid };

        if (isActive !== undefined) existing.isActive = isActive;
        if (fallbackToAI !== undefined) existing.fallbackToAI = fallbackToAI;

        const saved = await storage.saveItem('aiagent', existing);
        res.json(maskAgent(saved));
    } catch (e: any) {
        console.error('[AI Agent] Toggle error:', e);
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/aiagent/knowledge', authenticateToken, async (req: any, res) => {
    try {
        const { sessionId, question, answer } = req.body;
        if (!question || !answer) return res.status(400).json({ error: 'Missing question or answer' });
        const sid = sessionId || null;
        const ownerId = resolveAgentOwner(req, sid);
        if (ownerId === null) return res.status(403).json({ error: 'Access denied' });

        const { v4: uuidv4 } = await import('uuid');
        const entry = { id: uuidv4(), question, answer };

        // Auto-create the agent if it doesn't exist yet, so knowledge can be added
        // even before the user presses "Save settings".
        const existing = await storage.getItem('aiagent', { userId: ownerId, sessionId: sid })
            || { userId: ownerId, sessionId: sid, knowledgeBase: [] };

        existing.knowledgeBase = [...(existing.knowledgeBase || []), entry];
        const saved = await storage.saveItem('aiagent', existing);
        res.json(maskAgent(saved));
    } catch (e: any) {
        console.error('[AI Agent] Knowledge add error:', e);
        res.status(500).json({ error: e.message });
    }
});

app.delete('/api/aiagent/knowledge/:entryId', authenticateToken, async (req: any, res) => {
    try {
        const sessionId = req.query.sessionId || null;
        const ownerId = resolveAgentOwner(req, sessionId);
        if (ownerId === null) return res.status(403).json({ error: 'Access denied' });
        const existing = await storage.getItem('aiagent', { userId: ownerId, sessionId });
        if (!existing) return res.status(404).json({ error: 'AI Agent not configured yet' });

        existing.knowledgeBase = (existing.knowledgeBase || []).filter((k: any) => k.id !== req.params.entryId);
        existing._id = existing._id;
        const saved = await storage.saveItem('aiagent', existing);
        res.json(maskAgent(saved));
    } catch (e: any) {
        console.error('[AI Agent] Knowledge delete error:', e);
        res.status(500).json({ error: e.message });
    }
});

// Add a VOICE knowledge entry — recorded voice note sent when the question matches
app.post('/api/aiagent/voice', authenticateToken, async (req: any, res) => {
    try {
        const { sessionId, question, answer, audio, audioMime } = req.body;
        if (!question || !audio) return res.status(400).json({ error: 'Missing question or audio' });
        const sid = sessionId || null;
        const ownerId = resolveAgentOwner(req, sid);
        if (ownerId === null) return res.status(403).json({ error: 'Access denied' });

        if (String(audio).length > 2_700_000) {
            return res.status(400).json({ error: 'التسجيل طويل جداً (الحد ~2MB، حوالي دقيقة).' });
        }

        const { v4: uuidv4 } = await import('uuid');
        const entry = {
            id: uuidv4(),
            question: String(question),
            answer: String(answer || ''),
            audio: String(audio),
            audioMime: String(audioMime || 'audio/ogg')
        };

        const existing = await storage.getItem('aiagent', { userId: ownerId, sessionId: sid })
            || { userId: ownerId, sessionId: sid, knowledgeBase: [] };
        existing.knowledgeBase = [...(existing.knowledgeBase || []), entry];
        const saved = await storage.saveItem('aiagent', existing);
        res.json(maskAgent(saved));
    } catch (e: any) {
        console.error('[AI Agent] Voice add error:', e);
        res.status(500).json({ error: e.message });
    }
});

// Fetch a voice entry's audio (for playback in the dashboard)
app.get('/api/aiagent/knowledge/:entryId/audio', authenticateToken, async (req: any, res) => {
    try {
        const sessionId = req.query.sessionId || null;
        const ownerId = resolveAgentOwner(req, sessionId);
        if (ownerId === null) return res.status(403).json({ error: 'Access denied' });
        const agent = await storage.getItem('aiagent', { userId: ownerId, sessionId });
        const entry = (agent?.knowledgeBase || []).find((e: any) => e.id === req.params.entryId);
        if (!entry || !entry.audio) return res.status(404).json({ error: 'No audio' });
        res.json({ audio: entry.audio, audioMime: entry.audioMime || 'audio/ogg' });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Edit a knowledge entry's question / answer text
app.put('/api/aiagent/knowledge/:entryId', authenticateToken, async (req: any, res) => {
    try {
        const { sessionId, question, answer } = req.body;
        const sid = sessionId || null;
        const ownerId = resolveAgentOwner(req, sid);
        if (ownerId === null) return res.status(403).json({ error: 'Access denied' });
        const existing = await storage.getItem('aiagent', { userId: ownerId, sessionId: sid });
        if (!existing) return res.status(404).json({ error: 'Not found' });
        existing.knowledgeBase = (existing.knowledgeBase || []).map((e: any) =>
            e.id === req.params.entryId
                ? { ...e, question: question !== undefined ? String(question) : e.question, answer: answer !== undefined ? String(answer) : e.answer }
                : e
        );
        const saved = await storage.saveItem('aiagent', existing);
        res.json(maskAgent(saved));
    } catch (e: any) {
        console.error('[AI Agent] Knowledge edit error:', e);
        res.status(500).json({ error: e.message });
    }
});

// Add an ATTACHMENT knowledge entry (image/video/document sent when the question matches)
app.post('/api/aiagent/attachment', authenticateToken, async (req: any, res) => {
    try {
        const { sessionId, question, answer, media, mediaType, fileName } = req.body;
        if (!question || !media || !mediaType) return res.status(400).json({ error: 'Missing question, media or type' });
        const sid = sessionId || null;
        const ownerId = resolveAgentOwner(req, sid);
        if (ownerId === null) return res.status(403).json({ error: 'Access denied' });
        if (String(media).length > 7_000_000) return res.status(400).json({ error: 'الملف كبير جداً (الحد ~5MB).' });

        const { v4: uuidv4 } = await import('uuid');
        const entry = {
            id: uuidv4(),
            question: String(question),
            answer: String(answer || ''),
            media: String(media),
            mediaType: String(mediaType),
            fileName: String(fileName || '')
        };
        const existing = await storage.getItem('aiagent', { userId: ownerId, sessionId: sid }) || { userId: ownerId, sessionId: sid, knowledgeBase: [] };
        existing.knowledgeBase = [...(existing.knowledgeBase || []), entry];
        const saved = await storage.saveItem('aiagent', existing);
        res.json(maskAgent(saved));
    } catch (e: any) {
        console.error('[AI Agent] Attachment add error:', e);
        res.status(500).json({ error: e.message });
    }
});

// Fetch an attachment entry's media (for preview in the dashboard)
app.get('/api/aiagent/knowledge/:entryId/media', authenticateToken, async (req: any, res) => {
    try {
        const sessionId = req.query.sessionId || null;
        const ownerId = resolveAgentOwner(req, sessionId);
        if (ownerId === null) return res.status(403).json({ error: 'Access denied' });
        const agent = await storage.getItem('aiagent', { userId: ownerId, sessionId });
        const entry = (agent?.knowledgeBase || []).find((e: any) => e.id === req.params.entryId);
        if (!entry || !entry.media) return res.status(404).json({ error: 'No media' });
        res.json({ media: entry.media, mediaType: entry.mediaType, fileName: entry.fileName });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Upload a knowledge file (txt/pdf/docx/json/md) — server extracts the text
app.post('/api/aiagent/document', authenticateToken, async (req: any, res) => {
    try {
        const { sessionId, name, mimeType, dataBase64 } = req.body;
        const sid = sessionId || null;
        const ownerId = resolveAgentOwner(req, sid);
        if (ownerId === null) return res.status(403).json({ error: 'Access denied' });
        if (!name || !dataBase64) return res.status(400).json({ error: 'Missing file data' });

        const raw = String(dataBase64);
        const base64 = raw.includes(',') ? raw.split(',')[1] : raw;
        const buffer = Buffer.from(base64, 'base64');

        let text = '';
        try {
            text = await extractDocumentText(name, mimeType || '', buffer);
        } catch (parseErr: any) {
            console.error('[Doc] parse error:', parseErr?.message);
            return res.status(400).json({ error: 'تعذّر قراءة الملف. تأكد أنه صالح وغير محمي بكلمة مرور.' });
        }

        text = (text || '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
        if (!text) return res.status(400).json({ error: 'الملف لا يحتوي على نص قابل للقراءة (قد يكون صورة ممسوحة).' });

        const MAX = 25000;
        const truncated = text.length > MAX;
        if (truncated) text = text.slice(0, MAX);

        const { v4: uuidv4 } = await import('uuid');
        const entry = { id: uuidv4(), name: String(name).slice(0, 200), content: text, chars: text.length };

        const existing = await storage.getItem('aiagent', { userId: ownerId, sessionId: sid })
            || { userId: ownerId, sessionId: sid, documents: [] };
        existing.documents = [...(existing.documents || []), entry];
        const saved = await storage.saveItem('aiagent', existing);
        res.json({ agent: maskAgent(saved), truncated });
    } catch (e: any) {
        console.error('[AI Agent] Document add error:', e);
        res.status(500).json({ error: e.message });
    }
});

app.delete('/api/aiagent/document/:docId', authenticateToken, async (req: any, res) => {
    try {
        const sessionId = req.query.sessionId || null;
        const ownerId = resolveAgentOwner(req, sessionId);
        if (ownerId === null) return res.status(403).json({ error: 'Access denied' });
        const existing = await storage.getItem('aiagent', { userId: ownerId, sessionId });
        if (!existing) return res.status(404).json({ error: 'Not found' });
        existing.documents = (existing.documents || []).filter((d: any) => d.id !== req.params.docId);
        const saved = await storage.saveItem('aiagent', existing);
        res.json(maskAgent(saved));
    } catch (e: any) {
        console.error('[AI Agent] Document delete error:', e);
        res.status(500).json({ error: e.message });
    }
});

// Add a Groq API key to a session's pool (used with automatic failover)
app.post('/api/aiagent/groqkey', authenticateToken, async (req: any, res) => {
    try {
        const { sessionId, key, label } = req.body;
        if (!key || !String(key).trim()) return res.status(400).json({ error: 'Missing key' });
        const sid = sessionId || null;
        const ownerId = resolveAgentOwner(req, sid);
        if (ownerId === null) return res.status(403).json({ error: 'Access denied' });

        const { v4: uuidv4 } = await import('uuid');
        const entry = { id: uuidv4(), key: String(key).trim(), label: (label || '').trim(), status: 'untested', lastError: '', lastUsedAt: null };

        const existing = await storage.getItem('aiagent', { userId: ownerId, sessionId: sid })
            || { userId: ownerId, sessionId: sid, groqKeys: [] };
        existing.groqKeys = [...(existing.groqKeys || []), entry];
        await storage.saveItem('aiagent', existing);
        res.json({ success: true });
    } catch (e: any) {
        console.error('[AI Agent] Groq key add error:', e);
        res.status(500).json({ error: e.message });
    }
});

app.delete('/api/aiagent/groqkey/:keyId', authenticateToken, async (req: any, res) => {
    try {
        const sessionId = req.query.sessionId || null;
        const ownerId = resolveAgentOwner(req, sessionId);
        if (ownerId === null) return res.status(403).json({ error: 'Access denied' });
        const existing = await storage.getItem('aiagent', { userId: ownerId, sessionId });
        if (!existing) return res.status(404).json({ error: 'Not found' });
        existing.groqKeys = (existing.groqKeys || []).filter((k: any) => k.id !== req.params.keyId);
        if (existing.activeGroqKeyId === req.params.keyId) existing.activeGroqKeyId = '';
        await storage.saveItem('aiagent', existing);
        res.json({ success: true });
    } catch (e: any) {
        console.error('[AI Agent] Groq key delete error:', e);
        res.status(500).json({ error: e.message });
    }
});

// --- Conversation Logs & Analytics (per session) ---

// List conversations (grouped by chat) for a session
app.get('/api/sessions/:sessionId/conversations', authenticateToken, async (req: any, res) => {
    const { sessionId } = req.params;
    const session = SessionService.getSession(sessionId);
    if (!session || session.userId !== req.user.userId && req.user.role !== 'admin') {
        return res.status(404).json({ error: 'Session not found or access denied' });
    }
    try {
        const convos = await ChatLog.aggregate([
            { $match: { sessionId } },
            { $sort: { timestamp: -1 } },
            {
                $group: {
                    _id: '$remoteJid',
                    lastText: { $first: '$text' },
                    lastRole: { $first: '$role' },
                    lastTime: { $first: '$timestamp' },
                    pushName: { $max: '$pushName' },
                    total: { $sum: 1 }
                }
            },
            { $sort: { lastTime: -1 } },
            { $limit: 200 }
        ]);
        res.json(convos.map(c => ({
            remoteJid: c._id,
            number: (c._id || '').split('@')[0],
            pushName: c.pushName,
            lastText: c.lastText,
            lastRole: c.lastRole,
            lastTime: c.lastTime,
            total: c.total
        })));
    } catch (e: any) {
        console.error('[Conversations] list error:', e);
        res.status(500).json({ error: 'Failed to fetch conversations' });
    }
});

// Get the full thread for one chat
app.get('/api/sessions/:sessionId/conversations/:jid', authenticateToken, async (req: any, res) => {
    const { sessionId, jid } = req.params;
    const session = SessionService.getSession(sessionId);
    if (!session || session.userId !== req.user.userId && req.user.role !== 'admin') {
        return res.status(404).json({ error: 'Session not found or access denied' });
    }
    try {
        const remoteJid = decodeURIComponent(jid);
        const messages = await ChatLog.find({ sessionId, remoteJid })
            .sort({ timestamp: 1 })
            .limit(500)
            .lean();
        res.json(messages.map((m: any) => ({
            role: m.role,
            text: m.text,
            source: m.source,
            pushName: m.pushName,
            timestamp: m.timestamp
        })));
    } catch (e: any) {
        console.error('[Conversations] thread error:', e);
        res.status(500).json({ error: 'Failed to fetch conversation' });
    }
});

// Per-conversation settings (disable AI for this customer / custom prompt)
app.get('/api/sessions/:sessionId/chat-settings/:jid', authenticateToken, async (req: any, res) => {
    const { sessionId, jid } = req.params;
    const session = SessionService.getSession(sessionId);
    if (!session || (session.userId !== req.user.userId && req.user.role !== 'admin')) {
        return res.status(404).json({ error: 'Session not found or access denied' });
    }
    const remoteJid = decodeURIComponent(jid);
    const cfg = await storage.getItem('chat_settings', { sessionId, remoteJid });
    res.json({ aiDisabled: !!(cfg && cfg.aiDisabled), customPrompt: (cfg && cfg.customPrompt) || '' });
});

app.put('/api/sessions/:sessionId/chat-settings/:jid', authenticateToken, async (req: any, res) => {
    const { sessionId, jid } = req.params;
    const session = SessionService.getSession(sessionId);
    if (!session || (session.userId !== req.user.userId && req.user.role !== 'admin')) {
        return res.status(404).json({ error: 'Session not found or access denied' });
    }
    try {
        const remoteJid = decodeURIComponent(jid);
        const { aiDisabled, customPrompt } = req.body;
        const existing: any = await storage.getItem('chat_settings', { sessionId, remoteJid }) || { sessionId, remoteJid };
        if (aiDisabled !== undefined) existing.aiDisabled = !!aiDisabled;
        if (customPrompt !== undefined) existing.customPrompt = String(customPrompt).slice(0, 4000);
        await storage.saveItem('chat_settings', existing);
        res.json({ success: true, aiDisabled: !!existing.aiDisabled, customPrompt: existing.customPrompt || '' });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Delete a whole conversation from the dashboard
app.delete('/api/sessions/:sessionId/conversations/:jid', authenticateToken, async (req: any, res) => {
    const { sessionId, jid } = req.params;
    const session = SessionService.getSession(sessionId);
    if (!session || (session.userId !== req.user.userId && req.user.role !== 'admin')) {
        return res.status(404).json({ error: 'Session not found or access denied' });
    }
    try {
        const remoteJid = decodeURIComponent(jid);
        await ChatLog.deleteMany({ sessionId, remoteJid });
        res.json({ success: true });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Send a message / attachment to a customer from the dashboard
app.post('/api/sessions/:sessionId/conversations/:jid/send', authenticateToken, async (req: any, res) => {
    const { sessionId, jid } = req.params;
    const session = SessionService.getSession(sessionId);
    if (!session || (session.userId !== req.user.userId && req.user.role !== 'admin')) {
        return res.status(404).json({ error: 'Session not found or access denied' });
    }
    try {
        const remoteJid = decodeURIComponent(jid);
        const { type = 'text', content, caption } = req.body;
        if (!content) return res.status(400).json({ error: 'Missing content' });

        if (remoteJid.startsWith('fb:')) {
            const conn = await storage.getItem('facebook', { sessionId });
            if (!conn || !conn.pageAccessToken) return res.status(400).json({ error: 'صفحة فيسبوك غير مربوطة' });
            if (type !== 'text') return res.status(400).json({ error: 'الإرسال من اللوحة لفيسبوك يدعم النص فقط حالياً' });
            await fbSendMessage(conn.pageAccessToken, remoteJid.slice(3), content);
        } else {
            if (session.engine.currentStatus !== 'CONNECTED') {
                return res.status(400).json({ error: 'الجهاز غير متصل' });
            }
            await session.engine.send(remoteJid, type, content, caption);
        }

        const logText = type === 'text' ? content : (caption || `[${type}]`);
        await ChatLog.create({
            sessionId, userId: session.userId, remoteJid, role: 'assistant',
            text: String(logText).slice(0, 4000), source: 'manual', timestamp: Math.floor(Date.now() / 1000)
        });
        res.json({ success: true });
    } catch (e: any) {
        console.error('[Conversations] send error:', e);
        res.status(500).json({ error: e.message || 'Failed to send' });
    }
});

// Response analytics for a session
app.get('/api/sessions/:sessionId/analytics', authenticateToken, async (req: any, res) => {
    const { sessionId } = req.params;
    const session = SessionService.getSession(sessionId);
    if (!session || session.userId !== req.user.userId && req.user.role !== 'admin') {
        return res.status(404).json({ error: 'Session not found or access denied' });
    }
    try {
        const now = Math.floor(Date.now() / 1000);
        const since7d = now - 7 * 24 * 3600;

        const totalsAgg = await ChatLog.aggregate([
            { $match: { sessionId } },
            {
                $group: {
                    _id: null,
                    totalMessages: { $sum: 1 },
                    incoming: { $sum: { $cond: [{ $eq: ['$role', 'user'] }, 1, 0] } },
                    replies: { $sum: { $cond: [{ $eq: ['$role', 'assistant'] }, 1, 0] } },
                    aiReplies: { $sum: { $cond: [{ $and: [{ $eq: ['$role', 'assistant'] }, { $eq: ['$source', 'ai'] }] }, 1, 0] } },
                    keywordReplies: { $sum: { $cond: [{ $and: [{ $eq: ['$role', 'assistant'] }, { $eq: ['$source', 'keyword'] }] }, 1, 0] } }
                }
            }
        ]);
        const t = totalsAgg[0] || { totalMessages: 0, incoming: 0, replies: 0, aiReplies: 0, keywordReplies: 0 };

        const uniqueChats = (await ChatLog.distinct('remoteJid', { sessionId })).length;

        const daily = await ChatLog.aggregate([
            { $match: { sessionId, timestamp: { $gte: since7d } } },
            {
                $group: {
                    _id: { $dateToString: { format: '%Y-%m-%d', date: { $toDate: { $multiply: ['$timestamp', 1000] } } } },
                    incoming: { $sum: { $cond: [{ $eq: ['$role', 'user'] }, 1, 0] } },
                    replies: { $sum: { $cond: [{ $eq: ['$role', 'assistant'] }, 1, 0] } }
                }
            },
            { $sort: { _id: 1 } }
        ]);

        res.json({
            totalMessages: t.totalMessages,
            incoming: t.incoming,
            replies: t.replies,
            aiReplies: t.aiReplies,
            keywordReplies: t.keywordReplies,
            uniqueChats,
            responseRate: t.incoming ? Math.round((t.replies / t.incoming) * 100) : 0,
            daily: daily.map((d: any) => ({ date: d._id, incoming: d.incoming, replies: d.replies }))
        });
    } catch (e: any) {
        console.error('[Analytics] error:', e);
        res.status(500).json({ error: 'Failed to compute analytics' });
    }
});

// Sent-campaigns history (user sees own, admin sees all + owner name)
app.get('/api/campaigns', authenticateToken, async (req: any, res) => {
    try {
        const isAdmin = req.user.role === 'admin';
        const all = await storage.getItems('campaigns');
        const list = isAdmin ? all : all.filter((c: any) => c.userId === req.user.userId);
        if (isAdmin) {
            const byId: Record<string, string> = {};
            (await storage.getItems('users')).forEach((u: any) => { byId[u._id] = u.name; });
            list.forEach((c: any) => { c.ownerName = byId[c.userId] || '—'; });
        }
        res.json(list);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// --- Scheduled Campaigns Routes ---

// List Campaigns
app.get('/api/scheduled-campaigns', authenticateToken, async (req: any, res) => {
    try {
        // Admins see all? Or just own? Let's stick to own for now unless admin wants to oversee
        // For simplicity: User sees their own.
        const campaigns = await storage.getItems('scheduled_campaigns', { userId: req.user.userId });
        res.json(campaigns);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch campaigns' });
    }
});

// Create Campaign
app.post('/api/scheduled-campaigns', authenticateToken, async (req: any, res) => {
    try {
        const { sessionId, title, messageType, content, caption, recipients, scheduledTime, minDelay, maxDelay } = req.body;

        if (!title || !recipients || recipients.length === 0 || !scheduledTime) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        // Validate Recipients Format
        const validRecipients = recipients.map((r: any) => ({
            number: r.number,
            status: 'pending',
            error: null
        }));

        const newCampaign = await storage.saveItem('scheduled_campaigns', {
            userId: req.user.userId,
            sessionId,
            title,
            messageType: messageType || 'text',
            content,
            caption,
            recipients: validRecipients,
            scheduledTime: new Date(scheduledTime),
            minDelay: Number(minDelay) || 3,
            maxDelay: Number(maxDelay) || 10,
            status: 'pending',
            progress: { sent: 0, failed: 0, total: validRecipients.length }
        });

        res.json(newCampaign);
    } catch (error: any) {
        console.error('Create Campaign Error:', error);
        res.status(500).json({ error: 'Failed to create campaign' });
    }
});

// Update Campaign Details
app.put('/api/scheduled-campaigns/:id', authenticateToken, async (req: any, res) => {
    try {
        const { sessionId, title, messageType, content, caption, recipients, scheduledTime, minDelay, maxDelay } = req.body;

        // Find existing to ensure ownership and status
        const existing = await storage.getItem('scheduled_campaigns', { _id: req.params.id, userId: req.user.userId });
        if (!existing) return res.status(404).json({ error: 'Campaign not found' });

        if (existing.status === 'active' || existing.status === 'completed') {
            return res.status(400).json({ error: 'Cannot edit an active or completed campaign. Pause it first.' });
        }

        // Validate Recipients Format if provided
        let validRecipients = existing.recipients;
        if (recipients && Array.isArray(recipients)) {
            validRecipients = recipients.map((r: any) => ({
                number: r.number,
                status: 'pending',
                error: null
            }));
        }

        const updateData: any = {
            _id: req.params.id,
            userId: req.user.userId,
            sessionId: sessionId || existing.sessionId,
            title: title || existing.title,
            messageType: messageType || existing.messageType,
            content: content !== undefined ? content : existing.content,
            caption: caption !== undefined ? caption : existing.caption,
            recipients: validRecipients,
            scheduledTime: scheduledTime ? new Date(scheduledTime) : existing.scheduledTime,
            minDelay: minDelay ? Number(minDelay) : existing.minDelay,
            maxDelay: maxDelay ? Number(maxDelay) : existing.maxDelay,
            status: existing.status, // Keep existing status (pending/paused)
            progress: existing.progress // Keep progress
        };

        // If recipients changed, reset progress stats? 
        // Logic: If user edits recipients, they probably replaced the list. 
        // If they just edit text, we keep progress? 
        // For simplicity, if editing a 'pending' campaign, we can reset progress.
        // If 'paused', modifying recipients is tricky if some already sent. 
        // Let's assume full overwrite of recipients implies new list.
        if (existing.status === 'pending' && recipients) {
            updateData.progress = { sent: 0, failed: 0, total: validRecipients.length };
        }
        // If paused, we ideally shouldn't easily allow changing recipients to avoid messing up indices.
        // Let's block recipient edit if paused for safety, or just warn.
        if (existing.status === 'paused' && recipients) {
            return res.status(400).json({ error: 'Cannot change recipients of a paused campaign. Only content can be edited.' });
        }

        await storage.saveItem('scheduled_campaigns', updateData);
        res.json(updateData);
    } catch (error: any) {
        console.error('Update Campaign Error:', error);
        res.status(500).json({ error: 'Failed to update campaign' });
    }
});

// Action: Pause / Resume / Stop
app.put('/api/scheduled-campaigns/:id/status', authenticateToken, async (req: any, res) => {
    try {
        const { status } = req.body;
        if (!['paused', 'active', 'stopped'].includes(status)) {
            return res.status(400).json({ error: 'Invalid status' });
        }

        const campaign = await storage.getItem('scheduled_campaigns', { _id: req.params.id, userId: req.user.userId });
        if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

        // If resuming, ensure time is passed or just set to active so scheduler picks it up immediately?
        // Scheduler checks { scheduledTime: { $lte: now } }. If old, it runs immediately.

        await storage.saveItem('scheduled_campaigns', { _id: req.params.id, status });

        // If resuming immediately, we might want to trigger scheduler, but interval will catch it in 30s.
        res.json({ success: true, status });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update status' });
    }
});

// Delete Campaign
app.delete('/api/scheduled-campaigns/:id', authenticateToken, async (req: any, res) => {
    try {
        await storage.deleteItem('scheduled_campaigns', { _id: req.params.id, userId: req.user.userId });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete campaign' });
    }
});

// Dashboard overview (KPIs + onboarding state)
app.get('/api/dashboard', authenticateToken, async (req: any, res) => {
    try {
        const isAdmin = req.user.role === 'admin';
        const sessions = isAdmin ? SessionService.getAllSessions() : SessionService.getUserSessions(req.user.userId);
        const sessionIds = sessions.map(s => s.id);
        const connected = sessions.filter(s => s.engine.currentStatus === 'CONNECTED').length;

        const nowSec = Math.floor(Date.now() / 1000);
        const since24 = nowSec - 24 * 3600;
        const since7d = nowSec - 7 * 24 * 3600;
        const match: any = sessionIds.length ? { sessionId: { $in: sessionIds } } : { sessionId: '__none__' };
        const totalsAgg = await ChatLog.aggregate([
            { $match: match },
            {
                $group: {
                    _id: null,
                    messages: { $sum: 1 },
                    incoming: { $sum: { $cond: [{ $eq: ['$role', 'user'] }, 1, 0] } },
                    replies: { $sum: { $cond: [{ $eq: ['$role', 'assistant'] }, 1, 0] } },
                    aiReplies: { $sum: { $cond: [{ $and: [{ $eq: ['$role', 'assistant'] }, { $eq: ['$source', 'ai'] }] }, 1, 0] } },
                    keywordReplies: { $sum: { $cond: [{ $and: [{ $eq: ['$role', 'assistant'] }, { $eq: ['$source', 'keyword'] }] }, 1, 0] } },
                    manualReplies: { $sum: { $cond: [{ $and: [{ $eq: ['$role', 'assistant'] }, { $eq: ['$source', 'manual'] }] }, 1, 0] } },
                    today: { $sum: { $cond: [{ $gte: ['$timestamp', since24] }, 1, 0] } }
                }
            }
        ]);
        const t = totalsAgg[0] || { messages: 0, incoming: 0, replies: 0, aiReplies: 0, keywordReplies: 0, manualReplies: 0, today: 0 };
        const uniqueChats = sessionIds.length ? (await ChatLog.distinct('remoteJid', match)).length : 0;

        const daily = await ChatLog.aggregate([
            { $match: { ...match, timestamp: { $gte: since7d } } },
            {
                $group: {
                    _id: { $dateToString: { format: '%Y-%m-%d', date: { $toDate: { $multiply: ['$timestamp', 1000] } } } },
                    incoming: { $sum: { $cond: [{ $eq: ['$role', 'user'] }, 1, 0] } },
                    replies: { $sum: { $cond: [{ $eq: ['$role', 'assistant'] }, 1, 0] } }
                }
            },
            { $sort: { _id: 1 } }
        ]);

        const firstSession = sessions[0];
        let hasAgent = false, hasKnowledge = false, hasGroq = !!process.env.GROQ_API_KEY;
        if (firstSession) {
            const agent = await storage.getItem('aiagent', { sessionId: firstSession.id });
            hasAgent = !!(agent && agent.isActive);
            hasKnowledge = !!(agent && (((agent.knowledgeBase || []).length) || ((agent.documents || []).length)));
            if (agent && (agent.groqKeys || []).length) hasGroq = true;
        }

        // Current subscription plan (for the logged-in user)
        let plan: any = null;
        const me = await storage.getItem('users', { _id: req.user.userId });
        if (me?.planId) plan = await storage.getItem('plans', { _id: me.planId });

        res.json({
            devices: sessions.length,
            connected,
            conversations: uniqueChats,
            messages: t.messages,
            incoming: t.incoming,
            replies: t.replies,
            aiReplies: t.aiReplies,
            today: t.today,
            daily: daily.map((d: any) => ({ date: d._id, incoming: d.incoming, replies: d.replies })),
            replyBreakdown: { ai: t.aiReplies, keyword: t.keywordReplies, manual: t.manualReplies },
            onboarding: { hasDevice: sessions.length > 0, hasConnected: connected > 0, hasAgent, hasGroq, hasKnowledge },
            plan: plan ? { name: plan.name, priceMonthly: plan.priceMonthly, priceYearly: plan.priceYearly, currency: plan.currency, priceMonthlySA: plan.priceMonthlySA, priceYearlySA: plan.priceYearlySA, currencySA: plan.currencySA, maxSessions: plan.maxSessions, maxConversations: plan.maxConversations, maxCampaignMessages: plan.maxCampaignMessages, maxScheduled: plan.maxScheduled, features: plan.features } : null,
            usage: { devices: sessions.length, conversations: uniqueChats, messages: t.messages }
        });
    } catch (e: any) {
        console.error('[Dashboard] error:', e);
        res.status(500).json({ error: e.message });
    }
});

// Geo-detect the visitor's pricing region from their IP (EG = Egypt, SA = everywhere else).
// Cached per-IP in memory; falls back to EG if lookup fails.
const geoCache = new Map<string, { region: string; country: string }>();
const clientIp = (req: any): string => {
    const fwd = (req.headers['x-forwarded-for'] as string || '').split(',')[0].trim();
    return fwd || req.ip || req.socket?.remoteAddress || '';
};
app.get('/api/geo', async (req: any, res) => {
    const ip = clientIp(req);
    const isPrivate = !ip || ip === '::1' || ip.startsWith('127.') || ip.startsWith('10.') || ip.startsWith('192.168.') || ip.startsWith('::ffff:127.') || ip.startsWith('172.');
    if (geoCache.has(ip)) return res.json(geoCache.get(ip));
    if (isPrivate) return res.json({ region: 'EG', country: '', note: 'private-ip' });
    try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 3500);
        const r = await fetch(`http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,countryCode`, { signal: ctrl.signal });
        clearTimeout(timer);
        const d: any = await r.json();
        const country = d?.status === 'success' ? d.countryCode : '';
        const region = country === 'EG' ? 'EG' : 'SA';
        const out = { region, country };
        if (country) geoCache.set(ip, out);
        res.json(out);
    } catch {
        res.json({ region: 'EG', country: '', note: 'lookup-failed' });
    }
});

// --- Subscription Plans ---
app.get('/api/plans', authenticateToken, async (req: any, res) => {
    try {
        const all = await storage.getItems('plans');
        res.json(all.filter((p: any) => p.isActive !== false).sort((a: any, b: any) => (a.order || 0) - (b.order || 0)));
    } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.get('/api/plans/all', authenticateToken, requireAdmin, async (req: any, res) => {
    const all = await storage.getItems('plans');
    res.json(all.sort((a: any, b: any) => (a.order || 0) - (b.order || 0)));
});

app.post('/api/plans', authenticateToken, requireAdmin, async (req: any, res) => {
    try { res.json(await storage.saveItem('plans', { ...req.body })); }
    catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.put('/api/plans/:id', authenticateToken, requireAdmin, async (req: any, res) => {
    try { res.json(await storage.saveItem('plans', { ...req.body, _id: req.params.id })); }
    catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/plans/:id', authenticateToken, requireAdmin, async (req: any, res) => {
    try { await storage.deleteItem('plans', { _id: req.params.id }); res.json({ success: true }); }
    catch (e: any) { res.status(500).json({ error: e.message }); }
});

// Admin-only analytics: users, subscribers, plans distribution, revenue estimate, growth
app.get('/api/admin/analytics', authenticateToken, requireAdmin, async (req: any, res) => {
    try {
        const users = await storage.getItems('users');
        const plans = await storage.getItems('plans');
        const planById: Record<string, any> = {};
        plans.forEach((p: any) => { planById[p._id] = p; });

        const nonAdmin = users.filter((u: any) => u.role !== 'admin');
        const subscribers = nonAdmin.filter((u: any) => u.planId && planById[u.planId]);

        const totalUsers = users.length;
        const activeUsers = users.filter((u: any) => u.isActive !== false).length;
        const adminUsers = users.filter((u: any) => u.role === 'admin').length;
        const withoutPlan = nonAdmin.length - subscribers.length;

        // Subscribers per plan (+ revenue contribution)
        const perPlan = plans
            .map((p: any) => {
                const count = subscribers.filter((u: any) => u.planId === p._id).length;
                return { name: p.name, popular: !!p.popular, order: p.order || 0, count, priceMonthly: Number(p.priceMonthly) || 0, currency: p.currency || 'ج.م' };
            })
            .sort((a: any, b: any) => a.order - b.order);

        // Estimated monthly recurring revenue (EG reference + SA reference)
        let mrrEG = 0, mrrSA = 0;
        subscribers.forEach((u: any) => { const p = planById[u.planId]; if (p) { mrrEG += Number(p.priceMonthly) || 0; mrrSA += Number(p.priceMonthlySA) || 0; } });

        // New users over the last 6 months
        const now = new Date();
        const months: { key: string; label: string; count: number }[] = [];
        const idx: Record<string, number> = {};
        for (let i = 5; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            idx[key] = months.length;
            months.push({ key, label: key.slice(2), count: 0 });
        }
        users.forEach((u: any) => {
            if (!u.createdAt) return;
            const k = new Date(u.createdAt).toISOString().slice(0, 7);
            if (idx[k] !== undefined) months[idx[k]].count++;
        });

        const sessions = SessionService.getAllSessions();
        const connectedDevices = sessions.filter((s: any) => s.engine.currentStatus === 'CONNECTED').length;

        res.json({
            totalUsers, activeUsers, adminUsers,
            subscribersCount: subscribers.length, withoutPlan, plansCount: plans.length,
            perPlan, mrrEG, mrrSA,
            growth: months,
            totalDevices: sessions.length, connectedDevices
        });
    } catch (e: any) {
        console.error('[Admin analytics] error:', e);
        res.status(500).json({ error: e.message });
    }
});

// ============================================================
// Support tickets — users open tickets, admins manage & reply
// ============================================================
const publicMessages = (t: any) => (t.messages || []).map((m: any, i: number) => ({
    idx: i, from: m.from, text: m.text || '', at: m.at,
    fileName: m.fileName || null, fileType: m.fileType || null, hasAttachment: !!m.fileData
}));

// List tickets — user sees own, admin sees all (+ subscription status)
app.get('/api/support/tickets', authenticateToken, async (req: any, res) => {
    try {
        const isAdmin = req.user.role === 'admin';
        const all = await storage.getItems('support_tickets');
        let list = (isAdmin ? all : all.filter((t: any) => t.userId === req.user.userId))
            .sort((a: any, b: any) => (b.lastUpdate || 0) - (a.lastUpdate || 0));

        const usersById: Record<string, any> = {}, plansById: Record<string, any> = {};
        if (isAdmin) {
            (await storage.getItems('users')).forEach((u: any) => { usersById[u._id] = u; });
            (await storage.getItems('plans')).forEach((p: any) => { plansById[p._id] = p; });
        }

        res.json(list.map((t: any) => {
            const msgs = t.messages || [];
            const last = msgs[msgs.length - 1];
            const base: any = {
                _id: t._id, subject: t.subject, status: t.status, lastUpdate: t.lastUpdate,
                messagesCount: msgs.length, lastFrom: last ? last.from : null,
                lastPreview: last ? (last.text ? String(last.text).slice(0, 80) : (last.fileName ? '📎 ' + last.fileName : '')) : '',
                createdAt: t.createdAt
            };
            if (isAdmin) {
                const u = usersById[t.userId];
                const planName = u && u.planId && plansById[u.planId] ? plansById[u.planId].name : '';
                base.userName = u ? u.name : t.userName;
                base.username = u ? u.username : t.username;
                base.userActive = u ? u.isActive !== false : true;
                base.planName = planName;
                base.subscribed = !!planName;
            }
            return base;
        }));
    } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// Create a ticket
app.post('/api/support/tickets', authenticateToken, async (req: any, res) => {
    try {
        const { subject, message, fileName, fileType, fileData } = req.body;
        if (!subject || (!message && !fileData)) return res.status(400).json({ error: 'الموضوع والرسالة مطلوبان' });
        const me = await storage.getItem('users', { _id: req.user.userId });
        const now = Math.floor(Date.now() / 1000);
        const saved = await storage.saveItem('support_tickets', {
            userId: req.user.userId,
            userName: me ? me.name : '',
            username: me ? me.username : '',
            subject: String(subject).slice(0, 200),
            status: 'open',
            lastUpdate: now,
            messages: [{ from: 'user', text: message || '', fileName, fileType, fileData, at: now }]
        });
        res.json({ _id: saved._id, subject: saved.subject, status: saved.status });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// Get one ticket (with messages, attachments stripped)
app.get('/api/support/tickets/:id', authenticateToken, async (req: any, res) => {
    try {
        const t = await storage.getItem('support_tickets', { _id: req.params.id });
        if (!t) return res.status(404).json({ error: 'Ticket not found' });
        const isAdmin = req.user.role === 'admin';
        if (!isAdmin && t.userId !== req.user.userId) return res.status(403).json({ error: 'forbidden' });
        const extra: any = {};
        if (isAdmin) {
            const u = await storage.getItem('users', { _id: t.userId });
            let planName = '';
            if (u && u.planId) { const p = await storage.getItem('plans', { _id: u.planId }); if (p) planName = p.name; }
            extra.userName = u ? u.name : t.userName;
            extra.username = u ? u.username : t.username;
            extra.userActive = u ? u.isActive !== false : true;
            extra.planName = planName;
            extra.subscribed = !!planName;
        }
        res.json({ _id: t._id, subject: t.subject, status: t.status, userId: t.userId, createdAt: t.createdAt, messages: publicMessages(t), ...extra });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// Add a message (user or admin) — optional attachment
app.post('/api/support/tickets/:id/messages', authenticateToken, async (req: any, res) => {
    try {
        const { text, fileName, fileType, fileData } = req.body;
        if (!text && !fileData) return res.status(400).json({ error: 'الرسالة فارغة' });
        const t = await storage.getItem('support_tickets', { _id: req.params.id });
        if (!t) return res.status(404).json({ error: 'Ticket not found' });
        const isAdmin = req.user.role === 'admin';
        if (!isAdmin && t.userId !== req.user.userId) return res.status(403).json({ error: 'forbidden' });
        if (t.status === 'closed') return res.status(400).json({ error: 'التذكرة مغلقة' });
        const now = Math.floor(Date.now() / 1000);
        t.messages = t.messages || [];
        t.messages.push({ from: isAdmin ? 'admin' : 'user', text: text || '', fileName, fileType, fileData, at: now });
        t.status = isAdmin ? 'answered' : 'open';
        t.lastUpdate = now;
        delete t.createdAt; delete t.updatedAt;
        await storage.saveItem('support_tickets', t);
        res.json({ ok: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// Close (or reopen) a ticket
app.post('/api/support/tickets/:id/close', authenticateToken, async (req: any, res) => {
    try {
        const t = await storage.getItem('support_tickets', { _id: req.params.id });
        if (!t) return res.status(404).json({ error: 'Ticket not found' });
        const isAdmin = req.user.role === 'admin';
        if (!isAdmin && t.userId !== req.user.userId) return res.status(403).json({ error: 'forbidden' });
        t.status = req.body?.reopen ? 'open' : 'closed';
        t.lastUpdate = Math.floor(Date.now() / 1000);
        delete t.createdAt; delete t.updatedAt;
        await storage.saveItem('support_tickets', t);
        res.json({ ok: true, status: t.status });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// Download a message attachment
app.get('/api/support/tickets/:id/messages/:idx/attachment', authenticateToken, async (req: any, res) => {
    try {
        const t = await storage.getItem('support_tickets', { _id: req.params.id });
        if (!t) return res.status(404).json({ error: 'Ticket not found' });
        if (req.user.role !== 'admin' && t.userId !== req.user.userId) return res.status(403).json({ error: 'forbidden' });
        const m = (t.messages || [])[parseInt(req.params.idx, 10)];
        if (!m || !m.fileData) return res.status(404).json({ error: 'No attachment' });
        res.setHeader('Content-Type', m.fileType || 'application/octet-stream');
        res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(m.fileName || 'attachment')}"`);
        res.send(Buffer.from(m.fileData, 'base64'));
    } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ============================================================
// AI Website API — let an external site use a session's AI agent
// ============================================================

const aiAskLimiter = new Map<string, { count: number; resetAt: number }>();
const genWebKey = () => 'wsk_' + randomUUID().replace(/-/g, '') + randomUUID().replace(/-/g, '').slice(0, 8);

// Get (or lazily create) the session's website AI key
app.get('/api/sessions/:sessionId/ai-key', authenticateToken, async (req: any, res) => {
    const { sessionId } = req.params;
    const session = await storage.getItem('sessions', { id: sessionId });
    if (!session || (session.userId !== req.user.userId && req.user.role !== 'admin')) {
        return res.status(404).json({ error: 'Session not found or access denied' });
    }
    try {
        if (!session.aiApiKey) {
            session.aiApiKey = genWebKey();
            const upd: any = { ...session };
            if (upd._id) delete upd._id;
            delete upd.createdAt; delete upd.updatedAt;
            await storage.saveItem('sessions', upd);
        }
        res.json({ apiKey: session.aiApiKey });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.post('/api/sessions/:sessionId/ai-key/regenerate', authenticateToken, async (req: any, res) => {
    const { sessionId } = req.params;
    const session = await storage.getItem('sessions', { id: sessionId });
    if (!session || (session.userId !== req.user.userId && req.user.role !== 'admin')) {
        return res.status(404).json({ error: 'Session not found or access denied' });
    }
    try {
        const upd: any = { ...session, aiApiKey: genWebKey() };
        if (upd._id) delete upd._id;
        delete upd.createdAt; delete upd.updatedAt;
        await storage.saveItem('sessions', upd);
        res.json({ apiKey: upd.aiApiKey });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// PUBLIC: ask the session's AI a question (website widgets / external sites)
app.post('/api/ai/ask', async (req: any, res) => {
    try {
        const key = String(req.headers['x-api-key'] || req.body.apiKey || '');
        const question = req.body.question;
        const conversationId = req.body.conversationId;
        if (!key) return res.status(401).json({ error: 'Missing API key' });
        if (!question || !String(question).trim()) return res.status(400).json({ error: 'Missing question' });

        const now = Date.now();
        let rl = aiAskLimiter.get(key);
        if (!rl || now > rl.resetAt) { rl = { count: 0, resetAt: now + 60000 }; aiAskLimiter.set(key, rl); }
        rl.count++;
        if (rl.count > 30) return res.status(429).json({ error: 'Too many requests, slow down.' });

        const session = await storage.getItem('sessions', { aiApiKey: key });
        if (!session) return res.status(403).json({ error: 'Invalid API key' });

        const agent = await storage.getItem('aiagent', { sessionId: session.id });
        if (!agent) return res.status(400).json({ error: 'AI agent not configured for this session' });

        const remoteJid = `web:${String(conversationId || 'anon').slice(0, 64)}`;
        const rows = await ChatLog.find({ sessionId: session.id, remoteJid }).sort({ timestamp: -1 }).limit(12).lean();
        const history = rows.reverse().map((r: any) => ({ role: r.role, text: r.text }));

        const answer = await getAIResponse({ ...agent, isActive: true } as any, String(question), history as any);
        if (!answer) return res.status(502).json({ error: 'AI did not return a reply (check Groq key / limits).' });

        if (session.saveConversations !== false) {
            const ts = Math.floor(Date.now() / 1000);
            await ChatLog.create({ sessionId: session.id, userId: session.userId, remoteJid, role: 'user', text: String(question).slice(0, 4000), source: 'manual', timestamp: ts });
            await ChatLog.create({ sessionId: session.id, userId: session.userId, remoteJid, role: 'assistant', text: answer.slice(0, 4000), source: 'ai', timestamp: ts });
        }

        res.json({ answer });
    } catch (e: any) {
        console.error('[AI Ask] error:', e);
        res.status(500).json({ error: 'Internal error' });
    }
});

// PUBLIC: basic agent info for the website widget header
app.get('/api/ai/info', async (req: any, res) => {
    const key = String(req.headers['x-api-key'] || req.query.apiKey || '');
    if (!key) return res.status(401).json({ error: 'Missing API key' });
    const session = await storage.getItem('sessions', { aiApiKey: key });
    if (!session) return res.status(403).json({ error: 'Invalid API key' });
    const agent = await storage.getItem('aiagent', { sessionId: session.id });
    res.json({ name: agent?.name || 'AI', welcomeMessage: agent?.welcomeMessage || 'مرحباً! كيف يمكنني مساعدتك؟' });
});

// ============================================================
// Facebook Page Integration (Messenger messages + feed comments)
// ============================================================

const fbProcessed = new Set<string>(); // simple in-memory idempotency for mids/comment ids

const fbSendMessage = async (token: string, recipientId: string, text: string) => {
    try {
        const r = await fetch(`https://graph.facebook.com/v19.0/me/messages?access_token=${encodeURIComponent(token)}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ recipient: { id: recipientId }, messaging_type: 'RESPONSE', message: { text } })
        });
        if (!r.ok) console.error('[FB] send message failed:', await r.text());
    } catch (e) { console.error('[FB] send message error:', e); }
};

const fbReplyToComment = async (token: string, commentId: string, message: string) => {
    try {
        const r = await fetch(`https://graph.facebook.com/v19.0/${commentId}/comments?access_token=${encodeURIComponent(token)}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message })
        });
        if (!r.ok) console.error('[FB] reply comment failed:', await r.text());
    } catch (e) { console.error('[FB] reply comment error:', e); }
};

const fbGenerateReply = async (sessionId: string, remoteJid: string, userText: string, extra?: string, useMemory = true): Promise<string | null> => {
    const agent = await storage.getItem('aiagent', { sessionId });
    if (!agent || !agent.isActive) return null;
    const chatCfg = await storage.getItem('chat_settings', { sessionId, remoteJid });
    if (chatCfg && chatCfg.aiDisabled) return null; // AI disabled for this customer
    let history: { role: string; text: string }[] = [];
    if (useMemory) {
        const rows = await ChatLog.find({ sessionId, remoteJid }).sort({ timestamp: -1 }).limit(12).lean();
        history = rows.reverse().map((r: any) => ({ role: r.role, text: r.text }));
    }
    let systemExtra = extra || '';
    if (chatCfg && chatCfg.customPrompt) systemExtra += `\n\nتعليمات خاصة لهذا العميل تحديداً:\n${chatCfg.customPrompt}`;
    const agentForReply = systemExtra ? { ...agent, systemPrompt: `${agent.systemPrompt || ''}\n${systemExtra}` } : agent;
    return await getAIResponse(agentForReply as any, userText, history as any);
};

const fbLog = async (conn: any, remoteJid: string, role: 'user' | 'assistant', text: string, source: 'ai' | 'manual') => {
    try {
        await ChatLog.create({ sessionId: conn.sessionId, userId: conn.userId, remoteJid, role, text: (text || '').slice(0, 4000), source, timestamp: Math.floor(Date.now() / 1000) });
    } catch { /* ignore */ }
};

const fbShouldSave = async (sessionId: string) => {
    const sess = await storage.getItem('sessions', { id: sessionId });
    return !(sess && sess.saveConversations === false);
};

const handleFbMessage = async (conn: any, senderId: string, text: string, mid?: string) => {
    if (mid) { if (fbProcessed.has('m:' + mid)) return; fbProcessed.add('m:' + mid); }
    const remoteJid = `fb:${senderId}`;
    const saveConvos = await fbShouldSave(conn.sessionId);
    if (saveConvos) await fbLog(conn, remoteJid, 'user', text, 'manual');
    const reply = await fbGenerateReply(conn.sessionId, remoteJid, text, undefined, saveConvos);
    if (!reply) return;
    await fbSendMessage(conn.pageAccessToken, senderId, reply);
    if (saveConvos) await fbLog(conn, remoteJid, 'assistant', reply, 'ai');
};

const handleFbComment = async (conn: any, commentId: string, text: string) => {
    if (fbProcessed.has('c:' + commentId)) return;
    fbProcessed.add('c:' + commentId);
    const remoteJid = `fbc:${commentId}`;
    const saveConvos = await fbShouldSave(conn.sessionId);
    if (saveConvos) await fbLog(conn, remoteJid, 'user', text, 'manual');
    const reply = await fbGenerateReply(conn.sessionId, remoteJid, text, 'هذا تعليق عام على منشور في فيسبوك. ردّ باختصار ولباقة، ووجّه العميل للرسائل الخاصة إن احتاج تفاصيل أكثر.', saveConvos);
    if (!reply) return;
    await fbReplyToComment(conn.pageAccessToken, commentId, reply);
    if (saveConvos) await fbLog(conn, remoteJid, 'assistant', reply, 'ai');
};

// Webhook verification (Meta calls this once when you set the callback URL)
app.get('/api/facebook/webhook', async (req: any, res: any) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    if (mode === 'subscribe' && token) {
        if (process.env.FB_VERIFY_TOKEN && token === process.env.FB_VERIFY_TOKEN) return res.status(200).send(challenge);
        const match = await storage.getItem('facebook', { verifyToken: token });
        if (match) return res.status(200).send(challenge);
    }
    return res.sendStatus(403);
});

// Webhook events (incoming messages + comments)
app.post('/api/facebook/webhook', async (req: any, res: any) => {
    res.sendStatus(200); // acknowledge immediately so Meta doesn't retry
    try {
        const body = req.body;
        if (!body || body.object !== 'page') return;
        for (const entry of body.entry || []) {
            const pageId = entry.id;
            const conn = await storage.getItem('facebook', { pageId });
            if (!conn || !conn.isActive || !conn.pageAccessToken) continue;

            if (Array.isArray(entry.messaging) && conn.replyToMessages) {
                for (const ev of entry.messaging) {
                    if (ev.message && !ev.message.is_echo && ev.message.text && ev.sender?.id) {
                        await handleFbMessage(conn, ev.sender.id, ev.message.text, ev.message.mid);
                    }
                }
            }

            if (Array.isArray(entry.changes) && conn.replyToComments) {
                for (const ch of entry.changes) {
                    const v = ch.value || {};
                    if (ch.field === 'feed' && v.item === 'comment' && v.verb === 'add' && v.message && v.comment_id) {
                        if (v.from?.id && v.from.id === pageId) continue; // skip the page's own comments
                        await handleFbComment(conn, v.comment_id, v.message);
                    }
                }
            }
        }
    } catch (e) { console.error('[FB] webhook error:', e); }
});

// Get FB connection config for a session (access token masked)
app.get('/api/sessions/:sessionId/facebook', authenticateToken, async (req: any, res: any) => {
    const { sessionId } = req.params;
    const session = SessionService.getSession(sessionId);
    if (!session || (session.userId !== req.user.userId && req.user.role !== 'admin')) {
        return res.status(404).json({ error: 'Session not found or access denied' });
    }
    const conn = await storage.getItem('facebook', { sessionId });
    if (!conn) return res.json(null);
    res.json({
        pageId: conn.pageId || '',
        pageName: conn.pageName || '',
        verifyToken: conn.verifyToken || '',
        hasToken: !!conn.pageAccessToken,
        tokenHint: conn.pageAccessToken ? '••••••' + String(conn.pageAccessToken).slice(-4) : '',
        replyToMessages: conn.replyToMessages !== false,
        replyToComments: conn.replyToComments !== false,
        isActive: !!conn.isActive
    });
});

// Save FB connection config
app.put('/api/sessions/:sessionId/facebook', authenticateToken, async (req: any, res: any) => {
    const { sessionId } = req.params;
    const session = SessionService.getSession(sessionId);
    if (!session || (session.userId !== req.user.userId && req.user.role !== 'admin')) {
        return res.status(404).json({ error: 'Session not found or access denied' });
    }
    try {
        const { pageId, pageName, pageAccessToken, verifyToken, replyToMessages, replyToComments, isActive } = req.body;
        const existing = await storage.getItem('facebook', { sessionId });

        const data: any = {
            sessionId,
            userId: session.userId,
            pageId: (pageId ?? existing?.pageId ?? '').trim(),
            pageName: pageName ?? existing?.pageName ?? '',
            verifyToken: (verifyToken || existing?.verifyToken || '').trim(),
            replyToMessages: replyToMessages !== undefined ? !!replyToMessages : (existing?.replyToMessages ?? true),
            replyToComments: replyToComments !== undefined ? !!replyToComments : (existing?.replyToComments ?? true),
            isActive: isActive !== undefined ? !!isActive : (existing?.isActive ?? false)
        };
        // Only replace the token if a new, real one was provided (not the masked hint)
        if (pageAccessToken && pageAccessToken.trim() && !pageAccessToken.includes('••')) {
            data.pageAccessToken = pageAccessToken.trim();
        } else if (existing?.pageAccessToken) {
            data.pageAccessToken = existing.pageAccessToken;
        }
        if (existing?._id) data._id = existing._id;

        await storage.saveItem('facebook', data);
        res.json({ success: true });
    } catch (e: any) {
        console.error('[FB] save config error:', e);
        res.status(500).json({ error: e.message });
    }
});

// --- Socket.IO with Auth ---

io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) {
        return next(new Error("Authentication error"));
    }
    jwt.verify(token, JWT_SECRET, (err: any, decoded: any) => {
        if (err) return next(new Error("Authentication error"));
        socket.data.user = decoded;
        next();
    });
});

io.on('connection', (socket) => {
    const userId = socket.data.user.userId;
    const isAdmin = socket.data.user.role === 'admin';
    console.log(`User connected: ${userId}`);

    // Join user room for private updates
    socket.join(`user:${userId}`);

    // List Sessions (admins see ALL sessions; regular users see only their own)
    socket.on('list-sessions', async () => {
        const list = isAdmin ? SessionService.getAllSessions() : SessionService.getUserSessions(userId);

        let ownerMap: Record<string, string> = {};
        if (isAdmin) {
            const users = await storage.getItems('users');
            ownerMap = users.reduce((acc: any, u: any) => { acc[u._id] = u.name; return acc; }, {});
        }

        socket.emit('sessions-list', list.map(s => ({
            id: s.id,
            name: s.name,
            status: s.engine.currentStatus,
            userId: s.userId,
            ownerName: isAdmin ? (ownerMap[s.userId] || '—') : undefined,
            webhookUrl: s.webhookUrl,
            webhookUrls: s.webhookUrls || [],
            webhooks: s.webhooks || []
        })));
    });

    // Create Session (enforce per-user session limit for non-admins)
    socket.on('create-session', async ({ name }, callback) => {
        try {
            if (!isAdmin) {
                const me = await storage.getItem('users', { _id: userId });
                let limit = Number(me?.maxSessions) || 0;
                if (me?.planId) {
                    const plan = await storage.getItem('plans', { _id: me.planId });
                    if (plan) limit = Number(plan.maxSessions) || 0;
                }
                if (limit > 0 && SessionService.getUserSessions(userId).length >= limit) {
                    const msg = `وصلت للحد الأقصى من الأجهزة في باقتك (${limit}). قم بترقية الباقة لإضافة المزيد.`;
                    if (typeof callback === 'function') callback({ error: msg });
                    return;
                }
            }

            const sessionId = await SessionService.createSession(userId, name);

            socket.emit('session-created', { id: sessionId, name, status: 'IDLE' });
            io.to(`user:${userId}`).emit('sessions-updated');

            if (typeof callback === 'function') {
                callback({ sessionId });
            }
        } catch (error) {
            console.error('Error creating session:', error);
            if (typeof callback === 'function') {
                callback({ error: (error as any).message });
            }
        }
    });

    // Delete Session
    socket.on('delete-session', async ({ sessionId }) => {
        const result = await SessionService.deleteSession(sessionId, userId, isAdmin);
        if (result) {
            io.to(`user:${userId}`).emit('sessions-updated');
        }
    });

    // Start Session (Connect)
    socket.on('start-session', async ({ sessionId }) => {
        await SessionService.startSessionConnection(sessionId, userId, socket, io, isAdmin);
    });

    // Stop Campaign
    socket.on('stop-campaign', ({ sessionId }) => {
        CampaignService.stopCampaign(socket, sessionId);
    });

    // Send Message
    socket.on('send-message', async (data) => {
        const { sessionId, numbers, type, content, caption, minDelay = 3, maxDelay = 10 } = data;
        const session = SessionService.getSession(sessionId);

        // Security Check (admins may operate any session)
        if (!session || (session.userId !== userId && !isAdmin)) {
            socket.emit('message-status', { error: 'Invalid Session or Access Denied' });
            return;
        }

        await CampaignService.startCampaign(socket, data, session, isAdmin ? session.userId : userId);
    });

    // Logout
    socket.on('logout', async ({ sessionId }) => {
        await SessionService.logoutSession(sessionId, userId, socket, io, isAdmin);
    });
});

// ---------------------------------------------------------
// KEEP-ALIVE MECHANISM (Prevent Render Free Tier Sleep)
// ---------------------------------------------------------
// Render automatically sets RENDER_EXTERNAL_URL (e.g., https://my-app.onrender.com)
const SELF_URL = process.env.RENDER_EXTERNAL_URL || process.env.VITE_API_URL || `http://localhost:${PORT}`;

// Ping self every 5 minutes (300,000 ms) to stay active
// Render Free Tier sleeps after 15 mins of inactivity.
// We must ping the EXTERNAL URL to count as valid traffic.
setInterval(() => {
    const pingUrl = `${SELF_URL}/api/health-check`;
    console.log(`[KeepAlive] Pinging ${pingUrl} to prevent sleep...`);

    // Only attempt if it looks like a valid URL
    if (pingUrl.startsWith('http')) {
        fetch(pingUrl)
            .then(res => {
                if (res.ok) console.log(`[KeepAlive] Ping Success: ${res.status}`);
                else console.warn(`[KeepAlive] Ping Returned: ${res.status}`);
            })
            .catch(err => console.error(`[KeepAlive] Ping Failed: ${err.message}`));
    }
}, 5 * 60 * 1000);

// Dedicated Health Check Route
app.get('/api/health-check', (req, res) => {
    res.status(200).send('OK');
});
// ---------------------------------------------------------
