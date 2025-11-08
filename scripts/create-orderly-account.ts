import { ethers } from "ethers";
import * as ed from "@noble/ed25519";
import fetch from "node-fetch";
import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import { fileURLToPath } from "url";

// Setup sha512 for ed25519
ed.etc.sha512Sync = (...m) => crypto.createHash("sha512").update(Buffer.concat(m)).digest();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE = "https://testnet-api-evm.orderly.org";
const BROKER_ID = "woofi_pro";
const CHAIN_TYPE = "EVM";
const CHAIN_ID = 421614; // Arbitrum Sepolia

const DOMAIN = {
  name: "Orderly",
  version: "1",
  chainId: CHAIN_ID,
  verifyingContract: "0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC",
};

const REGISTER_TYPES = {
  Registration: [
    { name: "brokerId", type: "string" },
    { name: "chainId", type: "uint256" },
    { name: "timestamp", type: "uint64" },
    { name: "registrationNonce", type: "uint256" },
  ],
};

const ADD_KEY_TYPES = {
  AddOrderlyKey: [
    { name: "brokerId", type: "string" },
    { name: "chainId", type: "uint256" },
    { name: "orderlyKey", type: "string" },
    { name: "scope", type: "string" },
    { name: "timestamp", type: "uint64" },
    { name: "expiration", type: "uint64" },
  ],
};

function toBase64Url(bytes: Uint8Array): string {
  const b64 = Buffer.from(bytes).toString("base64");
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function getNonce(): Promise<string> {
  console.log("Fetching registration nonce...");
  const res = await fetch(`${BASE}/v1/registration_nonce`);

  if (!res.ok) {
    throw new Error(`Failed to get nonce: ${res.status}`);
  }

  const data: any = await res.json();
  const nonce = data?.data?.registration_nonce as string;

  if (!nonce) {
    throw new Error("No nonce in response");
  }

  console.log(`Nonce: ${nonce}\n`);
  return nonce;
}

async function getAccountId(address: string): Promise<string> {
  const res = await fetch(`${BASE}/v1/get_account?address=${address}&broker_id=${BROKER_ID}`);

  if (!res.ok) {
    throw new Error(`Failed to get account: ${res.status}`);
  }

  const data: any = await res.json();
  const accountId = data?.data?.account_id as string;

  if (!accountId) {
    throw new Error(`No account_id for address: ${address}`);
  }

  console.log(`Account ID: ${accountId}\n`);
  return accountId;
}

async function register(wallet: ethers.Wallet): Promise<string> {
  const nonce = await getNonce();
  const timestamp = Math.floor(Date.now());

  const message = {
    brokerId: BROKER_ID,
    chainId: CHAIN_ID,
    timestamp,
    registrationNonce: nonce,
  };

  console.log("Signing registration...");
  const signature = await wallet.signTypedData(DOMAIN, REGISTER_TYPES, message);
  console.log(`Signature: ${signature.substring(0, 20)}...\n`);

  console.log("Registering account...");
  const res = await fetch(`${BASE}/v1/register_account`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message,
      signature,
      userAddress: wallet.address,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Registration failed: ${res.status} ${text}`);
  }

  const data: any = await res.json();

  // Account already exists
  if (data.code === -1604) {
    console.log("Account already exists, fetching account ID...\n");
    return getAccountId(wallet.address);
  }

  const accountId = data?.data?.account_id as string;

  if (!accountId) {
    throw new Error(`No account_id in response: ${JSON.stringify(data)}`);
  }

  console.log(`Account registered: ${accountId}\n`);
  return accountId;
}

async function addKey(wallet: ethers.Wallet): Promise<{ publicKey: string; secretKey: string }> {
  console.log("Generating ed25519 key pair...");
  const secretKey = ed.utils.randomPrivateKey();
  const publicKey = await ed.getPublicKey(secretKey);

  const pkBase64Url = toBase64Url(publicKey);
  console.log(`Public key: ${pkBase64Url.substring(0, 20)}...\n`);

  const now = Math.floor(Date.now());
  const expiration = now + 365 * 24 * 60 * 60 * 1000;

  const message = {
    brokerId: BROKER_ID,
    chainId: CHAIN_ID,
    orderlyKey: `ed25519:${pkBase64Url}`,
    scope: "trading",
    timestamp: now,
    expiration,
  };

  console.log("Signing add key...");
  const signature = await wallet.signTypedData(DOMAIN, ADD_KEY_TYPES, message);
  console.log(`Signature: ${signature.substring(0, 20)}...\n`);

  console.log("Adding Orderly key...");
  const res = await fetch(`${BASE}/v1/orderly_key`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message,
      signature,
      userAddress: wallet.address,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Add key failed: ${res.status} ${text}`);
  }

  console.log("Orderly key added!\n");

  return {
    publicKey: pkBase64Url,
    secretKey: toBase64Url(secretKey),
  };
}

function saveToEnv(accountId: string, publicKey: string, secretKey: string): void {
  const envPath = path.join(__dirname, "..", ".env");
  const content = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf-8") : "";

  const updates: Record<string, string> = {
    ORDERLY_ACCOUNT_ID: accountId,
    ORDERLY_PUBLIC_KEY: publicKey,
    ORDERLY_SECRET_KEY: secretKey,
  };

  const newContent = Object.entries(updates).reduce((acc, [key, value]) => {
    const regex = new RegExp(`^${key}=.*$`, "m");
    return regex.test(acc)
      ? acc.replace(regex, `${key}=${value}`)
      : acc + `\n${key}=${value}`;
  }, content);

  fs.writeFileSync(envPath, newContent.trim() + "\n");
  console.log("Credentials saved to .env\n");
}

async function main() {
  const privateKey = process.env.EOA_PRIVATE_KEY || "";

  if (!privateKey) {
    console.error("Error: EOA_PRIVATE_KEY environment variable required\n");
    console.log("Usage:");
    console.log("  export EOA_PRIVATE_KEY=0x...");
    console.log("  pnpm run create-account\n");
    process.exit(1);
  }

  const wallet = new ethers.Wallet(privateKey);

  console.log("\nStarting Orderly Network Account Creation");
  console.log("==========================================");
  console.log(`Wallet: ${wallet.address}`);
  console.log(`Chain: ${CHAIN_TYPE} (${CHAIN_ID})`);
  console.log(`Broker: ${BROKER_ID}`);
  console.log(`API: ${BASE}\n`);

  const accountId = await register(wallet);
  const { publicKey, secretKey } = await addKey(wallet);

  saveToEnv(accountId, publicKey, secretKey);

  console.log("==========================================");
  console.log("Account creation completed!\n");
  console.log("Credentials:");
  console.log(`  Account ID:  ${accountId}`);
  console.log(`  Public Key:  ${publicKey.substring(0, 30)}...`);
  console.log(`  Secret Key:  ${secretKey.substring(0, 30)}...\n`);
  console.log("Next steps:");
  console.log("  1. Get testnet USDC from faucet");
  console.log("  2. Run: pnpm run dev:trader\n");
}

main().catch((error) => {
  console.error("\nError:", error);
  process.exit(1);
});
