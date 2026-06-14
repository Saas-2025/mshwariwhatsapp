
/**
 * WhatsApp Engine (SaaS Core)
 * This engine is designed to work in a Node.js environment with Baileys and File Storage.
 */

import { makeWASocket, DisconnectReason, BufferJSON, AuthenticationCreds, fetchLatestBaileysVersion, Browsers } from '@whiskeysockets/baileys';
import P from 'pino';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import NodeCache from 'node-cache';
import { v4 as uuidv4 } from 'uuid';
import { storage } from './storage.js';
import { AutoReplyService } from './autoReplyService.js';
import { useMongoDBAuthState } from './mongoAuth.js';
import { AuthState, Message, AIAgent, ChatLog } from '../models/index.js';
import { getAIResponse } from './aiService.js';


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Cache to handle "Over 2000 messages into the future" decryption errors
const msgRetryCounterCache = new NodeCache();

// Cache to store sent messages for handling client-side decryption retries (Fix: "Waiting for this message")
const sentMessagesCache = new NodeCache({ stdTTL: 3600, checkperiod: 600 }); // Store for 1 hour

export class WhatsAppEngine {
  private userId: string;
  private sessionId: string;
  private instanceId: string;
  private status: 'IDLE' | 'QR' | 'CONNECTED' | 'ERROR' = 'IDLE';
  private sock: any = null;
  private retryCount = 0;
  private conflictCount = 0;
  private decryptionErrorCount = 0;
  private decryptionErrorTimer: NodeJS.Timeout | null = null;
  private connectionStabilityTimeout: NodeJS.Timeout | null = null;
  private sentMessageIds = new Set<string>();

  constructor(userId: string, sessionId: string) {
    this.userId = userId;
    this.sessionId = sessionId;
    this.instanceId = uuidv4();
  }

  // Auth path is no longer needed but we keep folder logic just in case or remove if safe
  private getAuthPath() {
    return path.join(__dirname, '../data/auth_info_baileys', this.sessionId);
  }

