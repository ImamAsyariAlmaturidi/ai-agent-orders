import { MongoClient, Db } from "mongodb";
import { CONFIG } from "../config/index.js";

class DatabaseManager {
  private static client: MongoClient | null = null;
  private static db: Db | null = null;

  static async connect(): Promise<Db> {
    if (this.db) return this.db;

    this.client = new MongoClient(CONFIG.MONGODB_URI);
    await this.client.connect();
    this.db = this.client.db("agent_memory");
    console.log("✅ Connected to MongoDB");
    return this.db;
  }

  static getDb(): Db {
    if (!this.db) throw new Error("Database not connected");
    return this.db;
  }

  static async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.client = null;
      this.db = null;
      console.log("✅ Disconnected from MongoDB");
    }
  }
}

export { DatabaseManager };
