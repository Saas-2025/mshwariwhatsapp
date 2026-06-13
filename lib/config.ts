
export const CONFIG = {
  // Never hardcode credentials. Read from environment variables instead.
  MONGODB_URI: process.env.MONGO_URI || "",
  APP_NAME: "W-SaaS Gateway",
  VERSION: "2.1.0",
  DEFAULT_QR_TIMEOUT: 45000,
};