  /**
   * Initialize Session
   */
  async startSession(onQR: (qr: string) => void, onConnected: () => void, onError?: (reason: any) => void) {
    if (this.sock || this.status === 'CONNECTED') {
      console.log(`[Engine] Session ${this.sessionId} is already active/connecting. Ignoring start request.`);
      if (this.status === 'CONNECTED') onConnected();
      return;
    }

    this.status = 'QR';
    console.log(`[Engine] Starting Baileys socket for session ${this.sessionId} (Mongo Auth)...`);

    try {
      // Fetch latest version with a hardcoded fallback to avoid 405 errors
      let version: [number, number, number] = [2, 3000, 1017531287];
      try {
        const latest = await fetchLatestBaileysVersion();
        version = latest.version;
        console.log(`[Engine] Using fetched version ${version.join('.')} for ${this.sessionId}`);
      } catch (e) {
        console.warn(`[Engine] Failed to fetch latest version, using fallback ${version.join('.')}`);
      }

      // Use MongoDB Auth Adapter
      const { state, saveCreds } = await useMongoDBAuthState(this.sessionId);

      // Create Socket
      this.sock = makeWASocket({
        auth: state,
        version,
        printQRInTerminal: false,
        mobile: false,
        logger: P({ level: 'error' }),
        browser: ['Mac OS', 'Safari', '10.15.7'], // v20: More stable identity
        defaultQueryTimeoutMs: 60000,
        connectTimeoutMs: 60000,
        keepAliveIntervalMs: 30000,
        syncFullHistory: false, // v14: Disabled to prevent Signal congestion
        shouldSyncHistoryMessage: () => false,
        msgRetryCounterCache,
        getMessage: async (key) => {
          const jid = key.remoteJid!;
          console.log(`[Engine] [v19] Received RETRY request from ${jid}. ID: ${key.id}`);

          // 1. Check memory cache first
          const cached = sentMessagesCache.get(key.id!);
          if (cached) {
            console.log(`[Engine] [SUCCESS] Fulfilled retry from memory for: ${key.id}`);
            return (cached as any).message || undefined;
          }

          // 2. Check MongoDB
          try {
            const stored = await Message.findOne({ id: key.id, sessionId: this.sessionId }).lean();
            if (stored && stored.content) {
              console.log(`[Engine] [SUCCESS] Fulfilled retry from MongoDB for: ${key.id}`);
              // v20: Safely revive Protobuf buffers
              const parsedContent = JSON.parse(stored.content as string, BufferJSON.reviver);
              return parsedContent;
            }
          } catch (err) {
            console.error('[Engine] [ERROR] DB Fetch failed for retry:', err);
          }

          console.warn(`[Engine] [v17] [FAILURE] No content found for retry.`);
          return undefined;
        },
        markOnlineOnConnect: true // v14: Helps refresh metadata
      });

      // Handle Connection Updates
      this.sock.ev.on('connection.update', async (update: any) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
          console.log(`[Engine] QR Code generated for ${this.sessionId}`);
          const qrDataUrl = `data:image/png;base64,${qr}`;
          onQR(qrDataUrl);
        }

        if (connection === 'open') {
          console.log(`[Engine] Session ${this.sessionId} is now CONNECTED.`);

          // -----------------------------------------------------
          // UNIQUE SESSION ENFORCEMENT (One Number Policy)
          // -----------------------------------------------------
          const userJid = this.sock?.user?.id;
          const phoneNumber = userJid ? userJid.split(':')[0] : null;

          if (phoneNumber) {
            console.log(`[Engine] Verifying uniqueness for number: ${phoneNumber}`);

            await storage.saveItem('sessions', {
              id: this.sessionId,
              instanceId: this.instanceId,
              userId: this.userId,
              phoneNumber: phoneNumber,
              status: 'CONNECTED',
              updatedAt: new Date()
            });

            const allSessions = await storage.getItems('sessions', { phoneNumber });
            const duplicates = allSessions.filter(s => s.id !== this.sessionId && s.status !== 'TERMINATED');

            if (duplicates.length > 0) {
              console.warn(`[Engine] SECURITY ALERT: Found ${duplicates.length} duplicate sessions for number ${phoneNumber}. Terminating them.`);
              for (const dup of duplicates) {
                console.log(`[Engine] Killing duplicate session: ${dup.id}`);
                await storage.saveItem('sessions', { id: dup.id, status: 'TERMINATED' });
              }
            }
          }

          this.status = 'CONNECTED';
          if (this.connectionStabilityTimeout) clearTimeout(this.connectionStabilityTimeout);
          this.connectionStabilityTimeout = setTimeout(() => {
            this.retryCount = 0;
            console.log(`[Engine] Session ${this.sessionId} connection stabilized. Retry count reset.`);
          }, 15000);

          onConnected();
        } else if (connection === 'close') {
          const reason = (lastDisconnect?.error as any)?.output?.statusCode;
          console.log(`[Engine] Connection closed for ${this.sessionId}. Reason: ${reason}`);

          if (this.status !== 'ERROR') {
            this.status = 'IDLE';
          }
          this.sock = null;
          if (this.connectionStabilityTimeout) clearTimeout(this.connectionStabilityTimeout);

          const isConflict = reason === 440;
          const isInvalidSession = reason === 405 || reason === 401 || reason === DisconnectReason.loggedOut;

          let shouldReconnect = !isInvalidSession;

          if (isConflict) {
            this.conflictCount++;
            console.warn(`[Engine] CONFLICT detected for ${this.sessionId} (Count: ${this.conflictCount}).`);
            if (this.conflictCount > 3) {
              shouldReconnect = false;
            } else {
              await new Promise(resolve => setTimeout(resolve, 3000));
              const currentSession = await storage.getItem('sessions', { id: this.sessionId });
              const isOwner = currentSession?.instanceId === this.instanceId;
              if (!isOwner || !currentSession || currentSession.status === 'TERMINATED' || currentSession.status === 'DISCONNECTED') {
                shouldReconnect = false;
              } else {
                const phoneNumber = currentSession.phoneNumber;
                if (phoneNumber) {
                  const allSessions = await storage.getItems('sessions', { phoneNumber });
                  const newerActive = allSessions.find(s => s.id !== this.sessionId && s.status === 'CONNECTED');
                  if (newerActive) shouldReconnect = false;
                }
              }
            }
          }

          if (shouldReconnect) {
            const delay = isConflict ? 20000 : Math.min(Math.pow(2, this.retryCount) * 1000, 30000);
            this.retryCount++;
            setTimeout(() => this.startSession(onQR, onConnected), delay);
          } else {
            this.status = 'ERROR';
            if (reason !== 440) await this.cleanupData();
            if (onError) onError(reason || 'stopped');
          }
        }
      });

