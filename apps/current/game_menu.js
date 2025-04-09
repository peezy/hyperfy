function shouldUseDarkText(backgroundColor) {
  const match = backgroundColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!match) return false;

  const r = parseInt(match[1]);
  const g = parseInt(match[2]);
  const b = parseInt(match[3]);

  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5;
}

app.configure([
  {
    type: 'section',
    key: 'layout',
    label: 'Layout',
  },
  {
    type: 'text',
    key: 'leaderboardTitle',
    label: 'Title',
    placeholder: 'Enter Title',
    initial: 'Financial Dashboard',
  },
  {
    type: 'button',
    key: 'dimensionPresets',
    label: 'Display Size',
    buttons: [
      {
        label: 'Portrait Small',
        value: { width: 300, height: 500 }
      },
      {
        label: 'Portrait Large',
        value: { width: 400, height: 600 }
      },
      {
        label: 'Landscape Small',
        value: { width: 600, height: 300 }
      },
      {
        label: 'Landscape Large',
        value: { width: 800, height: 400 }
      }
    ],
    initial: { width: 400, height: 500 }
  },
  {
    type: 'dropdown',
    key: 'colorTheme',
    label: 'Theme',
    options: [
      {
        label: 'Modern',
        value: 'modern'
      },
      {
        label: 'Classic',
        value: 'classic'
      },
      {
        label: 'Vintage',
        value: 'vintage'
      },
      {
        label: 'Cyberpunk',
        value: 'cyberpunk'
      },
      {
        label: 'Slate',
        value: 'slate'
      },
      {
        label: 'Neon',
        value: 'neon'
      },
      {
        label: 'Hyperfy',
        value: 'hyperfy'
      }, {
        label: 'gridneon',
        value: 'gridneon'
      }
    ],
    initial: 'modern'
  },
  {
    type: 'range',
    key: 'backgroundAlpha',
    label: 'Background Opacity',
    min: 0,
    max: 100,
    step: 1,
    initial: 100,
  },
  {
    type: 'toggle',
    key: 'clickable',
    label: 'Allow Clicking',
    initial: true,
  }
]);

if (world.isServer) return;

