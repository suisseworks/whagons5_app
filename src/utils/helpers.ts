// Priority color helper
export const priorityColor = (priority: string): string => {
  switch (priority.toLowerCase()) {
    case 'high':
      return '#EF5350'; // Colors.red.shade500
    case 'medium':
      return '#FFA726'; // Colors.orange.shade500
    default:
      return '#66BB6A'; // Colors.green.shade500
  }
};

// Status color helper
export const statusColor = (status: string): string => {
  switch (status.toLowerCase()) {
    case 'in progress':
      return '#42A5F5'; // Colors.blue.shade500
    case 'scheduled':
      return '#AB47BC'; // Colors.purple.shade400
    case 'blocked':
      return '#EF5350'; // Colors.red.shade400
    case 'done':
      return '#43A047'; // Colors.green.shade600
    default:
      return '#9E9E9E'; // Colors.grey.shade500
  }
};

// Format timestamp for notifications
export const formatTimestamp = (timestamp: Date): string => {
  const now = new Date();
  const diffMs = now.getTime() - timestamp.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 60) {
    return `${diffMins}m ago`;
  } else if (diffHours < 24) {
    return `${diffHours}h ago`;
  } else if (diffDays < 7) {
    return `${diffDays}d ago`;
  } else {
    return `${timestamp.getMonth() + 1}/${timestamp.getDate()}/${timestamp.getFullYear()}`;
  }
};

// Get initials from name
export const getInitials = (name: string): string => {
  if (!name || name.length === 0) return '?';
  return name[0].toUpperCase();
};

// Get daily index for quotes/images (changes once per day)
export const getDailyIndex = (listLength: number): number => {
  const now = new Date();
  const daysSinceEpoch = Math.floor(now.getTime() / (1000 * 60 * 60 * 24));
  return daysSinceEpoch % listLength;
};

// Inspirational quotes
export const quotes = [
  { text: 'Every accomplishment starts with the decision to try.', author: 'John F. Kennedy' },
  { text: 'The only way to do great work is to love what you do.', author: 'Steve Jobs' },
  { text: 'Success is not final, failure is not fatal: it is the courage to continue that counts.', author: 'Winston Churchill' },
  { text: 'Believe you can and you\'re halfway there.', author: 'Theodore Roosevelt' },
  { text: 'The future belongs to those who believe in the beauty of their dreams.', author: 'Eleanor Roosevelt' },
  { text: 'It does not matter how slowly you go as long as you do not stop.', author: 'Confucius' },
  { text: 'Everything you\'ve ever wanted is on the other side of fear.', author: 'George Addair' },
  { text: 'The best time to plant a tree was 20 years ago. The second best time is now.', author: 'Chinese Proverb' },
  { text: 'Your limitation—it\'s only your imagination.', author: 'Unknown' },
  { text: 'Great things never come from comfort zones.', author: 'Unknown' },
];

// Image URLs for drawer
export const inspirationalImages = [
  'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=800&q=80', // ocean waves
  'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?auto=format&fit=crop&w=800&q=80', // forest path
  'https://images.unsplash.com/photo-1469474968028-56623f02e42e?auto=format&fit=crop&w=800&q=80', // mountain range
  'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?auto=format&fit=crop&w=800&q=80', // mountain lake
  'https://images.unsplash.com/photo-1502126324834-38f8e02d7160?auto=format&fit=crop&w=800&q=80', // climbing mountain
];
