// ==UserScript==
// @name         New Userscript
// @namespace    http://tampermonkey.net/
// @version      2025-05-25
// @description  try to take over the world!
// @author       You
// @match        https://gmgn.ai/*
// @icon         data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==
// @grant        none
// ==/UserScript==

(function() {
    'use strict';


// Prevent multiple script loads
if (window.GMGN_SCRIPT_LOADED) {
  return;
}
window.GMGN_SCRIPT_LOADED = true;
window.GMGN_TAB_ID = Math.random().toString(36).substring(2, 15);

// Audio configurations for transaction alerts
const soundOptions = {
  option1: {
    buy: new Audio("https://raw.githubusercontent.com/xeonise/sigmadan/refs/heads/main/pokypka228.mp3"),
    sell: new Audio("https://raw.githubusercontent.com/xeonise/sigmadan/refs/heads/main/prodazha228.mp3")
  },
  option2: {
    buy: new Audio("https://raw.githubusercontent.com/xeonise/sigmadan/refs/heads/main/long228.mp3"),
    sell: new Audio("https://raw.githubusercontent.com/xeonise/sigmadan/refs/heads/main/shorti228.mp3")
  },
  option3: {
    buy: new Audio("https://raw.githubusercontent.com/xeonise/sigmadan/refs/heads/main/zelalong.mp3"),
    sell: new Audio("https://raw.githubusercontent.com/xeonise/sigmadan/refs/heads/main//zelashort.mp3")
  }
};

// Chain ID to name mapping
const chainMap = {
  "195": "tron",
  "501": "sol",
  "81457": "blast",
  "56": "bsc",
  "1": "ethereum",
  "784": "sui",
  "8453": "base"
};

// State variables
let tokensList = [];
let quotationSocket = null;
let mexcSocket = null;
let transactions = [{ buy: [], sell: [] }];
let tableElements = [];
let processedTxIds = [new Set()];
let txAggregates = [new Map()];
let settings = [{
  filterAmount: 1000,
  filterTime: 10,
  isVisible: true,
  isSoundEnabled: true,
  soundMode: "transaction",
  selectedSound: "option1",
  scale: 1,
  aggregateEnabled: false,
  aggregateWindowMs: 10,
  transactionBuffer: [],
  positionLeft: null,
  positionTop: null,
  customAmountButtons: [1000, 3000, 5000, 10000]
}];
let sentiments = ["neutral"];
let sentimentScores = [0];
let soundPlayed = [false];
let tokenHistory = [];
let backgroundColor = "#000000";
let currentTokenAddress = null;
let currentChain = null;
let settingsPanel = null;
let priceTable = null;
let tokenName = null;
let dexPrice = null;
let mexcPrice = null;
let lastUpdateTime = Date.now();
let reconnectAttempts = 0;
let priceTableScale = 1;
let isPriceTableVisible = true;
let priceDecimals = 5;
let mexcPriceDecimals = 5;
let isDragging = false;

// Utility Functions
function logMessage(message, data = '') {
  if (message.includes("воспроизведен") ||
      message.includes("Ошибка воспроизведения") ||
      message.includes("Вкладка активна") ||
      message.includes("Вкладка неактивна") ||
      message.includes("установлена как активная") ||
      message.includes("не является основной")) {
    console.log(`[${new Date().toISOString()}] [Transaction Notification] ${message}`, data);
  }
}

function getStoredTokens() {
  try {
    const tokens = localStorage.getItem("GMGN_USER_TOKENS");
    return tokens && Array.isArray(JSON.parse(tokens)) ? JSON.parse(tokens) : [];
  } catch {
    return [];
  }
}

function saveTokens(tokens) {
  try {
    localStorage.setItem("GMGN_USER_TOKENS", JSON.stringify(tokens));
  } catch {}
}

function addToken(token) {
  const tokens = getStoredTokens();
  tokens.push(token);
  saveTokens(tokens);
}

function removeToken(address, chain) {
  let tokens = getStoredTokens();
  tokens = tokens.filter(token => !(token.address === address && token.chain === chain));
  saveTokens(tokens);
}

async function loadTokens() {
  let remoteTokens = [];
  try {
    const response = await fetch("https://raw.githubusercontent.com/xeonise/sigmadan/refs/heads/main/tokens.json");
    if (response.ok) {
      const data = await response.json();
      if (Array.isArray(data)) {
        remoteTokens = data.filter(token =>
          typeof token.address === "string" &&
          typeof token.ticker === "string" &&
          typeof token.mexcSymbol === "string"
        );
      }
    }
  } catch {}

  const localTokens = getStoredTokens();
  if (localTokens.length > 0) {
    const mergedTokens = [...remoteTokens];
    localTokens.forEach(localToken => {
      const index = mergedTokens.findIndex(
        token => token.address.toLowerCase() === localToken.address.toLowerCase() && token.chain === localToken.chain
      );
      if (index >= 0) {
        mergedTokens[index] = localToken;
      } else {
        mergedTokens.push(localToken);
      }
    });
    tokensList = mergedTokens;
  } else {
    tokensList = remoteTokens;
  }
  window.tokensJsonList = remoteTokens;
}

function resetState() {
  quotationSocket?.close();
  mexcSocket?.close();
  settingsPanel?.remove();
  tableElements.forEach((table, index) => {
    if (table) {
      const timerId = table.getAttribute("data-timer-id");
      if (timerId) clearInterval(parseInt(timerId));
      table.remove();
    }
  });
  tableElements = [];
  priceTable?.remove();
  transactions = [{ buy: [], sell: [] }];
  // Ensure settings always starts with a valid default config
  settings = [{
    filterAmount: 1000,
    filterTime: 10,
    isVisible: true,
    isSoundEnabled: true,
    soundMode: "transaction",
    selectedSound: "option1",
    scale: 1,
    aggregateEnabled: false,
    aggregateWindowMs: 10,
    transactionBuffer: [],
    positionLeft: null,
    positionTop: null,
    customAmountButtons: [1000, 3000, 5000, 10000]
  }];
  sentiments = ["neutral"];
  sentimentScores = [0];
  soundPlayed = [false];
  processedTxIds = [new Set()];
  txAggregates = [new Map()];
  tokenHistory = [];
  backgroundColor = "#000000";
  currentTokenAddress = null;
  currentChain = null;
  settingsPanel = null;
  priceTable = null;
  tokenName = null;
  dexPrice = null;
  mexcPrice = null;
  lastUpdateTime = Date.now();
  reconnectAttempts = 0;
  priceTableScale = 1;
  isPriceTableVisible = true;
  priceDecimals = 5;
  mexcPriceDecimals = 5;
  isDragging = false;
}

function hideBanner() {
  const banner = document.querySelector(".css-12rtj2z.banner");
  if (banner) banner.style.display = "none";
}

function hexToRgb(hex) {
  const match = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return match ? {
    r: parseInt(match[1], 16),
    g: parseInt(match[2], 16),
    b: parseInt(match[3], 16)
  } : null;
}

function updateBackgroundColor(hexColor) {
  const rgb = hexToRgb(hexColor);
  const rgba = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.9)`;
  if (settingsPanel) settingsPanel.style.background = rgba;
  tableElements.forEach(table => {
    if (table) table.style.background = rgba;
  });
  if (priceTable) priceTable.style.background = rgba;
  backgroundColor = hexColor;
}

function getCurrentTokenInfo() {
  const url = window.location.href;
  const match = url.match(/\/(tron|sol|blast|bsc|eth|sui|base)\/token\/([a-zA-Z0-9]+)/);
  if (match) {
    const chain = match[1];
    const address = match[2];
    const chainId = Object.keys(chainMap).find(id => chainMap[id] === chain);
    return { chain, tokenAddress: address, chainId };
  }
  return null;
}

function getTokenName() {
  const selectors = ["span.text-text-100.text-xl.font-semibold.leading-\\[21px\\]"];
  let name = null;
  for (const selector of selectors) {
    const element = document.querySelector(selector);
    if (element?.textContent.trim()) {
      name = element.textContent.trim();
      break;
    }
  }
  if (!name) {
    const tokenInfo = getCurrentTokenInfo();
    if (tokenInfo?.tokenAddress) {
      const token = tokensList.find(t => t.address.toLowerCase() === tokenInfo.tokenAddress.toLowerCase());
      name = token?.ticker || `${tokenInfo.tokenAddress.slice(0, 6)}...${tokenInfo.tokenAddress.slice(-4)}`;
    }
  }
  return name?.replace(/\s+/g, " ").trim() || "Unknown Token";
}

function createSubscriptionMessages(chain, address) {
  const statId = `stat-${Math.random().toString(36).substr(2, 9)}`;
  const activityId = `activity-${Math.random().toString(36).substr(2, 9)}`;
  return [
    {
      action: "subscribe",
      channel: "token_stat",
      id: statId,
      data: [{ chain, addresses: address }]
    },
    {
      action: "subscribe",
      channel: "token_activity",
      id: activityId,
      data: [{ chain, addresses: address }]
    }
  ];
}

function createMexcSubscription(symbol) {
  return {
    method: "sub.deal",
    param: { symbol, instType: "futures" }
  };
}

function connectQuotationSocket(chain, address) {
  let pingInterval = null;
  function connect() {
    quotationSocket = new WebSocket("wss://ws.gmgn.ai/quotation");
    quotationSocket.onopen = () => {
      reconnectAttempts = 0;
      createSubscriptionMessages(chain, address).forEach(msg => quotationSocket.send(JSON.stringify(msg)));
      pingInterval = setInterval(() => {
        if (quotationSocket?.readyState === WebSocket.OPEN) quotationSocket.send("ping");
      }, 30000);
    };
    quotationSocket.onmessage = event => {
      try {
        const data = JSON.parse(event.data);
        if (data.channel === "token_activity") {
          data.data.forEach(tx => {
            if (tx.e === "remove" || tx.e === "add") return;
            if (tx.a === address) {
              const isBuy = tx.e === "buy";
              const amount = parseFloat(tx.au || 0);
              const txId = tx.id || `tx-${Math.random().toString(36).substr(2, 9)}`;
              settings.forEach((config, index) => {
                if (!processedTxIds[index]) processedTxIds[index] = new Set();
                if (!processedTxIds[index].has(txId)) {
                  processTransaction(index + 1, amount, isBuy ? "buy" : "sell", txId);
                  processedTxIds[index].add(txId);
                }
              });
            }
          });
        } else if (data.channel === "token_stat") {
          data.data.forEach(stat => {
            if (stat.a === address) {
              dexPrice = parseFloat(stat.p || 0);
              lastUpdateTime = Date.now();
              updatePriceTable();
            }
          });
        }
      } catch {}
    };
    quotationSocket.onclose = () => {
      quotationSocket = null;
      clearInterval(pingInterval);
      if (reconnectAttempts < Infinity) {
        reconnectAttempts++;
        setTimeout(connect, 500);
      }
    };
  }
  connect();
  setInterval(() => {
    if (quotationSocket?.readyState === WebSocket.OPEN && Date.now() - lastUpdateTime > 180000) {
      quotationSocket.close();
    }
  }, 30000);
}

function connectMexcSocket(symbols) {
  if (!symbols?.length) {
    mexcPrice = null;
    updatePriceTable();
    return;
  }
  mexcSocket?.close();
  let pingInterval = null;
  function connect() {
    mexcSocket = new WebSocket("wss://contract.mexc.com/edge");
    mexcSocket.onopen = () => {
      reconnectAttempts = 0;
      symbols.forEach(symbol => mexcSocket.send(JSON.stringify(createMexcSubscription(symbol))));
      pingInterval = setInterval(() => {
        if (mexcSocket?.readyState === WebSocket.OPEN) mexcSocket.send("ping");
      }, 30000);
    };
    mexcSocket.onmessage = event => {
      try {
        const data = JSON.parse(event.data);
        if (data.channel === "push.deal") {
          const price = parseFloat(data.data.p || 0);
          if (price > 0) {
            mexcPrice = price;
            lastUpdateTime = Date.now();
            const priceStr = data.data.p.toString();
            mexcPriceDecimals = priceStr.split('.')[1]?.length || 0;
            updatePriceTable();
          }
        }
      } catch {}
    };
    mexcSocket.onclose = () => {
      mexcSocket = null;
      clearInterval(pingInterval);
      if (reconnectAttempts < Infinity) {
        reconnectAttempts++;
        setTimeout(connect, 500);
      }
    };
  }
  connect();
  setInterval(() => {
    if (mexcSocket?.readyState === WebSocket.OPEN && Date.now() - lastUpdateTime > 180000) {
      mexcSocket.close();
    }
  }, 30000);
}

function createPriceTable() {
  priceTable = document.createElement("div");
  priceTable.className = "gmgn-script-container";
  priceTable.id = "priceTable";
  priceTable.style.cssText = `
    position: fixed; top: 20px; left: 20px; background: rgba(0, 0, 0, 0.9); color: white;
    padding: 10px; border-radius: 8px; z-index: 1000; font-family: Arial, sans-serif;
    width: 250px; cursor: move; display: block; transform: scale(${priceTableScale});
    transform-origin: top left;
  `;
  document.body.appendChild(priceTable);
  updateBackgroundColor(backgroundColor);
  if (settings[0].positionLeft !== null && settings[0].positionTop !== null) {
    priceTable.style.left = settings[0].positionLeft + 'px';
    priceTable.style.top = settings[0].positionTop + 'px';
  }
  let isDragging = false;
  let offsetX = 0;
  let offsetY = 0;
  priceTable.addEventListener("mousedown", event => {
    const rect = priceTable.getBoundingClientRect();
    isDragging = true;
    offsetX = event.clientX - rect.left;
    offsetY = event.clientY - rect.top;
  });
  document.addEventListener("mousemove", event => {
    if (isDragging) {
      event.preventDefault();
      priceTable.style.left = event.clientX - offsetX + 'px';
      priceTable.style.top = event.clientY - offsetY + 'px';
      priceTable.style.transform = `scale(${priceTableScale})`;
    }
  });
  document.addEventListener("mouseup", () => {
    if (isDragging) {
      settings[0].positionLeft = parseFloat(priceTable.style.left) || null;
      settings[0].positionTop = parseFloat(priceTable.style.top) || null;
      saveSettings(currentChain, currentTokenAddress);
    }
    isDragging = false;
  });
  updatePriceTable();
}

function updatePriceTable() {
  if (!priceTable) return;
  const tokenNameDisplay = tokenName || "Unknown Token";
  const dexPriceDisplay = dexPrice ? dexPrice.toFixed(priceDecimals) : "N/A";
  const mexcPriceDisplay = mexcPrice ? mexcPrice.toFixed(priceDecimals) : "N/A";
  let priceDiff = "N/A";
  let arrow = '';
  let color = "white";
  if (dexPrice && mexcPrice) {
    priceDiff = ((mexcPrice - dexPrice) / dexPrice * 100).toFixed(2);
    priceDiff = priceDiff >= 0 ? `+${priceDiff}` : priceDiff;
    arrow = mexcPrice > dexPrice ? '🠕' : '🠗';
    color = mexcPrice > dexPrice ? "#00FF00" : "#FF0000";
  }
  priceTable.innerHTML = `
    <div style="font-weight: bold; margin-bottom: 5px;">${tokenNameDisplay}</div>
    <div style="border-bottom: 2px solid #ff0000; margin-bottom: 5px;"></div>
    <div style="display: flex; align-items: center; margin-bottom: 5px;">
      <span style="width: 60px;">DEX</span>
      <span style="margin-right: 10px;">${dexPriceDisplay}</span>
    </div>
    <div style="display: flex; align-items: center;">
      <span style="width: 60px;">MEXC</span>
      <span style="margin-right: 10px; color: ${color};">${mexcPriceDisplay} ${arrow}</span>
      <span style="margin-left: auto; color: white;">(${priceDiff}%)</span>
    </div>
  `;
  priceTable.style.display = isPriceTableVisible ? "block" : "none";
}

function createSettingsPanel() {
  const existingToggle = document.getElementById("toggleFilters");
  if (existingToggle) existingToggle.remove();
  const existingPanel = document.getElementById("transactionFilterPanel");
  if (existingPanel) existingPanel.remove();

  const toggleButton = document.createElement("button");
  toggleButton.id = "toggleFilters";
  toggleButton.style.cssText = `
    position: fixed; top: 20px; right: 20px;
    padding: 8px 15px; border: 1.5px solid #38e8ff; cursor: pointer; border-radius: 8px; z-index: 10001;
    font-family: Arial, sans-serif; font-weight: bold; background: #232526; color: white;
  `;
  toggleButton.textContent = "Settings";
  document.body.appendChild(toggleButton);

  settingsPanel = document.createElement("div");
  settingsPanel.className = "gmgn-script-container";
  settingsPanel.id = "transactionFilterPanel";
  settingsPanel.style.cssText = `
    position: fixed; top: 150px; left: 20px; background: linear-gradient(135deg, #232526 0%, #414345 100%);
    color: white; padding: 10px; border-radius: 18px; z-index: 10000; font-family: Arial, sans-serif;
    display: none; max-height: 80vh; max-width: 90vw; overflow-y: auto; box-shadow: 0 4px 32px 0 #000a, 0 1.5px 6px 0 #0004;
  `;
  settingsPanel.innerHTML = `
    <div style="display: flex; flex-direction: row; flex-wrap: nowrap; overflow-x: auto; white-space: nowrap;">
      <div style="flex: 0 0 200px; min-width: 200px; margin-right: 10px; position: sticky; left: 0; top: 10px;">
        <div class="collapsible-section">
          <div style="display: flex; justify-content: space-between; cursor: pointer;" class="section-header">
            <div style="font-weight: bold;">Price Tracking</div>
            <button class="toggle-section" style="background: none; border: none; color: white; cursor: pointer;">▶</button>
          </div>
          <div class="section-content" style="display: none;">
            <div style="margin-top: 5px;">
              <label style="display: flex; align-items: center; gap: 5px;">
                <input type="checkbox" id="showPriceTable" ${isPriceTableVisible ? 'checked' : ''}> Show Price Table
              </label>
            </div>
            <div style="margin-top: 5px;">
              <label>Price Table Scale:</label>
              <div style="display: flex; gap: 5px; margin-top: 5px;">
                <button class="filter-btn scale-btn price-scale-btn" data-scale-change="-0.1">-</button>
                <span id="priceScaleDisplay">${(priceTableScale * 100).toFixed(0)}%</span>
                <button class="filter-btn scale-btn price-scale-btn" data-scale-change="0.1">+</button>
              </div>
            </div>
            <div style="margin-top: 5px;">
              <label>Decimal Places:</label>
              <div style="display: flex; gap: 5px; margin-top: 5px; flex-wrap: wrap;">
                <button class="filter-btn decimals-btn" data-decimals="1">1</button>
                <button class="filter-btn decimals-btn" data-decimals="2">2</button>
                <button class="filter-btn decimals-btn" data-decimals="3">3</button>
                <button class="filter-btn decimals-btn" data-decimals="4">4</button>
                <button class="filter-btn decimals-btn" data-decimals="5">5</button>
                <button class="filter-btn decimals-btn" data-decimals="6">6</button>
              </div>
              <div style="margin-top: 5px; display: flex; align-items: center; gap: 5px;">
                <input type="number" id="priceDecimalsInput" placeholder="Decimals" min="0" max="10" style="width: 80px; padding: 2px;">
                <button id="applyPriceDecimals" class="apply-btn">Apply</button>
              </div>
            </div>
          </div>
        </div>
        <div class="collapsible-section">
          <div style="display: flex; justify-content: space-between; cursor: pointer;" class="section-header">
            <div style="font-weight: bold;">Additional Options</div>
            <button class="toggle-section" style="background: none; border: none; color: white; cursor: pointer;">▶</button>
          </div>
          <div class="section-content" style="display: none;">
            <div style="margin-top: 10px; display: flex; flex-direction: column; gap: 10px;">
              <button id="addCoinBtn" class="apply-btn">Add Token</button>
              <button id="resetSettingsBtn" class="apply-btn" style="border-color: #ff5555 !important;">Reset Settings</button>
            </div>
          </div>
        </div>
      </div>
      <div id="tableSettingsContainer" style="display: flex; flex-direction: row; flex-wrap: nowrap; overflow-x: auto; white-space: nowrap; justify-content: flex-start; align-items: flex-start;">
        ${settings.map((config, index) => `
          <div class="table-settings" data-index="${index}" style="flex: 0 0 280px; min-width: 280px; padding: 10px; border: 1px solid white; border-radius: 5px; margin-right: 10px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
              <div style="font-weight: bold;">Table #${index + 1}</div>
              <div style="display: flex; gap: 2px; align-items: center;">
                <span class="visibility-icon" data-index="${index}" title="Toggle Visibility" style="display:inline-block;cursor:pointer;padding:4px 6px;border-radius:6px;transition:background 0.15s;font-size:18px;line-height:1;">👁️</span>
                <span class="sound-icon" data-index="${index}" title="Toggle Sound" style="display:inline-block;cursor:pointer;padding:4px 6px;border-radius:6px;transition:background 0.15s;font-size:18px;line-height:1;">🔊</span>
                ${index > 0 ? `<button class="remove-table-btn" data-index="${index}" style="background: none; border: none; color: #ff0000; cursor: pointer; font-size: 20px; padding: 0 6px; display: flex; align-items: center; height: 28px;">✖</button>` : ''}
              </div>
            </div>
            <div class="collapsible-section">
              <div style="display: flex; justify-content: space-between; cursor: pointer;" class="section-header">
                <div style="font-weight: bold;">Amount Filter</div>
                <button class="toggle-section" style="background: none; border: none; color: white; cursor: pointer;">▼</button>
              </div>
              <div class="section-content" style="display: block;">
                <div style="display: flex; align-items: center; justify-content: space-between; margin-top: 5px; margin-bottom: 5px;">
                  <span id="currentFilterDisplay${index}">Current: ${config.filterAmount} $</span>
                  <span class="edit-section-icon" title="Edit" style="cursor:pointer;font-size:17px;line-height:1;">✏️</span>
                </div>
                <div style="display: flex; gap: 5px;">
                  ${config.customAmountButtons.map(amount => `<button class="filter-btn amount-btn" data-index="${index}" data-amount="${amount}">${amount} $</button>`).join('')}
                </div>
                <div style="margin-top: 5px; display: flex; align-items: center; gap: 5px;">
                  <input type="number" id="customFilterAmount${index}" placeholder="Custom Amount $" style="width: 80px; padding: 2px;">
                  <button id="applyCustomFilter${index}" class="apply-btn">Apply</button>
                </div>
              </div>
            </div>
            <div class="collapsible-section">
              <div style="display: flex; justify-content: space-between; cursor: pointer;" class="section-header">
                <div style="font-weight: bold;">Time Filter</div>
                <button class="toggle-section" style="background: none; border: none; color: white; cursor: pointer;">▼</button>
              </div>
              <div class="section-content" style="display: block;">
                <div style="display: flex; align-items: center; justify-content: space-between; margin-top: 5px; margin-bottom: 5px;">
                  <span id="currentTimeFilterDisplay${index}">Current: ${config.filterTime}s</span>
                </div>
                <div style="display: flex; gap: 5px;">
                  <button class="filter-btn time-btn" data-index="${index}" data-time="10">10s</button>
                  <button class="filter-btn time-btn" data-index="${index}" data-time="30">30s</button>
                  <button class="filter-btn time-btn" data-index="${index}" data-time="60">60s</button>
                  <button class="filter-btn time-btn" data-index="${index}" data-time="120">120s</button>
                </div>
                <div style="margin-top: 5px; display: flex; align-items: center; gap: 5px;">
                  <input type="number" id="customFilterTime${index}" placeholder="Custom Time" style="width: 80px; padding: 2px;">
                  <button id="applyCustomTimeFilter${index}" class="apply-btn">Apply</button>
                </div>
              </div>
            </div>
            <div class="collapsible-section">
              <div style="display: flex; justify-content: space-between; cursor: pointer;" class="section-header">
                <div style="font-weight: bold;">Transaction Aggregation</div>
                <button class="toggle-section" style="background: none; border: none; color: white; cursor: pointer;">▶</button>
              </div>
              <div class="section-content" style="display: none;">
                <div style="margin-top: 5px;">
                  <label style="display: flex; align-items: center; gap: 5px;">
                    <input type="checkbox" class="aggregate-enabled" data-index="${index}" ${config.aggregateEnabled ? 'checked' : ''}>
                    Enable Aggregation
                  </label>
                </div>
                <div style="margin-top: 5px;">
                  <label>Current: <span id="currentAggregateWindow${index}">${config.aggregateWindowMs} ms</span></label>
                  <div style="display: flex; gap: 5px; margin-top: 5px;">
                    <button class="filter-btn aggregate-window-btn" data-index="${index}" data-window="10">10 ms</button>
                    <button class="filter-btn aggregate-window-btn" data-index="${index}" data-window="50">50 ms</button>
                    <button class="filter-btn aggregate-window-btn" data-index="${index}" data-window="100">100 ms</button>
                  </div>
                  <div style="margin-top: 5px; display: flex; align-items: center; gap: 5px;">
                    <input type="number" id="aggregateWindow${index}" placeholder="Time (ms)" min="10" max="1000" style="width: 80px; padding: 2px;">
                    <button id="applyAggregateWindow${index}" class="apply-btn" data-index="${index}">Apply</button>
                  </div>
                </div>
              </div>
            </div>
            <div class="collapsible-section">
              <div style="display: flex; justify-content: space-between; cursor: pointer;" class="section-header">
                <div style="font-weight: bold;">Table Scale</div>
                <button class="toggle-section" style="background: none; border: none; color: white; cursor: pointer;">▶</button>
              </div>
              <div class="section-content" style="display: none;">
                <div style="margin-top: 5px;">
                  <label>Table Scale:</label>
                  <div class="scale-btn-container">
                    <button class="filter-btn scale-btn table-scale-btn" data-index="${index}" data-scale-change="-0.1">-</button>
                    <span id="scaleDisplay${index}">${(config.scale * 100).toFixed(0)}%</span>
                    <button class="filter-btn scale-btn table-scale-btn" data-index="${index}" data-scale-change="0.1">+</button>
                  </div>
                </div>
              </div>
            </div>
            <div class="collapsible-section">
              <div style="display: flex; justify-content: space-between; cursor: pointer;" class="section-header">
                <div style="font-weight: bold;">Sound Selection</div>
                <button class="toggle-section" style="background: none; border: none; color: white; cursor: pointer;">▶</button>
              </div>
              <div class="section-content" style="display: none;">
                <div style="margin-top: 5px;">
                  <strong>Table ${index + 1}:</strong>
                  <div style="display: flex; flex-direction: column; gap: 5px; margin-top: 5px;">
                    <label style="display: flex; align-items: center; gap: 5px;">
                      <input type="radio" name="soundOption${index}" value="option1" ${config.selectedSound === 'option1' ? 'checked' : ''}>
                      Sound 1: Standard
                    </label>
                    <label style="display: flex; align-items: center; gap: 5px;">
                      <input type="radio" name="soundOption${index}" value="option2" ${config.selectedSound === 'option2' ? 'checked' : ''}>
                      Sound 2: Classic
                    </label>
                    <label style="display: flex; align-items: center; gap: 5px;">
                      <input type="radio" name="soundOption${index}" value="option3" ${config.selectedSound === 'option3' ? 'checked' : ''}>
                      Sound 3: Powerful
                    </label>
                  </div>
                </div>
              </div>
            </div>
            <div class="collapsible-section">
              <div style="display: flex; justify-content: space-between; cursor: pointer;" class="section-header">
                <div style="font-weight: bold;">Sound Mode</div>
                <button class="toggle-section" style="background: none; border: none; color: white; cursor: pointer;">▶</button>
              </div>
              <div class="section-content" style="display: none;">
                <div style="margin-top: 5px;">
                  <strong>Table ${index + 1}:</strong>
                  <div style="display: flex; flex-direction: column; gap: 5px; margin-top: 5px;">
                    <label style="display: flex; align-items: center; gap: 5px;">
                      <input type="radio" name="soundMode${index}" value="transaction" ${config.soundMode === 'transaction' ? 'checked' : ''}>
                      Mode 1: By Transactions
                    </label>
                    <label style="display: flex; align-items: center; gap: 5px;">
                      <input type="radio" name="soundMode${index}" value="dominance" ${config.soundMode === 'dominance' ? 'checked' : ''}>
                      Mode 2: By Dominance Change
                    </label>
                    <label style="display: flex; align-items: center; gap: 5px;">
                      <input type="radio" name="soundMode${index}" value="difference" ${config.soundMode === 'difference' ? 'checked' : ''}>
                      Mode 3: By Difference Change
                    </label>
                  </div>
                </div>
              </div>
            </div>
          </div>
        `).join('')}
        <button id="addTableBtn" style="flex: 0 0 auto; background: none; border: none; color: white; font-size: 24px; cursor: pointer; padding: 10px; margin-left: 0;">+</button>
      </div>
    </div>
  `;
  document.body.appendChild(settingsPanel);

  // Add styles
  const style = document.createElement("style");
  style.textContent = `
    .gmgn-script-container .apply-btn,
    .gmgn-script-container .filter-btn,
    .gmgn-script-container .scale-btn,
    .gmgn-script-container .remove-table-btn,
    .gmgn-script-container button,
    #gmgn-token-manager-modal button {
      border: none !important;
      outline: none !important;
      box-shadow: none !important;
      background: none !important;
    }
    .gmgn-script-container .apply-btn,
    .gmgn-script-container .filter-btn {
      padding: 8px 12px !important;
      border-radius: 6px !important;
      font-weight: 500 !important;
      transition: background 0.15s, color 0.15s, border-color 0.15s !important;
      background: #232526 !important;
      color: #b0e0ff !important;
      border: 1px solid #38e8ff44 !important;
    }
    .gmgn-script-container .apply-btn:hover,
    .gmgn-script-container .filter-btn:hover {
      background: #292d32 !important;
      color: #fff !important;
      border: 1px solid #38e8ff !important;
    }
    .gmgn-script-container .apply-btn:active,
    .gmgn-script-container .filter-btn:active {
      transform: scale(0.95) !important;
      background: #38e8ff44 !important;
      border-color: #38e8ff !important;
    }
    .gmgn-script-container .selected {
      background: #38e8ff22 !important;
      color: #38e8ff !important;
      border: 1px solid #38e8ff !important;
    }
    .gmgn-script-container[id^="transactionAlertTable"] {
      opacity: 0 !important;
      visibility: hidden !important;
      transition: opacity 0.2s ease-out !important;
    }
    .gmgn-script-container[id^="transactionAlertTable"].show {
      opacity: 1 !important;
      visibility: visible !important;
    }
  `;
  document.head.appendChild(style);

  // Event Listeners
  toggleButton.addEventListener("click", () => {
    settingsPanel.style.display = settingsPanel.style.display === "none" ? "block" : "none";
  });

  document.querySelectorAll(".toggle-section").forEach(button => {
    button.addEventListener("click", () => {
      const content = button.parentElement.nextElementSibling;
      const isOpen = content.style.display === "block";
      content.style.display = isOpen ? "none" : "block";
      button.textContent = isOpen ? "▶" : "▼";
    });
  });

  document.querySelectorAll(".amount-btn").forEach(button => {
    button.addEventListener("click", () => {
      const index = parseInt(button.getAttribute("data-index"));
      const amount = parseInt(button.getAttribute("data-amount"));
      settings[index].filterAmount = amount;
      document.getElementById(`currentFilterDisplay${index}`).textContent = `Current: ${amount} $`;
      saveSettings(currentChain, currentTokenAddress);
    });
  });

  document.querySelectorAll(".time-btn").forEach(button => {
    button.addEventListener("click", () => {
      const index = parseInt(button.getAttribute("data-index"));
      const time = parseInt(button.getAttribute("data-time"));
      settings[index].filterTime = time;
      document.getElementById(`currentTimeFilterDisplay${index}`).textContent = `Current: ${time}s`;
      saveSettings(currentChain, currentTokenAddress);
    });
  });

  document.querySelectorAll(".aggregate-window-btn").forEach(button => {
    button.addEventListener("click", () => {
      const index = parseInt(button.getAttribute("data-index"));
      const windowMs = parseInt(button.getAttribute("data-window"));
      settings[index].aggregateWindowMs = windowMs;
      document.getElementById(`currentAggregateWindow${index}`).textContent = `${windowMs} ms`;
      saveSettings(currentChain, currentTokenAddress);
    });
  });

  document.querySelectorAll(".apply-btn").forEach(button => {
    if (button.id.startsWith("applyCustomFilter")) {
      button.addEventListener("click", () => {
        const index = parseInt(button.id.replace("applyCustomFilter", ""));
        const input = document.getElementById(`customFilterAmount${index}`);
        const amount = parseInt(input.value);
        if (!isNaN(amount) && amount > 0) {
          settings[index].filterAmount = amount;
          document.getElementById(`currentFilterDisplay${index}`).textContent = `Current: ${amount} $`;
          saveSettings(currentChain, currentTokenAddress);
        }
      });
    } else if (button.id.startsWith("applyCustomTimeFilter")) {
      button.addEventListener("click", () => {
        const index = parseInt(button.id.replace("applyCustomTimeFilter", ""));
        const input = document.getElementById(`customFilterTime${index}`);
        const time = parseInt(input.value);
        if (!isNaN(time) && time > 0) {
          settings[index].filterTime = time;
          document.getElementById(`currentTimeFilterDisplay${index}`).textContent = `Current: ${time}s`;
          saveSettings(currentChain, currentTokenAddress);
        }
      });
    } else if (button.id.startsWith("applyAggregateWindow")) {
      button.addEventListener("click", () => {
        const index = parseInt(button.id.replace("applyAggregateWindow", ""));
        const input = document.getElementById(`aggregateWindow${index}`);
        const windowMs = parseInt(input.value);
        if (!isNaN(windowMs) && windowMs >= 10 && windowMs <= 1000) {
          settings[index].aggregateWindowMs = windowMs;
          document.getElementById(`currentAggregateWindow${index}`).textContent = `${windowMs} ms`;
          saveSettings(currentChain, currentTokenAddress);
        }
      });
    }
  });

  document.querySelectorAll(".scale-btn").forEach(button => {
    button.addEventListener("click", () => {
      const scaleChange = parseFloat(button.getAttribute("data-scale-change"));
      if (button.classList.contains("price-scale-btn")) {
        priceTableScale = Math.max(0.5, Math.min(priceTableScale + scaleChange, 2));
        document.getElementById("priceScaleDisplay").textContent = `${(priceTableScale * 100).toFixed(0)}%`;
        if (priceTable) priceTable.style.transform = `scale(${priceTableScale})`;
      } else {
        const index = parseInt(button.getAttribute("data-index"));
        settings[index].scale = Math.max(0.5, Math.min(settings[index].scale + scaleChange, 2));
        document.getElementById(`scaleDisplay${index}`).textContent = `${(settings[index].scale * 100).toFixed(0)}%`;
        const table = tableElements[index];
        if (table) table.style.transform = `scale(${settings[index].scale})`;
      }
      saveSettings(currentChain, currentTokenAddress);
    });
  });

  document.querySelectorAll(".decimals-btn").forEach(button => {
    button.addEventListener("click", () => {
      priceDecimals = parseInt(button.getAttribute("data-decimals"));
      updatePriceTable();
      saveSettings(currentChain, currentTokenAddress);
    });
  });

  document.getElementById("applyPriceDecimals")?.addEventListener("click", () => {
    const input = document.getElementById("priceDecimalsInput");
    const decimals = parseInt(input.value);
    if (!isNaN(decimals) && decimals >= 0 && decimals <= 10) {
      priceDecimals = decimals;
      updatePriceTable();
      saveSettings(currentChain, currentTokenAddress);
    }
  });

  document.querySelectorAll(".visibility-icon").forEach(icon => {
    icon.addEventListener("click", () => {
      const index = parseInt(icon.getAttribute("data-index"));
      settings[index].isVisible = !settings[index].isVisible;
      const table = tableElements[index];
      if (table) table.style.display = settings[index].isVisible ? "block" : "none";
      saveSettings(currentChain, currentTokenAddress);
    });
  });

  document.querySelectorAll(".sound-icon").forEach(icon => {
    icon.addEventListener("click", () => {
      const index = parseInt(icon.getAttribute("data-index"));
      settings[index].isSoundEnabled = !settings[index].isSoundEnabled;
      saveSettings(currentChain, currentTokenAddress);
    });
  });

  document.querySelectorAll(".remove-table-btn").forEach(button => {
    button.addEventListener("click", () => {
      const index = parseInt(button.getAttribute("data-index"));
      settings.splice(index, 1);
      tableElements[index]?.remove();
      tableElements.splice(index, 1);
      transactions.splice(index, 1);
      processedTxIds.splice(index, 1);
      txAggregates.splice(index, 1);
      sentiments.splice(index, 1);
      sentimentScores.splice(index, 1);
      soundPlayed.splice(index, 1);
      saveSettings(currentChain, currentTokenAddress);
      createSettingsPanel();
    });
  });

  document.getElementById("addTableBtn")?.addEventListener("click", () => {
    settings.push({
      filterAmount: 1000,
      filterTime: 10,
      isVisible: true,
      isSoundEnabled: true,
      soundMode: "transaction",
      selectedSound: "option1",
      scale: 1,
      aggregateEnabled: false,
      aggregateWindowMs: 10,
      transactionBuffer: [],
      customAmountButtons: [1000, 3000, 5000, 10000]
    });
    transactions.push({ buy: [], sell: [] });
    processedTxIds.push(new Set());
    txAggregates.push(new Map());
    sentiments.push("neutral");
    sentimentScores.push(0);
    soundPlayed.push(false);
    tableElements.push(null);
    createSettingsPanel();
    createTransactionTable(settings.length);
    saveSettings(currentChain, currentTokenAddress);
  });

  document.getElementById("showPriceTable")?.addEventListener("change", event => {
    isPriceTableVisible = event.target.checked;
    if (priceTable) priceTable.style.display = isPriceTableVisible ? "block" : "none";
    saveSettings(currentChain, currentTokenAddress);
  });

  document.getElementById("addCoinBtn")?.addEventListener("click", createTokenManager);
  document.getElementById("resetSettingsBtn")?.addEventListener("click", () => {
    resetState();
    createSettingsPanel();
    createPriceTable();
    settings.forEach((_, index) => createTransactionTable(index + 1));
    saveSettings(currentChain, currentTokenAddress);
  });

  document.querySelectorAll("input[name^='soundOption']").forEach(input => {
    input.addEventListener("change", () => {
      const index = parseInt(input.name.replace("soundOption", ""));
      settings[index].selectedSound = input.value;
      saveSettings(currentChain, currentTokenAddress);
    });
  });

  document.querySelectorAll("input[name^='soundMode']").forEach(input => {
    input.addEventListener("change", () => {
      const index = parseInt(input.name.replace("soundMode", ""));
      settings[index].soundMode = input.value;
      saveSettings(currentChain, currentTokenAddress);
    });
  });

  document.querySelectorAll(".aggregate-enabled").forEach(input => {
    input.addEventListener("change", () => {
      const index = parseInt(input.getAttribute("data-index"));
      settings[index].aggregateEnabled = input.checked;
      saveSettings(currentChain, currentTokenAddress);
    });
  });
}

function createTransactionTable(tableIndex) {
  const table = document.createElement("div");
  table.className = "gmgn-script-container show";
  table.id = `transactionAlertTable${tableIndex}`;
  table.style.cssText = `
    position: fixed; top: ${100 + tableIndex * 50}px; left: 300px;
    background: rgba(0, 0, 0, 0.9); color: white; padding: 10px;
    border-radius: 8px; z-index: 1000; font-family: Arial, sans-serif;
    width: 250px; cursor: move; transform: scale(${settings[tableIndex - 1].scale});
    transform-origin: top left; display: ${settings[tableIndex - 1].isVisible ? 'block' : 'none'};
  `;
  document.body.appendChild(table);
  tableElements[tableIndex - 1] = table;
  updateBackgroundColor(backgroundColor);

  let isDragging = false;
  let offsetX = 0;
  let offsetY = 0;
  table.addEventListener("mousedown", event => {
    const rect = table.getBoundingClientRect();
    isDragging = true;
    offsetX = event.clientX - rect.left;
    offsetY = event.clientY - rect.top;
  });
  document.addEventListener("mousemove", event => {
    if (isDragging) {
      event.preventDefault();
      table.style.left = event.clientX - offsetX + 'px';
      table.style.top = event.clientY - offsetY + 'px';
      table.style.transform = `scale(${settings[tableIndex - 1].scale})`;
    }
  });
  document.addEventListener("mouseup", () => {
    isDragging = false;
  });

  function updateTable() {
    const config = settings[tableIndex - 1];
    const txData = transactions[tableIndex - 1];
    table.innerHTML = `
      <div style="font-weight: bold; margin-bottom: 5px;">Table #${tableIndex}</div>
      <div>Amount: ${config.filterAmount}$</div>
      <div>Time: ${config.filterTime}s</div>
      <div>Buy: ${txData.buy.length}</div>
      <div>Sell: ${txData.sell.length}</div>
    `;
  }

  const timerId = setInterval(updateTable, 1000);
  table.setAttribute("data-timer-id", timerId);
}

function processTransaction(tableIndex, amount, type, txId) {
  const config = settings[tableIndex - 1];
  if (amount < config.filterAmount) return;

  const txData = transactions[tableIndex - 1];
  const now = Date.now();
  txData[type].push({ amount, timestamp: now, id: txId });

  // Clean old transactions
  txData.buy = txData.buy.filter(tx => now - tx.timestamp < config.filterTime * 1000);
  txData.sell = txData.sell.filter(tx => now - tx.timestamp < config.filterTime * 1000);

  if (config.isSoundEnabled && config.soundMode === "transaction") {
    const sound = soundOptions[config.selectedSound][type];
    sound.play().catch(() => logMessage("Playback Error"));
  }

  createTransactionTable(tableIndex);
}

function saveSettings(chain, address) {
  // Placeholder for saving settings to local storage or server
}

async function initialize() {
  await loadTokens();
  const tokenInfo = getCurrentTokenInfo();
  if (tokenInfo && (tokenInfo.tokenAddress !== currentTokenAddress || tokenInfo.chain !== currentChain)) {
    saveSettings(currentChain, currentTokenAddress);
    resetState();
    currentTokenAddress = tokenInfo.tokenAddress;
    currentChain = tokenInfo.chain;
    tokenName = getTokenName();
    connectQuotationSocket(tokenInfo.chain, tokenInfo.tokenAddress);
    transactions = settings.map(() => ({ buy: [], sell: [] }));
    processedTxIds = settings.map(() => new Set());
    txAggregates = settings.map(() => new Map());
    tableElements = new Array(settings.length).fill(null);
    hideBanner();
    createSettingsPanel();
    createPriceTable();
    settings.forEach((_, index) => createTransactionTable(index + 1));
    const token = tokensList.find(t => t.address.toLowerCase() === tokenInfo.tokenAddress.toLowerCase());
    if (token) {
      connectMexcSocket([token.mexcSymbol]);
    } else {
      mexcPrice = null;
      updatePriceTable();
    }
  } else if (!tokenInfo) {
    saveSettings(currentChain, currentTokenAddress);
    resetState();
    currentTokenAddress = null;
    currentChain = null;
    tokenName = null;
    document.title = "GMGN";
  }

  setTimeout(() => {
    updateScrollbars();
    updateButtonStyles();
  }, 500);
}

function updateScrollbars() {
  const container = document.getElementById("tableSettingsContainer");
  if (!container) return;
  container.style.overflowX = container.scrollWidth > container.clientWidth + 2 ? "auto" : "hidden";

  const panel = document.getElementById("transactionFilterPanel");
  if (panel) {
    const tableCount = container.querySelectorAll(".table-settings").length;
    const maxWidth = window.innerWidth - 40;
    let width = 220 + tableCount * 300 + (tableCount - 1) * 10 + 40;
    width = Math.max(380, Math.min(width, maxWidth));
    panel.style.width = `${width}px`;
    panel.style.left = "20px";
    panel.style.right = '';
    panel.style.maxWidth = "calc(100vw - 40px)";
    panel.style.overflowY = container.offsetHeight > panel.clientHeight - 40 ? "auto" : "hidden";
  }
}

function updateButtonStyles() {
  document.querySelectorAll(".amount-btn, .time-btn, .aggregate-window-btn, .decimals-btn").forEach(btn => {
    btn.removeAttribute("data-selected");
  });
  document.querySelectorAll(".table-settings").forEach((table, index) => {
    const amount = settings[index]?.filterAmount || 1000;
    table.querySelectorAll(".amount-btn").forEach(btn => {
      if (parseInt(btn.getAttribute("data-amount")) === amount) {
        btn.setAttribute("data-selected", "true");
      }
    });
    const time = settings[index]?.filterTime || 10;
    table.querySelectorAll(".time-btn").forEach(btn => {
      if (parseInt(btn.getAttribute("data-time")) === time) {
        btn.setAttribute("data-selected", "true");
      }
    });
    const windowMs = settings[index]?.aggregateWindowMs || 10;
    table.querySelectorAll(".aggregate-window-btn").forEach(btn => {
      if (parseInt(btn.getAttribute("data-window")) === windowMs) {
        btn.setAttribute("data-selected", "true");
      }
    });
  });
  document.querySelectorAll(".decimals-btn").forEach(btn => {
    if (parseInt(btn.getAttribute("data-decimals")) === priceDecimals) {
      btn.setAttribute("data-selected", "true");
    }
  });
}

function createTokenManager() {
  if (document.getElementById("gmgn-token-manager-modal")) return;
  const modal = document.createElement("div");
  modal.id = "gmgn-token-manager-modal";
  modal.style.cssText = `
    position: fixed; right: 0; bottom: 0; width: 350px; height: 480px;
    background: #181818; color: #fff; z-index: 10020; border-radius: 16px 16px 0 0; box-shadow: 0 0 32px #000a;
    padding: 24px 20px 20px 20px; font-family: Arial, sans-serif; display: flex; flex-direction: column;
  `;
  modal.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;">
      <div style="font-size:20px;font-weight:bold;">Tokens (Local)</div>
      <button id="gmgn-token-manager-close" style="background:none;border:none;color:#fff;font-size:28px;cursor:pointer;">✖</button>
    </div>
    <div id="gmgn-token-list" style="flex:1;overflow-y:auto;margin:16px 0 12px 0;"></div>
    <form id="gmgn-token-add-form" style="display:flex;flex-direction:column;gap:8px;">
      <input id="gmgn-token-address" type="text" placeholder="Token Address" required style="padding:6px 10px;">
      <div style="display:flex;gap:6px;align-items:center;">
        <span title="Same name, but on MEXC it may be different, e.g., YZY → YZYSOL" style="width:22px;height:22px;border-radius:50%;border:2px solid #38e8ff;color:#38e8ff;font-weight:bold;font-size:15px;cursor:pointer;line-height:22px;text-align:center;">?</span>
        <input id="gmgn-token-mexc" type="text" placeholder="MEXC Symbol (without _USDT)" required style="flex:1;padding:6px 10px;">
        <button type="submit" style="padding:6px 16px;background:#4caf50;color:#fff;border:none;border-radius:4px;cursor:pointer;min-width:80px;">Add</button>
      </div>
    </form>
    <div style="font-size:12px;color:#aaa;margin-top:8px;">
      <b>Note:</b> These tokens are stored locally in the browser.<br>
      To save globally, add them to tokens.json.
    </div>
  `;
  document.body.appendChild(modal);
  modal.querySelector("#gmgn-token-manager-close").onclick = () => modal.remove();

  function updateTokenList() {
    const list = modal.querySelector("#gmgn-token-list");
    const tokens = getStoredTokens();
    if (!tokens.length) {
      list.innerHTML = `<div style="color:#aaa;text-align:center;margin-top:40px;">No added tokens</div>`;
      return;
    }
    list.innerHTML = tokens.map((token, index) => {
      let address = token.address;
      if (typeof address === "string" && address.length > 16) {
        address = address.slice(0, 10) + "..." + address.slice(-6);
      }
      return `
        <div style="display:flex;align-items:center;justify-content:space-between;padding:6px 0;border-bottom:1px solid #333;">
          <div>
            <div style="font-weight:bold;font-size:17px;">${token.mexcSymbol}</div>
            <div style="font-size:12px;color:#aaa;word-break:break-all;">${address}</div>
          </div>
          <button data-idx="${index}" style="color:#ff5555;font-size:20px;cursor:pointer;" title="Delete">🗑️</button>
        </div>
      `;
    }).join('');
    list.querySelectorAll("button[data-idx]").forEach(button => {
      button.onclick = () => {
        const idx = parseInt(button.getAttribute("data-idx"));
        const tokens = getStoredTokens();
        if (tokens[idx]) {
          removeToken(tokens[idx].address, tokens[idx].chain);
          updateTokenList();
        }
      };
    });
  }

  updateTokenList();
  modal.querySelector("#gmgn-token-add-form").onsubmit = function(event) {
    event.preventDefault();
    const address = modal.querySelector("#gmgn-token-address").value.trim();
    let mexcSymbol = modal.querySelector("#gmgn-token-mexc").value.trim();
    if (!address || !mexcSymbol) return;
    if (!/_USDT$/i.test(mexcSymbol)) {
      mexcSymbol += "_USDT";
    }
    const tokens = getStoredTokens();
    if (tokens.some(t => t.address.toLowerCase() === address.toLowerCase() && t.chain === currentChain)) {
      alert("Token already added");
      return;
    }
    const token = {
      address,
      ticker: '',
      mexcSymbol,
      chain: currentChain
    };
    addToken(token);
    updateTokenList();
    modal.querySelector("#gmgn-token-address").value = '';
    modal.querySelector("#gmgn-token-mexc").value = '';
  };
}

function createAmountEditor(tableIndex) {
  if (document.getElementById("amount-buttons-editor")) {
    document.getElementById("amount-buttons-editor").remove();
  }
  const amounts = settings[tableIndex].customAmountButtons.slice();
  const editor = document.createElement("div");
  editor.id = "amount-buttons-editor";
  editor.style.cssText = `
    position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
    background: linear-gradient(135deg, #232526 0%, #414345 100%); color: white;
    padding: 20px; border-radius: 10px; box-shadow: 0 4px 32px 0 rgba(0,0,0,0.5);
    z-index: 10002; font-family: 'Segoe UI', 'Inter', Arial, sans-serif;
  `;
  editor.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
      <h3 style="margin: 0; font-size: 18px;">Edit Amount Filters</h3>
      <button id="close-amount-editor" style="background: none; border: none; color: white; font-size: 20px; cursor: pointer;">✕</button>
    </div>
    <div style="display: grid; grid-template-columns: 1fr; gap: 10px; margin-bottom: 15px;">
      ${amounts.map((amount, idx) => `
        <div style="display: flex; align-items: center; gap: 10px;">
          <label style="width: 100px;">Button ${idx + 1}:</label>
          <input type="number" id="amount-editor-value-${idx}" value="${amount}" min="1" style="width: 120px; padding: 8px; border-radius: 5px; border: none; background: #292d32; color: white;">
          <span>$</span>
        </div>
      `).join('')}
    </div>
    <div style="display: flex; justify-content: flex-end; gap: 10px;">
      <button id="save-amount-buttons" style="padding: 8px 16px; border-radius: 5px; border: none; background: #38e8ff; color: #232526; cursor: pointer;">Save</button>
      <button id="reset-amount-buttons" style="padding: 8px 16px; border-radius: 5px; border: 1px solid #ff5555; background: none; color: #ff5555; cursor: pointer;">Reset</button>
    </div>
  `;
  document.body.appendChild(editor);

  document.getElementById("close-amount-editor").addEventListener("click", () => editor.remove());
  document.getElementById("reset-amount-buttons").addEventListener("click", () => {
    const defaults = [1000, 3000, 5000, 10000];
    defaults.forEach((amount, idx) => {
      const input = document.getElementById(`amount-editor-value-${idx}`);
      if (input) input.value = amount;
    });
  });
  document.getElementById("save-amount-buttons").addEventListener("click", () => {
    const newAmounts = [];
    for (let i = 0; i < amounts.length; i++) {
      const value = parseInt(document.getElementById(`amount-editor-value-${i}`).value);
      if (!isNaN(value) && value > 0) {
        newAmounts.push(value);
      } else {
        alert("All values must be positive numbers!");
        return;
      }
    }
    const buttons = document.querySelectorAll(`.amount-btn[data-index="${tableIndex}"]`);
    buttons.forEach((btn, idx) => {
      btn.setAttribute("data-amount", newAmounts[idx]);
      btn.textContent = `${newAmounts[idx]} $`;
    });
    const display = document.getElementById(`currentFilterDisplay${tableIndex}`);
    const currentAmount = parseInt(display.textContent.match(/\d+/)[0]);
    const idx = amounts.indexOf(currentAmount);
    if (idx !== -1) {
      settings[tableIndex].filterAmount = newAmounts[idx];
      display.textContent = `Current: ${newAmounts[idx]} $`;
    }
    settings[tableIndex].customAmountButtons = newAmounts.slice();
    saveSettings(currentChain, currentTokenAddress);
    editor.remove();
  });

  const closeOnClickOutside = event => {
    if (!editor.contains(event.target) && event.target.id !== "amount-buttons-editor") {
      editor.remove();
      document.removeEventListener("mousedown", closeOnClickOutside);
    }
  };
  document.addEventListener("mousedown", closeOnClickOutside);
  document.addEventListener("keydown", event => {
    if (event.key === "Escape") {
      editor.remove();
      document.removeEventListener("mousedown", closeOnClickOutside);
    }
  });
}

document.addEventListener("click", event => {
  if (event.target.classList.contains("edit-section-icon")) {
    event.preventDefault();
    event.stopPropagation();
    const table = event.target.closest(".table-settings");
    if (table) {
      const index = parseInt(table.getAttribute("data-index"));
      createAmountEditor(index);
    }
  }
  if (event.target.classList.contains("filter-btn") || event.target.classList.contains("apply-btn")) {
    const siblings = event.target.parentElement?.querySelectorAll(".filter-btn, .apply-btn");
    siblings?.forEach(btn => btn.classList.remove("selected"));
    event.target.classList.add("selected");
  }
  if (event.target.classList.contains("visibility-icon") || event.target.classList.contains("sound-icon")) {
    event.target.classList.toggle("selected");
  }
});

window.addEventListener("resize", updateScrollbars);
setInterval(updateScrollbars, 500);
setTimeout(updateButtonStyles, 1000);

initialize().catch(error => console.error("Initialization error:", error));
})();
