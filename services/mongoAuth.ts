import { AuthenticationCreds, AuthenticationState, BufferJSON, initAuthCreds, SignalDataTypeMap } from '@whiskeysockets/baileys';
import { AuthState } from '../models/index.js';

// Attempts per DB write before the failure is reported back to Baileys
const WRITE_ATTEMPTS = 3;

export const useMongoDBAuthState = async (sessionId: string): Promise<{ state: AuthenticationState, saveCreds: () => Promise<void>, flush: () => Promise<void> }> => {

    const memoryKeys: { [key: string]: any } = {};

    // 1. Initial Load: Populate cache for speed
    console.log(`[Auth] Initializing memory cache for session ${sessionId}...`);
    const allStoredKeys = await AuthState.find({ sessionId }).lean();
    for (const item of allStoredKeys) {
        memoryKeys[item.key] = JSON.parse(JSON.stringify(item.data), BufferJSON.reviver);
    }
    console.log(`[Auth] Cache ready (${allStoredKeys.length} keys).`);

    let writeMutex = Promise.resolve();
    let credsMutex = Promise.resolve();

    // Keys whose DB write failed. They live only in memory until a later write saves them;
    // if the process restarts first they are lost and recipients can't decrypt our messages.
    const unsavedKeys = new Set<string>();

    const toOperation = (key: string, value: any) => {
        if (value) {
            const jsonData = JSON.parse(JSON.stringify(value, BufferJSON.replacer));
            return {
                updateOne: {
                    filter: { sessionId, key },
                    update: { $set: { sessionId, key, data: jsonData } },
                    upsert: true
                }
            };
        }
        return {
            deleteOne: {
                filter: { sessionId, key }
            }
        };
    };

    const withRetry = async (label: string, write: () => Promise<unknown>) => {
        let lastErr: any;
        for (let attempt = 1; attempt <= WRITE_ATTEMPTS; attempt++) {
            try {
                await write();
                if (attempt > 1) console.log(`[Auth] Session ${sessionId}: ${label} saved on attempt ${attempt}.`);
                return;
            } catch (err) {
                lastErr = err;
                if (attempt < WRITE_ATTEMPTS) await new Promise(resolve => setTimeout(resolve, 500 * attempt));
            }
        }
        throw lastErr;
    };

    // Best-effort re-save of keys from earlier failed writes, using their current in-memory values.
    // Never throws, so one bad key can't block every later write.
    const retryUnsavedKeys = async () => {
        if (unsavedKeys.size === 0) return;
        const keys = Array.from(unsavedKeys);
        try {
            await AuthState.bulkWrite(keys.map(key => toOperation(key, memoryKeys[key])), { ordered: false });
            for (const key of keys) unsavedKeys.delete(key);
            console.log(`[Auth] Session ${sessionId}: recovered ${keys.length} previously unsaved key(s).`);
        } catch (err) {
            console.error(`[Auth][CRITICAL] Session ${sessionId}: ${unsavedKeys.size} encryption key(s) are still NOT saved to MongoDB.`, err);
        }
    };

    const writeToDB = async (updates: { [key: string]: any }) => {
        const keys = Object.keys(updates);
        if (keys.length === 0) return;
        const operations = keys.map(key => toOperation(key, updates[key]));

        // CRITICAL (v19): Strictly enforce atomic/sequential writes using a promise queue
        const job = writeMutex.then(async () => {
            try {
                await withRetry(`${keys.length} key(s)`, () => AuthState.bulkWrite(operations, { ordered: false }));
            } catch (err) {
                for (const key of keys) unsavedKeys.add(key);
                console.error(
                    `[Auth][CRITICAL] Session ${sessionId}: failed to save ${keys.length} encryption key(s) to MongoDB after ${WRITE_ATTEMPTS} attempts ` +
                    `(${unsavedKeys.size} unsaved in total). If the server restarts before they are saved, recipients will see "Waiting for this message".`,
                    err
                );
                // Re-throw so Baileys knows the commit failed and retries it instead of assuming success
                throw err;
            }
            for (const key of keys) unsavedKeys.delete(key);
            await retryUnsavedKeys();
        });
        // Keep the queue usable for later writes even when this one failed
        writeMutex = job.catch(() => { });
        await job;
    };

    const creds: AuthenticationCreds = memoryKeys['creds'] || initAuthCreds();

    return {
        state: {
            creds,
            keys: {
                get: async (type, ids) => {
                    const data: { [key: string]: SignalDataTypeMap[typeof type] } = {};
                    const missingKeys: string[] = [];

                    for (const id of ids) {
                        const key = `${type}-${id}`;
                        if (memoryKeys[key]) {
                            data[id] = memoryKeys[key];
                        } else {
                            missingKeys.push(id);
                        }
                    }

                    // READ-THROUGH: If anything is missing in memory, check DB
                    if (missingKeys.length > 0) {
                        const dbKeys = missingKeys.map(id => `${type}-${id}`);
                        const dbResults = await AuthState.find({ sessionId, key: { $in: dbKeys } }).lean();
                        for (const res of dbResults) {
                            const val = JSON.parse(JSON.stringify(res.data), BufferJSON.reviver);
                            const id = res.key.split(`${type}-`)[1];
                            data[id] = val;
                            memoryKeys[res.key] = val; // Cache it
                        }
                    }

                    return data;
                },
                set: async (data) => {
                    const dbUpdates: { [key: string]: any } = {};
                    for (const type in data) {
                        for (const id in data[type]) {
                            const value = data[type][id];
                            const key = `${type}-${id}`;

                            // Update Memory
                            if (value) {
                                memoryKeys[key] = value;
                            } else {
                                delete memoryKeys[key];
                            }

                            // Prepare DB Update
                            dbUpdates[key] = value;
                        }
                    }
                    // CRITICAL: Await before returning to engine (throws if the DB write failed)
                    await writeToDB(dbUpdates);
                }
            }
        },
        saveCreds: async () => {
            memoryKeys['creds'] = creds; // Sync memory explicitly
            // Serialize writes so an older snapshot can never land after a newer one
            const job = credsMutex.then(async () => {
                try {
                    await withRetry('creds', () => {
                        // Snapshot at write time so the latest creds are always the ones saved
                        const jsonData = JSON.parse(JSON.stringify(creds, BufferJSON.replacer));
                        return AuthState.findOneAndUpdate(
                            { sessionId, key: 'creds' },
                            { $set: { sessionId, key: 'creds', data: jsonData } },
                            { upsert: true }
                        );
                    });
                } catch (err) {
                    console.error(`[Auth][CRITICAL] Session ${sessionId}: failed to save creds to MongoDB after ${WRITE_ATTEMPTS} attempts.`, err);
                    throw err;
                }
            });
            credsMutex = job.catch(() => { });
            await job;
        },
        // Wait for queued writes and make a last attempt at unsaved keys (used before process exit)
        flush: async () => {
            await writeMutex;
            await credsMutex;
            await retryUnsavedKeys();
        }
    };
};
