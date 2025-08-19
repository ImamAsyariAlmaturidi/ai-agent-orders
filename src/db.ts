// db.js - Updated addItemToCart function yang handle duplicates

import { MongoClient, ObjectId, Db } from "mongodb";
import { Conversation, ConversationEntry } from "./types.js";
import { Cart, CartItem } from "./types.js";

import "dotenv/config";

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  throw new Error("Please define the MONGODB_URI environment variable");
}

// Connect to MongoDB and get database instance
export const connectToMongoDB = async (): Promise<{
  client: MongoClient;
  db: Db;
}> => {
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  console.log("Connected to MongoDB");
  const db = client.db("agent_memory");
  return { client, db };
};

// Create a new conversation
export const createConversation = async (
  db: Db,
  userId: string,
  cartId: ObjectId
): Promise<string> => {
  const collection = db.collection<Conversation>("conversations");

  const conversation: Conversation = {
    userId,
    history: [],
    cartId,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  console.log(conversation, "Creating conversation with cartId");
  const result = await collection.insertOne(conversation);
  return result.insertedId.toString();
};

// Add entry to conversation history
export const addToConversationHistory = async (
  db: Db,
  conversationId: string,
  role: "user" | "assistant",
  content: string
): Promise<ConversationEntry> => {
  const collection = db.collection<Conversation>("conversations");

  const entry: ConversationEntry = {
    role,
    content,
    timestamp: new Date(),
  };

  await collection.updateOne(
    { _id: new ObjectId(conversationId) },
    {
      $push: { history: entry },
      $set: { updatedAt: new Date() },
    }
  );
  return entry;
};

// Get conversation history
export const getConversationHistory = async (
  db: Db,
  conversationId: string
): Promise<ConversationEntry[]> => {
  const collection = db.collection<Conversation>("conversations");

  const conversation = await collection.findOne({
    _id: new ObjectId(conversationId),
  });

  return conversation?.history || [];
};

// Create cart only if user doesn't have active cart
export const createCart = async (db: Db, userId: string): Promise<string> => {
  const collection = db.collection<Cart>("carts");

  // Check if user already has an active cart
  const existingCart = await collection.findOne({
    userId,
    status: "active",
  });

  if (existingCart) {
    console.log(`User ${userId} already has active cart: ${existingCart._id}`);
    return existingCart._id.toString();
  }

  // Create new cart only if no active cart exists
  const cart: Cart = {
    userId,
    status: "active",
    items: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const result = await collection.insertOne(cart);
  console.log(`Created new cart for user ${userId}: ${result.insertedId}`);
  return result.insertedId.toString();
};

// Force create new cart (untuk checkout dll)
export const createNewCart = async (
  db: Db,
  userId: string
): Promise<string> => {
  const collection = db.collection<Cart>("carts");

  const cart: Cart = {
    userId,
    status: "active",
    items: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const result = await collection.insertOne(cart);
  console.log(
    `Force created new cart for user ${userId}: ${result.insertedId}`
  );
  return result.insertedId.toString();
};

// ================== READ ==================
export const getActiveCart = async (
  db: Db,
  userId: string
): Promise<Cart | null> => {
  const collection = db.collection<Cart>("carts");

  return await collection.findOne({
    userId,
    status: "active",
  });
};

export const getCartById = async (
  db: Db,
  cartId: string
): Promise<Cart | null> => {
  const collection = db.collection<Cart>("carts");

  return await collection.findOne({
    _id: new ObjectId(cartId),
  });
};

export const getUserCarts = async (
  db: Db,
  userId: string,
  status?: "active" | "checked_out" | "abandoned"
): Promise<Cart[]> => {
  const collection = db.collection<Cart>("carts");

  const query: any = { userId };
  if (status) {
    query.status = status;
  }

  return await collection.find(query).sort({ createdAt: -1 }).toArray();
};

// ================== UPDATE ==================

// ✅ FIXED: Smart add item to cart - check for duplicates first
export const addItemToCart = async (
  db: Db,
  cartId: string,
  item: CartItem & { price: number }
): Promise<{ isNew: boolean; message: string }> => {
  const collection = db.collection<Cart>("carts");

  try {
    // First, get the current cart to check for existing items
    const cart = await collection.findOne({ _id: new ObjectId(cartId) });

    if (!cart) {
      throw new Error(`Cart with ID ${cartId} not found`);
    }

    // Check if item with same name and type already exists
    const existingItemIndex = cart.items.findIndex(
      (existingItem) =>
        existingItem.name.toLowerCase() === item.name.toLowerCase() &&
        existingItem.type === item.type
    );

    if (existingItemIndex !== -1) {
      // Item exists, update quantity and total price
      const existingItem = cart.items[existingItemIndex];
      const newQuantity = (existingItem.quantity || 1) + (item.quantity || 1);
      const newTotalPrice = item.price * newQuantity;

      await collection.updateOne(
        {
          _id: new ObjectId(cartId),
          "items._id": existingItem._id,
        },
        {
          $set: {
            [`items.$.quantity`]: newQuantity,
            [`items.$.totalPrice`]: newTotalPrice,
            updatedAt: new Date(),
          },
        }
      );

      return {
        isNew: false,
        message: `Updated ${item.name} quantity to ${newQuantity} (Total: ${newTotalPrice})`,
      };
    } else {
      // Item doesn't exist, add new item
      const quantity = item.quantity || 1;
      const itemWithId = {
        ...item,
        _id: new ObjectId().toString(),
        quantity,
        totalPrice: item.price * quantity,
      };

      await collection.updateOne(
        { _id: new ObjectId(cartId) },
        {
          $push: { items: itemWithId },
          $set: { updatedAt: new Date() },
        }
      );

      return {
        isNew: true,
        message: `Added new item: ${item.name} (Total: ${itemWithId.totalPrice})`,
      };
    }
  } catch (error) {
    console.error("Error in addItemToCart:", error);
    throw error;
  }
};

// ✅ NEW: Add item or update if exists (with specific quantity)
export const addOrUpdateCartItem = async (
  db: Db,
  cartId: string,
  item: CartItem,
  mode: "add" | "set" = "add" // "add" = tambah quantity, "set" = set quantity
): Promise<{ isNew: boolean; message: string }> => {
  const collection = db.collection<Cart>("carts");

  try {
    const cart = await collection.findOne({ _id: new ObjectId(cartId) });

    if (!cart) {
      throw new Error(`Cart with ID ${cartId} not found`);
    }

    const existingItemIndex = cart.items.findIndex(
      (existingItem) =>
        existingItem.name.toLowerCase() === item.name.toLowerCase() &&
        existingItem.type === item.type
    );

    if (existingItemIndex !== -1) {
      const existingItem = cart.items[existingItemIndex];

      let newQuantity: number;
      let newTotalPrice: number;

      if (mode === "add") {
        // Add to existing quantity
        newQuantity = (existingItem.quantity || 1) + (item.quantity || 1);
        newTotalPrice = (existingItem.totalPrice || 0) + (item.totalPrice || 0);
      } else {
        // Set new quantity
        newQuantity = item.quantity || 1;
        newTotalPrice = item.totalPrice || 0;
      }

      await collection.updateOne(
        {
          _id: new ObjectId(cartId),
          "items._id": existingItem._id,
        },
        {
          $set: {
            [`items.$.quantity`]: newQuantity,
            [`items.$.totalPrice`]: newTotalPrice,
            updatedAt: new Date(),
          },
        }
      );

      return {
        isNew: false,
        message: `Updated ${item.name} quantity to ${newQuantity} (Total: $${newTotalPrice})`,
      };
    } else {
      // Add new item
      const itemWithId = {
        ...item,
        _id: new ObjectId().toString(),
        quantity: item.quantity || 1,
      };

      await collection.updateOne(
        { _id: new ObjectId(cartId) },
        {
          $push: { items: itemWithId },
          $set: { updatedAt: new Date() },
        }
      );

      return {
        isNew: true,
        message: `Added new item: ${item.name} to cart`,
      };
    }
  } catch (error) {
    console.error("Error in addOrUpdateCartItem:", error);
    throw error;
  }
};

export const removeItemFromCart = async (
  db: Db,
  cartId: string,
  itemId: string
): Promise<void> => {
  const collection = db.collection<Cart>("carts");

  await collection.updateOne(
    { _id: new ObjectId(cartId) },
    {
      $pull: { items: { _id: itemId } },
      $set: { updatedAt: new Date() },
    }
  );
};

// ✅ NEW: Remove item by name (more user-friendly)
export const removeItemFromCartByName = async (
  db: Db,
  cartId: string,
  itemName: string
): Promise<boolean> => {
  const collection = db.collection<Cart>("carts");

  const result = await collection.updateOne(
    { _id: new ObjectId(cartId) },
    {
      $pull: {
        items: {
          name: { $regex: new RegExp(itemName, "i") }, // case-insensitive
        },
      },
      $set: { updatedAt: new Date() },
    }
  );

  return result.modifiedCount > 0;
};

export const updateCartItemQuantity = async (
  db: Db,
  cartId: string,
  itemId: string,
  newQuantity: number
): Promise<void> => {
  const collection = db.collection<Cart>("carts");

  await collection.updateOne(
    {
      _id: new ObjectId(cartId),
      "items._id": itemId,
    },
    {
      $set: {
        "items.$.quantity": newQuantity,
        updatedAt: new Date(),
      },
    }
  );
};

export const updateCartStatus = async (
  db: Db,
  cartId: string,
  status: "active" | "checked_out" | "abandoned"
): Promise<void> => {
  const collection = db.collection<Cart>("carts");

  await collection.updateOne(
    { _id: new ObjectId(cartId) },
    {
      $set: { status, updatedAt: new Date() },
    }
  );
};

export const clearCartItems = async (db: Db, cartId: string): Promise<void> => {
  const collection = db.collection<Cart>("carts");

  await collection.updateOne(
    { _id: new ObjectId(cartId) },
    {
      $set: {
        items: [],
        updatedAt: new Date(),
      },
    }
  );
};

// ================== DELETE ==================
export const deleteCart = async (db: Db, cartId: string): Promise<void> => {
  const collection = db.collection<Cart>("carts");

  await collection.deleteOne({
    _id: new ObjectId(cartId),
  });
};

export const deleteAllUserCarts = async (
  db: Db,
  userId: string
): Promise<number> => {
  const collection = db.collection<Cart>("carts");

  const result = await collection.deleteMany({ userId });
  return result.deletedCount;
};

// Close MongoDB connection
export const closeMongoConnection = async (
  client: MongoClient
): Promise<void> => {
  await client.close();
  console.log("Disconnected from MongoDB");
};