      // Handle Creds Update
      this.sock.ev.on('creds.update', async () => {
        try {
          await saveCreds();
        } catch (err) {
          console.error('[Engine] Failed to save credentials:', err);
        }
      });

      // --- Contact Handling ---

      // 1. Initial Contact Sync from WhatsApp (Phonebook)
      this.sock.ev.on('contacts.upsert', async (contacts: any[]) => {
        console.log(`[Engine] Received ${contacts.length} contacts (Phonebook).`);
        if (contacts.length > 0) console.log('[Engine] Sample contact:', JSON.stringify(contacts[0]));

        const validContacts = contacts
          .filter(c => c.id.includes('@s.whatsapp.net') && !c.id.includes('@lid') && !c.id.includes('@broadcast'))
          .map(c => ({
            sessionId: this.sessionId,
            id: c.id,
            name: c.name || undefined, // Strict name only
            notify: c.notify,
            verifiedName: c.verifiedName
          }));

        if (validContacts.length > 0) {
          await storage.saveItems('contacts', validContacts);
          console.log(`[Engine] Saved ${validContacts.length} numbers from Phonebook.`);
        }
      });

      // 2. Fallback: Parse Incoming Messages to extract sender number/name
      this.sock.ev.on('messages.upsert', async ({ messages, type }: { messages: any[], type: string }) => {
        console.log(`[Engine] messages.upsert event: ${messages.length} messages, Type: ${type}`);

        if (type === 'notify' || type === 'append') {
          const contactsToUpdate = [];
          for (const msg of messages) {
            let remoteJid = msg.key.remoteJid;
            console.log(`[Engine] Incoming msg from ${remoteJid}, fromMe: ${msg.key.fromMe}`);

            const m = msg.message;
            const messageContent = m?.ephemeralMessage?.message || m?.viewOnceMessage?.message || m?.viewOnceMessageV2?.message || m;
            const textContent = (messageContent?.conversation || messageContent?.extendedTextMessage?.text || messageContent?.imageMessage?.caption || '').trim();
            const lowerText = textContent.toLowerCase();
            const hasMedia = !!(messageContent?.imageMessage || messageContent?.videoMessage || messageContent?.audioMessage || messageContent?.documentMessage);

            // --- v14/v15/v16: Auto Signal Repair for Decryption Issues ---
            // If the message is ciphertext (Type 1), we can't read it. We must reset the session.
            const isCiphertext = !!msg.messageStubType || (!msg.message && !msg.key.fromMe && !m?.protocolMessage && !m?.senderKeyDistributionMessage);

            if (isCiphertext) {
              console.warn(`[Engine] [v19] Decryption failure from ${remoteJid}. Letting Baileys internal retry handle it natively.`);
              continue; // Skip only this broken message, keep processing the rest of the batch
            }

            const isUnmuteCommand = ['#bot', '#unmute', '!bot', '/bot', 'unmute', '#تفعيل'].includes(lowerText);
            const isFixCommand = ['#fix', '#اصلاح', '#repair', 'تصليح'].includes(lowerText);

            if (isFixCommand) {
              console.log(`[Engine] Manual Repair requested for ${remoteJid}`);
              try {
                if (this.sock?.signalRepository?.clearSession) {
                  await this.sock.signalRepository.clearSession(remoteJid);
                  await this.send(remoteJid, 'text', '✅ تم إصلاح التشفير لهذا الرقم. يرجى المحاولة مرة أخرى.');
                }
              } catch (e) {
                console.error('[Engine] Manual Fix failed:', e);
              }
              return;
            }

            // --- Global System Commands (#bot) ---
            if (isUnmuteCommand) {
              console.log(`[Engine] SYSTEM COMMAND detected (fromMe: ${msg.key.fromMe}): UNMUTE for ${remoteJid}`);
              try {
                await storage.deleteItem('muted_chats', { sessionId: this.sessionId, chatId: remoteJid });
                // Optional: Notify on successful unmute (Only once)
                // if (!msg.key.fromMe) await this.sock.sendMessage(remoteJid, { text: "🤖 Bot Re-enabled!" });
              } catch (err) {
                console.error('[Engine] Failed to unmute chat:', err);
              }
              // If it's a command, we don't want to trigger auto-replies or takeover
              continue;
            }

            if (msg.key.fromMe) {
              // Ignore bot's own messages (Auto-Replies) to prevent triggering Human Takeover
              if (msg.key.id && this.sentMessageIds.has(msg.key.id)) {
                continue;
              }

              // --- Human Takeover Logic (Muting) ---
              // If user replies manually, mute the bot for this chat
              const msgTimestamp = msg.messageTimestamp;
              const now = Math.floor(Date.now() / 1000);
              const isStale = msgTimestamp && (now - Number(msgTimestamp) > 60);

              if (remoteJid && !remoteJid.includes('@broadcast') && !remoteJid.includes('@g.us') && !isStale && type !== 'append') {
                // Ignore protocol/system messages
                if (m?.protocolMessage || m?.senderKeyDistributionMessage || m?.peerDataOperationRequestMessage) continue;

                // Only proceed if there's actual content (already checked isUnmuteCommand above)
                if (!textContent && !hasMedia) continue;

                console.log(`[Human Takeover] MANUAL REPLY detected. Chat: ${remoteJid}, Content: "${textContent.substring(0, 50)}", Type: ${type}`);
                try {
                  await storage.saveItem('muted_chats', {
                    sessionId: this.sessionId,
                    chatId: remoteJid,
                    mutedAt: new Date(),
                    userId: this.userId
                  });
                } catch (err) {
                  console.error('[Human Takeover] Failed to mute chat:', err);
                }
              } else if (isStale) {
                console.log(`[Human Takeover] Ignored stale manual reply from ${remoteJid} (Age: ${now - Number(msgTimestamp)}s)`);
              }
              continue;
            }

            // Allow @s.whatsapp.net AND @lid (Lightning IDs)
            if (!remoteJid || remoteJid.includes('@broadcast') || (!remoteJid.includes('@s.whatsapp.net') && !remoteJid.includes('@lid'))) continue;

            const pushName = msg.pushName;

            // --- Webhook Trigger (n8n & Multiple) ---
            try {
              const session = await storage.getItem('sessions', { id: this.sessionId });

              // Collect all unique URLs
              const targets = new Set<string>();

              // 1. Legacy Single
              if (session?.webhookUrl) targets.add(session.webhookUrl);

              // 2. Legacy Array
              if (session?.webhookUrls && Array.isArray(session.webhookUrls)) {
                session.webhookUrls.forEach((url: string) => {
                  if (url && typeof url === 'string') targets.add(url);
                });
              }

              // 3. New Named Webhooks
              if (session?.webhooks && Array.isArray(session.webhooks)) {
                session.webhooks.forEach((w: any) => {
                  if (w.url && typeof w.url === 'string') targets.add(w.url);
                });
              }

              if (targets.size > 0) {
                console.log(`[Webhook] Reforwarding message from ${remoteJid} to ${targets.size} endpoints.`);

                // Determine message type and content
                let msgType = 'text';
                let msgContent = '';

                if (msg.message?.conversation) {
                  msgContent = msg.message.conversation;
                } else if (msg.message?.extendedTextMessage?.text) {
                  msgContent = msg.message.extendedTextMessage.text;
                } else if (msg.message?.imageMessage) {
                  msgType = 'image';
                  msgContent = '[Image]'; // We could potentially download and upload, or just notify
                } else if (msg.message?.videoMessage) {
                  msgType = 'video';
                  msgContent = '[Video]';
                } else if (msg.message?.audioMessage) {
                  msgType = 'audio';
                  msgContent = '[Audio]';
                } else if (msg.message?.documentMessage) {
                  msgType = 'document';
                  msgContent = '[Document]';
                }

                // v21: Clean extraction for both JID and LID to avoid @suffixes in webhooks
                const cleanFrom = remoteJid.split('@')[0];

                const payload = {
                  event: 'message.received',
                  session_id: this.sessionId,
                  from: cleanFrom,
                  pushName: pushName,
                  type: msgType,
                  content: msgContent,
                  timestamp: msg.messageTimestamp,
                  full_message: msg
                };

                // Dispatch to all targets (Fire and Forget)
                const promises = Array.from(targets).map(url =>
                  fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                  }).catch(err => console.error(`[Webhook] Failed to send to ${url}:`, err.message))
                );

                // We don't await all to avoid blocking, but maybe we should await Promise.allSettled slightly?
                // The original code didn't await. Let's keep it async.
              }
            } catch (whErr) {
              console.error('[Webhook] Error:', whErr);
            }

            // --- Auto Reply: AI + Knowledge (primary), keyword rules (legacy fallback) ---
            try {
              const sessionState = await storage.getItem('sessions', { id: this.sessionId });
              const replyDisabled = !!(sessionState && sessionState.autoReplyEnabled === false);

              // Human takeover: if the owner replied manually, this chat is muted
              const isMuted = await storage.getItem('muted_chats', { sessionId: this.sessionId, chatId: remoteJid });

              if (textContent) {
                // Resolve the per-session AI agent and build memory BEFORE logging the
                // current turn, so the prompt history doesn't duplicate it.
                const agent = await this.getSessionAgent();
                const aiActive = !!(agent && agent.isActive);
                const history = aiActive ? await this.buildHistory(remoteJid) : [];

                // Always record the inbound customer message (memory / history / analytics)
                await this.logChat(remoteJid, 'user', textContent, pushName);

                if (replyDisabled) {
                  console.log(`[AutoReply] Reply disabled for session ${this.sessionId} — logged only.`);
                } else if (isMuted) {
                  console.log(`[AutoReply] [Muted] ${remoteJid} (human takeover) — logged only.`);
                } else if (aiActive) {
                  // 1) AI Agent is the PRIMARY responder (knowledge base + conversation memory)
                  try {
                    const aiReply = await getAIResponse(agent as any, textContent, history);
                    if (aiReply) {
                      await new Promise(r => setTimeout(r, 800 + Math.random() * 1500));
                      await this.sock.sendPresenceUpdate('composing', remoteJid);
                      await new Promise(r => setTimeout(r, Math.min(6000, 1500 + aiReply.length * 25)));
                      await this.sock.sendPresenceUpdate('paused', remoteJid);
                      const aiSent = await this.sock.sendMessage(remoteJid, { text: aiReply }, { quoted: msg });
                      if (aiSent?.key?.id) {
                        this.sentMessageIds.add(aiSent.key.id);
                        sentMessagesCache.set(aiSent.key.id, aiSent);
                        setTimeout(() => this.sentMessageIds.delete(aiSent.key.id!), 15000);
                      }
                      await this.logChat(remoteJid, 'assistant', aiReply, undefined, 'ai');
                      console.log(`[AI] Sent AI response to ${remoteJid}`);
                    }
                  } catch (aiErr) {
                    console.error('[AI] Error generating AI reply:', aiErr);
                  }
                } else {
                  // 2) Legacy keyword auto-reply (only when no active AI agent)
                  const matchedRule = await AutoReplyService.getResponse(this.userId, textContent, this.sessionId);
                  if (matchedRule) {
                    console.log(`[AutoReply] Keyword match: ${matchedRule._id} | ${matchedRule.replyType || 'text'}`);
                    const isAudio = matchedRule.replyType === 'audio';
                    const presenceType = isAudio ? 'recording' : 'composing';
                    await new Promise(r => setTimeout(r, 1000 + Math.random() * 2000));
                    await this.sock.sendPresenceUpdate(presenceType, remoteJid);
                    const humanDelay = isAudio ? 4000 : Math.min(8000, 3000 + (matchedRule.response.length * 50));
                    await new Promise(r => setTimeout(r, humanDelay));
                    await this.sock.sendPresenceUpdate('paused', remoteJid);

                    const responseText = matchedRule.response;
                    try {
                      let sentMsg;
                      if (matchedRule.replyType === 'image' && matchedRule.mediaUrl) {
                        sentMsg = await this.sock.sendMessage(remoteJid, { image: { url: matchedRule.mediaUrl }, caption: responseText }, { quoted: msg });
                      } else if (matchedRule.replyType === 'video' && matchedRule.mediaUrl) {
                        sentMsg = await this.sock.sendMessage(remoteJid, { video: { url: matchedRule.mediaUrl }, caption: responseText }, { quoted: msg });
                      } else if (matchedRule.replyType === 'document' && matchedRule.mediaUrl) {
                        sentMsg = await this.sock.sendMessage(remoteJid, { document: { url: matchedRule.mediaUrl }, mimetype: 'application/pdf', fileName: matchedRule.fileName || 'file.pdf', caption: responseText }, { quoted: msg });
                      } else if (matchedRule.replyType === 'audio' && matchedRule.mediaUrl) {
                        sentMsg = await this.sock.sendMessage(remoteJid, { audio: { url: matchedRule.mediaUrl }, ptt: true }, { quoted: msg });
                      } else {
                        sentMsg = await this.sock.sendMessage(remoteJid, { text: responseText }, { quoted: msg });
                      }

                      if (sentMsg?.key?.id) {
                        this.sentMessageIds.add(sentMsg.key.id);
                        sentMessagesCache.set(sentMsg.key.id, sentMsg);
                        try {
                          await Message.create({
                            sessionId: this.sessionId,
                            remoteJid: remoteJid,
                            fromMe: true,
                            id: sentMsg.key.id,
                            content: JSON.stringify(sentMsg.message, BufferJSON.replacer),
                            timestamp: Math.floor(Date.now() / 1000)
                          });
                        } catch (dbErr) {
                          console.error('[Engine] Failed to persist auto-reply for retry:', dbErr);
                        }
                        setTimeout(() => this.sentMessageIds.delete(sentMsg.key.id!), 15000);
                      }
                      await this.logChat(remoteJid, 'assistant', responseText || `[${matchedRule.replyType || 'text'}]`, undefined, 'keyword');
                      console.log(`[AutoReply] Sent ${matchedRule.replyType || 'text'} response.`);
                    } catch (sendErr) {
                      console.error('[AutoReply] Failed to send response:', sendErr);
                      await this.sock.sendMessage(remoteJid, { text: `[Error sending media] ${responseText}` }, { quoted: msg });
                    }
                  }
                }
              }
            } catch (err) {
              console.error('[AutoReply] Error processing message:', err);
            }
            // ------------------------

            contactsToUpdate.push({
              sessionId: this.sessionId,
              id: remoteJid,
              notify: pushName,
              name: undefined, // Never overwrite name from a message upsert
              hasMessaged: true
            });
          }

          if (contactsToUpdate.length > 0) {
            await storage.saveItems('contacts', contactsToUpdate);
          }
        }
      });

      // 3. conversation History (Chats) - REMOVED (Handled by messaging-history.set)
      this.sock.ev.on('chats.upsert', async (chats: any[]) => {
        // Helpful for incremental updates, but history sync covers initial.
        // keeping it for real-time new conversation updates
        const contactsToUpdate = chats
          .filter(c => c.id.includes('@s.whatsapp.net') && !c.id.includes('@lid') && !c.id.includes('@broadcast'))
          .map(c => ({
            sessionId: this.sessionId,
            id: c.id,
            name: c.name || undefined,
            hasMessaged: true
          }));

        if (contactsToUpdate.length > 0) {
          await storage.saveItems('contacts', contactsToUpdate);
        }
      });

      // 4. Initial History Sync (The most reliable source for past chats)
      this.sock.ev.on('messaging-history.set', async (data: any) => {
        const { chats, contacts, messages } = data;
        const msgCount = messages?.length || 0;
        console.log(`[Engine] Received History Sync: ${chats?.length || 0} chats, ${contacts?.length || 0} contacts, ${msgCount} messages.`);

        // Map to deduplicate and merge updates for this batch
        // Key: JID, Value: Partial<Contact>
        const contactsMap = new Map<string, any>();

        const upsertContact = (id: string, data: any) => {
          if (!id.includes('@s.whatsapp.net') || id.includes('@lid')) return;
          const existing = contactsMap.get(id) || { sessionId: this.sessionId, id };
          // Merge logic: prefer new truthy values, but careful with 'name' vs 'notify'
          contactsMap.set(id, { ...existing, ...data });
        };

        // 1. Process Contacts (Phonebook names & PushNames from direct contact sync)
        if (contacts) {
          contacts.forEach((c: any) => {
            upsertContact(c.id, {
              name: c.name || undefined, // Strict name only (Saved Name)
              notify: c.notify, // Push Name (WhatsApp Name) if present
              verifiedName: c.verifiedName
            });
          });
        }

        // 2. Process Chats (Conversations state)
        if (chats) {
          chats.forEach((c: any) => {
            // For chats, we primarily want to establish 'hasMessaged'
            upsertContact(c.id, {
              // chat.name can be a name for groups/contacts if set manually or synced
              ...(c.name ? { name: c.name } : {}),
              hasMessaged: true
            });
          });
        }

        // 3. Process Messages (CRITICAL: Extract PushNames for unsaved contacts)
        if (messages) {
          messages.forEach((msg: any) => {
            if (msg.pushName && !msg.key.fromMe) {
              const isGroup = msg.key.remoteJid.endsWith('@g.us');
              // For groups, sender is participant. For private, remoteJid is sender.
              const sender = isGroup ? msg.key.participant : msg.key.remoteJid;

              if (sender) {
                upsertContact(sender, {
                  notify: msg.pushName, // This solves "Missing WhatsApp Name"
                  hasMessaged: true
                });
              }
            }
          });
        }

        const contactsToSave = Array.from(contactsMap.values());

        if (contactsToSave.length > 0) {
          await storage.saveItems('contacts', contactsToSave);
          console.log(`[Engine] Synced ${contactsToSave.length} unique contacts from history (with deep message scanning).`);
        }
      });


    } catch (error) {
      console.error('[Engine] Failed to start session:', error);
      this.status = 'ERROR';
      throw error;
    }
  }

  async send(to: string, type: 'text' | 'image' | 'audio' | 'video' | 'document', content: string, caption?: string) {
    if (this.status !== 'CONNECTED' || !this.sock) throw new Error("Device is not connected!");

    const jid = to.includes('@s.whatsapp.net') ? to : `${to}@s.whatsapp.net`;
    console.log(`[API] Sending ${type} to ${to}...`);

    try {
      let sentMsg;
      if (type === 'text') {
        // Plain text message
        sentMsg = await this.sock.sendMessage(jid, { text: content });
      } else {
        // Media message handling
        const isUrl = content.startsWith('http://') || content.startsWith('https://');

        if (isUrl) {
          // A. Handle URL (Best for n8n/Automation)
          console.log(`[API] Detected Media URL for ${type}`);

          if (type === 'image') {
            sentMsg = await this.sock.sendMessage(jid, { image: { url: content }, caption: caption });
          } else if (type === 'audio') {
            sentMsg = await this.sock.sendMessage(jid, { audio: { url: content }, ptt: true }); // Send as Voice Note
          } else if (type === 'video') {
            sentMsg = await this.sock.sendMessage(jid, { video: { url: content }, caption: caption });
          } else if (type === 'document') {
            // Try to guess mimetype or default to pdf (WhatsApp requires mimetype for documents usually)
            // Ideally we'd fetch HEAD to check content-type, but for now we default to pdf/octet-stream
            // n8n users should ensure their URL is direct.
            sentMsg = await this.sock.sendMessage(jid, {
              document: { url: content },
              mimetype: 'application/pdf',
              fileName: caption || content.split('/').pop() || 'file.pdf'
            });
          }

        } else {
          // B. Handle Base64 (Legacy/Direct Upload)
          const base64Part = content.includes(',') ? content.split(',')[1] : content;
          if (!base64Part) throw new Error("Invalid media content: Base64 data missing");

          const buffer = Buffer.from(base64Part, 'base64');

          if (type === 'image') {
            sentMsg = await this.sock.sendMessage(jid, { image: buffer, caption: caption });
          } else if (type === 'audio') {
            sentMsg = await this.sock.sendMessage(jid, { audio: buffer, ptt: true });
          } else if (type === 'video') {
            sentMsg = await this.sock.sendMessage(jid, { video: buffer, caption: caption });
          } else if (type === 'document') {
            sentMsg = await this.sock.sendMessage(jid, { document: buffer, mimetype: 'application/pdf', fileName: caption || 'file.pdf' });
          }
        }
      }

      if (sentMsg?.key?.id) {
        this.sentMessageIds.add(sentMsg.key.id);
        sentMessagesCache.set(sentMsg.key.id, sentMsg);

        // v13/v20: Persistent Store for retries
        try {
          await Message.create({
            sessionId: this.sessionId,
            remoteJid: jid,
            fromMe: true,
            id: sentMsg.key.id,
            // v20: Force stringify using Baileys replacer to protect Uint8Arrays
            content: JSON.stringify(sentMsg.message, BufferJSON.replacer),
            timestamp: Math.floor(Date.now() / 1000)
          });
        } catch (dbErr) {
          console.error('[Engine] Failed to persist sent message for retry:', dbErr);
        }

        setTimeout(() => this.sentMessageIds.delete(sentMsg.key.id!), 15000);
      }

      return { success: true, timestamp: Date.now() };
    } catch (error) {
      console.error(`[API] Send failed:`, error);
      throw error;
    }
  }

  async logout() {
    try {
      console.log('[Engine] Logging out...');
      if (this.sock) {
        await this.sock.logout();
        this.sock.end(undefined);
        this.sock = null;
      }
    } catch (err) {
      console.error('[Engine] Error during logout:', err);
    } finally {
      await this.cleanupData();
      this.status = 'IDLE';
    }
  }

  async cleanupData() {
    try {
      // 1. Clear MongoDB Auth State (SaaS Core)
      // The model name is 'AuthState', Mongoose pluralizes to 'authstates' or 'auth_states' 
      // but the storage.deleteItem uses the collection name passed.
      // Based on mongoAuth.ts, it uses the AuthState model.
      await AuthState.deleteMany({ sessionId: this.sessionId });

      // 2. Update Session Status in DB to prevent automatic resumption
      await storage.saveItem('sessions', { id: this.sessionId, status: 'DISCONNECTED' });

      // 3. Optional: Clear local files (Legacy/Fallback)
      const authPath = this.getAuthPath();
      await fs.rm(authPath, { recursive: true, force: true });

      console.log(`[Engine] Auth data and status for ${this.sessionId} cleared in DB & Disk.`);
    } catch (e) {
      console.error('[Engine] Failed to clear data:', e);
    }
  }

  async validateNumber(phone: string): Promise<boolean> {
    if (this.status !== 'CONNECTED' || !this.sock) return false;
    const jid = phone.includes('@') ? phone : `${phone}@s.whatsapp.net`;
    try {
      const result = await this.sock.onWhatsApp(jid);
      return result && result.length > 0 && result[0].exists;
    } catch (err) {
      console.error(`Failed to validate number ${phone}`, err);
      return false;
    }
  }

  // --- AI Agent helpers (per-session config + conversation memory) ---

  private async getSessionAgent(): Promise<any | null> {
    // Prefer the per-session agent; fall back to a legacy global agent (sessionId=null)
    let agent = await AIAgent.findOne({ userId: this.userId, sessionId: this.sessionId }).lean();
    if (!agent) agent = await AIAgent.findOne({ userId: this.userId, sessionId: null }).lean();
    return agent;
  }

  private async buildHistory(remoteJid: string, limit = 12): Promise<{ role: 'user' | 'assistant'; text: string }[]> {
    try {
      const rows = await ChatLog.find({ sessionId: this.sessionId, remoteJid })
        .sort({ timestamp: -1 })
        .limit(limit)
        .lean();
      return rows.reverse().map(r => ({ role: (r.role === 'assistant' ? 'assistant' : 'user') as 'user' | 'assistant', text: r.text }));
    } catch (e) {
      console.error('[Engine] buildHistory failed:', e);
      return [];
    }
  }

  private async logChat(remoteJid: string, role: 'user' | 'assistant', text: string, pushName?: string, source: 'ai' | 'keyword' | 'manual' = 'manual') {
    try {
      await ChatLog.create({
        sessionId: this.sessionId,
        userId: this.userId,
        remoteJid,
        role,
        text: (text || '').slice(0, 4000),
        pushName,
        source,
        timestamp: Math.floor(Date.now() / 1000)
      });
    } catch (e) {
      console.error('[Engine] logChat failed:', e);
    }
  }

  public get currentStatus() {
    return this.status;
  }
}
