'use client';

import { useWebSocket } from '@/hooks/useWebSocket';
import { 
  WifiIcon, 
  ExclamationTriangleIcon,
  ArrowPathIcon 
} from '@heroicons/react/24/outline';

export function WebSocketStatus() {
  const { isConnected, error, reconnectCount, reconnect } = useWebSocket({ autoConnect: false });

  if (isConnected) {
    return (
      <div className="flex items-center space-x-2 text-success-600">
        <WifiIcon className="h-4 w-4" />
        <span className="text-sm font-medium">Live</span>
        <div className="w-2 h-2 bg-success-500 rounded-full animate-pulse"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center space-x-2 text-danger-600">
        <ExclamationTriangleIcon className="h-4 w-4" />
        <span className="text-sm font-medium">
          {reconnectCount > 0 ? `Reconnecting... (${reconnectCount})` : 'Disconnected'}
        </span>
        <button
          onClick={reconnect}
          className="p-1 hover:bg-danger-50 rounded"
          title="Reconnect"
        >
          <ArrowPathIcon className="h-3 w-3" />
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center space-x-2 text-warning-600">
      <div className="w-4 h-4 border-2 border-warning-200 border-t-warning-600 rounded-full animate-spin"></div>
      <span className="text-sm font-medium">Connecting...</span>
    </div>
  );
}