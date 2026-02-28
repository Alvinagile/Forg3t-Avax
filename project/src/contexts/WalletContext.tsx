import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import Web3 from 'web3';

// Define the Ethereum provider interface
interface EthereumProvider {
  request: (args: { method: string; params?: any[] }) => Promise<any>;
  on: (event: string, callback: (...args: any[]) => void) => void;
  removeListener: (event: string, callback: (...args: any[]) => void) => void;
}

// Extend window interface with ethereum property
declare global {
  interface Window {
    ethereum?: EthereumProvider;
  }
}

interface WalletContextType {
  account: string | null;
  isConnected: boolean;
  connectWallet: () => Promise<void>;
  disconnectWallet: () => void;
  web3: Web3 | null;
  walletClient: any | null; // Add walletClient to the context
  isWalletAvailable: boolean; // Add flag to indicate if wallet is available
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

export function WalletProvider({ children }: { children: ReactNode }) {
  const [account, setAccount] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [web3, setWeb3] = useState<Web3 | null>(null);
  const [walletClient, setWalletClient] = useState<any | null>(null);
  const [isWalletAvailable, setIsWalletAvailable] = useState(false);

  useEffect(() => {
    // Check if wallet provider is available
    const checkWalletAvailability = () => {
      setIsWalletAvailable(typeof window !== 'undefined' && !!window.ethereum);
    };

    checkWalletAvailability();

    // Listen for wallet provider changes
    if (typeof window !== 'undefined') {
      const handleEthereumLoaded = () => {
        checkWalletAvailability();
      };

      // If ethereum is not yet available, listen for it
      if (!window.ethereum) {
        window.addEventListener('ethereum#loaded', handleEthereumLoaded);
      }

      return () => {
        window.removeEventListener('ethereum#loaded', handleEthereumLoaded);
      };
    }
  }, []);

  useEffect(() => {
    // Check if wallet is already connected
    const savedAccount = localStorage.getItem('wallet_account');
    if (savedAccount && isWalletAvailable) {
      setAccount(savedAccount);
      // Don't automatically set isConnected to true, let the wallet provider validate it
      validateWalletConnection(savedAccount);
    }
  }, [isWalletAvailable]);

  const validateWalletConnection = async (savedAccount: string) => {
    try {
      if (typeof window !== 'undefined' && window.ethereum) {
        // Request accounts to see if wallet is still connected
        const accounts = await window.ethereum.request({
          method: 'eth_accounts',
        });
        
        // Check if the saved account is still in the connected accounts
        if (accounts.includes(savedAccount)) {
          setIsConnected(true);
          
          // Initialize web3
          const web3Instance = new Web3(window.ethereum as any);
          setWeb3(web3Instance);
          
          // Create wallet client
          const walletClientInstance = {
            account: {
              address: savedAccount
            }
          };
          setWalletClient(walletClientInstance);
        } else {
          // Account is no longer connected, clean up
          localStorage.removeItem('wallet_account');
          setAccount(null);
        }
      }
    } catch (error) {
      console.error('Failed to validate wallet connection:', error);
      // Clean up on error
      localStorage.removeItem('wallet_account');
      setAccount(null);
    }
  };

  const connectWallet = async () => {
    try {
      if (typeof window !== 'undefined' && window.ethereum) {
        // Request account access
        const accounts = await window.ethereum.request({
          method: 'eth_requestAccounts',
        });
        
        const accountAddress = accounts[0];
        setAccount(accountAddress);
        setIsConnected(true);
        localStorage.setItem('wallet_account', accountAddress);
        
        // Initialize web3
        const web3Instance = new Web3(window.ethereum as any);
        setWeb3(web3Instance);
        
        // Create wallet client
        const walletClientInstance = {
          account: {
            address: accountAddress
          }
        };
        setWalletClient(walletClientInstance);
        
        console.log('Wallet connected:', accountAddress);
      } else {
        alert('Please install MetaMask or another Ethereum wallet extension');
      }
    } catch (error) {
      console.error('Failed to connect wallet:', error);
      alert('Failed to connect wallet. Please try again.');
    }
  };

  const disconnectWallet = () => {
    setAccount(null);
    setIsConnected(false);
    setWeb3(null);
    setWalletClient(null);
    localStorage.removeItem('wallet_account');
    console.log('Wallet disconnected');
  };

  return (
    <WalletContext.Provider
      value={{
        account,
        isConnected,
        connectWallet,
        disconnectWallet,
        web3,
        walletClient,
        isWalletAvailable,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  const context = useContext(WalletContext);
  if (context === undefined) {
    throw new Error('useWallet must be used within a WalletProvider');
  }
  return context;
}