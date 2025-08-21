import { Db, ObjectId } from "mongodb";

// Define the conversation history document structure
export type ConversationEntry = {
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
};

export type Conversation = {
  _id?: ObjectId;
  userId: string;
  cartId: ObjectId; // Optional cart ID for cart-related operations
  history: ConversationEntry[];
  createdAt: Date;
  updatedAt: Date;
};

// Agent run result type
export type AgentRunResult = {
  conversationId: string;
  finalOutput: string;
  images?: string[]; // ✅
};

// App context type
export type AppContext = {
  db: Db;
  userId: string;
  cartId?: string; // Optional cart ID for cart-related operations
  conversationId?: string;
  userProfile?: {
    favoriteLanguage: string;
    favoriteDatabase: string;
    experience: number;
    preferredFramework?: string;
  };
  products?: Array<{
    _id: string;
    name: string;
    price: number;
    slug: string;
    description: string;
  }>;
  // ✅ NEW: Include last searched products for quick access
  lastSearchResults?: Array<{
    _id: string;
    name: string;
    price: number;
    slug: string;
    description: string;
  }>;
};

export interface CartItem {
  _id?: string; // biar gampang hapus / update item spesifik
  type: "product" | "service" | "custom";
  name: string;
  quantity?: number;
  totalPrice?: number;
  [key: string]: any; // fleksibel untuk data tambahan (durasi, note, dsb)
}

export interface Cart {
  _id?: ObjectId;
  userId: string; // whatsapp_number / user id
  status: "active" | "checked_out" | "abandoned";
  items: CartItem[];
  createdAt: Date;
  updatedAt: Date;
}
