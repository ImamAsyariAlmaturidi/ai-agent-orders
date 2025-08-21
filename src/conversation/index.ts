import { Db, ObjectId } from "mongodb";

export const ConversationManager = (db: Db) => {
  const getOrCreateConversation = async (sessionId: string, userId: string) => {
    const conversationId = sessionId || new ObjectId().toString();
    const existing = await db
      .collection("conversations")
      .findOne({ _id: new ObjectId(conversationId) });
    if (!existing) {
      await db.collection("conversations").insertOne({
        _id: new ObjectId(conversationId),
        userId,
        history: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }
    return conversationId;
  };

  const addMessage = async (
    conversationId: string,
    role: string,
    content: string,
    metadata?: any
  ) => {
    await db
      .collection("conversations")
      .updateOne(
        { _id: new ObjectId(conversationId) },
        {
          $push: {
            history: { role, content, timestamp: new Date(), ...metadata },
          },
          $set: { updatedAt: new Date() },
        }
      );
  };

  const getHistory = async (conversationId: string, limit = 20) => {
    const conversation = await db
      .collection("conversations")
      .findOne({ _id: new ObjectId(conversationId) });
    return (conversation?.history || []).slice(-limit);
  };

  return { getOrCreateConversation, addMessage, getHistory };
};
