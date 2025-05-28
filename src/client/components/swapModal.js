import { useState, useEffect, useCallback } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { VersionedTransaction, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import { getAccount, getAssociatedTokenAddress } from '@solana/spl-token';
import { css } from '@firebolt-dev/css'

/**
 * @typedef {Object} Token
 * @property {string} address
 * @property {string} symbol
 * @property {string} name
 * @property {number} decimals
 * @property {string} [logoURI]
 */

/**
 * @typedef {Object} QuoteResponse
 * @property {string} inputMint
 * @property {string} inAmount
 * @property {string} outputMint
 * @property {string} outAmount
 * @property {string} otherAmountThreshold
 * @property {string} swapMode
 * @property {number} slippageBps
 * @property {null} platformFee
 * @property {string} priceImpactPct
 * @property {Array<{swapInfo: {ammKey: string, label: string, inputMint: string, outputMint: string, inAmount: string, outAmount: string, feeAmount: string, feeMint: string}, percent: number}>} routePlan
 */

// Hardcoded tokens
const TOKENS = [
  {
    address: 'So11111111111111111111111111111111111111112',
    symbol: 'SOL',
    name: 'Solana',
    decimals: 9,
    logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png'
  },
  {
    address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    symbol: 'USDC',
    name: 'USD Coin',
    decimals: 6,
    logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png'
  },

  // TODO: get env variable for world token (currently env variables aren't exposed to the client)
];

export const SwapModal = () => {
  const { connection } = useConnection();
  const wallet = useWallet();
  
  const [inputToken, setInputToken] = useState(TOKENS[0]); // SOL
  const [outputToken, setOutputToken] = useState(TOKENS[1]); // USDC
  const [inputAmount, setInputAmount] = useState('');
  const [slippage, setSlippage] = useState(0.5); // 0.5%
  const [loading, setLoading] = useState(false);
  const [quoteResponse, setQuoteResponse] = useState(null);
  const [swapStatus, setSwapStatus] = useState(null); // 'success', 'error', or null
  const [statusMessage, setStatusMessage] = useState('');
  const [balances, setBalances] = useState({}); // { tokenAddress: balance }
  const [loadingBalances, setLoadingBalances] = useState(false);
  
  // Clear status message after 5 seconds
  useEffect(() => {
    if (swapStatus) {
      const timer = setTimeout(() => {
        setSwapStatus(null);
        setStatusMessage('');
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [swapStatus]);

  // Fetch quote when input changes
  useEffect(() => {
    if (!inputToken || !outputToken || !inputAmount || parseFloat(inputAmount) === 0) {
      setQuoteResponse(null);
      return;
    }

    const fetchQuote = async () => {
      setLoading(true);
      try {
        const amount = Math.floor(parseFloat(inputAmount) * Math.pow(10, inputToken.decimals));
        const response = await fetch(
          `https://quote-api.jup.ag/v6/quote?inputMint=${inputToken.address}&outputMint=${outputToken.address}&amount=${amount}&slippageBps=${Math.floor(slippage * 100)}`
        );
        const data = await response.json();
        setQuoteResponse(data);
      } catch (error) {
        console.error('Error fetching quote:', error);
      } finally {
        setLoading(false);
      }
    };

    const debounceTimer = setTimeout(fetchQuote, 500);
    return () => clearTimeout(debounceTimer);
  }, [inputToken, outputToken, inputAmount, slippage]);

  // Fetch wallet balances
  const fetchBalances = useCallback(async () => {
    if (!wallet.publicKey || !connection) return;
    
    setLoadingBalances(true);
    try {
      const newBalances = {};
      
      // Fetch SOL balance
      const solBalance = await connection.getBalance(wallet.publicKey);
      newBalances['So11111111111111111111111111111111111111112'] = solBalance / LAMPORTS_PER_SOL;
      
      // Fetch SPL token balances
      for (const token of TOKENS) {
        if (token.address === 'So11111111111111111111111111111111111111112') continue; // Skip SOL, already fetched
        
        try {
          const tokenAccount = await getAssociatedTokenAddress(
            new PublicKey(token.address),
            wallet.publicKey
          );
          const accountInfo = await getAccount(connection, tokenAccount);
          newBalances[token.address] = Number(accountInfo.amount) / Math.pow(10, token.decimals);
        } catch (error) {
          // Token account doesn't exist, balance is 0
          newBalances[token.address] = 0;
        }
      }
      
      setBalances(newBalances);
    } catch (error) {
      console.error('Error fetching balances:', error);
    } finally {
      setLoadingBalances(false);
    }
  }, [wallet.publicKey, connection]);

  // Fetch balances when wallet connects or tokens change
  useEffect(() => {
    if (wallet.connected) {
      fetchBalances();
    } else {
      setBalances({});
    }
  }, [wallet.connected, fetchBalances]);

  // Refetch balances after successful swap
  useEffect(() => {
    if (swapStatus === 'success' && wallet.connected) {
      // Delay to allow blockchain to update
      setTimeout(fetchBalances, 2000);
    }
  }, [swapStatus, wallet.connected, fetchBalances]);

  // Handle max button click
  const handleMaxClick = () => {
    const balance = balances[inputToken?.address];
    if (balance && balance > 0) {
      // For SOL, leave a small amount for transaction fees
      if (inputToken.address === 'So11111111111111111111111111111111111111112') {
        const maxAmount = Math.max(0, balance - 0.01); // Reserve 0.01 SOL for fees
        setInputAmount(maxAmount.toString());
      } else {
        setInputAmount(balance.toString());
      }
    }
  };

  const handleSwap = async () => {
    if (!wallet.publicKey || !wallet.signTransaction || !quoteResponse) return;

    try {
      setLoading(true);
      
      // Get serialized transactions for the swap
      const { swapTransaction } = await (
        await fetch('https://quote-api.jup.ag/v6/swap', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            quoteResponse,
            userPublicKey: wallet.publicKey.toString(),
            wrapAndUnwrapSol: true,
            // dynamicComputeUnitLimit: true, // Allow dynamic compute unit limit
            // prioritizationFeeLamports: 'auto' // or custom lamports
          })
        })
      ).json();

      // Deserialize the transaction
      const swapTransactionBuf = Buffer.from(swapTransaction, 'base64');
      const transaction = VersionedTransaction.deserialize(swapTransactionBuf);

      // Sign and send the transaction
      const signedTransaction = await wallet.signTransaction(transaction);
      const rawTransaction = signedTransaction.serialize();
      const txid = await connection.sendRawTransaction(rawTransaction, {
        skipPreflight: false,
        maxRetries: 2
      });

      // Wait for confirmation
      const latestBlockHash = await connection.getLatestBlockhash();
      await connection.confirmTransaction({
        blockhash: latestBlockHash.blockhash,
        lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
        signature: txid
      }, 'confirmed');

      console.log('Swap successful:', txid);
      setSwapStatus('success');
      setStatusMessage(`Swap successful! <a href="https://solscan.io/tx/${txid}" target="_blank" rel="noopener noreferrer">View on Solscan</a>`);
      setInputAmount('');
      setQuoteResponse(null);
    } catch (error) {
      console.error('Swap failed:', error);
      setSwapStatus('error');
      setStatusMessage('Swap failed: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleTokenSelect = (token, type) => {
    if (type === 'input') {
      setInputToken(token);
      // If the selected input token is the same as output token, clear output token
      if (outputToken && token.address === outputToken.address) {
        setOutputToken(null);
      }
    } else {
      setOutputToken(token);
      // If the selected output token is the same as input token, clear input token
      if (inputToken && token.address === inputToken.address) {
        setInputToken(null);
      }
    }
  };

  const switchTokens = () => {
    const temp = inputToken;
    setInputToken(outputToken);
    setOutputToken(temp);
    setInputAmount('');
  };

  const outputAmount = quoteResponse 
    ? (parseInt(quoteResponse.outAmount) / Math.pow(10, outputToken?.decimals || 9)).toFixed(6)
    : '';

  return (
    <div
      className='swap-modal'
      css={css`
        width: 100%;
        background-color: rgba(0, 0, 0, 0.2);
        border-radius: 0.75rem;
        padding: 1rem;
        border: 1px solid rgba(255, 255, 255, 0.05);
        color: white;
        font-family: system-ui, -apple-system, sans-serif;
        
        .swap-title {
          font-size: 1.125rem;
          font-weight: 500;
          text-align: center;
          margin-bottom: 1rem;
          color: rgba(255, 255, 255, 0.9);
        }
        
        .token-section {
          background-color: rgba(0, 0, 0, 0.3);
          border-radius: 0.5rem;
          padding: 0.75rem;
          margin-bottom: 0.75rem;
          border: 1px solid rgba(255, 255, 255, 0.05);
          
          .token-label {
            font-size: 0.75rem;
            color: rgba(255, 255, 255, 0.6);
            margin-bottom: 0.5rem;
            text-transform: uppercase;
            letter-spacing: 0.025em;
          }
          
          .token-input-row {
            display: flex;
            flex-direction: column;
            gap: 0.5rem;
            margin-bottom: 0.5rem;
            
            .input-container {
              display: flex;
              align-items: center;
              gap: 0.5rem;
              
              input {
                flex: 1;
                background: transparent;
                border: none;
                color: white;
                font-size: 1.125rem;
                outline: none;
                min-width: 0;
                
                &::placeholder {
                  color: rgba(255, 255, 255, 0.3);
                }
              }
            }
            
            .controls-container {
              display: flex;
              align-items: center;
              justify-content: space-between;
              gap: 0.75rem;
              
              .max-button {
                background-color: rgba(64, 64, 64, 0.8);
                border: 1px solid rgba(128, 128, 128, 0.6);
                border-radius: 0.25rem;
                color: white;
                padding: 0.375rem 0.75rem;
                font-size: 0.75rem;
                cursor: pointer;
                transition: all 0.2s ease;
                white-space: nowrap;
                
                &:hover {
                  background-color: rgba(96, 96, 96, 0.8);
                  border-color: rgba(160, 160, 160, 0.6);
                }
                
                &:disabled {
                  background-color: rgba(0, 0, 0, 0.4);
                  border-color: rgba(255, 255, 255, 0.1);
                  color: rgba(255, 255, 255, 0.4);
                  cursor: not-allowed;
                }
              }
              
              select {
                background-color: rgba(0, 0, 0, 0.4);
                border: 1px solid rgba(255, 255, 255, 0.1);
                border-radius: 0.375rem;
                color: white;
                padding: 0.5rem 0.75rem;
                font-size: 0.875rem;
                outline: none;
                cursor: pointer;
                min-width: 5rem;
                flex: 1;
                
                &:hover {
                  border-color: rgba(255, 255, 255, 0.2);
                }
                
                option {
                  background-color: rgba(15, 16, 24, 0.95);
                  color: white;
                }
              }
            }
          }
          
          .balance-info {
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-size: 0.75rem;
            color: rgba(255, 255, 255, 0.6);
            
            .balance-label {
              color: rgba(255, 255, 255, 0.5);
            }
            
            .balance-value {
              color: rgba(255, 255, 255, 0.7);
            }
          }
        }
        
        .swap-switch {
          display: flex;
          justify-content: center;
          margin: 0.5rem 0;
          
          button {
            background-color: rgba(0, 0, 0, 0.4);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 0.375rem;
            padding: 0.375rem;
            color: rgba(255, 255, 255, 0.6);
            cursor: pointer;
            transition: all 0.2s ease;
            
            &:hover {
              background-color: rgba(0, 0, 0, 0.6);
              color: white;
              border-color: rgba(255, 255, 255, 0.2);
            }
            
            svg {
              display: block;
              width: 16px;
              height: 16px;
            }
          }
        }
        
        .route-info {
          background-color: rgba(0, 0, 0, 0.3);
          border-radius: 0.5rem;
          padding: 0.75rem;
          margin-bottom: 0.75rem;
          border: 1px solid rgba(255, 255, 255, 0.05);
          
          .route-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 0.375rem;
            font-size: 0.75rem;
            
            &:last-child {
              margin-bottom: 0;
            }
            
            .route-label {
              color: rgba(255, 255, 255, 0.6);
            }
            
            .route-value {
              color: rgba(255, 255, 255, 0.9);
              text-align: right;
            }
          }
        }
        
        .slippage-section {
          background-color: rgba(0, 0, 0, 0.3);
          border-radius: 0.5rem;
          padding: 0.75rem;
          margin-bottom: 1rem;
          border: 1px solid rgba(255, 255, 255, 0.05);
          
          .slippage-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            
            .slippage-label {
              font-size: 0.75rem;
              color: rgba(255, 255, 255, 0.6);
              text-transform: uppercase;
              letter-spacing: 0.025em;
            }
            
            .slippage-buttons {
              display: flex;
              gap: 0.25rem;
              
              button {
                padding: 0.25rem 0.5rem;
                border-radius: 0.25rem;
                border: 1px solid rgba(255, 255, 255, 0.1);
                background-color: rgba(0, 0, 0, 0.4);
                color: rgba(255, 255, 255, 0.7);
                font-size: 0.75rem;
                cursor: pointer;
                transition: all 0.2s ease;
                
                &:hover {
                  background-color: rgba(0, 0, 0, 0.6);
                  color: white;
                }
                
                &.active {
                  background-color: rgba(64, 64, 64, 0.9);
                  border-color: rgba(128, 128, 128, 0.8);
                  color: white;
                }
              }
            }
          }
        }
        
        .swap-button {
          width: 100%;
          padding: 0.75rem;
          border-radius: 0.5rem;
          border: none;
          font-size: 0.875rem;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s ease;
          
          &:enabled {
            background: linear-gradient(135deg, rgba(64, 64, 64, 0.9), rgba(32, 32, 32, 0.9));
            color: white;
            border: 1px solid rgba(128, 128, 128, 0.3);
            
            &:hover {
              background: linear-gradient(135deg, rgba(96, 96, 96, 0.9), rgba(48, 48, 48, 0.9));
              transform: translateY(-1px);
              box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
              border-color: rgba(160, 160, 160, 0.4);
            }
          }
          
          &:disabled {
            background-color: rgba(0, 0, 0, 0.4);
            color: rgba(255, 255, 255, 0.4);
            cursor: not-allowed;
          }
        }
        
        .status-message {
          margin-top: 0.75rem;
          padding: 0.75rem;
          border-radius: 0.5rem;
          font-size: 0.875rem;
          text-align: center;
          animation: fadeIn 0.3s ease-in-out;
          
          &.success {
            background-color: rgba(34, 197, 94, 0.1);
            border: 1px solid rgba(34, 197, 94, 0.3);
            color: rgba(34, 197, 94, 0.9);
          }
          
          &.error {
            background-color: rgba(239, 68, 68, 0.1);
            border: 1px solid rgba(239, 68, 68, 0.3);
            color: rgba(239, 68, 68, 0.9);
          }
          
          a {
            color: inherit;
            text-decoration: underline;
            font-weight: 500;
            
            &:hover {
              text-decoration: none;
              opacity: 0.8;
            }
          }
        }
        
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}
    >
      
      {/* Input Token */}
      <div className='token-section'>
        <div className='token-label'>In</div>
        <div className='token-input-row'>
          <div className='input-container'>
            <input
              type="number"
              value={inputAmount}
              onChange={(e) => setInputAmount(e.target.value)}
              placeholder="0.00"
            />
          </div>
          <div className='controls-container'>
            <button
              className='max-button'
              onClick={handleMaxClick}
              disabled={!wallet.connected || !inputToken || !balances[inputToken?.address] || balances[inputToken?.address] === 0}
            >
              MAX
            </button>
            <select
              value={inputToken?.address || ''}
              onChange={(e) => {
                const token = TOKENS.find(t => t.address === e.target.value);
                if (token) handleTokenSelect(token, 'input');
              }}
            >
              <option value="">Select token</option>
              {TOKENS.slice(0, 50).map((token) => (
                <option 
                  key={token.address} 
                  value={token.address}
                  disabled={outputToken && token.address === outputToken.address}
                >
                  {token.symbol}
                </option>
              ))}
            </select>
          </div>
        </div>
        {wallet.connected && inputToken && (
          <div className='balance-info'>
            <span className='balance-label'>Balance:</span>
            <span className='balance-value'>
              {loadingBalances ? 'Loading...' : 
                balances[inputToken.address] !== undefined ? 
                  `${balances[inputToken.address].toFixed(6)} ${inputToken.symbol}` : 
                  '0.000000 ' + inputToken.symbol
              }
            </span>
          </div>
        )}
      </div>

      {/* Swap Button */}
      <div className='swap-switch'>
        <button onClick={switchTokens}>
          <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
          </svg>
        </button>
      </div>

      {/* Output Token */}
      <div className='token-section'>
        <div className='token-label'>Out</div>
        <div className='token-input-row'>
          <div className='input-container'>
            <input
              type="number"
              value={outputAmount}
              readOnly
              placeholder="0.00"
            />
          </div>
          <div className='controls-container'>
            <select
              value={outputToken?.address || ''}
              onChange={(e) => {
                const token = TOKENS.find(t => t.address === e.target.value);
                if (token) handleTokenSelect(token, 'output');
              }}
            >
              <option value="">Select token</option>
              {TOKENS.slice(0, 50).map((token) => (
                <option 
                  key={token.address} 
                  value={token.address}
                  disabled={inputToken && token.address === inputToken.address}
                >
                  {token.symbol}
                </option>
              ))}
            </select>
          </div>
        </div>
        {wallet.connected && outputToken && (
          <div className='balance-info'>
            <span className='balance-label'>Balance:</span>
            <span className='balance-value'>
              {loadingBalances ? 'Loading...' : 
                balances[outputToken.address] !== undefined ? 
                  `${balances[outputToken.address].toFixed(6)} ${outputToken.symbol}` : 
                  '0.000000 ' + outputToken.symbol
              }
            </span>
          </div>
        )}
      </div>

      {/* Route Info */}
      {quoteResponse && (
        <div className='route-info'>
          <div className='route-row'>
            <span className='route-label'>Price Impact</span>
            <span className='route-value'>{parseFloat(quoteResponse.priceImpactPct).toFixed(2)}%</span>
          </div>
          <div className='route-row'>
            <span className='route-label'>Minimum Received</span>
            <span className='route-value'>
              {(parseInt(quoteResponse.otherAmountThreshold) / Math.pow(10, outputToken?.decimals || 9)).toFixed(6)} {outputToken?.symbol}
            </span>
          </div>
          <div className='route-row'>
            <span className='route-label'>Route</span>
            <span className='route-value'>{quoteResponse.routePlan.length} hop(s)</span>
          </div>
        </div>
      )}

      {/* Slippage Settings */}
      <div className='slippage-section'>
        <div className='slippage-header'>
          <span className='slippage-label'>Slippage Tolerance</span>
          <div className='slippage-buttons'>
            {[0.1, 0.5, 1.0].map((value) => (
              <button
                key={value}
                onClick={() => setSlippage(value)}
                className={slippage === value ? 'active' : ''}
              >
                {value}%
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Swap Button */}
      <button
        className='swap-button'
        onClick={handleSwap}
        disabled={!wallet.connected || loading || !quoteResponse || !inputAmount}
      >
        {!wallet.connected
          ? 'Connect Wallet'
          : loading
          ? 'Waiting for approval...'
          : !inputAmount
          ? 'Enter an amount'
          : !quoteResponse
          ? 'No route available'
          : 'Swap'}
      </button>

      {/* Status Message */}
      {swapStatus && (
        <div 
          className={`status-message ${swapStatus}`}
          dangerouslySetInnerHTML={{ __html: statusMessage }}
        />
      )}
    </div>
  );
}; 