const DEBUG = true;
const log = (...args) => DEBUG && console.log(...args);

log(app.config);
let TOKEN;
const { network, tokenMintDevnet, tokenMintMainnet } = app.config;
const tokenMint = network === "mainnet" ? tokenMintMainnet : tokenMintDevnet;
TOKEN = tokenMint;


if (world.isServer) {

  const solana = app.solana();
  let token;

  async function init() {
    log("Server init");

    app.on('signature', async ([sig, msg], playerId) => {
      const address = world.getPlayer(playerId)?.solana
      if (!address) throw new Error('no address!')

      // log('validating signature', sig, 'from', address, `(${playerId})`)
      // log('msg:', msg)

      const res = await solana.validateSignature(address, msg, sig)
      console.log(res)
      try {
        const bal = await token.getServerBalance(playerId)
        console.log(bal)
      } catch (e) {
        console.error(e)
      }

    })

    if (!solana?.connection) {
      log("No Solana connection for server balance");
      throw new Error("init failed");
    }

    token = await solana.programs.token(TOKEN);
    if (!token) throw new Error("token not found");

    token.onTransaction((info) => {
      console.log("caught token transaction on scripts!");
      console.log(info);
    });

    // await token.syncTokenBalances()
  }

  init();

  app.on(
    "client:transfer",
    async ([fromApp, amount, to, playerAddress], playerId) => {
      log("transfer notification received:", { amount, playerAddress });
      // we should get tx hash also :think:

      app.emit(`spl_token:${TOKEN}:server:transfer_confirmed`, [
        fromApp,
        amount,
        to,
        playerAddress,
      ]);
    }
  );

  app.on("withdraw_request", async (amount, playerId) => {
    log("request from", playerId);

    // const playerBalance = await token.getServerBalance(playerId);
    const tx = await token.withdrawTokens(playerId, amount)
    log(tx);
    app.sendTo(playerId, "withdraw_finished", tx)
  });

  app.on("deposit_request", async (amount, playerId) => {
    app.sendTo(playerId, "deposit_request", [app.instanceId, amount])
  });

  world.on(
    `spl_token:${TOKEN}:deposit_request`,
    ([fromApp, playerId, amount]) => {
      console.log({ fromApp, amount });
      log(
        `spl_token:${TOKEN}:deposit_request:received from ${fromApp}, amount ${amount}`
      );
      app.sendTo(playerId, "deposit_request", [fromApp, amount]);
    }
  );

  app.on('connected', (_, playerId) => {
    app.sendTo(playerId, "server:wallet", solana.publicKey);
  })
}

if (world.isClient) {
  log("Client initialized");

  const player = world.getPlayer();

  let token;
  let serverAddress = null;
  let solana;

  async function init() {
    solana = app.solana();
    console.log("init solana", solana);
    if (!solana?.connection || !player.solana) {
      console.log({ player: player.solana });
      log("No Solana connection for client");
      return;
    }

    token = await solana.programs.token(TOKEN);
    if (!token) throw new Error("error fetching token");

    const balance = token.balance
    console.log({ address: player.solana, balance })
  }

  init();

  app.on("server:wallet", address => {
    log('Received server wallet info:', { address });
    serverAddress = address;
  });
  app.send('connected')

  function startTransferOperation(fromApp, amount, to) {
    log("Starting transfer operation");
    return new Promise(async (resolve, reject) => {
      if (!solana?.connection) {
        log("No Solana connection for transfer");
        reject(new Error("No Solana connection"));
        return;
      }

      app.emit(`spl_token:${TOKEN}:transfer:start`), [fromApp, amount, to];

      try {
        // Get the token object first using the new API
        if (!token) token = await solana.programs.token(TOKEN);

        log("token transfer to:", { to, amount });
        const transferResult = await token.transfer(to, amount);

        if (transferResult.success) {
          log("Transfer successful");
          app.send(`client:transfer`, [fromApp, amount, to, player.solana]);
          app.emit(`spl_token:${TOKEN}:transfer:success`, [
            fromApp,
            amount,
            to,
            player.solana,
          ]);
          resolve();
        } else {
          log("Transfer failed:", transferResult.error);
          app.emit(`spl_token:${TOKEN}:transfer:error`, transferResult.error);
          reject(new Error(transferResult.error));
        }
      } catch (error) {
        log("Transfer failed:", error);
        app.emit(`spl_token:${TOKEN}:transfer:error`, error);
        reject(error);
      }
    });
  }

  // app.on(`transfer_request`, ([fromApp, amount, to]) => {
  //   startTransferOperation(fromApp, amount, to);
  // });
  app.on(`deposit_request`, ([fromApp, amount]) => {
    if (serverAddress == null) throw new Error("server wallet not set!");
    log("Starting deposit operation");

    startTransferOperation(fromApp, amount, serverAddress)
  })

  world.on(`spl_token:${TOKEN}:deposit_request`, (amount) => {
    app.send('deposit_request', amount)
  })

  //only on 'active' mode
  world.on(`spl_token:${TOKEN}:withdraw_request`, (amount) => {
    app.send('withdraw_request', amount)
  })

  world.on("solana", ({ playerId }) => {
    const solPlayer = world.getPlayer(playerId);
    console.log({ player, solPlayer });
    if (player.id === solPlayer.id) {
      // console.log("new wallet, fetching balance");
    }
  });
}


app.configure(() => {
  return [
    {
      key: "solana",
      type: "section",
      label: "Solana Settings",
    },
    {
      key: "network",
      type: "switch",
      label: "Network",
      options: [
        { label: "mainnet", value: "mainnet" },
        { label: "devnet", value: "devnet" },
      ],
      defaultValue: "devnet",
    },
    {
      key: "tokenMintMainnet",
      type: "text",
      label: "Mainnet Token Mint",
    },
    {
      key: "tokenMintDevnet",
      type: "text",
      label: "Devnet Token Mint",
    },
    {
      key: "withdrawAmount",
      type: "number",
      label: "Withdraw Amount",
    },
    {
      key: "withdrawButton",
      type: "button",
      label: "Withdraw",
      onClick: () => {
        app.send("withdraw_request", app.config.withdrawAmount);
      },
    },
    {
      key: "depositAmount",
      type: "number",
      label: "Deposit Amount",
    },
    {
      key: "depositButton",
      type: "button",
      label: "Deposit",
      onClick: () => {
        app.send("deposit_request", app.config.depositAmount);
        // startTransferOperation(app.instanceId, app.config.depositAmount, serverAddress)
      },
    },
    {
      key: "signButton",
      type: "button",
      label: "Sign",
      onClick: async () => {
        const msg = 'hello world!'
        const res = await app.solana().sign(msg)
        if (!res.success) throw new Error('signature error')
        console.log(res)
        app.send('signature', [res.signature, msg])
      },
    },
  ];
});