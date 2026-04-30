import { HttpError } from "./errors.ts";

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function toUint8Array(value: string | ArrayBuffer | Uint8Array) {
  if (typeof value === "string") {
    return textEncoder.encode(value);
  }

  if (value instanceof Uint8Array) {
    return value;
  }

  return new Uint8Array(value);
}

export function stableStringify(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortValue);
  }

  if (value && typeof value === "object" && !(value instanceof Date)) {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((accumulator, key) => {
        accumulator[key] = sortValue((value as Record<string, unknown>)[key]);
        return accumulator;
      }, {});
  }

  return value;
}

export async function sha256Hex(value: string | ArrayBuffer | Uint8Array) {
  const digest = await crypto.subtle.digest("SHA-256", toUint8Array(value));
  return Array.from(new Uint8Array(digest))
    .map((part) => part.toString(16).padStart(2, "0"))
    .join("");
}

export async function sha256Bytes32(value: string | ArrayBuffer | Uint8Array) {
  const hex = await sha256Hex(value);
  return `0x${hex}`;
}

function bytesToBase64(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes));
}

function base64ToBytes(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function deriveSecretKey() {
  const rawSecret = Deno.env.get("FORG3T_SECRET_ENCRYPTION_KEY");

  if (!rawSecret) {
    throw new HttpError(500, "Missing FORG3T_SECRET_ENCRYPTION_KEY");
  }

  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    textEncoder.encode(rawSecret),
    "PBKDF2",
    false,
    ["deriveKey"],
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: textEncoder.encode("forg3t-integrations"),
      iterations: 150_000,
      hash: "SHA-256",
    },
    keyMaterial,
    {
      name: "AES-GCM",
      length: 256,
    },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encryptSecret(secret: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveSecretKey();
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv,
    },
    key,
    textEncoder.encode(secret),
  );

  return {
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
    iv: bytesToBase64(iv),
  };
}

export async function decryptSecret(ciphertext: string, iv: string) {
  const key = await deriveSecretKey();
  const plaintext = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: base64ToBytes(iv),
    },
    key,
    base64ToBytes(ciphertext),
  );

  return textDecoder.decode(plaintext);
}