function getThemeColors(theme) {
  const themes = {
    modern: {
      backgroundColor: 'rgba(0, 0, 0, 0.7)',
      headerBackgroundColor: 'rgba(0, 0, 0, 0.8)',
      borderColor: 'rgba(255, 255, 255, 0.8)',
      textColor: 'rgba(255, 255, 255, 1)',
      textBorderColor: 'rgba(255, 255, 255, 0.6)',
      textBackgroundColor: 'rgba(0, 0, 0, 0.5)',
      lightTextColor: 'rgba(255, 255, 255, 1)',
      darkTextColor: 'rgba(255, 255, 255, 1)'
    },
    classic: {
      backgroundColor: 'rgba(0, 170, 255, 1)',
      headerBackgroundColor: 'rgba(0, 140, 210, 1)',
      borderColor: 'rgba(170, 255, 0, 1)',
      textColor: 'rgba(255, 170, 0, 1)',
      textBorderColor: 'rgba(170, 0, 255, 1)',
      textBackgroundColor: 'rgba(0, 0, 0, 0.5)',
      lightTextColor: 'rgba(255, 255, 255, 1)',
      darkTextColor: 'rgba(0, 0, 0, 1)'
    },
    vintage: {
      backgroundColor: 'rgba(142, 50, 63, 1)',
      headerBackgroundColor: 'rgba(112, 40, 53, 1)',
      borderColor: 'rgba(30, 54, 78, 1)',
      textColor: 'rgba(164, 153, 73, 1)',
      textBorderColor: 'rgba(65, 69, 77, 1)',
      textBackgroundColor: 'rgba(219, 126, 126, 0.5)',
      lightTextColor: 'rgba(255, 255, 255, 1)',
      darkTextColor: 'rgba(0, 0, 0, 1)'
    },
    cyberpunk: {
      backgroundColor: 'rgba(11, 36, 54, 1)',
      headerBackgroundColor: 'rgba(8, 28, 42, 1)',
      borderColor: 'rgba(0, 240, 255, 1)',
      textColor: 'rgba(0, 255, 242, 1)',
      textBorderColor: 'rgba(10, 255, 247, 1)',
      textBackgroundColor: 'rgba(0, 240, 255, 0.2)',
      lightTextColor: 'rgba(255, 255, 255, 1)',
      darkTextColor: 'rgba(0, 0, 0, 1)'
    },
    slate: {
      backgroundColor: 'rgba(30, 41, 59, 1)',
      headerBackgroundColor: 'rgba(23, 32, 46, 1)',
      borderColor: 'rgba(71, 85, 105, 1)',
      textColor: 'rgba(226, 232, 240, 1)',
      textBorderColor: 'rgba(100, 116, 139, 1)',
      textBackgroundColor: 'rgba(51, 65, 85, 0.6)',
      lightTextColor: 'rgba(255, 255, 255, 1)',
      darkTextColor: 'rgba(0, 0, 0, 1)'
    },
    neon: {
      backgroundColor: 'rgba(0, 0, 0, 1)',
      headerBackgroundColor: 'rgba(20, 20, 20, 1)',
      borderColor: 'rgba(0, 255, 0, 1)',
      textColor: 'rgba(255, 0, 255, 1)',
      textBorderColor: 'rgba(0, 255, 255, 1)',
      textBackgroundColor: 'rgba(255, 0, 255, 0.2)',
      lightTextColor: 'rgba(255, 255, 255, 1)',
      darkTextColor: 'rgba(0, 0, 0, 1)'
    },
    hyperfy: {
      backgroundColor: 'rgba(217, 4, 121, 1)',
      headerBackgroundColor: 'rgba(166, 28, 129, 1)',
      borderColor: 'rgba(41, 117, 217, 1)',
      textColor: 'rgba(142, 55, 166, 1)',
      textBorderColor: 'rgba(13, 13, 13, 1)',
      textBackgroundColor: 'rgba(13, 13, 13, 0.5)',
      lightTextColor: 'rgba(255, 255, 255, 1)',
      darkTextColor: 'rgba(13, 13, 13, 1)'
    },
    gridneon: {
      backgroundColor: 'rgba(15, 20, 40, 1)',
      headerBackgroundColor: 'rgba(10, 15, 35, 1)',
      borderColor: 'rgba(0, 200, 255, 1)',
      textColor: 'rgba(255, 50, 200, 1)',
      textBorderColor: 'rgba(0, 180, 255, 1)',
      textBackgroundColor: 'rgba(20, 25, 50, 0.7)',
      lightTextColor: 'rgba(230, 240, 255, 1)',
      darkTextColor: 'rgba(10, 15, 35, 1)'
    }
  };

  return themes[theme] || themes.classic;
}

let token;


const colors = getThemeColors(props.colorTheme);

// Mock financial data - in a real app, this would come from a backend
const financialData = {
  walletBalance: 0,
  serverBalance: 0,
  collectableCoins: 0
};

let trophyUI;
let trophyText = app.create('uitext', {
  value: '10 | 5 | 2',
  fontSize: 16,
  textAlign: 'center',
  color: colors.textColor,
});

function refreshMiniUIBalance() {
  const { walletBalance, serverBalance, collectableCoins } = financialData
  trophyText.value = `${serverBalance} | ${collectableCoins}`
}

async function init() {
  const solana = app.solana()

  if (!solana.connection) return;

  token = await solana.programs.token("EkxY8gCiyxTfLnZpUvQs6UMSHYykfrUXQj4iQE1X2e41")
  // console.log("foo", token.balance)
  financialData.walletBalance = token.balance
  refreshMiniUIBalance()
}


init()
world.on('balance', balance => {
  financialData.serverBalance = balance
  financialData.walletBalance = token?.balance || 0
  refreshMiniUIBalance()
})

let floatingCoinsMapObj;
world.on('floatingCoinsMap', coinsMap => {
  // financialData.collectableCoins = coins
  // refreshMiniUIBalance()
  floatingCoinsMapObj = coinsMap;
})

app.on('fixedUpdate', () => {
  if (!floatingCoinsMapObj) {
    app.emit('requestFloatingCoins')
  } else {
    financialData.collectableCoins = floatingCoinsMapObj?.size
    refreshMiniUIBalance()
  }
})



