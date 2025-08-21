import { Db, ObjectId } from "mongodb";
import { Cart, CartItem } from "../types.js";

export const CartModel = (db: Db) => {
  const collection = db.collection<Cart>("carts");

  const create = async (cart: Omit<Cart, "_id">) => {
    const result = await collection.insertOne({ ...cart, _id: new ObjectId() });
    return result.insertedId.toString();
  };

  const findActiveByUser = async (userId: string) => {
    return await collection.findOne({ userId, status: "active" });
  };

  const findById = async (cartId: string) => {
    return await collection.findOne({ _id: new ObjectId(cartId) });
  };

  const update = async (cartId: string, data: Partial<Cart>) => {
    await collection.updateOne(
      { _id: new ObjectId(cartId) },
      { $set: { ...data, updatedAt: new Date() } }
    );
  };

  const deleteCart = async (cartId: string) => {
    await collection.deleteOne({ _id: new ObjectId(cartId) });
  };

  const addItem = async (cartId: string, item: CartItem) => {
    await collection.updateOne(
      { _id: new ObjectId(cartId) },
      { $push: { items: item }, $set: { updatedAt: new Date() } }
    );
  };

  const removeItem = async (cartId: string, itemId: string) => {
    await collection.updateOne(
      { _id: new ObjectId(cartId) },
      { $pull: { items: { _id: itemId } }, $set: { updatedAt: new Date() } }
    );
  };

  return {
    create,
    findActiveByUser,
    findById,
    update,
    deleteCart,
    addItem,
    removeItem,
  };
};
