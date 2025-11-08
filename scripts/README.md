# Orderly Account Creation

Creates an Orderly Network testnet account and API credentials.

## Setup

```bash
cd scripts
pnpm install
```

## Usage

```bash
export EOA_PRIVATE_KEY=0x...
pnpm run create-account
```

## What it does

1. Fetches registration nonce
2. Signs EIP-712 registration message
3. Registers account → gets Account ID
4. Generates ed25519 key pair
5. Adds Orderly key to account
6. Saves credentials to `../.env`

## Output

Saves to root `.env`:
- `ORDERLY_ACCOUNT_ID`
- `ORDERLY_PUBLIC_KEY`
- `ORDERLY_SECRET_KEY`

## Details

- Network: Arbitrum Sepolia (421614)
- API: https://testnet-api-evm.orderly.org
- Broker: woofi_pro
