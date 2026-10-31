interface SourceBadgeProps {
  source: string;
  showTooltip?: boolean;
}

export default function SourceBadge({ source, showTooltip = false }: SourceBadgeProps) {
  const getStyles = () => {
    switch (source) {
      case 'typed':
        return 'bg-blue-500/20 text-blue-800 dark:text-blue-300 border-blue-500/30';
      case 'paste':
        return 'bg-[#f6992c]/20 text-[#b35a0a] dark:text-[#f6992c] border-[#f6992c]/30';
      case 'import':
        return 'bg-[#f6992c]/20 text-[#b35a0a] dark:text-[#f6992c] border-[#f6992c]/30';
      case 'reorder':
        return 'bg-violet-500/20 text-violet-800 dark:text-violet-300 border-violet-500/30';
      case 'system':
        return 'bg-border text-muted border-border';
      default:
        return 'bg-border text-muted border-border';
    }
  };

  const getTooltip = () => {
    switch (source) {
      case 'typed':
        return 'Direct keyboard input - strongest evidence of authorship';
      case 'paste':
        return 'Content pasted from clipboard';
      case 'import':
        return 'Imported from file';
      case 'reorder':
        return 'Section order changed';
      case 'system':
        return 'System-generated event';
      default:
        return '';
    }
  };

  const getLabel = () => {
    switch (source) {
      case 'import':
        return 'Imported';
      case 'reorder':
        return 'Reordered';
      default:
        return source;
    }
  };

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${getStyles()}`}
      title={showTooltip ? getTooltip() : undefined}
    >
      {getLabel()}
    </span>
  );
}





