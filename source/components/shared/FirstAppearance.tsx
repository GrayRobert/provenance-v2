interface FirstAppearanceProps {
  timestamp: string;
  alwaysVisible?: boolean;
}

export default function FirstAppearance({ 
  timestamp, 
  alwaysVisible = false 
}: FirstAppearanceProps) {
  const formatTimestamp = (ts: string) => {
    return new Date(ts).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const className = alwaysVisible
    ? 'text-xs text-gray-500'
    : 'text-xs text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity';

  return (
    <div className={className}>
      🕒 First written {formatTimestamp(timestamp)}
    </div>
  );
}