app.emit('requestBalance')


let mode = 'leaderboard'

function createLeaderboardUI() {
  mode = 'leaderboard'
  if (trophyUI) {
    app.remove(trophyUI);
  }

  const dimensions = { width: 400, height: 500 } //props.dimensionPresets;
  const uiWidth = dimensions.width;
  const uiHeight = dimensions.height;
  const colors = getThemeColors(props.colorTheme);
  const alpha = props.backgroundAlpha / 100;

  const mainBgColor = colors.backgroundColor.replace('1)', `${alpha})`);
  const headerBgColor = colors.headerBackgroundColor.replace('1)', `${alpha})`);

  const dashboard = app.create('ui', {
    width: uiWidth,
    height: uiHeight,
    res: 2,
    position: [0, 1, 0],
    offset: [20, -20, 0],
    space: 'screen',
    pivot: 'bottom-left',
    backgroundColor: mainBgColor,
    borderRadius: 12,
    borderColor: colors.borderColor,
    borderWidth: 2,
    padding: 10,
    pointerEvents: true,
    flexDirection: 'column',
    gap: 12,
  });

  // Auto-hide functionality using app.on('update')
  let lastInteractionTime = Date.now();
  let updateHandler;

  // Function to update the last interaction time
  const updateInteractionTime = () => {
    lastInteractionTime = Date.now();
  };

  // Create the update handler for auto-hide
  updateHandler = (dt) => {
    const currentTime = Date.now();
    const idleTime = currentTime - lastInteractionTime;

    if (idleTime > 1500) { // 3 seconds
      // Unsubscribe from update
      app.off('update', updateHandler);

      // Minimize dashboard
      dashboard.parent.remove(dashboard);
      createTrophyUI();
    }
  };

  // Start the auto-hide timer
  app.on('update', updateHandler);

  // Initial interaction time
  updateInteractionTime();

  // Add event listeners for mouse enter/leave
  dashboard.onPointerEnter = updateInteractionTime;
  dashboard.onPointerLeave = updateInteractionTime; // Still update time on leave, but countdown starts

  const titleHeight = Math.floor(uiHeight * 0.08);
  const dashboardTitle = app.create('uitext', {
    value: props.leaderboardTitle,
    fontSize: Math.min(24, titleHeight * 0.8),
    textAlign: 'center',
    color: colors.textColor,
    padding: 8,
    backgroundColor: colors.textBackgroundColor,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: colors.borderColor,
  });

  const minimizeButton = app.create('uitext', {
    value: '−',
    fontSize: 20,
    textAlign: 'center',
    color: colors.textColor,
    padding: 4,
    backgroundColor: mainBgColor,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.borderColor,
    position: 'absolute',
    top: 4,
    left: 4,
    onPointerDown: () => {
      // Unsubscribe from update
      app.off('update', updateHandler);

      dashboard.parent.remove(dashboard);
      createTrophyUI();
    },
    cursor: 'pointer'
  });

  // dashboard.add(minimizeButton);
  dashboard.add(dashboardTitle);

  // Balance display section
  const balanceContainer = app.create('uiview', {
    width: uiWidth - 20,
    height: Math.floor(uiHeight * 0.25),
    flexDirection: 'column',
    backgroundColor: headerBgColor,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.borderColor,
    padding: 10,
    gap: 10
  });

  function createBalanceRow(label, value) {
    const row = app.create('uiview', {
      width: uiWidth - 40,
      height: Math.floor(uiHeight * 0.06),
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: 2,
    });

    const labelText = app.create('uitext', {
      value: label,
      fontSize: 18,
      textAlign: 'left',
      color: colors.textColor,
    });

    const valueText = app.create('uitext', {
      value: value.toString(),
      fontSize: 18,
      textAlign: 'right',
      color: colors.textColor,
      padding: 6,
      backgroundColor: colors.textBackgroundColor,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.borderColor,
    });

    row.add(labelText);
    row.add(valueText);
    return row;
  }

  balanceContainer.add(createBalanceRow("Wallet Balance:", financialData.walletBalance));
  balanceContainer.add(createBalanceRow("Server Balance:", financialData.serverBalance));
  balanceContainer.add(createBalanceRow("Collectable Coins:", financialData.collectableCoins));

  dashboard.add(balanceContainer);

  // Deposit section
  const depositContainer = app.create('uiview', {
    width: uiWidth - 20,
    height: Math.floor(uiHeight * 0.3),
    flexDirection: 'column',
    backgroundColor: headerBgColor,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.borderColor,
    padding: 10,
    gap: 10
  });

  const depositHeader = app.create('uitext', {
    value: "Deposit",
    fontSize: 20,
    textAlign: 'center',
    color: colors.textColor,
  });

  const depositInputRow = app.create('uiview', {
    width: uiWidth - 40,
    height: Math.floor(uiHeight * 0.06),
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 2,
    gap: 5
  });

  const depositInputLabel = app.create('uitext', {
    value: "Amount:",
    fontSize: 16,
    textAlign: 'left',
    color: colors.textColor,
  });

  // Create percentage buttons for deposit
  const createPercentButton = (percent, container, isDeposit = true) => {
    const buttonValue = Math.floor(isDeposit ? financialData.walletBalance * (percent / 100) : financialData.serverBalance * (percent / 100));

    const button = app.create('uitext', {
      value: `${percent}%`,
      fontSize: 14,
      textAlign: 'center',
      color: colors.lightTextColor,
      backgroundColor: isDeposit ? 'rgba(0, 0, 0, 0.6)' : 'rgba(0, 0, 0, 0.6)',
      padding: 4,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.borderColor,
      cursor: 'pointer',
      width: Math.floor((uiWidth - 60) / 4),
      onPointerDown: () => {
        // Set the selected amount for deposit/withdrawal
        if (isDeposit) {
          depositSelectedAmount = buttonValue;
          depositButton.value = `Deposit ${buttonValue}`;
        } else {
          withdrawalSelectedAmount = buttonValue;
          withdrawalButton.value = `Withdraw ${buttonValue}`;
        }
        // Reset the interaction time
        updateInteractionTime();
      },
      onPointerEnter: updateInteractionTime,
      onPointerLeave: updateInteractionTime
    });

    container.add(button);
    return button;
  };

  const depositButtonsContainer = app.create('uiview', {
    width: uiWidth - 40,
    height: Math.floor(uiHeight * 0.06),
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 2,
    gap: 5
  });

  // Create deposit percentage buttons
  createPercentButton(25, depositButtonsContainer);
  createPercentButton(50, depositButtonsContainer);
  createPercentButton(75, depositButtonsContainer);
  createPercentButton(100, depositButtonsContainer);

  // Track selected amount
  let depositSelectedAmount = 0;

  const depositButton = app.create('uitext', {
    value: "Deposit 0",
    fontSize: 16,
    textAlign: 'center',
    color: colors.lightTextColor,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    padding: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.borderColor,
    cursor: 'pointer',
    onPointerDown: () => {
      // In a real app, this would handle the deposit action
      console.log('Deposit requested for:', depositSelectedAmount);

      // Update balances
      if (depositSelectedAmount > 0 && depositSelectedAmount <= financialData.walletBalance) {
        financialData.walletBalance -= depositSelectedAmount;
        financialData.serverBalance += depositSelectedAmount;

        // Update the display
        balanceContainer.children.forEach(row => {
          if (row.children[0].value === "Wallet Balance:") {
            row.children[1].value = financialData.walletBalance.toString();
          } else if (row.children[0].value === "Server Balance:") {
            row.children[1].value = financialData.serverBalance.toString();
          }
        });

        // Reset the deposit amount
        depositSelectedAmount = 0;
        depositButton.value = "Deposit 0";

        // Update the trophy UI text
        if (trophyUI) {
          trophyUI.children[0].value = `${financialData.walletBalance} | ${financialData.serverBalance} | ${financialData.collectableCoins}`;
        }
      }

      // Reset the interaction time
      updateInteractionTime();
    },
    onPointerEnter: updateInteractionTime,
    onPointerLeave: updateInteractionTime
  });

  depositInputRow.add(depositInputLabel);

  depositContainer.add(depositHeader);
  depositContainer.add(depositInputRow);
  depositContainer.add(depositButtonsContainer);
  depositContainer.add(depositButton);

  dashboard.add(depositContainer);

  // Withdrawal section
  const withdrawalContainer = app.create('uiview', {
    width: uiWidth - 20,
    height: Math.floor(uiHeight * 0.3),
    flexDirection: 'column',
    backgroundColor: headerBgColor,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.borderColor,
    padding: 10,
    gap: 10
  });

  const withdrawalHeader = app.create('uitext', {
    value: "Withdrawal",
    fontSize: 20,
    textAlign: 'center',
    color: colors.textColor,
  });

  const withdrawalInputRow = app.create('uiview', {
    width: uiWidth - 40,
    height: Math.floor(uiHeight * 0.06),
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 2,
    gap: 5
  });

  const withdrawalInputLabel = app.create('uitext', {
    value: "Amount:",
    fontSize: 16,
    textAlign: 'left',
    color: colors.textColor,
  });

  const withdrawalButtonsContainer = app.create('uiview', {
    width: uiWidth - 40,
    height: Math.floor(uiHeight * 0.06),
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 2,
    gap: 5
  });

  // Create withdrawal percentage buttons
  createPercentButton(25, withdrawalButtonsContainer, false);
  createPercentButton(50, withdrawalButtonsContainer, false);
  createPercentButton(75, withdrawalButtonsContainer, false);
  createPercentButton(100, withdrawalButtonsContainer, false);

  // Track selected amount
  let withdrawalSelectedAmount = 0;

  const withdrawalButton = app.create('uitext', {
    value: "Withdraw 0",
    fontSize: 16,
    textAlign: 'center',
    color: colors.lightTextColor,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    padding: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.borderColor,
    cursor: 'pointer',
    onPointerDown: () => {
      // In a real app, this would handle the withdrawal action
      console.log('Withdrawal requested for:', withdrawalSelectedAmount);

      // Update balances
      if (withdrawalSelectedAmount > 0 && withdrawalSelectedAmount <= financialData.serverBalance) {
        financialData.serverBalance -= withdrawalSelectedAmount;
        financialData.walletBalance += withdrawalSelectedAmount;

        // Update the display
        balanceContainer.children.forEach(row => {
          if (row.children[0].value === "Wallet Balance:") {
            row.children[1].value = financialData.walletBalance.toString();
          } else if (row.children[0].value === "Server Balance:") {
            row.children[1].value = financialData.serverBalance.toString();
          }
        });

        // Reset the withdrawal amount
        withdrawalSelectedAmount = 0;
        withdrawalButton.value = "Withdraw 0";

        // Update the trophy UI text
        if (trophyUI) {
          trophyUI.children[0].value = `${financialData.walletBalance} | ${financialData.serverBalance} | ${financialData.collectableCoins}`;
        }
      }

      // Reset the interaction time
      updateInteractionTime();
    },
    onPointerEnter: updateInteractionTime,
    onPointerLeave: updateInteractionTime
  });

  withdrawalInputRow.add(withdrawalInputLabel);

  withdrawalContainer.add(withdrawalHeader);
  withdrawalContainer.add(withdrawalInputRow);
  withdrawalContainer.add(withdrawalButtonsContainer);
  withdrawalContainer.add(withdrawalButton);

  dashboard.add(withdrawalContainer);

  app.add(dashboard);
}

function createTrophyUI() {
  mode = 'trophy'

  const alpha = props.backgroundAlpha / 100;
  const mainBgColor = colors.backgroundColor.replace('1)', `${alpha})`);

  trophyUI = app.create('ui', {
    width: 80,
    height: 32,
    res: 2,
    position: [0, 1, 0],
    offset: [20, -20, 0],
    space: 'screen',
    pivot: 'bottom-left',
    backgroundColor: mainBgColor,
    borderRadius: 10,
    borderColor: colors.borderColor,
    borderWidth: 2,
    padding: 2,
    pointerEvents: props.clickable,
    flexDirection: 'column',
    gap: 4,
    alignItems: 'center',
    justifyContent: 'center',
    cursor: props.clickable ? 'pointer' : 'default',
    onPointerDown: () => {
      if (props.clickable) {
        createLeaderboardUI();
      }
    }
  });

  trophyUI.add(trophyText);
  app.add(trophyUI);
}


createLeaderboardUI(); 