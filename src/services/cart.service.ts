import { Db, ObjectId } from "mongodb";
import { CartModel } from "../models/cart.mongo.js";
import { CartItem } from "../types.js";

export const CartService = (db: Db) => {
  const cartModel = CartModel(db);

  const createCartForUser = async (userId: string) => {
    const activeCart = await cartModel.findActiveByUser(userId);
    if (activeCart) return activeCart._id!.toString();

    return await cartModel.create({
      userId,
      status: "active",
      items: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  };

  const addOrUpdateItem = async (
    cartId: string,
    item: CartItem,
    mode: "add" | "set" = "add"
  ) => {
    const cart = await cartModel.findById(cartId);
    if (!cart) throw new Error("Cart not found");

    const existingIndex = cart.items.findIndex(
      (i) =>
        i.name.toLowerCase() === item.name.toLowerCase() && i.type === item.type
    );

    if (existingIndex !== -1) {
      const existingItem = cart.items[existingIndex];
      let newQuantity: number;
      let newTotalPrice: number;

      if (mode === "add") {
        newQuantity = (existingItem.quantity || 1) + (item.quantity || 1);
        newTotalPrice = (existingItem.totalPrice || 0) + (item.totalPrice || 0);
      } else {
        newQuantity = item.quantity || 1;
        newTotalPrice = item.totalPrice || 0;
      }

      cart.items[existingIndex].quantity = newQuantity;
      cart.items[existingIndex].totalPrice = newTotalPrice;
      await cartModel.update(cartId, { items: cart.items });

      return {
        isNew: false,
        message: `Updated ${item.name} quantity to ${newQuantity}`,
      };
    } else {
      const newItem = {
        ...item,
        _id: new ObjectId().toString(),
        quantity: item.quantity || 1,
      };
      await cartModel.addItem(cartId, newItem);
      return { isNew: true, message: `Added new item ${item.name}` };
    }
  };

  const decreaseItem = async (
    cartId: string,
    itemId: string,
    amount: number = 1
  ) => {
    const cart = await cartModel.findById(cartId);
    if (!cart) return { success: false };

    const item = cart.items.find((i) => i._id === itemId);
    if (!item) return { success: false };

    const newQuantity = (item.quantity || 1) - amount;
    if (newQuantity <= 0) {
      await cartModel.removeItem(cartId, itemId);
      return { success: true, action: "removed" };
    }

    item.quantity = newQuantity;
    item.totalPrice =
      (item.totalPrice! / (item.quantity! + amount)) * newQuantity;
    await cartModel.update(cartId, { items: cart.items });
    return { success: true, action: "decreased" };
  };

  return { createCartForUser, addOrUpdateItem, decreaseItem };
};
