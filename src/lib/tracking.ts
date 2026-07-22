import { db } from './firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

export type InteractionType = 'like' | 'save' | 'click' | 'view' | 'comment';

export async function trackInteraction(userId: string, itemId: string, itemType: 'post' | 'video' | 'marketItem', type: InteractionType, metadata?: any) {
  try {
    await addDoc(collection(db, 'userInteractions'), {
      userId,
      itemId,
      itemType,
      type,
      metadata,
      createdAt: serverTimestamp()
    });
  } catch (error) {
    console.error("Error tracking interaction:", error);
  }
}
