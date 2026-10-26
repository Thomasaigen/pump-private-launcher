export const snapshots = {
  "earlier": {
    "mode": "offline-simulation",
    "description": "Synthetic snapshot illustrating different launch and migration identities. Not blockchain data or Axiom backend code.",
    "selectedWallet": "wallet_a",
    "wallets": [
      {
        "id": "wallet_a",
        "label": "My selected wallet",
        "publicAddress": ""
      },
      {
        "id": "wallet_b",
        "label": "My test wallet 2",
        "publicAddress": ""
      },
      {
        "id": "wallet_c",
        "label": "My test wallet 3",
        "publicAddress": ""
      },
      {
        "id": "wallet_d",
        "label": "My test wallet 4",
        "publicAddress": ""
      }
    ],
    "tokens": [
      {
        "id": "sample_1",
        "name": "Sample token 1",
        "launchWallet": "wallet_b",
        "protocolCreator": "wallet_b",
        "deployerAddress": "wallet_a",
        "pumpDeployerAddress": "wallet_b",
        "migrationUser": "wallet_a",
        "migrated": true
      },
      {
        "id": "sample_2",
        "name": "Sample token 2",
        "launchWallet": "wallet_c",
        "protocolCreator": "wallet_c",
        "deployerAddress": "wallet_a",
        "pumpDeployerAddress": "wallet_c",
        "migrationUser": "wallet_a",
        "migrated": true
      },
      {
        "id": "sample_3",
        "name": "Sample token 3",
        "launchWallet": "wallet_d",
        "protocolCreator": "wallet_d",
        "deployerAddress": "wallet_a",
        "pumpDeployerAddress": "wallet_d",
        "migrationUser": "wallet_a",
        "migrated": true
      },
      {
        "id": "sample_4",
        "name": "Selected wallet's launch",
        "launchWallet": "wallet_a",
        "protocolCreator": "wallet_b",
        "deployerAddress": "wallet_a",
        "migrated": false
      }
    ]
  },
  "later": {
    "mode": "offline-simulation",
    "description": "Synthetic later snapshot with two additional unmigrated launches.",
    "selectedWallet": "wallet_a",
    "wallets": [
      {
        "id": "wallet_a",
        "label": "My selected wallet",
        "publicAddress": ""
      },
      {
        "id": "wallet_b",
        "label": "My test wallet 2",
        "publicAddress": ""
      },
      {
        "id": "wallet_c",
        "label": "My test wallet 3",
        "publicAddress": ""
      },
      {
        "id": "wallet_d",
        "label": "My test wallet 4",
        "publicAddress": ""
      }
    ],
    "tokens": [
      {
        "id": "sample_1",
        "name": "Sample token 1",
        "launchWallet": "wallet_b",
        "protocolCreator": "wallet_b",
        "deployerAddress": "wallet_a",
        "pumpDeployerAddress": "wallet_b",
        "migrationUser": "wallet_a",
        "migrated": true
      },
      {
        "id": "sample_2",
        "name": "Sample token 2",
        "launchWallet": "wallet_c",
        "protocolCreator": "wallet_c",
        "deployerAddress": "wallet_a",
        "pumpDeployerAddress": "wallet_c",
        "migrationUser": "wallet_a",
        "migrated": true
      },
      {
        "id": "sample_3",
        "name": "Sample token 3",
        "launchWallet": "wallet_d",
        "protocolCreator": "wallet_d",
        "deployerAddress": "wallet_a",
        "pumpDeployerAddress": "wallet_d",
        "migrationUser": "wallet_a",
        "migrated": true
      },
      {
        "id": "sample_4",
        "name": "Selected wallet's launch",
        "launchWallet": "wallet_a",
        "protocolCreator": "wallet_b",
        "deployerAddress": "wallet_a",
        "migrated": false
      },
      {
        "id": "sample_5",
        "name": "Additional sample launch 1",
        "launchWallet": "wallet_a",
        "protocolCreator": "wallet_b",
        "deployerAddress": "wallet_a",
        "migrated": false
      },
      {
        "id": "sample_6",
        "name": "Additional sample launch 2",
        "launchWallet": "wallet_a",
        "protocolCreator": "wallet_b",
        "deployerAddress": "wallet_a",
        "migrated": false
      }
    ]
  }
};
