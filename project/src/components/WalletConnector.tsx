
import { useWallet } from '../contexts/WalletContext';
import { Shield, AlertTriangle } from 'lucide-react';

export function WalletConnector() {
  const { account, isConnected, connectWallet, disconnectWallet, isWalletAvailable } = useWallet();

  const formatAddress = (address: string) => {
    return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
  };

  // Show wallet installation prompt if wallet is not available
  if (!isWalletAvailable) {
    return (
      <div className="flex items-center bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-2">
        <AlertTriangle className="h-4 w-4 text-yellow-600 mr-2" />
        <span className="text-yellow-700 text-sm font-medium">
          Install Wallet
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-center">
      {isConnected ? (
        <div className="flex items-center space-x-2">
          <div className="flex items-center bg-green-50 border border-green-200 rounded-lg px-3 py-2">
            <Shield className="h-4 w-4 text-green-600 mr-2" />
            <span className="text-green-700 text-sm font-medium">
              {formatAddress(account || '')}
            </span>
          </div>
          <button
            onClick={disconnectWallet}
            className="text-[#4B4B4B] hover:text-[#111111] text-sm transition-colors font-medium"
          >
            Disconnect
          </button>
        </div>
      ) : (
        <button
          onClick={connectWallet}
          className="flex items-center bg-[#2F80ED] hover:bg-[#2870CE] text-white px-4 py-2 rounded-lg transition-colors font-medium"
        >
          <Shield className="h-4 w-4 mr-2" />
          Connect Wallet
        </button>
      )}
    </div>
  );
}