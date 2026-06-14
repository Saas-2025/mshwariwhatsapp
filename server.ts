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

dotenv.config({ path: '.env.local' });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

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

// List Users (Admin Only)
app.get('/api/users', authenticateToken, requireAdmin, async (req: any, res) => {
    console.log('--> GET /api/users REQUEST');
    try {
        const users = await storage.getItems('users');
        console.log(`--> Found ${users.length} users`);
        const safeUsers = users.map((u: any) => {
            const { password, ...rest } = u;
            return rest;
        });
        // Sort by date (newest first)
        res.json(safeUsers.sort((a: any, b: any) => {
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
        const { name, username, password, isActive, permissions, role, maxSessions } = req.body;

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
app.get('/api/sessions', authenticateToken, async (req: any, res) => {
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

app.post('/api/sessions/:sessionId/messages', authenticateToken, async (req: any, res) => {
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

const fbGenerateReply = async (sessionId: string, remoteJid: string, userText: string, extra?: string): Promise<string | null> => {
    const agent = await storage.getItem('aiagent', { sessionId });
    if (!agent || !agent.isActive) return null;
    const rows = await ChatLog.find({ sessionId, remoteJid }).sort({ timestamp: -1 }).limit(12).lean();
    const history = rows.reverse().map((r: any) => ({ role: r.role, text: r.text }));
    const agentForReply = extra ? { ...agent, systemPrompt: `${agent.systemPrompt || ''}\n${extra}` } : agent;
    return await getAIResponse(agentForReply as any, userText, history);
};

const fbLog = async (conn: any, remoteJid: string, role: 'user' | 'assistant', text: string, source: 'ai' | 'manual') => {
    try {
        await ChatLog.create({ sessionId: conn.sessionId, userId: conn.userId, remoteJid, role, text: (text || '').slice(0, 4000), source, timestamp: Math.floor(Date.now() / 1000) });
    } catch { /* ignore */ }
};

const handleFbMessage = async (conn: any, senderId: string, text: string, mid?: string) => {
    if (mid) { if (fbProcessed.has('m:' + mid)) return; fbProcessed.add('m:' + mid); }
    const remoteJid = `fb:${senderId}`;
    await fbLog(conn, remoteJid, 'user', text, 'manual');
    const reply = await fbGenerateReply(conn.sessionId, remoteJid, text);
    if (!reply) return;
    await fbSendMessage(conn.pageAccessToken, senderId, reply);
    await fbLog(conn, remoteJid, 'assistant', reply, 'ai');
};

const handleFbComment = async (conn: any, commentId: string, text: string) => {
    if (fbProcessed.has('c:' + commentId)) return;
    fbProcessed.add('c:' + commentId);
    const remoteJid = `fbc:${commentId}`;
    await fbLog(conn, remoteJid, 'user', text, 'manual');
    const reply = await fbGenerateReply(conn.sessionId, remoteJid, text, 'هذا تعليق عام على منشور في فيسبوك. ردّ باختصار ولباقة، ووجّه العميل للرسائل الخاصة إن احتاج تفاصيل أكثر.');
    if (!reply) return;
    await fbReplyToComment(conn.pageAccessToken, commentId, reply);
    await fbLog(conn, remoteJid, 'assistant', reply, 'ai');
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
                const limit = Number(me?.maxSessions) || 0;
                if (limit > 0 && SessionService.getUserSessions(userId).length >= limit) {
                    const msg = `وصلت للحد الأقصى من الأجهزة (${limit}). تواصل مع المسؤول لزيادة الحد.`;
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
