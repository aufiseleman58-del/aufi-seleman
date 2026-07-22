import libsodium from 'libsodium-wrappers';

// E2EE Service for Zathu Social
// Uses libsodium (X25519) for key exchange and sealed boxes

export async function initEncryption() {
  await libsodium.ready;
}

export interface KeyPair {
  publicKey: string; // Base64
  privateKey: string; // Base64
}

/**
 * Generates a new X25519 keypair for the user
 */
export async function generateKeyPair(): Promise<KeyPair> {
  await libsodium.ready;
  const pair = libsodium.crypto_box_keypair();
  return {
    publicKey: libsodium.to_base64(pair.publicKey),
    privateKey: libsodium.to_base64(pair.privateKey),
  };
}

/**
 * Encrypts a message for a specific recipient using their public key.
 * This uses a "Sealed Box" which provides anonymity for the sender.
 */
export async function encryptForRecipient(message: string, recipientPublicKeyBase64: string): Promise<string> {
  await libsodium.ready;
  const recipientPubKey = libsodium.from_base64(recipientPublicKeyBase64);
  const encrypted = libsodium.crypto_box_seal(message, recipientPubKey);
  return libsodium.to_base64(encrypted);
}

/**
 * Decrypts a sealed box message using the user's private key.
 */
export async function decryptMessage(encryptedMessageBase64: string, myKeyPair: KeyPair): Promise<string> {
  await libsodium.ready;
  const encrypted = libsodium.from_base64(encryptedMessageBase64);
  const myPubKey = libsodium.from_base64(myKeyPair.publicKey);
  const myPrivKey = libsodium.from_base64(myKeyPair.privateKey);
  
  try {
    const decrypted = libsodium.crypto_box_seal_open(encrypted, myPubKey, myPrivKey);
    return libsodium.to_string(decrypted);
  } catch (e) {
    // If decryption fails, it's often due to a key mismatch (e.g. message for a different keypair)
    console.warn("Sealed box decryption failed. Likely incorrect key pair.");
    return "[Message Encrypted for different Key Pair]";
  }
}

/**
 * For two-way E2EE where both sender and receiver can see the message.
 * We'll use a shared secret derived from the sender's private key and recipient's public key.
 */
export async function encryptShared(message: string, senderPrivateKeyBase64: string, recipientPublicKeyBase64: string): Promise<{ ciphertext: string; nonce: string }> {
  await libsodium.ready;
  const senderPrivKey = libsodium.from_base64(senderPrivateKeyBase64);
  const recipientPubKey = libsodium.from_base64(recipientPublicKeyBase64);
  
  const nonce = libsodium.randombytes_buf(libsodium.crypto_box_NONCEBYTES);
  const ciphertext = libsodium.crypto_box_easy(message, nonce, recipientPubKey, senderPrivKey);
  
  return {
    ciphertext: libsodium.to_base64(ciphertext),
    nonce: libsodium.to_base64(nonce)
  };
}

export async function decryptShared(ciphertextBase64: string, nonceBase64: string, myPrivateKeyBase64: string, otherPublicKeyBase64: string): Promise<string> {
  await libsodium.ready;
  try {
    const myPrivKey = libsodium.from_base64(myPrivateKeyBase64);
    const otherPubKey = libsodium.from_base64(otherPublicKeyBase64);
    const ciphertext = libsodium.from_base64(ciphertextBase64);
    const nonce = libsodium.from_base64(nonceBase64);
    
    const decrypted = libsodium.crypto_box_open_easy(ciphertext, nonce, otherPubKey, myPrivKey);
    return libsodium.to_string(decrypted);
  } catch (e) {
    console.warn("Shared decryption failed. Likely incorrect key pair or modified ciphertext.");
    return "[Message Encrypted for different Key Pair]";
  }
}
